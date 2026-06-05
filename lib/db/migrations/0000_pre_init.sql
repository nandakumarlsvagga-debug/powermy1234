--------------------------------------------------------------------------------
-- POWERLVL v1 — Pre-schema migration
--
-- This file installs only the `derive_tier(integer)` function and its
-- dependent enum type. It exists so that the `scans_tier_matches_score`
-- CHECK constraint declared in lib/db/src/schema/scans.ts can resolve
-- `derive_tier` when `drizzle-kit push` creates the `scans` table.
--
-- Apply order:
--   1. THIS FILE (creates the `tier` enum + `derive_tier` function)
--   2. `pnpm --filter @workspace/db run push` (creates all tables, including
--      the scans CHECK that references `derive_tier`)
--   3. `0001_init.sql` (creates the public projection view, enables RLS,
--      installs per-table policies and grants — and re-asserts
--      `derive_tier` via CREATE OR REPLACE for idempotency)
--
-- Validates: Requirements 6.2, 14.4
--------------------------------------------------------------------------------

-- The `tier` enum is also declared in lib/db/src/schema/enums.ts and will be
-- created by `drizzle-kit push` in step 2. We pre-create it here (idempotent
-- via the DO block) so the function below can reference the type. The labels
-- match the schema definition exactly; if they ever drift, drizzle-kit push
-- will fail loudly rather than silently produce an inconsistent DB.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'tier') THEN
    CREATE TYPE public.tier AS ENUM (
      'D', 'C', 'B', 'A', 'S', 'SS', 'SSS', 'LIMITLESS'
    );
  END IF;
END
$$;


CREATE OR REPLACE FUNCTION public.derive_tier(score integer)
RETURNS public.tier
LANGUAGE plpgsql
IMMUTABLE
PARALLEL SAFE
AS $$
BEGIN
  IF score IS NULL THEN
    RAISE EXCEPTION 'derive_tier: score must not be NULL';
  END IF;

  IF score <  1000 OR score > 100000 THEN
    RAISE EXCEPTION 'derive_tier: score % out of range [1000, 100000]', score;
  END IF;

  IF score <=  4999 THEN RETURN 'D'::public.tier;         END IF;
  IF score <= 14999 THEN RETURN 'C'::public.tier;         END IF;
  IF score <= 34999 THEN RETURN 'B'::public.tier;         END IF;
  IF score <= 54999 THEN RETURN 'A'::public.tier;         END IF;
  IF score <= 74999 THEN RETURN 'S'::public.tier;         END IF;
  IF score <= 89999 THEN RETURN 'SS'::public.tier;        END IF;
  IF score <= 98999 THEN RETURN 'SSS'::public.tier;       END IF;
  RETURN 'LIMITLESS'::public.tier;
END;
$$;

COMMENT ON FUNCTION public.derive_tier(integer) IS
  'Maps a Score (1000..100000) to its Tier band per Requirement 6.2. '
  'Used in the scans_tier_matches_score CHECK constraint.';
