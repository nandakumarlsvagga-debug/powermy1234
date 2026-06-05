/**
 * `multer` configuration for `POST /api/scans`.
 *
 * The scan upload is the only endpoint that accepts `multipart/form-data`
 * (per design.md "API Surface"). Per Requirement 2.1 we cap the image at
 * 8 MB; per Requirement 2.7 we accept exactly one image file plus the
 * supporting text fields (`category`, `description`, `localDate`,
 * `localTz`).
 *
 * The file is buffered in memory rather than written to disk because the
 * downstream pipeline (`@workspace/images` + `@workspace/moderation`)
 * already operates on `Buffer`s and we do not want a stray `/tmp` file
 * outliving a moderation rejection.
 */

import multer from "multer";

/** Field name accepted by `POST /api/scans`. */
export const SCAN_IMAGE_FIELD = "image";

/** Hard byte cap that matches the requirements. */
export const MAX_IMAGE_BYTES = 8 * 1024 * 1024;

/**
 * Multer middleware that accepts a single image file plus the multipart
 * text fields. Mount on `POST /api/scans` only — never globally — so that
 * other endpoints stay JSON-only and CSRF-resistant.
 */
export const scanUpload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: MAX_IMAGE_BYTES,
    files: 1,
    // Generous text-field budget. The actual values are validated downstream
    // via the generated Zod schemas in `@workspace/api-zod`.
    fieldSize: 4 * 1024,
    fields: 16,
  },
}).single(SCAN_IMAGE_FIELD);
