/**
 * Helpers for the signed `plvl_anon` cookie.
 *
 * The cookie carries the `anon_session_id` (a UUID) for unauthenticated
 * visitors so the same browser can be tracked across requests for daily
 * limits and the soft-auth claim flow. The value is signed (HMAC-SHA256)
 * with the server-only `SESSION_SIGNING_KEY` so a tampered cookie cannot
 * forge another visitor's session.
 *
 * Wire format: `<uuid>.<base64url(HMAC-SHA256(uuid, key))>`
 *
 * Cookie attributes (per design.md "Cookies"):
 *   - httpOnly
 *   - secure  (in production only; relaxed in non-prod for local HTTP)
 *   - SameSite=Lax
 *   - Path=/
 *   - Max-Age=400 days
 */

import { createHmac, timingSafeEqual } from "node:crypto";
import type { Request, Response } from "express";

export const ANON_COOKIE_NAME = "plvl_anon";
export const ANON_COOKIE_MAX_AGE_SECONDS = 400 * 24 * 60 * 60;

const VALUE_SEPARATOR = ".";

/**
 * Best-effort UUID v4-or-similar shape check. We accept any RFC-4122-style
 * `8-4-4-4-12` lowercase hex layout because the source is our own database
 * UUID columns (the cookie value is opaque to clients).
 */
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

function getSigningKey(): Buffer {
  const key = process.env["SESSION_SIGNING_KEY"];
  if (!key) {
    throw new Error(
      "SESSION_SIGNING_KEY must be set to sign anonymous session cookies.",
    );
  }
  return Buffer.from(key, "utf8");
}

function sign(value: string): string {
  return createHmac("sha256", getSigningKey())
    .update(value)
    .digest("base64url");
}

/**
 * Build the wire value for `plvl_anon`. Throws if `anonSessionId` does not
 * look like a UUID — never serialize unstructured input into this cookie.
 */
export function signAnonCookieValue(anonSessionId: string): string {
  if (!UUID_RE.test(anonSessionId)) {
    throw new Error("anonSessionId must be a UUID string");
  }
  const sig = sign(anonSessionId);
  return `${anonSessionId}${VALUE_SEPARATOR}${sig}`;
}

/**
 * Verify a wire value and return the embedded `anonSessionId`, or `null` if
 * the value is missing, malformed, or the signature does not match. Uses a
 * constant-time comparison so attackers cannot derive the signing key from
 * timing.
 */
export function verifyAnonCookieValue(raw: string | undefined): string | null {
  if (!raw) {
    return null;
  }

  const idx = raw.indexOf(VALUE_SEPARATOR);
  if (idx <= 0 || idx === raw.length - 1) {
    return null;
  }

  const id = raw.slice(0, idx);
  const sig = raw.slice(idx + 1);

  if (!UUID_RE.test(id)) {
    return null;
  }

  let expected: Buffer;
  let provided: Buffer;
  try {
    expected = Buffer.from(sign(id), "base64url");
    provided = Buffer.from(sig, "base64url");
  } catch {
    return null;
  }

  if (expected.length !== provided.length || expected.length === 0) {
    return null;
  }

  return timingSafeEqual(expected, provided) ? id : null;
}

interface AnonCookieOptions {
  /** Override `secure` — defaults to `NODE_ENV === 'production'`. */
  secure?: boolean;
}

/**
 * Read and verify the `plvl_anon` cookie from a request. Returns the embedded
 * `anonSessionId` or `null` if absent / invalid. Requires the `cookie-parser`
 * middleware to be mounted upstream (so `req.cookies` is populated).
 */
export function readAnonCookie(
  req: Request & { cookies?: Record<string, string | undefined> },
): string | null {
  return verifyAnonCookieValue(req.cookies?.[ANON_COOKIE_NAME]);
}

/**
 * Write the `plvl_anon` cookie with the design-mandated attributes.
 */
export function setAnonCookie(
  res: Response,
  anonSessionId: string,
  opts: AnonCookieOptions = {},
): void {
  const secure = opts.secure ?? process.env["NODE_ENV"] === "production";
  res.cookie(ANON_COOKIE_NAME, signAnonCookieValue(anonSessionId), {
    httpOnly: true,
    secure,
    sameSite: "lax",
    path: "/",
    maxAge: ANON_COOKIE_MAX_AGE_SECONDS * 1000,
  });
}

/**
 * Clear the `plvl_anon` cookie. Use during account deletion or sign-out
 * flows where we explicitly want to abandon the anonymous session.
 */
export function clearAnonCookie(res: Response): void {
  res.clearCookie(ANON_COOKIE_NAME, { path: "/" });
}
