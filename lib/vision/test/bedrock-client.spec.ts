import {
  ConverseCommand,
  type ConverseCommandInput,
  type ConverseCommandOutput,
} from "@aws-sdk/client-bedrock-runtime";
import { describe, expect, it, vi } from "vitest";

import {
  BedrockNovaLiteClient,
  DEFAULT_MODEL_ID,
  type BedrockRuntimeLike,
  buildPass1ResponseSchemaJson,
  buildPass1SystemPrompt,
  buildPass3SystemPrompt,
  buildUserPromptText,
  parsePass1Response,
  parsePass3Response,
} from "../src/bedrock-client.js";
import { VisionUnavailableError } from "../src/errors.js";

function makePass1Client(): BedrockRuntimeLike & { send: ReturnType<typeof vi.fn> } {
  return {
    send: vi.fn().mockResolvedValue(makeOkPass1Output(makePass1Response())),
  };
}

function makePass3Client(): BedrockRuntimeLike & { send: ReturnType<typeof vi.fn> } {
  return {
    send: vi.fn().mockResolvedValue(makeOkPass3Output("Triple monitors radiate sovereign discipline; this tower runs cold.")),
  };
}

function makeOkPass1Output(json: any): ConverseCommandOutput {
  return {
    output: {
      message: {
        role: "assistant",
        content: [{ text: JSON.stringify(json) }],
      },
    },
    stopReason: "end_turn",
    usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
    metrics: { latencyMs: 0 },
    $metadata: {},
  } as ConverseCommandOutput;
}

function makePass1Response(): any {
  return {
    image_subjects: ["monitors", "keyboard"],
    archetype: "operator_command",
    subject_class: "mid",
    joke_target: "none",
    memetic_status: "non_meme",
    taste_demonstrated_score: 75,
    cultural_recognition_score: 50,
    absurdity_level: 2,
    sincerity_level: 8,
    pretension_level: 3,
    menace_level: 1,
    wholesomeness_level: 6,
    powerlvl_brand_visible: false,
    taste_brands_visible: ["herman_miller"],
    category_match_score: 9,
    anomaly_signal: null,
    cultural_notes: "Clean dual-monitor setup; well managed cables.",
  };
}

function makeOkPass3Output(commentary: string): ConverseCommandOutput {
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

const IMAGE_BYTES = Buffer.from("fake-jpeg-bytes");

describe("BedrockNovaLiteClient — Pass 1 readImage Request Shape", () => {
  it("invokes Bedrock Converse with the configured model id and inference parameters", async () => {
    const client = makePass1Client();
    const adapter = new BedrockNovaLiteClient(client);

    await adapter.readImage({
      imageBytes: IMAGE_BYTES,
      imageMediaType: "image/jpeg",
      category: "SETUPS",
      description: null,
    });

    expect(client.send).toHaveBeenCalledTimes(1);
    const command = client.send.mock.calls[0]?.[0];
    expect(command).toBeInstanceOf(ConverseCommand);

    const input = (command as ConverseCommand).input as ConverseCommandInput;
    expect(input.modelId).toBe(DEFAULT_MODEL_ID);
    expect(input.inferenceConfig?.temperature).toBe(0);
    expect(input.inferenceConfig?.topP).toBe(0.1);
  });

  it("includes the system prompt with the archetypes block and allowing description", async () => {
    const client = makePass1Client();
    const adapter = new BedrockNovaLiteClient(client);

    await adapter.readImage({
      imageBytes: IMAGE_BYTES,
      imageMediaType: "image/jpeg",
      category: "SETUPS",
      description: "sleek coding zone",
    });

    const input = (client.send.mock.calls[0]?.[0] as ConverseCommand)
      .input as ConverseCommandInput;
    const systemText = (input.system?.[0] as { text?: string }).text ?? "";
    expect(systemText).toContain("You are POWERLVL's cultural reader.");
    expect(systemText).toContain("operator_command");
    expect(systemText).toContain("minimalist_monk");

    const userTextBlock = input.messages?.[0]?.content?.find(
      (block): block is { text: string } =>
        typeof block === "object" && block !== null && "text" in block,
    );
    expect(userTextBlock?.text).toContain('User context: "sleek coding zone"');
  });

  it("attaches the image block with correct format", async () => {
    const client = makePass1Client();
    const adapter = new BedrockNovaLiteClient(client);

    await adapter.readImage({
      imageBytes: IMAGE_BYTES,
      imageMediaType: "image/png",
      category: "SETUPS",
      description: null,
    });

    const input = (client.send.mock.calls[0]?.[0] as ConverseCommand)
      .input as ConverseCommandInput;
    const message = input.messages?.[0];
    expect(message?.role).toBe("user");
    const imageBlock = message?.content?.find(
      (block): block is { image: { format: string; source: { bytes: Uint8Array } } } =>
        typeof block === "object" && block !== null && "image" in block,
    );
    expect(imageBlock?.image.format).toBe("png");
  });
});

describe("BedrockNovaLiteClient — Pass 3 writeCommentary Request Shape", () => {
  it("invokes Bedrock Converse with the voice system prompt and context", async () => {
    const client = makePass3Client();
    const adapter = new BedrockNovaLiteClient(client);

    await adapter.writeCommentary({
      reading: makePass1Response(),
      score: 55000,
      tier: "S",
      verdictNoun: "Elite Signal",
      category: "SETUPS",
      description: "sweet setup",
    });

    expect(client.send).toHaveBeenCalledTimes(1);
    const command = client.send.mock.calls[0]?.[0];
    const input = (command as ConverseCommand).input as ConverseCommandInput;

    const systemText = (input.system?.[0] as { text?: string }).text ?? "";
    expect(systemText).toContain("You are POWERLVL's voice.");
    expect(systemText).toContain("S-tier: Dramatic, cinematic, the scouter is alarmed.");

    const userTextBlock = input.messages?.[0]?.content?.find(
      (block): block is { text: string } =>
        typeof block === "object" && block !== null && "text" in block,
    );
    expect(userTextBlock?.text).toContain("Verdict Noun: Elite Signal");
  });
});

describe("BedrockNovaLiteClient — parsePass1Response & parsePass3Response", () => {
  it("parses well-formed Pass 1 response", () => {
    const res = parsePass1Response(JSON.stringify(makePass1Response()), "SETUPS");
    expect(res.taste_demonstrated_score).toBe(75);
    expect(res.subject_class).toBe("mid");
    expect(res.taste_brands_visible).toContain("herman_miller");
  });

  it("clamps out-of-range Pass 1 signals and drops invalid brands", () => {
    const raw = makePass1Response();
    raw.taste_demonstrated_score = 150;
    raw.absurdity_level = 11;
    raw.taste_brands_visible = ["herman_miller", "invalid_brand"];
    const res = parsePass1Response(JSON.stringify(raw), "SETUPS");
    expect(res.taste_demonstrated_score).toBe(100);
    expect(res.absurdity_level).toBe(10);
    expect(res.taste_brands_visible).toEqual(["herman_miller"]);
  });

  it("parses well-formed Pass 3 response", () => {
    const raw = { commentary: "  This is an epic scouter commentary.  " };
    const res = parsePass3Response(JSON.stringify(raw));
    expect(res).toBe("This is an epic scouter commentary.");
  });
});

describe("BedrockNovaLiteClient — Error conditions", () => {
  it("maps Converse API timeout to timeout error", async () => {
    const client: BedrockRuntimeLike = {
      send: vi.fn().mockReturnValue(new Promise(() => {})),
    };
    const adapter = new BedrockNovaLiteClient(client, { timeoutMs: 50 });

    await expect(
      adapter.readImage({
        imageBytes: IMAGE_BYTES,
        imageMediaType: "image/jpeg",
        category: "SETUPS",
        description: null,
      }),
    ).rejects.toThrow(VisionUnavailableError);
  });
});
