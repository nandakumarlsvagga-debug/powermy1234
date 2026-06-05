import { DetectModerationLabelsCommand } from "@aws-sdk/client-rekognition";

import { ModerationUnavailableError } from "./errors.js";
import {
  DEFAULT_TIMEOUT_MS,
  MIN_REJECT_CONFIDENCE,
  REJECT_CATEGORIES,
  type ModerationVerdict,
  type RekognitionLike,
} from "./types.js";

export interface ModerationServiceOptions {
  /** Per-call timeout in milliseconds; defaults to 3 000. */
  timeoutMs?: number;
}

/**
 * Wraps Rekognition `DetectModerationLabels`. The SDK client is injected via
 * the constructor so tests can stub it without environment plumbing.
 */
export class ModerationService {
  readonly #client: RekognitionLike;
  readonly #timeoutMs: number;

  constructor(client: RekognitionLike, options: ModerationServiceOptions = {}) {
    this.#client = client;
    this.#timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  }

  async moderate(imageBytes: Buffer): Promise<ModerationVerdict> {
    const command = new DetectModerationLabelsCommand({
      Image: { Bytes: imageBytes },
      // Server-side filter so we never receive low-confidence noise. We still
      // re-check the threshold below so the contract is enforced in our code.
      MinConfidence: MIN_REJECT_CONFIDENCE,
    });

    let output;
    try {
      output = await this.#sendWithTimeout(command);
    } catch (err) {
      if (err instanceof ModerationUnavailableError) throw err;
      throw new ModerationUnavailableError(
        "sdk_error",
        "Rekognition DetectModerationLabels failed",
        { cause: err },
      );
    }

    const labels = output.ModerationLabels ?? [];
    const flagged = new Set<string>();
    for (const label of labels) {
      const confidence = label.Confidence ?? 0;
      if (confidence < MIN_REJECT_CONFIDENCE) continue;

      // Rekognition returns both leaf labels (e.g. "Graphic Violence") and
      // their top-level category via `ParentName`. We match against the
      // top-level category so callers see the stable user-facing names.
      const topLevel = label.ParentName?.length ? label.ParentName : label.Name;
      if (topLevel && REJECT_CATEGORIES.has(topLevel)) {
        flagged.add(topLevel);
      }
    }

    if (flagged.size === 0) {
      return { ok: true, flaggedLabels: [] };
    }
    return { ok: false, flaggedLabels: [...flagged] };
  }

  async #sendWithTimeout(
    command: DetectModerationLabelsCommand,
  ): Promise<
    Awaited<ReturnType<RekognitionLike["send"]>>
  > {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.#timeoutMs);
    timer.unref?.();

    const sendPromise = this.#client.send(command);

    const timeoutPromise = new Promise<never>((_, reject) => {
      controller.signal.addEventListener(
        "abort",
        () => {
          reject(
            new ModerationUnavailableError(
              "timeout",
              `Rekognition DetectModerationLabels exceeded ${this.#timeoutMs}ms`,
            ),
          );
        },
        { once: true },
      );
    });

    try {
      return await Promise.race([sendPromise, timeoutPromise]);
    } finally {
      clearTimeout(timer);
    }
  }
}
