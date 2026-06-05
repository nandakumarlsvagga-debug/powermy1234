--------------------------------------------------------------------------------
-- POWERLVL v1 — Initial post-schema migration
--
-- This file installs:
--   1. The Postgres `derive_tier(integer)` function used by the
--      `scans_tier_matches_score` CHECK constraint.
--   2. The `scans_public_v` security-definer view that projects only the
--      columns safe for public, unauthenticated access (Feed, Leaderboard,
--      Permalink).
--   3. Row-Level Security on every Member-owned table.
--   4. Per-table RLS policies for the `anon` and `authenticated` Supabase
--      roles. The API server queries via the service role so these policies
--      are defense-in-depth; the primary authorization happens in route
--      handlers.
--
-- Application order (drizzle-kit migrate / supabase db push):
--   This file is applied AFTER the schema migration that creates the
--   `members`, `scans`, `likes`, `daily_scan_counts`, and `anon_sessions`
--   tables and the `tier` / `category` / `anomaly_type` enums.
--
-- Note on the `scans_tier_matches_score` CHECK in lib/db/src/schema/scans.ts:
--   The CHECK references `derive_tier(score)`. If the schema migration runs
--   before `derive_tier` exists, the table create will fail. The block
--   labeled "DERIVE TIER FUNCTION" below is idempotent and may be applied
--   before the schema migration (e.g. as a Supabase pre-migration hook) so
--   the CHECK can resolve at table-create time. The view and RLS policies
--   in the rest of this file MUST run after the schema migration since they
--   reference table columns and the existing `tier` / `anomaly_type` /
--   `category` enums that drizzle-kit owns.
--
-- Validates: Requirements 6.2, 9.7, 9.8, 14.4
--------------------------------------------------------------------------------


--------------------------------------------------------------------------------
-- 1. DERIVE TIER FUNCTION
--
--   Pure mapping from Score (1000..100000) to Tier per Requirement 6.2:
--     D         1000..4999
--     C         5000..14999
--     B         15000..34999
--     A         35000..54999
--     S         55000..74999
--     SS        75000..89999
--     SSS       90000..98999
--     LIMITLESS 99000..100000
--
--   IMMUTABLE + PARALLEL SAFE so Postgres can use the function inside
--   CHECK constraints, generated columns, and parallel query plans.
--------------------------------------------------------------------------------

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


--------------------------------------------------------------------------------
-- 2. PUBLIC SCAN PROJECTION VIEW (scans_public_v)
--
--   The single read surface for unauthenticated traffic. Restricted to the
--   columns the design's RLS subsection lists as safe to expose:
--     id, username (joined), category, score, tier, anomaly_type,
--     commentary, description, thumbnail_object_key, created_at
--
--   Notably absent from the view (and therefore unreachable by the `anon`
--   role): core_stats, category_stats, image_object_key, image_perceptual_hash,
--   model_response, score_pre_anomaly, anomaly_modifier_pct, member_id,
--   anon_session_id, expires_at, expired_at. The API server reads those via
--   the service role for permalink rendering.
--
--   Security model: the view is owned by the `postgres` role (Supabase
--   default for SQL run from migrations) and `security_invoker = false`
--   makes SELECTs against the view run with the owner's privileges, so RLS
--   on the underlying `scans` table is bypassed for callers who have SELECT
--   on the view itself (`anon`, `authenticated`).
--
--   `expired_at IS NULL` filters out scans whose images have been purged
--   per Requirement 2.9, so QR scans of expired/fake permalinks resolve to
--   the unverified-scan branch in the API (Requirement 8.14).
--------------------------------------------------------------------------------

CREATE OR REPLACE VIEW public.scans_public_v
WITH (security_invoker = false) AS
SELECT
  s.id              AS id,
  m.username        AS username,
  s.category        AS category,
  s.score           AS score,
  s.tier            AS tier,
  s.verdict_noun    AS verdict_noun,
  s.anomaly_type    AS anomaly_type,
  s.commentary      AS commentary,
  s.description     AS description,
  s.thumbnail_object_key AS thumbnail_object_key,
  s.created_at      AS created_at
FROM public.scans s
LEFT JOIN public.members m ON m.id = s.member_id
WHERE s.expired_at IS NULL;

COMMENT ON VIEW public.scans_public_v IS
  'Security-definer projection of scans for public Feed / Leaderboard / '
  'Permalink reads. Excludes claim-able fields and unsafe columns. '
  'username is NULL for unclaimed Anonymous Scans.';


--------------------------------------------------------------------------------
-- 3. ROW-LEVEL SECURITY — enable on every Member-owned table.
--
--   FORCE flag ensures the table owner is also subject to RLS, so accidental
--   queries with the owner role still respect policies.
--------------------------------------------------------------------------------

ALTER TABLE public.members           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.members           FORCE  ROW LEVEL SECURITY;

ALTER TABLE public.scans             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.scans             FORCE  ROW LEVEL SECURITY;

ALTER TABLE public.likes             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.likes             FORCE  ROW LEVEL SECURITY;

ALTER TABLE public.daily_scan_counts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.daily_scan_counts FORCE  ROW LEVEL SECURITY;

ALTER TABLE public.anon_sessions     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.anon_sessions     FORCE  ROW LEVEL SECURITY;


--------------------------------------------------------------------------------
-- 4. GRANTS
--
--   RLS only takes effect when a role first holds a base privilege on the
--   relation. Below we hand out the minimum table-level rights and lean on
--   policies for the row-level filtering. All writes go through the service
--   role, which bypasses RLS, so we deliberately do not grant INSERT /
--   UPDATE / DELETE on `scans`, `members`, `daily_scan_counts`, or
--   `anon_sessions` to `anon` / `authenticated`.
--------------------------------------------------------------------------------

-- Public read of usernames for Profile lookups; column-level grant keeps
-- the rest of the row (deleted_at) out of reach.
GRANT SELECT (id, username, created_at) ON public.members        TO anon, authenticated;

-- A signed-in Member can update its own row (e.g. soft-delete flag).
GRANT UPDATE (deleted_at)                ON public.members        TO authenticated;

-- Authenticated reads of full scan rows are gated by the SELECT policy below.
GRANT SELECT                              ON public.scans          TO authenticated;

-- Public projection view is the only path for `anon` reads of scans.
GRANT SELECT                              ON public.scans_public_v TO anon, authenticated;

-- Likes are toggled directly by the API on behalf of the visitor.
GRANT SELECT, INSERT, DELETE              ON public.likes          TO anon, authenticated;

-- Daily-quota visibility for the dashboard.
GRANT SELECT                              ON public.daily_scan_counts TO authenticated;

-- Anonymous visitors can see their own session row.
GRANT SELECT                              ON public.anon_sessions  TO anon, authenticated;


--------------------------------------------------------------------------------
-- 5. POLICIES — `members`
--
--   - Anyone may read the public projection (id, username, created_at). RLS
--     does not filter columns, so the column-level grant above is what
--     prevents leakage of `deleted_at`.
--   - A signed-in Member may update only its own row.
--------------------------------------------------------------------------------

DROP POLICY IF EXISTS members_select_public ON public.members;
CREATE POLICY members_select_public
  ON public.members
  FOR SELECT
  TO anon, authenticated
  USING (deleted_at IS NULL);

DROP POLICY IF EXISTS members_update_self ON public.members;
CREATE POLICY members_update_self
  ON public.members
  FOR UPDATE
  TO authenticated
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid());


--------------------------------------------------------------------------------
-- 6. POLICIES — `scans`
--
--   Authenticated members may read full rows only for their own Scans. All
--   public read paths (Feed, Leaderboard, Permalink) go through
--   `scans_public_v`, which bypasses this policy by design.
--
--   Writes are service-role only. We deliberately omit INSERT / UPDATE /
--   DELETE policies so any non-service write attempt is denied by the
--   default-deny RLS behavior.
--------------------------------------------------------------------------------

DROP POLICY IF EXISTS scans_select_owner ON public.scans;
CREATE POLICY scans_select_owner
  ON public.scans
  FOR SELECT
  TO authenticated
  USING (auth.uid() = member_id);


--------------------------------------------------------------------------------
-- 7. POLICIES — `likes`
--
--   Visitor identity comes from one of:
--     - `auth.uid()` for signed-in Members
--     - `current_setting('app.anon_session_id', true)` for anonymous visitors
--       (set per-request by the API server from the signed `plvl_anon`
--       cookie; second arg `true` returns NULL when unset rather than
--       erroring).
--
--   The COALESCE guards prevent NULL setting matches from short-circuiting
--   to TRUE on rows whose `anon_session_id` is also NULL.
--------------------------------------------------------------------------------

DROP POLICY IF EXISTS likes_select_visitor ON public.likes;
CREATE POLICY likes_select_visitor
  ON public.likes
  FOR SELECT
  TO anon, authenticated
  USING (
    (member_id IS NOT NULL AND member_id = auth.uid())
    OR (
      anon_session_id IS NOT NULL
      AND COALESCE(current_setting('app.anon_session_id', true), '') <> ''
      AND anon_session_id::text = current_setting('app.anon_session_id', true)
    )
  );

DROP POLICY IF EXISTS likes_insert_visitor ON public.likes;
CREATE POLICY likes_insert_visitor
  ON public.likes
  FOR INSERT
  TO anon, authenticated
  WITH CHECK (
    (member_id IS NOT NULL AND member_id = auth.uid())
    OR (
      anon_session_id IS NOT NULL
      AND COALESCE(current_setting('app.anon_session_id', true), '') <> ''
      AND anon_session_id::text = current_setting('app.anon_session_id', true)
    )
  );

DROP POLICY IF EXISTS likes_delete_visitor ON public.likes;
CREATE POLICY likes_delete_visitor
  ON public.likes
  FOR DELETE
  TO anon, authenticated
  USING (
    (member_id IS NOT NULL AND member_id = auth.uid())
    OR (
      anon_session_id IS NOT NULL
      AND COALESCE(current_setting('app.anon_session_id', true), '') <> ''
      AND anon_session_id::text = current_setting('app.anon_session_id', true)
    )
  );


--------------------------------------------------------------------------------
-- 8. POLICIES — `daily_scan_counts`
--
--   A Member may read its own daily-quota row. Writes go through the
--   service role (the API increments the counter inside the scan-creation
--   transaction).
--------------------------------------------------------------------------------

DROP POLICY IF EXISTS daily_scan_counts_select_self ON public.daily_scan_counts;
CREATE POLICY daily_scan_counts_select_self
  ON public.daily_scan_counts
  FOR SELECT
  TO authenticated
  USING (member_id = auth.uid());


--------------------------------------------------------------------------------
-- 9. POLICIES — `anon_sessions`
--
--   An anonymous visitor may read its own session row (driven by the same
--   `app.anon_session_id` GUC the likes policy uses). Writes go through the
--   service role (`POST /api/anon/session`).
--------------------------------------------------------------------------------

DROP POLICY IF EXISTS anon_sessions_select_self ON public.anon_sessions;
CREATE POLICY anon_sessions_select_self
  ON public.anon_sessions
  FOR SELECT
  TO anon, authenticated
  USING (
    COALESCE(current_setting('app.anon_session_id', true), '') <> ''
    AND id::text = current_setting('app.anon_session_id', true)
  );
