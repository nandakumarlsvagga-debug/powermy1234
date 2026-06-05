import { RekognitionClient } from "@aws-sdk/client-rekognition";

import { ModerationService } from "./moderate.js";
import type { ModerationVerdict, RekognitionLike } from "./types.js";

export { ModerationUnavailableError } from "./errors.js";
export { ModerationService } from "./moderate.js";
export type { ModerationServiceOptions } from "./moderate.js";
export type { ModerationVerdict, RekognitionLike } from "./types.js";
export {
  DEFAULT_TIMEOUT_MS,
  MIN_REJECT_CONFIDENCE,
  REJECT_CATEGORIES,
} from "./types.js";

let defaultService: ModerationService | null = null;

function getDefaultService(): ModerationService {
  if (defaultService) return defaultService;

  // The Rekognition client picks up region + credentials from the standard
  // AWS_* env vars; explicit region keeps the failure mode at construction
  // time rather than at request time.
  const region = process.env.AWS_REGION ?? process.env.AWS_DEFAULT_REGION;
  if (!region) {
    throw new Error(
      "AWS_REGION must be set to use the default ModerationService. " +
        "For tests, construct ModerationService directly with an injected client.",
    );
  }
  const client: RekognitionLike = new RekognitionClient({ region });
  defaultService = new ModerationService(client);
  return defaultService;
}

/**
 * Screen image bytes through Rekognition `DetectModerationLabels`. Returns a
 * verdict with `ok: false` and the flagged top-level categories when any
 * labelled match has confidence ≥ 70 within {Explicit Nudity, Violence, Hate
 * Symbols}; otherwise returns `{ ok: true, flaggedLabels: [] }`.
 *
 * Throws `ModerationUnavailableError` on SDK failure or when the 3 s timeout
 * is exceeded so the API server can map it to `MODERATION_UNAVAILABLE`.
 */
export function moderate(imageBytes: Buffer): Promise<ModerationVerdict> {
  return getDefaultService().moderate(imageBytes);
}
