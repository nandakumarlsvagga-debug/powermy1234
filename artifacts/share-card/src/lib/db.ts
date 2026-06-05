import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "@workspace/db/schema";

const { Pool } = pg;

/**
 * Read-only Postgres client for the share-card renderer.
 *
 * The renderer is a pure projection over `scans_public_v` plus signed Storage
 * URL generation; it never writes. We therefore connect with a connection
 * string scoped to a read-only Postgres role and never expose the underlying
 * pool to callers (only `db`).
 *
 * Required environment:
 *   - `SHARE_CARD_DATABASE_URL` — Postgres URL for the read-only role.
 */
const connectionString = process.env["SHARE_CARD_DATABASE_URL"];

if (!connectionString) {
  throw new Error(
    "SHARE_CARD_DATABASE_URL must be set. The share-card renderer requires a read-only Postgres connection.",
  );
}

const pool: pg.Pool = new Pool({
  connectionString,
  // Serverless functions are short-lived; keep the pool small.
  max: 2,
  idleTimeoutMillis: 10_000,
});

export const db = drizzle(pool, { schema });
export type ShareCardDb = typeof db;
