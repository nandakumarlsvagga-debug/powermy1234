import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  BedrockNovaLiteClient,
  type BedrockRuntimeLike,
} from "../src/bedrock-client.js";
import { VisionUnavailableError } from "../src/errors.js";
import {
  BEDROCK_RPM_LIMIT,
  _bedrockBucket,
  analyzeImage,
} from "../src/index.js";
import type { VisionRequest } from "../src/types.js";
import type { ConverseCommandOutput } from "@aws-sdk/client-bedrock-runtime";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makePass1Response(): any {
  return {
    image_subjects: ["monitors", "tower", "rgb"],
    archetype: "custom_loop_war",
    subject_class: "mid",
    joke_target: "none",
    memetic_status: "non_meme",
    taste_demonstrated_score: 78,
    cultural_recognition_score: 30,
    absurdity_level: 4,
    sincerity_level: 8,
    pretension_level: 3,
    menace_level: 7,
    wholesomeness_level: 5,
    powerlvl_brand_visible: false,
    taste_brands_visible: ["herman_miller"],
    category_match_score: 10,
    anomaly_signal: null,
    cultural_notes: "Custom liquid-loop build with high build discipline.",
  };
}

function makePass1Output(reading = makePass1Response()): ConverseCommandOutput {
  return {
    output: {
      message: {
        role: "assistant",
        content: [{ text: JSON.stringify(reading) }],
      },
    },
    stopReason: "end_turn",
    usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
    metrics: { latencyMs: 0 },
    $metadata: {},
  } as ConverseCommandOutput;
}

function makePass3Output(commentary: string): ConverseCommandOutput {
  return {
    output: {
      message: {
        role: "assistant",
        content: [{ text: JSON.stringify({ commentary }) }],
      },
    },
    stopReason: "end_turn",
    usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
    metrics: { latencyMs: 0 },
    $metadata: {},
  } as ConverseCommandOutput;
}

function makeRuntimeStub(): BedrockRuntimeLike & {
  send: ReturnType<typeof vi.fn>;
} {
  return { send: vi.fn() };
}

const BASE_REQUEST: VisionRequest = {
  imageBytes: Buffer.from("fake-image-bytes"),
  imageMediaType: "image/jpeg",
  category: "SETUPS",
  description: null,
  perceptualHash: "5a3c7f1122334455",
};

// ---------------------------------------------------------------------------
// Bucket reset between tests
// ---------------------------------------------------------------------------

beforeEach(() => {
  _bedrockBucket.tokens = BEDROCK_RPM_LIMIT;
  _bedrockBucket.lastRefillMs = Date.now();
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// Path 1: retry-then-success
// ---------------------------------------------------------------------------

describe("analyzeImage — Pass 1 retry-then-success", () => {
  it("retries once on Pass 1 parse_error and returns model result on success", async () => {
    const runtime = makeRuntimeStub();

    // First call: bad json
    runtime.send.mockResolvedValueOnce({
      output: {
        message: {
          role: "assistant",
          content: [{ text: "bad json format" }],
        },
      },
      stopReason: "end_turn",
      usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
      metrics: { latencyMs: 0 },
      $metadata: {},
    } as ConverseCommandOutput);

    // Second call: retry Pass 1 success
    runtime.send.mockResolvedValueOnce(makePass1Output());

    // Third call: Pass 3 scouter commentary success
    runtime.send.mockResolvedValueOnce(makePass3Output("Triple monitors glow in formation; this keyboard is locked."));

    const client = new BedrockNovaLiteClient(runtime);
    const result = await analyzeImage(BASE_REQUEST, { client });

    expect(runtime.send).toHaveBeenCalledTimes(3);
    expect(result.pass1Retried).toBe(true);
    expect(result.commentarySource).toBe("model");
    expect(result.commentary).toContain("monitors");
    expect(result.forcedAnomaly).toBeNull();
  });

  it("does NOT retry on sdk_error (non-parse errors go straight to neutral fallback)", async () => {
    const runtime = makeRuntimeStub();
    runtime.send.mockRejectedValueOnce(new Error("AWS API failure"));

    const client = new BedrockNovaLiteClient(runtime);
    const result = await analyzeImage(BASE_REQUEST, { client });

    expect(runtime.send).toHaveBeenCalledTimes(1);
    expect(result.forcedAnomaly).toBe("SCOUTER_FAILURE");
    expect(result.commentarySource).toBe("fallback");
    expect(result.rendered.tier).toBe("A"); // neutral fallback produces A tier
  });
});

// ---------------------------------------------------------------------------
// Path 2: retry-then-fail-to-neutral-fallback
// ---------------------------------------------------------------------------

describe("analyzeImage — Pass 1 retry-then-fail-to-neutral-fallback", () => {
  it("falls back to neutral reading when both attempts fail", async () => {
    const runtime = makeRuntimeStub();
    runtime.send.mockResolvedValue({
      output: {
        message: {
          role: "assistant",
          content: [{ text: "not json" }],
        },
      },
    } as ConverseCommandOutput);

    const client = new BedrockNovaLiteClient(runtime);
    const result = await analyzeImage(BASE_REQUEST, { client });

    expect(runtime.send).toHaveBeenCalledTimes(2);
    expect(result.forcedAnomaly).toBe("SCOUTER_FAILURE");
    expect(result.commentarySource).toBe("fallback");
    expect(result.culturalReading.archetype).toBe("mid");
  });
});

// ---------------------------------------------------------------------------
// Path 3: Pass 3 slop detector retry & fallback
// ---------------------------------------------------------------------------

describe("analyzeImage — Pass 3 slop-detector retry and replacement", () => {
  it("retries Pass 3 on slop, using the second response if valid", async () => {
    const runtime = makeRuntimeStub();

    // Call 1: Pass 1 success
    runtime.send.mockResolvedValueOnce(makePass1Output());
    // Call 2: Pass 3 returns slop (too short)
    runtime.send.mockResolvedValueOnce(makePass3Output("Too short."));
    // Call 3: Pass 3 retry returns valid commentary (no banned words)
    runtime.send.mockResolvedValueOnce(makePass3Output("Three monitors stand in combat formation; keyboard is locked."));

    const client = new BedrockNovaLiteClient(runtime);
    const result = await analyzeImage(BASE_REQUEST, { client });

    expect(runtime.send).toHaveBeenCalledTimes(3);
    expect(result.pass3Retried).toBe(true);
    expect(result.commentarySource).toBe("model");
    expect(result.commentary).toContain("monitors");
  });

  it("uses fallback commentary when Pass 3 retry also returns slop", async () => {
    const runtime = makeRuntimeStub();

    // Call 1: Pass 1 success
    runtime.send.mockResolvedValueOnce(makePass1Output());
    // Call 2: Pass 3 returns slop
    runtime.send.mockResolvedValueOnce(makePass3Output("Too short."));
    // Call 3: Pass 3 retry also returns slop
    runtime.send.mockResolvedValueOnce(makePass3Output("Still short."));

    const client = new BedrockNovaLiteClient(runtime);
    const result = await analyzeImage(BASE_REQUEST, { client });

    expect(runtime.send).toHaveBeenCalledTimes(3);
    expect(result.commentarySource).toBe("fallback");
  });
});

// ---------------------------------------------------------------------------
// Path 4: concurrency-cap exhaustion
// ---------------------------------------------------------------------------

describe("analyzeImage — concurrency-cap exhaustion", () => {
  it("falls through to neutral fallback when the bucket is empty", async () => {
    const runtime = makeRuntimeStub();
    const client = new BedrockNovaLiteClient(runtime);

    _bedrockBucket.tokens = 0;

    const result = await analyzeImage(BASE_REQUEST, { client });

    expect(runtime.send).not.toHaveBeenCalled();
    expect(result.forcedAnomaly).toBe("SCOUTER_FAILURE");
    expect(result.commentarySource).toBe("fallback");
  });
});
