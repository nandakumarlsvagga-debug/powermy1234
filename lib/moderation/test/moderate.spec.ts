import { DetectModerationLabelsCommand } from "@aws-sdk/client-rekognition";
import { describe, expect, it, vi } from "vitest";

import { ModerationUnavailableError } from "../src/errors.js";
import { ModerationService } from "../src/moderate.js";
import type { RekognitionLike } from "../src/types.js";

/**
 * Build a stub Rekognition client whose `send` is a `vi.fn()`. The default
 * resolves with an empty `ModerationLabels` payload (i.e. clean image); each
 * test overrides the implementation as needed.
 */
function makeClient(): RekognitionLike & { send: ReturnType<typeof vi.fn> } {
  return {
    send: vi.fn().mockResolvedValue({ ModerationLabels: [] }),
  };
}

const IMAGE = Buffer.from("fake-image-bytes");

describe("ModerationService.moderate", () => {
  it("returns ok with no flagged labels for a clean image", async () => {
    const client = makeClient();
    const service = new ModerationService(client);

    const verdict = await service.moderate(IMAGE);

    expect(verdict).toEqual({ ok: true, flaggedLabels: [] });
    expect(client.send).toHaveBeenCalledTimes(1);
    expect(client.send.mock.calls[0]?.[0]).toBeInstanceOf(
      DetectModerationLabelsCommand,
    );
  });

  it("flags Explicit Nudity when a leaf label crosses the threshold", async () => {
    const client = makeClient();
    client.send.mockResolvedValueOnce({
      ModerationLabels: [
        {
          Name: "Graphic Female Nudity",
          ParentName: "Explicit Nudity",
          Confidence: 92,
        },
      ],
    });
    const service = new ModerationService(client);

    const verdict = await service.moderate(IMAGE);

    expect(verdict).toEqual({ ok: false, flaggedLabels: ["Explicit Nudity"] });
  });

  it("flags Violence when a leaf label crosses the threshold", async () => {
    const client = makeClient();
    client.send.mockResolvedValueOnce({
      ModerationLabels: [
        {
          Name: "Weapon Violence",
          ParentName: "Violence",
          Confidence: 80,
        },
      ],
    });
    const service = new ModerationService(client);

    const verdict = await service.moderate(IMAGE);

    expect(verdict).toEqual({ ok: false, flaggedLabels: ["Violence"] });
  });

  it("flags Hate Symbols when a leaf label crosses the threshold", async () => {
    const client = makeClient();
    client.send.mockResolvedValueOnce({
      ModerationLabels: [
        {
          Name: "Nazi Party",
          ParentName: "Hate Symbols",
          Confidence: 75,
        },
      ],
    });
    const service = new ModerationService(client);

    const verdict = await service.moderate(IMAGE);

    expect(verdict).toEqual({ ok: false, flaggedLabels: ["Hate Symbols"] });
  });

  it("does not flag labels whose confidence is below the threshold", async () => {
    const client = makeClient();
    client.send.mockResolvedValueOnce({
      ModerationLabels: [
        {
          Name: "Graphic Female Nudity",
          ParentName: "Explicit Nudity",
          Confidence: 60,
        },
      ],
    });
    const service = new ModerationService(client);

    const verdict = await service.moderate(IMAGE);

    expect(verdict).toEqual({ ok: true, flaggedLabels: [] });
  });

  it("throws ModerationUnavailableError with reason 'sdk_error' when the SDK rejects", async () => {
    const client = makeClient();
    const cause = new Error("aws sdk failure");
    client.send.mockRejectedValueOnce(cause);
    const service = new ModerationService(client);

    const result = await service.moderate(IMAGE).catch((err: unknown) => err);

    expect(result).toBeInstanceOf(ModerationUnavailableError);
    const err = result as ModerationUnavailableError;
    expect(err.reason).toBe("sdk_error");
    expect(err.cause).toBe(cause);
  });

  it("throws ModerationUnavailableError with reason 'timeout' when the SDK never resolves", async () => {
    const client: RekognitionLike = {
      // Never-resolving promise so the timeout path always wins.
      send: vi.fn().mockReturnValue(new Promise(() => {})),
    };
    const service = new ModerationService(client, { timeoutMs: 100 });

    const result = await service.moderate(IMAGE).catch((err: unknown) => err);

    expect(result).toBeInstanceOf(ModerationUnavailableError);
    const err = result as ModerationUnavailableError;
    expect(err.reason).toBe("timeout");
  });
});
