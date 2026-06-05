/**
 * Discriminated `ApiError` builder + Express error middleware.
 *
 * The wire shape mirrors the OpenAPI `ApiError` discriminated union (see
 * `lib/api-spec/openapi.yaml` and the generated Zod schemas in
 * `@workspace/api-zod`). Route handlers throw an `HttpError` (or any of the
 * `apiError.*` factories), and the middleware in `errorHandler` maps it to a
 * JSON response body of type `ApiError` with a matching HTTP status code.
 */

import type { ErrorRequestHandler, Request, Response, NextFunction } from "express";
import type { ApiError, ApiErrorImageInvalidReason } from "@workspace/api-zod";

const STATUS_BY_CODE = {
  INVALID_INPUT: 400,
  UNAUTHENTICATED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  RATE_LIMITED: 429,
  DAILY_LIMIT_REACHED: 429,
  MODERATION_REJECTED: 422,
  MODERATION_UNAVAILABLE: 503,
  IMAGE_INVALID: 400,
  VISION_UNAVAILABLE: 503,
  INTERNAL: 500,
} as const satisfies Record<ApiError["code"], number>;

export type ApiErrorCode = ApiError["code"];

/**
 * Thrown by route handlers to surface a typed API error. The Express error
 * middleware (`errorHandler`) catches it and writes the matching JSON body +
 * HTTP status.
 */
export class HttpError<C extends ApiErrorCode = ApiErrorCode> extends Error {
  readonly body: Extract<ApiError, { code: C }>;
  readonly status: number;

  constructor(body: Extract<ApiError, { code: C }>) {
    super(body.message);
    this.name = "HttpError";
    this.body = body;
    this.status = STATUS_BY_CODE[body.code];
  }
}

function build<C extends ApiErrorCode>(
  body: Extract<ApiError, { code: C }>,
): HttpError<C> {
  return new HttpError<C>(body);
}

/**
 * Factory namespace for building each `ApiError` variant.
 *
 * Usage:
 *   throw apiError.notFound('Scan not found');
 *   throw apiError.imageInvalid('Image too large', 'size');
 */
export const apiError = {
  invalidInput(message: string, opts?: { field?: string; rule?: string }) {
    return build({
      code: "INVALID_INPUT",
      message,
      ...(opts?.field !== undefined ? { field: opts.field } : {}),
      ...(opts?.rule !== undefined ? { rule: opts.rule } : {}),
    } as Extract<ApiError, { code: "INVALID_INPUT" }>);
  },
  unauthenticated(message = "Authentication required") {
    return build({ code: "UNAUTHENTICATED", message } as Extract<
      ApiError,
      { code: "UNAUTHENTICATED" }
    >);
  },
  forbidden(message = "Forbidden") {
    return build({ code: "FORBIDDEN", message } as Extract<
      ApiError,
      { code: "FORBIDDEN" }
    >);
  },
  notFound(message = "Not found") {
    return build({ code: "NOT_FOUND", message } as Extract<
      ApiError,
      { code: "NOT_FOUND" }
    >);
  },
  rateLimited(retryAfterSec: number, message = "Rate limit exceeded") {
    return build({
      code: "RATE_LIMITED",
      message,
      retryAfterSec,
    } as Extract<ApiError, { code: "RATE_LIMITED" }>);
  },
  dailyLimitReached(resetAt: Date | string, message = "Daily limit reached") {
    return build({
      code: "DAILY_LIMIT_REACHED",
      message,
      resetAt: resetAt instanceof Date ? resetAt : new Date(resetAt),
    } as Extract<ApiError, { code: "DAILY_LIMIT_REACHED" }>);
  },
  moderationRejected(categories: string[], message = "Image was rejected by moderation") {
    return build({
      code: "MODERATION_REJECTED",
      message,
      categories,
    } as Extract<ApiError, { code: "MODERATION_REJECTED" }>);
  },
  moderationUnavailable(message = "Moderation service unavailable") {
    return build({ code: "MODERATION_UNAVAILABLE", message } as Extract<
      ApiError,
      { code: "MODERATION_UNAVAILABLE" }
    >);
  },
  imageInvalid(message: string, reason: ApiErrorImageInvalidReason) {
    return build({
      code: "IMAGE_INVALID",
      message,
      reason,
    } as Extract<ApiError, { code: "IMAGE_INVALID" }>);
  },
  visionUnavailable(message = "Vision service unavailable") {
    return build({ code: "VISION_UNAVAILABLE", message } as Extract<
      ApiError,
      { code: "VISION_UNAVAILABLE" }
    >);
  },
  internal(message = "Internal server error") {
    return build({ code: "INTERNAL", message } as Extract<
      ApiError,
      { code: "INTERNAL" }
    >);
  },
} as const;

/**
 * Express error middleware. Maps `HttpError` to its typed JSON body; any
 * other unexpected error is logged via `req.log` (pino-http) and returned as
 * a generic `INTERNAL` response so we never leak stack traces or third-party
 * error messages to clients.
 *
 * Sets `Retry-After` on rate-limit / daily-limit responses per RFC 7231.
 */
export const errorHandler: ErrorRequestHandler = (
  err: unknown,
  req: Request,
  res: Response,
  // `next` is required by Express to recognize this as an error handler.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _next: NextFunction,
) => {
  if (res.headersSent) {
    // Express recommends delegating back to the default handler when headers
    // have already been written (the connection will be closed).
    return _next(err);
  }

  const requestId = (req as Request & { id?: string }).id;

  if (err instanceof HttpError) {
    if (err.body.code === "RATE_LIMITED") {
      res.setHeader("Retry-After", String(err.body.retryAfterSec));
    }
    if (err.body.code === "DAILY_LIMIT_REACHED") {
      const resetAt =
        err.body.resetAt instanceof Date
          ? err.body.resetAt.getTime()
          : Date.parse(err.body.resetAt);
      const seconds = Math.max(0, Math.ceil((resetAt - Date.now()) / 1000));
      res.setHeader("Retry-After", String(seconds));
    }
    res.status(err.status).json({
      ...err.body,
      ...(requestId !== undefined ? { requestId } : {}),
    });
    return;
  }

  // Unknown error — log it and return INTERNAL.
  const log = (req as Request & { log?: { error: (obj: object, msg: string) => void } }).log;
  if (log) {
    log.error({ err }, "unhandled error");
  }

  const internal: Extract<ApiError, { code: "INTERNAL" }> = {
    code: "INTERNAL",
    message: "Internal server error",
  };
  res.status(STATUS_BY_CODE.INTERNAL).json({
    ...internal,
    ...(requestId !== undefined ? { requestId } : {}),
  });
};
