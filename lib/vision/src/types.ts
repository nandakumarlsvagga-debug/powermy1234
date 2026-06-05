/**
 * Shared types for the Vision Adapter (`@workspace/vision`).
 *
 * Exposes the types for Pass 1 (READ), Pass 3 (VOICE), and the orchestrator
 * analyzeImage (Architecture 3).
 */

import type {
  AnomalyType,
  Category,
  Tier,
  CulturalReading,
  RenderedScore,
  SubjectClass,
  JokeTarget,
  MemeticStatus,
} from "@workspace/scoring";

export type {
  AnomalyType,
  Category,
  Tier,
  CulturalReading,
  RenderedScore,
  SubjectClass,
  JokeTarget,
  MemeticStatus,
};

/**
 * Input bundle to `analyzeImage` / `readImage`.
 */
export interface VisionRequest {
  imageBytes: Buffer;
  imageMediaType: string;
  category: Category;
  description: string | null;
  perceptualHash: string;
}

/**
 * Input bundle to `writeCommentary`.
 */
export interface CommentaryRequest {
  reading: CulturalReading;
  score: number;
  tier: Tier;
  verdictNoun: string;
  category: Category;
  description: string | null;
}

/**
 * Output bundle from `analyzeImage`.
 */
export interface AnalyzeImageResult {
  culturalReading: CulturalReading;
  rendered: RenderedScore;
  /** Score before the anomaly modifier was applied. Equals rendered.score if no anomaly. */
  scorePreAnomaly: number;
  commentary: string;
  commentarySource: "model" | "fallback";
  anomaly: { anomalyType: AnomalyType; modifierPct: number } | null;
  forcedAnomaly: AnomalyType | null;
  pass1LatencyMs: number | null;
  pass3LatencyMs: number | null;
  pass1Retried: boolean;
  pass3Retried: boolean;
}

/**
 * Slop Detector verdict.
 */
export type SlopVerdict =
  | { ok: true }
  | {
      ok: false;
      reason: "word_count" | "banned_word" | "no_image_noun";
    };

/**
 * The structured response we ask Bedrock Nova Lite to emit in Pass 3.
 */
export interface BedrockVoiceResponse {
  commentary: string;
}
