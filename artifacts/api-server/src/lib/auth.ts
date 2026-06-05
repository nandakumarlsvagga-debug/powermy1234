/**
 * Supabase JWT verification with JWKS caching.
 *
 * Per design.md "Authentication": for API requests, the server reads the
 * `sb-access-token` cookie and verifies the JWT against the Supabase JWKS.
 * `jose`'s `createRemoteJWKSet` handles fetching, in-memory caching, and
 * key rotation; we wrap it in a process-wide singleton so a cold start
 * pays the JWKS fetch cost at most once.
 *
 * The verified JWT yields the Supabase auth user id (`sub`), which the rest
 * of the API treats as `member_id`.
 */

import { createRemoteJWKSet, jwtVerify, type JWTPayload } from "jose";
import type { Request } from "express";

/** Cookie name set by `@supabase/ssr` on the apex domain. */
export const ACCESS_TOKEN_COOKIE = "sb-access-token";

const JWKS_PATH = "/auth/v1/.well-known/jwks.json";
const JWKS_TTL_MS = 5 * 60 * 1000;

let cachedJwks: ReturnType<typeof createRemoteJWKSet> | null = null;

function getJwks(): ReturnType<typeof createRemoteJWKSet> {
  if (cachedJwks) {
    return cachedJwks;
  }
  const url = process.env["SUPABASE_URL"];
  if (!url) {
    throw new Error("SUPABASE_URL must be set to verify Supabase JWTs.");
  }
  cachedJwks = createRemoteJWKSet(new URL(`${url}${JWKS_PATH}`), {
    cooldownDuration: JWKS_TTL_MS,
    cacheMaxAge: JWKS_TTL_MS,
  });
  return cachedJwks;
}

export interface AuthenticatedMember {
  /** Supabase auth user id; matches `members.id`. */
  memberId: string;
  /** The full verified JWT payload, for handlers that need additional claims. */
  payload: JWTPayload;
}

/**
 * Pull the access token off the request. Prefers the standard
 * `Authorization: Bearer <token>` header (used by tests and direct API
 * clients) and falls back to the `sb-access-token` cookie set by Supabase.
 */
export function readAccessToken(
  req: Request & { cookies?: Record<string, string | undefined> },
): string | null {
  const auth = req.headers["authorization"];
  if (typeof auth === "string" && auth.toLowerCase().startsWith("bearer ")) {
    const token = auth.slice(7).trim();
    if (token.length > 0) {
      return token;
    }
  }
  const cookie = req.cookies?.[ACCESS_TOKEN_COOKIE];
  return cookie && cookie.length > 0 ? cookie : null;
}

/**
 * Verify a Supabase access token. Resolves to `null` when the token is
 * missing, expired, malformed, or signed by an unknown key. Throws only on
 * unrecoverable infrastructure errors (e.g. JWKS endpoint unreachable),
 * which the caller should surface as `INTERNAL`.
 */
export async function verifyAccessToken(
  token: string | null,
): Promise<AuthenticatedMember | null> {
  if (!token) {
    return null;
  }

  try {
    const { payload } = await jwtVerify(token, getJwks(), {
      // Supabase access tokens are issued by the project's auth server and
      // carry `aud: 'authenticated'` for signed-in users.
      audience: "authenticated",
    });
    if (typeof payload.sub !== "string" || payload.sub.length === 0) {
      return null;
    }
    return { memberId: payload.sub, payload };
  } catch {
    return null;
  }
}

/**
 * Convenience: verify the JWT carried by `req`. Returns `null` for
 * unauthenticated requests so route handlers can decide whether anonymous
 * access is permitted.
 */
export async function authenticate(
  req: Request & { cookies?: Record<string, string | undefined> },
): Promise<AuthenticatedMember | null> {
  return verifyAccessToken(readAccessToken(req));
}

/**
 * Test seam: reset the JWKS singleton so tests can swap `SUPABASE_URL`
 * without leaking cached keys between cases.
 */
export function __resetAuthForTests(): void {
  cachedJwks = null;
}
