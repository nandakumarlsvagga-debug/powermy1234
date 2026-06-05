/**
 * `@workspace/vision` — Vision Adapter for POWERLVL.
 */

import { BedrockNovaLiteClient } from "./bedrock-client.js";
import { pickFallback } from "./fallback-library.js";
import { detectSlop } from "./slop-detector.js";
import {
  renderScore,
  deriveAnomalySeed,
  drawAnomaly,
  applyAnomalyModifier,
  pickVerdictNoun,
  scoreToTier,
} from "@workspace/scoring";
import type {
  Category,
  Tier,
  AnomalyType,
  CulturalReading,
  RenderedScore,
  VisionRequest,
  CommentaryRequest,
  AnalyzeImageResult,
} from "./types.js";
import { VisionUnavailableError } from "./errors.js";
import crypto from "crypto";

// Export public interface types
export type {
  Category,
  Tier,
  AnomalyType,
  CulturalReading,
  RenderedScore,
  VisionRequest,
  CommentaryRequest,
  AnalyzeImageResult,
  SlopVerdict,
} from "./types.js";

// Export other helpers
export { detectSlop } from "./slop-detector.js";
export type { BedrockNovaLiteClientOptions, BedrockRuntimeLike } from "./bedrock-client.js";
export {
  BedrockNovaLiteClient,
  DEFAULT_MAX_TOKENS,
  DEFAULT_MODEL_ID,
  DEFAULT_TIMEOUT_MS,
  TEMPERATURE,
  TOP_P,
  buildPass1ResponseSchemaJson,
  buildPass1SystemPrompt,
  buildPass3SystemPrompt,
  buildUserPromptText,
  parsePass1Response,
  parsePass3Response,
  renderFewShotBlock,
} from "./bedrock-client.js";

export type { FewShotExample } from "./few-shot/index.js";
export { FEW_SHOT_EXAMPLES, fewShotFor } from "./few-shot/index.js";

export type { VisionUnavailableReason } from "./errors.js";
export { VisionUnavailableError } from "./errors.js";

export { pickFallback } from "./fallback-library.js";

// Concurrency cap: 120 Bedrock invocations per minute (Requirement 5.9 / Task 8.7)
export const BEDROCK_RPM_LIMIT = 120;

export const _bedrockBucket = {
  tokens: BEDROCK_RPM_LIMIT as number,
  lastRefillMs: Date.now(),
};

function consumeBedrockToken(): boolean {
  const now = Date.now();
  const elapsedSec = (now - _bedrockBucket.lastRefillMs) / 1000;
  _bedrockBucket.lastRefillMs = now;
  
  // Refill rate: 120 tokens per 60 seconds = 2 tokens/sec
  const refillRate = BEDROCK_RPM_LIMIT / 60;
  _bedrockBucket.tokens = Math.min(
    BEDROCK_RPM_LIMIT,
    _bedrockBucket.tokens + elapsedSec * refillRate
  );
  
  if (_bedrockBucket.tokens < 1) {
    return false;
  }
  _bedrockBucket.tokens -= 1;
  return true;
}

export async function acquireTokenWithTimeout(timeoutMs: number): Promise<boolean> {
  if (timeoutMs <= 0) {
    return consumeBedrockToken();
  }
  const start = Date.now();
  while (true) {
    if (consumeBedrockToken()) {
      return true;
    }
    const elapsed = Date.now() - start;
    if (elapsed >= timeoutMs) {
      break;
    }
    const sleepTime = Math.min(50, timeoutMs - elapsed);
    await new Promise((resolve) => setTimeout(resolve, sleepTime));
  }
  return false;
}

function hashToSeed(perceptualHash: string): number {
  const hex = perceptualHash.replace(/[^0-9a-fA-F]/g, "");
  if (hex.length < 8) return 0;
  return parseInt(hex.slice(0, 8), 16) >>> 0;
}

function deterministicUUID(hash: string, category: string): string {
  const sha = crypto.createHash("sha256").update(`${hash}|${category}`).digest("hex");
  return [
    sha.slice(0, 8),
    sha.slice(8, 12),
    sha.slice(12, 16),
    sha.slice(16, 20),
    sha.slice(20, 32),
  ].join("-");
}

function getNeutralReading(req: VisionRequest): CulturalReading {
  return {
    image_subjects: ["frame"],
    archetype: "mid",
    subject_class: "mid",
    joke_target: "none",
    memetic_status: "non_meme",
    taste_demonstrated_score: 50,
    cultural_recognition_score: 50,
    absurdity_level: 3,
    sincerity_level: 5,
    pretension_level: 2,
    menace_level: 3,
    wholesomeness_level: 5,
    powerlvl_brand_visible: false,
    taste_brands_visible: [],
    category_match_score: 5,
    anomaly_signal: null,
    cultural_notes: "Vision model failure; neutral fallback applied.",
  };
}

let _defaultClient: BedrockNovaLiteClient | null = null;
function getDefaultClient(): BedrockNovaLiteClient {
  if (!_defaultClient) {
    const { BedrockRuntimeClient } = require("@aws-sdk/client-bedrock-runtime");
    _defaultClient = new BedrockNovaLiteClient(new BedrockRuntimeClient({}));
  }
  return _defaultClient;
}

export interface AnalyzeImageOptions {
  client?: BedrockNovaLiteClient;
  maxWaitMs?: number;
}

export async function readImage(
  req: VisionRequest,
  options: { client?: BedrockNovaLiteClient; maxWaitMs?: number } = {}
): Promise<CulturalReading> {
  const client = options.client ?? getDefaultClient();
  const defaultWait = (typeof process !== "undefined" && process.env.VITEST) ? 0 : 1500;
  const waitMs = options.maxWaitMs ?? defaultWait;
  
  if (!await acquireTokenWithTimeout(waitMs)) {
    throw new VisionUnavailableError("timeout", "Rate limit cap reached (refused Bedrock token)");
  }
  return client.readImage({
    imageBytes: req.imageBytes,
    imageMediaType: req.imageMediaType,
    category: req.category,
    description: req.description,
  });
}

export async function writeCommentary(
  req: CommentaryRequest,
  options: { client?: BedrockNovaLiteClient; maxWaitMs?: number } = {}
): Promise<string> {
  const client = options.client ?? getDefaultClient();
  const defaultWait = (typeof process !== "undefined" && process.env.VITEST) ? 0 : 1500;
  const waitMs = options.maxWaitMs ?? defaultWait;
  
  if (!await acquireTokenWithTimeout(waitMs)) {
    throw new VisionUnavailableError("timeout", "Rate limit cap reached (refused Bedrock token)");
  }
  return client.writeCommentary(req);
}

export async function analyzeImage(
  req: VisionRequest,
  options: AnalyzeImageOptions = {},
): Promise<AnalyzeImageResult> {
  const client = options.client ?? getDefaultClient();
  const maxWaitMs = options.maxWaitMs;
  const scanId = deterministicUUID(req.perceptualHash, req.category);

  let culturalReading: CulturalReading;
  let pass1LatencyMs: number | null = null;
  let pass1Retried = false;
  let forcedAnomaly: AnomalyType | null = null;

  // -------------------------------------------------------------------------
  // Pass 1: READ (readImage)
  // -------------------------------------------------------------------------
  const t0 = Date.now();
  try {
    culturalReading = await readImage(req, { client, maxWaitMs });
    pass1LatencyMs = Date.now() - t0;
  } catch (err) {
    const isParseError =
      err instanceof VisionUnavailableError && err.reason === "parse_error";
    if (isParseError) {
      pass1Retried = true;
      try {
        culturalReading = await readImage(req, { client, maxWaitMs });
        pass1LatencyMs = Date.now() - t0;
      } catch (retryErr) {
        culturalReading = getNeutralReading(req);
        forcedAnomaly = "SCOUTER_FAILURE";
        pass1LatencyMs = Date.now() - t0;
      }
    } else {
      culturalReading = getNeutralReading(req);
      forcedAnomaly = "SCOUTER_FAILURE";
      pass1LatencyMs = Date.now() - t0;
    }
  }

  // -------------------------------------------------------------------------
  // Pass 2: RENDER (renderScore)
  // -------------------------------------------------------------------------
  const rendered = renderScore(culturalReading, scanId, req.category);

  // -------------------------------------------------------------------------
  // Anomaly Draw
  // -------------------------------------------------------------------------
  // Capture score before anomaly modifier for persistence and audit.
  const scorePreAnomaly = rendered.score;
  let anomaly: { anomalyType: AnomalyType; modifierPct: number } | null = null;
  if (forcedAnomaly !== null) {
    anomaly = { anomalyType: forcedAnomaly, modifierPct: 0 };
  } else {
    const seed = deriveAnomalySeed({
      scanId,
      category: req.category,
      imagePerceptualHash: req.perceptualHash,
    });
    const anomalyType = drawAnomaly(seed);
    if (anomalyType !== null) {
      const { finalScore, modifierPct } = applyAnomalyModifier(rendered.score, anomalyType, seed);
      rendered.score = finalScore;
      rendered.tier = scoreToTier(finalScore);
      anomaly = { anomalyType, modifierPct };
    }
  }

  // Pick verdict noun based on final tier and flavor
  rendered.verdictNoun = pickVerdictNoun(rendered.tier, culturalReading, scanId);

  // -------------------------------------------------------------------------
  // Pass 3: VOICE (writeCommentary)
  // -------------------------------------------------------------------------
  let commentary = "";
  let commentarySource: "model" | "fallback" = "model";
  let pass3LatencyMs: number | null = null;
  let pass3Retried = false;

  if (forcedAnomaly === "SCOUTER_FAILURE") {
    const seed = hashToSeed(req.perceptualHash);
    commentary = pickFallback(req.category, rendered.tier, culturalReading.image_subjects, seed);
    commentarySource = "fallback";
  } else {
    const tStart3 = Date.now();
    const commentaryReq: CommentaryRequest = {
      reading: culturalReading,
      score: rendered.score,
      tier: rendered.tier,
      verdictNoun: rendered.verdictNoun,
      category: req.category,
      description: req.description,
    };

    try {
      commentary = await writeCommentary(commentaryReq, { client, maxWaitMs });
      const slop = detectSlop(commentary, culturalReading.image_subjects);
      if (!slop.ok) {
        throw new VisionUnavailableError("parse_error", `Slop detected: ${slop.reason}`);
      }
      pass3LatencyMs = Date.now() - tStart3;
    } catch (err) {
      pass3Retried = true;
      try {
        commentary = await writeCommentary(commentaryReq, { client, maxWaitMs });
        const slop = detectSlop(commentary, culturalReading.image_subjects);
        if (!slop.ok) {
          throw new VisionUnavailableError("parse_error", `Slop detected on retry: ${slop.reason}`);
        }
        pass3LatencyMs = Date.now() - tStart3;
      } catch (retryErr) {
        const seed = hashToSeed(req.perceptualHash);
        commentary = pickFallback(req.category, rendered.tier, culturalReading.image_subjects, seed);
        commentarySource = "fallback";
        pass3LatencyMs = Date.now() - tStart3;
      }
    }
  }

  return {
    culturalReading,
    rendered,
    scorePreAnomaly,
    commentary,
    commentarySource,
    anomaly,
    forcedAnomaly,
    pass1LatencyMs,
    pass3LatencyMs,
    pass1Retried,
    pass3Retried,
  };
}
