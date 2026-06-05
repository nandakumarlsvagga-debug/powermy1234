import type {
  DetectModerationLabelsCommandInput,
  DetectModerationLabelsCommandOutput,
} from "@aws-sdk/client-rekognition";

/**
 * Public verdict returned from `moderate`. A verdict with `ok: false` is a
 * normal rejection (the image was flagged); `flaggedLabels` lists the
 * top-level Rekognition categories that crossed the confidence threshold.
 *
 * Service errors and timeouts surface as a thrown `ModerationUnavailableError`
 * — they never appear here.
 */
export interface ModerationVerdict {
  ok: boolean;
  flaggedLabels: string[];
}

/**
 * Minimal slice of the Rekognition client used by this package. Declaring it
 * structurally lets tests inject a stub without pulling in the full SDK.
 */
export interface RekognitionLike {
  send(
    command: { input: DetectModerationLabelsCommandInput },
  ): Promise<DetectModerationLabelsCommandOutput>;
}

/**
 * Moderation categories whose top-level (parent) name triggers a rejection
 * when their confidence is at least `MIN_REJECT_CONFIDENCE`. Per Requirement
 * 2.4 / 2.5: explicit nudity, graphic violence, and hate symbols.
 */
export const REJECT_CATEGORIES: ReadonlySet<string> = new Set([
  "Explicit Nudity",
  "Violence",
  "Hate Symbols",
]);

/** Confidence threshold (Rekognition reports 0–100). */
export const MIN_REJECT_CONFIDENCE = 70;

/** Per-call budget for the SDK round-trip. */
export const DEFAULT_TIMEOUT_MS = 3_000;
