# Implementation Plan: POWERLVL v1

## Overview 
now 
This plan converts the POWERLVL v1 design into a series of incremental TypeScript implementation steps for the existing pnpm monorepo. The work proceeds bottom-up: shared foundations (database schema, design tokens, OpenAPI contract) first, then pure libraries (scoring, sanitizer, QR, images, moderation, rate-limiter, vision, reveal-controller), then the API server pipeline, then the share-card renderer, then the web client, and finally background jobs and CI gates. Property-based tests are placed next to the code under test using `vitest` + `fast-check`, and each property is annotated with its property number from the design and the requirement clause it validates. Tasks marked `*` are optional test sub-tasks; core implementation tasks are never optional.

Convert the feature design into a series of prompts for a code-generation LLM that will implement each step with incremental progress. Make sure that each prompt builds on the previous prompts, and ends with wiring things together. There should be no hanging or orphaned code that isn't integrated into a previous step. Focus ONLY on tasks that involve writing, modifying, or testing code.

## Tasks

- [x] 1. Set up shared foundations (design tokens, database schema, API spec base)
  - [x] 1.1 Create `@workspace/design-tokens` package with colors, fonts, spacing, motion presets, tier accents, and monoline icon SVGs
    - Add `lib/design-tokens/package.json`, `tsconfig.json`, `src/index.ts` exporting `COLORS`, `TIER_ACCENTS`, `FONTS`, `SPACING_BASE`, `HERO_CLEARANCE_PX`
    - Add `src/motion.ts` with `SPRINGS`, `EASINGS`, `DURATIONS` and a `withReducedMotion(preset)` helper
    - Add `src/icons/` with monoline SVG components for the six Categories, navigation, and HUD glyphs
    - Add the POWERLVL wordmark SVG and PNG asset variants under `src/wordmark/`
    - _Requirements: 12.1, 12.2, 12.3, 12.4, 12.5, 12.7, 12.11, 12.16, 12.17_

  - [x] 1.2 Populate Drizzle schema in `lib/db/src/schema/` for all required tables
    - Add one file per table: `members.ts`, `scans.ts`, `likes.ts`, `rate-limit-buckets.ts`, `daily-scan-counts.ts`, `anon-sessions.ts`, `pending-cleanups.ts`, `account-deletions.ts`
    - Wire all tables through `src/schema/index.ts`
    - Encode CHECK constraints (`score BETWEEN 1000 AND 100000`, `(member_id IS NULL) <> (anon_session_id IS NULL OR member_id IS NOT NULL)`, tier-from-score)
    - Add indexes per design (`(score DESC, created_at ASC)`, `(category, score DESC, created_at ASC)`, `(created_at DESC)`, `(member_id, created_at DESC)`, `(anon_session_id, created_at DESC)`, partial purge index, partial unique like indexes)
    - _Requirements: 2.7, 2.8, 2.9, 2.10, 6.1, 6.2, 9.2, 10.3, 10.4, 11.3_

  - [x] 1.3 Author SQL migrations for the Postgres `derive_tier` function, the `scans_public_v` security-definer view, and Supabase RLS policies
    - Create `lib/db/migrations/0001_init.sql` containing the function, view, RLS enable, and per-table policies for `members`, `scans`, `likes`, `daily_scan_counts`, `anon_sessions`
    - Wire `drizzle.config.ts` to emit migrations alongside the schema
    - _Requirements: 6.2, 9.7, 9.8, 14.4_

  - [x] 1.4 Extend `lib/api-spec/openapi.yaml` with the v1 endpoint catalog and shared schemas
    - Add paths: `/anon/session`, `/scans`, `/scans/{id}`, `/scans/{id}/share-card.png`, `/scans/{id}/claim`, `/scans/{id}/like`, `/feed`, `/leaderboards`, `/profiles/{username}`, `/profiles/{username}/scans`, `/me`, `/me/username`
    - Add components: `Category`, `Tier`, `AnomalyType`, `ScanPublic`, `CreateScanResponse`, `LeaderboardEntry`, `LeaderboardResponse`, `ProfilePublic`, and the `ApiError` discriminated union
    - Mark request bodies as `multipart/form-data` for `POST /scans` and JSON elsewhere
    - _Requirements: 1.1, 1.6, 3.1, 3.6, 8.1, 8.10, 9.2, 10.1, 10.2, 10.5, 11.1, 11.7_

  - [x] 1.5 Regenerate `@workspace/api-client-react` and `@workspace/api-zod` from the updated OpenAPI spec
    - Run `pnpm --filter @workspace/api-spec run codegen` and commit the generated output
    - Add a CI guard that fails when generated files are out of sync with the spec
    - _Requirements: 3.6, 9.2, 10.5, 11.7_

- [ ] 2. Implement deterministic scoring and anomaly engine in `@workspace/scoring`

  > **DUAL-PASS UPDATE.** Sub-tasks 2.1 (single-pass `computeScore`) and 2.3–2.5 are partially superseded by the Dual-Pass Cultural Scoring Engine (see `nova-lite-system-prompt.md` Blocks K–O and `design.md` "Dual-Pass Cultural Scoring Engine"). Keep the PRNG (`mulberry32`) and tier-mapping pieces of 2.1; replace `computeScore`/`computeStats` with `renderScore` per Pass 2 spec. Add the new sub-tasks 2.8–2.13 below for the Dual-Pass renderer, verdict-noun pool, modifier engine, and brand bonuses.
  - [x] 2.1 Create `lib/scoring` package and implement the pure scoring core
    - Add `src/types.ts` with `Category`, `Tier`, `CoreStats`, `CategoryStats`, `TraitConfidences`, `ScoringInput`
    - Add `src/category-stats.ts` exporting the `CATEGORY_STATS` map for all six categories
    - Add `src/score.ts` with `confidenceToStat`, `computeStats`, `computeScore`, `scoreToTier`, and the `CORE_WEIGHTS` / `CATEGORY_WEIGHT_TOTAL` constants
    - Add `src/prng.ts` with the vendored `mulberry32` PRNG
    - Re-export the public surface from `src/index.ts`
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.6, 6.7_

  - [x] 2.2 Implement the anomaly engine in `lib/scoring/src/anomaly.ts`
    - Export `deriveAnomalySeed`, `drawAnomaly`, `applyAnomalyModifier` with the `ANOMALY_WEIGHTS` table and per-anomaly modifier bands
    - Clamp the modified score to `[1000, 100000]` and round `modifierPct` to two decimals for audit
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5, 7.6, 7.7, 7.8, 7.9_

  - [ ] 2.3 Add `CulturalReading` and `RenderedScore` types to `lib/scoring/src/types.ts`
    - Include all fields per `nova-lite-system-prompt.md` Block 2 and Block K
    - Export `Archetype`, `SubjectClass`, `JokeTarget`, `MemeticStatus`, `BrandSlug` enums/unions
    - _Requirements: 5.1, 5.3, 6.4_

  - [ ] 2.4 Implement `renderScore(reading, seed) → RenderedScore` in `lib/scoring/src/render.ts`
    - Step 1: baseScore from `(0.65*tasteDemonstrated + 0.35*culturalRecognition) ** 1.45 * 99000 + 1000`
    - Step 2: modifier engine in fixed order per Block L (anti-iconic ceiling, satirical-inversion floor, reverence-protected floor, iconic floor, iconic-meme floor, POWERLVL brand pull+cap, taste-brand bonus+cap, pretension penalty, self-aware affection, out-of-scope cap, final clamp)
    - Step 3: tier from score range
    - Step 4: verdict noun via deterministic flavor-and-seed pick (see 2.5)
    - Step 5: per-category stat derivation via the per-category mapping in Block L Step 5
    - Return `RenderedScore` with `score`, `tier`, `verdictNoun`, `coreStats`, `categoryStats`, `modifiersApplied: ModifierLog[]`, `scorePreModifiers`
    - _Requirements: 5.3, 5.4, 5.5, 6.1, 6.2, 6.3, 6.4, 6.5, 6.7_

  - [ ] 2.5 Implement verdict-noun pool and selection in `lib/scoring/src/verdict-nouns.ts`
    - Author the full pool per Block O (D, C, B, A, S, SS, SSS, LIMITLESS each with their flavored noun groups)
    - Implement `pickVerdictNoun(tier, dominantFlavor, scanId) → string` deterministic via `mulberry32(sha256(scanId+tier+flavor))`
    - Build-time test ensures every flavor under every tier has at least 3 candidate nouns
    - _Requirements: 6.3_

  - [ ] 2.6 Implement taste-brand allowlist in `lib/scoring/src/taste-brands.ts`
    - Author the v1 allowlist per Block 6 of the prompt (margiela, apc, carhartt, … hario, fellow, rogue_fitness, eleiko)
    - Export `TASTE_BRANDS: Record<BrandSlug, BrandMetadata>`
    - The allowlist is the single source of truth — Pass 1 emissions outside the list are silently dropped at validation
    - _Requirements: 5.4_

  - [ ] 2.7 Write property tests for `renderScore` in `lib/scoring/test/render.properties.spec.ts`
    - **P-R1**: score range — score ∈ [1000, 100000] for any valid reading
    - **P-R2**: determinism — same reading + same scanId → same RenderedScore
    - **P-R3**: anti-iconic ceiling — subjectClass = anti_iconic → score ≤ 4999
    - **P-R4**: satirical inversion floor — satirical_inversion + the_powerful → score ≥ 55000
    - **P-R5**: reverence floor — reverence_protected → score ≥ 15000
    - **P-R6**: iconic floor — iconic → score ≥ 55000
    - **P-R7**: iconic-meme floor — iconic_meme → score ≥ 75000
    - **P-R8**: POWERLVL brand cap — brand visible + (mid OR trying_too_hard) → score ≤ 74999
    - **P-R9**: taste-brand cap — taste brands + (mid OR trying_too_hard) → score ≤ 54999
    - **P-R10**: pretension penalty — pretension ≥ 70 + (mid OR trying_too_hard) → score ≤ 19999
    - **P-R11**: distribution — over 10,000 sampled readings, ≥80% of scores in [15000, 70000]
    - **P-R12**: verdict determinism — same reading → same verdict noun
    - **P-R13**: verdict tier match — verdict noun is from the pool matching the rendered tier
    - **P-R14**: LIMITLESS gate — LIMITLESS scores require iconic/iconic_meme + culturalRecognition ≥ 95
    - _Requirements: 5.5, 6.1, 6.5, 6.6, 6.7_

  - [ ] 2.8 Write canonical anchor tests in `lib/scoring/test/render.anchors.spec.ts`
    - All anchors A-1 through A-17 from Block N (Mona Lisa ≥ SS, Doge ≥ SS, Spider-Man meme ≥ SS, McLaren F1 ≥ S, champion bodybuilder ≥ S, religious icon ≥ S, Kim Jong Un in frock ≥ S, plain Kim Jong Un = D, terrorist glory = D, kid drawing ≥ B, first dorm setup ≥ B, mall drip ≤ C+, ricer Civic ≤ C+, mug in light ∈ {B, A}, POWERLVL sticker on mid setup ∈ {A, S} AND < LIMITLESS, Margiela coat fit ≥ S, Mac Pro setup with HHKB ≥ S)
    - Each anchor has a hand-authored `CulturalReading` fixture in `lib/scoring/test/fixtures/anchors.ts`
    - **CI MUST FAIL if any anchor regresses.** The cultural floors are the product's reputation; they cannot drift silently.
    - _Requirements: 6.7_

- [x] 3. Implement description sanitizer in `@workspace/description-sanitizer`
  - [x] 3.1 Create `lib/description-sanitizer` package and implement `sanitizeDescription`
    - Add the `INJECTION_PATTERNS` regex list and a profanity deny-list with leet mapping
    - Strip flagged spans, drop empty results to `null`, and cap length at 120
    - Export `SanitizationResult` and `sanitizeDescription` from `src/index.ts`
    - _Requirements: 3.6, 3.7, 14.5_

  - [x] 3.2 Write property test for sanitizer in `lib/description-sanitizer/test/sanitizer.properties.spec.ts`
    - **Property 41: Sanitizer Idempotence** — assert `sanitize(sanitize(x)) === sanitize(x)`
    - **Property 42: Sanitizer Length Cap** — assert `sanitize(x).length ≤ 120` (or `null`)
    - **Property 43: Sanitizer Pattern Strip** — for every `INJECTION_PATTERNS` member `p`, assert `p.test(sanitize(x)) === false`
    - **Validates: Requirements 3.6, 3.7, 14.5**

- [x] 4. Implement QR renderer in `@workspace/qr`
  - [x] 4.1 Create `lib/qr` package wrapping `qrcode-generator` at error-correction level M
    - Export `renderQrSvg(text, opts?)` returning deterministic SVG with configurable size and quiet zone
    - Default to a 4-module quiet zone and a module pixel size that meets the 264 px / 220 px / 160 px requirements per ratio
    - _Requirements: 8.3, 8.4, 8.5_

  - [x] 4.2 Write QR-decode round-trip test in `lib/qr/test/qr.properties.spec.ts`
    - For arbitrary URL-shaped strings of length 16..256, render the SVG, rasterize with `@resvg/resvg-js`, decode with `jsqr`, and assert the decoded text equals the input
    - **Property 38: Card Carries QR Encoding Permalink (library-level precondition)**
    - **Validates: Requirements 8.3, 8.4**

- [x] 5. Implement image processor in `@workspace/images`
  - [x] 5.1 Create `lib/images` package implementing the `sharp`-based pipeline
    - Export `processImage({ bytes, declaredMime })` returning `ProcessedImage`
    - Validate format ∈ {JPEG, PNG, HEIC, WebP}, size ≤ 8 MB, shorter edge ≥ 256 px, and declared MIME matches decoded MIME via magic-byte sniffing
    - Strip EXIF, bake orientation, downscale longer edge ≤ 1600 px, encode AVIF → fall back to WebP at decreasing quality until ≤ 300 KB
    - Generate a 480 px long-edge WebP thumbnail and compute an 8×8-DCT perceptual hash
    - Throw a typed `ImageInvalidError` with `reason ∈ {'size','format','dimensions','mime_mismatch'}` on validation failure
    - _Requirements: 2.1, 2.2, 2.3, 2.7_

  - [x] 5.2 Write unit tests for `processImage` in `lib/images/test/process.spec.ts`
    - Cover each rejection branch (size, format, dimensions, mime mismatch) and a happy-path case verifying EXIF strip, ≤ 1600 px longest edge, ≤ 300 KB final size, and thumbnail dimensions
    - _Requirements: 2.1, 2.2, 2.3, 2.7_

- [ ] 6. Implement moderation adapter in `@workspace/moderation`
  - [x] 6.1 Create `lib/moderation` package wrapping AWS Rekognition `DetectModerationLabels`
    - Export `moderate(imageBytes)` returning `{ ok, flaggedLabels }`; fail on confidence ≥ 70 for {Explicit Nudity, Violence, Hate Symbols}
    - Apply a 3 s timeout; throw a typed `ModerationUnavailableError` on SDK error or timeout so callers can map to `MODERATION_UNAVAILABLE`
    - Inject the SDK client via constructor for test stubbing
    - _Requirements: 2.4, 2.5, 2.6_

  - [x] 6.2 Write unit tests for `moderate` in `lib/moderation/test/moderate.spec.ts`
    - Stub the SDK client to cover: clean image, flagged image (each category), SDK error, timeout
    - _Requirements: 2.4, 2.5, 2.6_

- [x] 7. Implement Postgres-backed rate limiter in `@workspace/ratelimit`
  - [x] 7.1 Create `lib/ratelimit` package implementing `consume(bucketKey, capacity, refillPerSec)`
    - Use a single atomic `UPDATE ... RETURNING` against `rate_limit_buckets` that computes refilled tokens from `refilled_at` and decrements one if available
    - Return `{ ok, retryAfterSec, remaining }` and never block the request loop
    - _Requirements: 14.1, 14.2_

  - [x] 7.2 Write integration tests against a dockerized Postgres in `lib/ratelimit/test/consume.spec.ts`
    - Verify cap, refill, concurrent consume contention (two parallel transactions cannot both consume the last token), and `retryAfterSec` correctness
    - _Requirements: 14.1, 14.2_

- [ ] 8. Implement Vision adapter, slop detector, and fallback library in `@workspace/vision`

  > **DUAL-PASS UPDATE.** Sub-task 8.6 (single Bedrock call) and 8.7 (single-call orchestration) are superseded by the Dual-Pass architecture (Pass 1 + Pass 3). Keep 8.1 (skeleton), 8.2 (slop detector), 8.4 (fallback library), and 8.6's banned-words / few-shot infrastructure. Replace 8.6's single `analyzeImage` with separate `readImage` (Pass 1) and `writeCommentary` (Pass 3) per Pass 2 spec. Add new sub-tasks 8.9–8.14 below for Pass 1 and Pass 3.
  - [x] 8.1 Create `lib/vision` package skeleton with shared types and the banned-words list
    - Add `src/index.ts` exporting `VisionRequest`, `VisionResult`, `analyzeImage`
    - Add `src/banned-words.ts` with at least 50 banned flat positive adjectives, including all five required examples (`great`, `nice`, `amazing`, `awesome`, `cool`)
    - Add `src/types.ts` for the structured Bedrock response schema
    - _Requirements: 5.5_

  - [x] 8.2 Implement the slop detector in `lib/vision/src/slop-detector.ts`
    - Reject when word count is outside `[8, 14]`, when any banned word matches as a whole word (case-insensitive), or when no `imageNouns` entry appears as a whole word
    - Return `SlopVerdict` with `reason ∈ {'word_count','banned_word','no_image_noun'}`
    - _Requirements: 5.5_

  - [ ] 8.3 Write property test for slop detector in `lib/vision/test/slop.properties.spec.ts`
    - **Property 15: Slop Word-Count Band** — accept iff word count ∈ [8, 14]
    - **Property 16: Slop Banned Word Reject** — reject when any banned word appears as a whole word
    - **Property 17: Slop Image-Noun Grounding** — reject when no `imageNouns` entry appears as a whole word
    - **Validates: Requirements 5.5**

  - [x] 8.4 Implement the fallback commentary library in `lib/vision/src/fallback-library.ts`
    - Author at least 24 templates per Category (≥ 144 total), each with one `{noun}` slot and a `[minTier, maxTier]` band, spanning all eight tiers per category
    - Implement `pickFallback(category, tier, imageNouns, seed)` using `mulberry32` so selection is deterministic
    - At build time, run every template through the slop detector with a representative noun to assert none can produce slop
    - _Requirements: 5.6_

  - [ ] 8.5 Write property test for fallback library in `lib/vision/test/fallback.properties.spec.ts`
    - **Property 18: Fallback Never Slop** — for arbitrary `(category, tier, nouns, seed)`, assert `pickFallback` output passes `detectSlop`
    - **Validates: Requirements 5.6**

  - [ ] 8.6 Author the Pass 1 (Read) prompt and implement `readImage(req: VisionRequest) → Promise<CulturalReading>` in `lib/vision/src/read-image.ts`
    - System prompt from Blocks A through I. Category specific archetypes and allowlist brands.
    - Call Bedrock with `temperature=0`, `top_p=0.1`, structured output.
    - Retry once on parse/validation failure. Synthesize neutral reading on double failure.
    - _Requirements: 5.1, 5.2, 5.9, 5.10, 5.12_

  - [ ] 8.7 Author the Pass 3 (Voice) prompt and implement `writeCommentary(req: CommentaryRequest) → Promise<string>` in `lib/vision/src/write-commentary.ts`
    - System prompt from Blocks P through T. Verdict noun voice rules and few-shots.
    - Call Bedrock with `temperature=0`, `top_p=0.1`, structured output.
    - Retry once on slop/parse failure. Fall back to library on double failure.
    - _Requirements: 5.7, 5.8, 5.11_

  - [ ] 8.8 Implement `analyzeImage` orchestration in `lib/vision/src/index.ts`
    - Orchestrates Pass 1 (`readImage`) → Pass 2 (`renderScore` from `@workspace/scoring`) → Anomaly Draw → Pass 3 (`writeCommentary`) → `AnalyzeImageResult`
    - Enforce process-wide cap of 120 Bedrock invocations per minute leaky-bucket counter.
    - _Requirements: 5.1, 5.3, 5.7, 5.10, 5.11, 5.12_

  - [ ] 8.9 Write unit and integration tests for the dual-pass orchestration in `lib/vision/test/analyze.spec.ts`
    - Cover retry-then-success, retry-then-fail-to-neutral-fallback, slop-reject-uses-fallback, and concurrency-cap exhaustion paths.
    - _Requirements: 5.5, 5.6, 5.7, 5.8, 5.9_

- [ ] 9. Implement reveal controller in `@workspace/reveal-controller`
  - [x] 9.1 Create `lib/reveal-controller` package with `RevealController` and the `RevealPhase` state machine
    - Schedule transitions on `requestAnimationFrame` against `performance.now()` deltas with `MAX_TOTAL_MS = 10000`
    - Hold `analysis` if response arrives early; extend by up to 4 s if late; emit `scouter_failure` against a deterministic neutral payload past the max
    - Honor `reducedMotion` by routing through `withReducedMotion` from `@workspace/design-tokens`
    - Emit phase transitions via `onPhase(phase, ctx)` so the web client can drive UI without owning timing
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 4.7, 4.10, 12.15_

  - [ ] 9.2 Write property test for the reveal controller in `lib/reveal-controller/test/reveal.properties.spec.ts`
    - Inject a `FakePerformance` clock and a controllable response promise
    - **Property 32: Reveal Total Duration Bound** — total wall-clock time ∈ [7000, 10000] ms
    - **Property 33: Reveal Slam After Analysis-Min** — `slam` fires no earlier than 6500 ms from start
    - **Property 34: Reveal Order** — Score → Tier → Core → Category → Commentary order is preserved and elements never disappear before `done`
    - **Property 35: Reduced-Motion Preserves Order** — same ordering and same `done` time hold under `reducedMotion=true`
    - **Property 36: Reveal Variant Determinism** — variant played equals `response.reveal.revealVariant` when response arrives in budget
    - **Validates: Requirements 4.2, 4.3, 4.4, 4.6, 4.7, 4.10, 7.1, 7.2, 12.15**



- [ ] 20. Update DB schema for Dual-Pass persistence
  - [ ] 20.1 Extend `scans` table in `lib/db/src/schema/scans.ts`
    - Add `cultural_reading` jsonb (the full Pass 1 output, for audit and future re-rendering)
    - Add `verdict_noun` text NOT NULL
    - Add `score_pre_modifiers` integer NOT NULL (audit / property tests)
    - Add `modifiers_applied` jsonb (the audit log of which modifiers fired)
    - Migration is forward-compatible — v1 has not shipped yet, so no live data to migrate
    - _Requirements: 5.3, 5.5, 6.3, 6.7_

  - [ ] 20.2 Update `scans_public_v` view in `lib/db/migrations/0001_init.sql` to include `verdict_noun`
    - Verdict noun is part of the public projection (it appears on Share Card, Permalink, Feed, Leaderboard)
    - _Requirements: 6.3_

  - [ ] 20.3 Update generated API client types after schema change
    - Re-run `pnpm --filter @workspace/api-spec run codegen` to include `verdictNoun` in `ScanPublic`
    - Update `OpenAPI.yaml` to include `verdictNoun: string` on the `ScanPublic` schema
    - _Requirements: 6.3_

- [ ] 10. Checkpoint - shared libraries
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 11. Implement API server pipeline and routes in `artifacts/api-server`
  - [ ] 11.1 Wire shared dependencies into `artifacts/api-server`
    - Add `@workspace/db`, `@workspace/scoring`, `@workspace/vision`, `@workspace/moderation`, `@workspace/images`, `@workspace/ratelimit`, `@workspace/qr`, `@workspace/api-zod`, `@workspace/description-sanitizer` to its `package.json`
    - Add `src/lib/supabase.ts` (service-role client) and `src/lib/auth.ts` for JWT verification + JWKS caching
    - Add `src/lib/cookies.ts` for the signed `plvl_anon` cookie helpers (HMAC-SHA256, httpOnly, SameSite=Lax, 400-day max-age)
    - Add `src/lib/errors.ts` with the discriminated `ApiError` builder and an Express error middleware mapping thrown errors to JSON
    - Mount `multer` (or `busboy`) for `multipart/form-data` only on `POST /scans`
    - _Requirements: 9.1, 14.3, 14.4, 14.6_

  - [ ] 11.2 Implement `POST /api/anon/session` in `src/routes/anon-session.ts`
    - Accept the visitor fingerprint and IANA `localTz`, upsert into `anon_sessions`, set the signed `plvl_anon` cookie, and return the current daily-quota state
    - _Requirements: 1.2_

  - [ ] 11.3 Implement the scan creation pipeline orchestrator in `src/scan-pipeline/index.ts`
    - Sequence: rate-limit checks → daily-limit checks → multipart parse → image validation → description sanitization → moderation → image processing → storage write (with `pending_cleanups` row) → vision analysis → scoring → anomaly draw + clamp → persistence in a single transaction → share-card pre-warm → response
    - Compute the stable seed `sha256(member_id || anon_session_id || image_perceptual_hash || category)` and pass it to scoring/anomaly
    - Enforce the 6.0 s server-side budget; abort Bedrock at 4.0 s and fall through to neutral fallback so the response lands by ~6.0 s
    - _Requirements: 1.1, 1.5, 1.6, 2.1–2.10, 3.1, 3.3, 3.4, 3.5, 3.6, 3.7, 3.8, 4.5, 5.1–5.9, 6.1–6.7, 7.1–7.10, 14.1, 14.5, 14.6_

  - [ ] 11.4 Implement `POST /api/scans` in `src/routes/scans.ts`
    - Validate the request via the generated Zod schemas; reject with `INVALID_INPUT` on failure
    - Enforce per-IP (10/hour), per-Member (30/hour), Anonymous (1/local-day), Member (25/UTC-day) limits via `@workspace/ratelimit` and the `daily_scan_counts` table
    - Validate `localDate` against current UTC ± 26 hours; validate `localTz` against an IANA list
    - Invoke the pipeline; on `MODERATION_REJECTED` / `MODERATION_UNAVAILABLE` / `IMAGE_INVALID`, return the matching `ApiError` and persist nothing
    - Return `CreateScanResponse` with `scan` and `reveal.{ serverElapsedMs, revealVariant }`
    - _Requirements: 1.1, 1.2, 1.3, 1.5, 1.6, 2.1–2.6, 3.1–3.8, 4.5, 5.1, 9.4, 9.5, 14.1, 14.5_

  - [ ] 11.5 Implement `GET /api/scans/{id}` and `POST /api/scans/{id}/claim` in `src/routes/scans.ts`
    - `GET`: return the public projection from `scans_public_v` joined with `members`; signed image and thumbnail URLs ≤ 24 h; include the absolute `permalink` and `shareCardUrls`
    - `claim`: require authenticated caller; verify the Scan has `member_id IS NULL` and matches the caller's `plvl_anon` cookie; on match, atomically `UPDATE scans SET member_id = auth.uid(), anon_session_id = NULL`; idempotent on a Scan already owned by the caller, `403` on mismatch
    - _Requirements: 1.4, 8.10, 8.11, 8.13, 8.14, 9.6_

  - [ ] 11.6 Implement `POST /api/scans/{id}/like` in `src/routes/likes.ts`
    - Toggle a `likes` row keyed by `member_id` when authenticated, else by `anon_session_id`
    - Return `{ liked, likeCount }`; the count uses the per-scan 60 s aggregate cache
    - _Requirements: 11.3, 11.5_

  - [ ] 11.7 Implement `GET /api/feed` in `src/routes/feed.ts`
    - Cursor pagination by `created_at < cursor` with `LIMIT 21` for hasMore detection
    - Return both claimed and unclaimed Scans; render `username = null` for unclaimed; exclude rows with `expired_at IS NOT NULL`
    - Set `Cache-Control: private, max-age=0, must-revalidate`
    - _Requirements: 11.1, 11.2_

  - [ ] 11.8 Implement `GET /api/leaderboards` in `src/routes/leaderboards.ts`
    - Validate `window ∈ {today, week, all}` and `scope ∈ {global, setups, fitness, drip, pets, rides, wildcard}`
    - Run the parametrized SQL from the design (`ROW_NUMBER` ordering by `score DESC, created_at ASC`, limit 100, members-only join)
    - Return only `{ rank, scanId, username, category, score, tier, anomaly, createdAt, permalink }` per entry
    - Set `Cache-Control: public, max-age=10, s-maxage=30`
    - _Requirements: 10.1, 10.2, 10.3, 10.4, 10.5, 10.6, 10.7_

  - [ ] 11.9 Implement `GET /api/profiles/{username}` and `GET /api/profiles/{username}/scans` in `src/routes/profiles.ts`
    - Return the `ProfilePublic` projection plus the first page of scan history (20, newest first); compute aggregates with the per-Member 5 min cache
    - Respond `404 NOT_FOUND` for unknown usernames
    - _Requirements: 11.6, 11.7, 11.8_

  - [ ] 11.10 Implement `GET /api/me`, `POST /api/me/username`, and `DELETE /api/me` in `src/routes/me.ts`
    - `GET /me`: return current member, daily-quota state, and any claim-eligible unclaimed Scan IDs
    - `POST /me/username`: validate `^[a-z0-9_]{3,20}$` and case-insensitive uniqueness; on `unique` violation map to `INVALID_INPUT { rule: 'uniqueness' }`; create the `members` row only on success
    - `DELETE /me`: write the audit row, then run the seven-step transaction (storage delete → scans → likes → daily counts → members → Supabase Auth admin delete)
    - _Requirements: 2.10, 9.1, 9.2, 9.3, 9.7_

  - [ ] 11.11 Implement structured logging and observability in `src/lib/logger.ts`
    - Configure `pino` with the `REDACT` list (no `description`, no `imageBytes`, no auth headers, no service keys)
    - Emit `vision.invocation`, `moderation.invocation`, `ratelimit.reject`, `scan.created`, `auth.signin` events; never log raw model output at INFO
    - Propagate a per-request `request_id` to all child SDK calls and surface it in error responses
    - _Requirements: 14.6_

  - [ ] 11.12 Wire all routes into `src/routes/index.ts` and add the `X-PLVL-Client: web` CSRF check + same-origin CORS middleware
    - _Requirements: 9.8, 14.3_

  - [ ] 11.13 Write integration tests for the scan pipeline in `artifacts/api-server/test/scan-pipeline.spec.ts`
    - Run against dockerized Postgres with stubbed Bedrock and Rekognition
    - Cover happy path, moderation reject, moderation unavailable, image invalid, slop fallback, vision retry → success, vision retry → neutral fallback, anonymous daily-limit hit, member daily-limit hit, IP rate-limit hit, claim flow end-to-end
    - _Requirements: 1.1, 1.2, 1.3, 1.5, 2.1–2.10, 3.6, 3.7, 5.5, 5.6, 5.7, 5.8, 9.4, 9.5, 9.6, 14.1, 14.5_

  - [ ] 11.14 Write API surface property tests in `artifacts/api-server/test/properties.spec.ts`
    - **Property 19: Score Persistence Equals Recompute** — recompute score from persisted confidences/category/anomaly/seed and assert equality with persisted score
    - **Property 20: Tier Persistence Consistent** — assert `tier === scoreToTier(score)` for every persisted Scan
    - **Property 21: Anonymous Daily-Limit Invariant** — count of anonymous Scans per `anon_session_id` per local day ≤ 1
    - **Property 22: Member Daily-Limit Invariant** — count of Member Scans per `member_id` per UTC day ≤ 25
    - **Property 23: One Like Per Visitor** — at most one `likes` row per `(scan_id, visitor)`
    - **Property 24: Leaderboard Field Set** — every entry has exactly `{rank, scanId, username, category, score, tier, anomaly, createdAt, permalink}`
    - **Property 25: Leaderboard Members Only** — every entry has non-null `username`
    - **Property 26: Leaderboard Tiebreak** — equal-score entries are ordered by earlier `createdAt` first
    - **Property 30: Description Length Cap** — persisted `description` is null or has length ≤ 120
    - **Property 31: Username Invariant** — every persisted username matches `^[a-z0-9_]{3,20}$` and is case-insensitively unique
    - **Validates: Requirements 1.2, 1.3, 3.6, 6.2, 6.4, 9.2, 9.3, 9.4, 9.5, 10.3, 10.4, 10.5, 10.6, 11.3**

- [ ] 12. Implement share-card renderer in `artifacts/share-card`
  - [x] 12.1 Bootstrap the `artifacts/share-card` Vercel function package
    - Create `package.json` (depends on `@workspace/design-tokens`, `@workspace/qr`, `@workspace/db`, `satori`, `@resvg/resvg-js`), `tsconfig.json`, `build.mjs`, and the read-only Postgres client
    - Bundle Geist + Geist Mono Latin/digit subsets into `src/fonts/` and load them via `satori` font config
    - _Requirements: 8.2_

  - [ ] 12.2 Implement shared card components in `src/components/`
    - Add `<Wordmark>`, `<ScannedImage>`, `<Score>`, `<TierBadge>`, `<CoreStatsGrid>`, `<Commentary>`, `<DescriptionLine>`, `<AnomalyBadge>`, `<VerificationCorner>` (renders `<QrCode>` + `/scan/{id}` text), and `<MetaFooter>`
    - The `<Score>` component renders `#F5A623` in tabular Geist Mono at the per-ratio minimum pixel heights (≥ 200 px on story/square, ≥ 120 px on landscape)
    - The `<VerificationCorner>` renders the QR via `@workspace/qr` at 264 / 220 / 160 px in the bottom-right with quiet zone
    - _Requirements: 8.3, 8.4, 8.5, 8.6, 8.7, 12.5, 12.6_

  - [ ] 12.3 Implement the three layouts in `src/layouts/{story,square,landscape}.tsx`
    - Compose the shared components per ratio at 1080×1920, 1080×1080, and 1200×628
    - Strip any field beyond the public projection so the username is the only PII rendered
    - _Requirements: 8.1, 8.3, 8.6, 8.7, 8.8_

  - [ ] 12.4 Implement the three render endpoints in `src/handlers/{story,square,landscape}.ts`
    - Each handler: read Scan, generate signed Storage URL, compose JSX, render SVG via `satori`, rasterize to PNG via `@resvg/resvg-js`
    - Set `Cache-Control: public, max-age=86400, s-maxage=86400, immutable` and `ETag = sha256(scanId + ratio + 'v1')`
    - On render failure, return `503` so the permalink page can show the "Share card temporarily unavailable" notice
    - _Requirements: 8.1, 8.2, 8.9, 8.13_

  - [ ] 12.5 Write share-card snapshot tests in `artifacts/share-card/test/snapshot.spec.ts`
    - Snapshot one rendered PNG per (8 tiers × 3 ratios) = 24 cases, plus one per anomaly type at the square ratio
    - _Requirements: 8.1, 8.3, 8.7, 12.4_

  - [ ] 12.6 Write share-card property tests in `artifacts/share-card/test/properties.spec.ts`
    - **Property 27: Permalink Existence** — every persisted Scan returns a 200 PNG for each ratio
    - **Property 37: Three Share-Card Ratios Always** — assert all three ratio handlers return 200 PNGs
    - **Property 38: Card Carries QR Encoding Permalink** — decode the QR from the rendered PNG with `jsqr` and assert the decoded text equals the absolute permalink URL
    - **Property 39: No PII on Card** — assert rendered text never contains the Member's email, `member_id`, or any auth token
    - **Property 40: Score is Largest Text Element** — read `satori`'s measured layout boxes and assert the Score's pixel height is `≥` every other text element
    - **Validates: Requirements 8.1, 8.2, 8.3, 8.8, 8.10, 1.6**

- [ ] 13. Checkpoint - server and rendering
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 14. Implement web client in `artifacts/web`
  - [ ] 14.1 Bootstrap `artifacts/web` as a React 19 + Vite + TailwindCSS 4 SPA
    - Create `package.json` (depends on `@workspace/design-tokens`, `@workspace/api-client-react`, `@workspace/api-zod`, `@workspace/reveal-controller`, `@workspace/qr`, `framer-motion`, `wouter`, `@tanstack/react-query`, `@tanstack/react-virtual`, `@supabase/ssr`)
    - Configure Tailwind `@theme` to consume `@workspace/design-tokens` and scope the HUD-cyan and amber utilities so they cannot be applied outside `<HudOverlay>` and `<Amber>`
    - Add the per-route SSR shim (or Vercel pre-rendering) for `/scan/{id}` and `/u/{username}` to emit OG metadata server-side
    - Wire Wouter routes for `/`, `/scan`, `/scan/run/:tempId`, `/scan/:id`, `/feed`, `/leaderboards`, `/u/:username`, `/me`, `/auth/callback`, `/auth/username`
    - _Requirements: 8.12, 9.1, 11.1, 12.1, 12.16, 12.17_

  - [ ] 14.2 Implement design-system primitives in `src/components/design-system/`
    - Add `<Skeleton>`, `<Button>`, `<Card>` (1 px outer + inset border, no drop shadow), `<Amber>` (with the per-viewport context counter), `<HudOverlay>`, `<TierBadge>`, `<AnomalyBadge>`, `<Wordmark>`
    - Add the shared `useReducedMotion` hook reading `prefers-reduced-motion`
    - Forbid generic spinners; CI lints for the string `spinner` outside the skeleton library
    - _Requirements: 12.1, 12.2, 12.3, 12.4, 12.7, 12.10, 12.11, 12.13, 12.14, 13.4_

  - [ ] 14.3 Implement landing surface at `/` in `src/routes/landing.tsx`
    - Render the wordmark hero, the "Begin Scan" amber CTA, and a Feed strip pre-rendered from the SSR response
    - _Requirements: 12.5, 12.7, 12.8, 13.1_

  - [ ] 14.4 Implement scan setup at `/scan` in `src/routes/scan-setup.tsx`
    - Image upload via file picker, drag-and-drop, and mobile camera capture
    - Six monoline-SVG Categories with required selection; submission blocked until a category is picked
    - Description input with a live remaining-character counter that hard-stops at 120 chars
    - Preload tier badges, anomaly overlays, HUD chrome, and fonts; submit becomes interactive only when `Promise.all` resolves
    - _Requirements: 2.1, 3.1, 3.2, 3.3, 3.4, 3.6, 4.9, 13.3_

  - [ ] 14.5 Implement the cinematic reveal at `/scan/run/:tempId` in `src/routes/scan-run.tsx`
    - Use `@workspace/reveal-controller` driven by `submittedAt` and the `useCreateScan` mutation promise
    - Dispatch reveal variant components (`<StandardReveal>`, `<PowerSurgeReveal>`, `<ForbiddenAuraReveal>`, `<ScouterFailureReveal>`, `<UnregisteredEnergyReveal>`, `<ChaosSpikeReveal>`) keyed off `response.reveal.revealVariant`
    - All animations use `framer-motion` + the `SPRINGS`/`EASINGS`/`DURATIONS` tokens; transform/opacity only; `withReducedMotion` swaps to cross-fade
    - On `MAX_TOTAL_MS` exceeded, play `scouter_failure` against a deterministic neutral payload computed locally
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 4.7, 4.8, 4.10, 7.4, 7.5, 7.6, 7.7, 7.8, 12.11, 12.12, 12.15_

  - [ ] 14.6 Implement Result screen and soft-auth prompt in `src/routes/scan-result.tsx`
    - Render Score → Tier → Core Stats → Category Stats → Commentary in sequence; reserve final layout space so post-slam shift is zero
    - Render `<AnomalyBadge>` when `scan.anomaly` is non-null
    - Render share-card preview and per-platform download (story / square / landscape)
    - For unclaimed anonymous Scans, fade in the dismissible soft-auth prompt offering claim + sign-in via Google OAuth
    - _Requirements: 1.4, 1.6, 4.6, 4.7, 7.10, 8.1, 9.6_

  - [ ] 14.7 Implement permalink at `/scan/:id` with SSR OG metadata in `src/routes/scan-permalink.tsx`
    - Render the original image, Score, Tier, Core Stats, Category Stats, commentary, anomaly badge, username (or `anonymous`), timestamp, and the **VERIFIED SCAN** badge
    - SSR shim emits `og:image`, `og:image:secure_url`, `og:image:width/height`, and Twitter card tags pointing to the appropriate share-card URL
    - For `404` / `expired_at IS NOT NULL`, render the **UNVERIFIED — SCAN NOT FOUND** view with a 404 status
    - For share-card render failure, show "Share card temporarily unavailable" in place of the preview block
    - _Requirements: 8.10, 8.11, 8.12, 8.13, 8.14_

  - [ ] 14.8 Implement public Feed at `/feed` in `src/routes/feed.tsx`
    - `useInfiniteQuery` over `GET /api/feed` paged at 20; render with `@tanstack/react-virtual`
    - Like and Share controls on every entry; Share opens the platform-targeted dialog wired to share-card URLs
    - Render `username` `||` `anonymous` for unclaimed Scans
    - _Requirements: 11.1, 11.2, 11.3, 11.4, 11.5_

  - [ ] 14.9 Implement Leaderboards at `/leaderboards` in `src/routes/leaderboards.tsx`
    - Three window tabs (TODAY / THIS WEEK / ALL-TIME) and seven scope tabs (GLOBAL + six categories) → 21 board views
    - Render `{rank, username, category, score, tier, anomaly, createdAt}` and a permalink link; never render any other field
    - _Requirements: 10.1, 10.2, 10.3, 10.5, 10.6_

  - [ ] 14.10 Implement public Profile at `/u/:username` and self profile at `/me` in `src/routes/profile.tsx`
    - Render header (username, initials avatar, aggregates) plus paginated scan history (20 per page, newest first)
    - For unknown usernames, render the Profile-not-found view while keeping public navigation reachable
    - `/me` redirects to `/u/{username}` once the username is set; otherwise to `/auth/username`
    - _Requirements: 11.6, 11.7, 11.8_

  - [ ] 14.11 Implement auth flow at `/auth/callback` and `/auth/username` in `src/routes/auth.tsx`
    - Handle the Supabase OAuth code exchange, then call `GET /api/me`
    - Username chooser validates `^[a-z0-9_]{3,20}$` client-side, surfaces the violated rule (`length` / `chars` / `uniqueness`) without re-authenticating
    - After username save, attempt the soft-auth claim if a recent unclaimed Scan exists for the active `plvl_anon` cookie
    - _Requirements: 9.1, 9.2, 9.3, 9.6_

  - [ ] 14.12 Write component tests for the reveal sequence in `artifacts/web/test/reveal.spec.tsx`
    - Drive `<RevealRoute>` with a stubbed mutation promise and a fake clock; assert the standard, anomaly, and reduced-motion paths
    - **Reinforces Properties 32, 33, 34, 35, 36 at the integration level**
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 4.7, 4.10, 7.1, 7.2, 12.15_

  - [ ] 14.13 Write Playwright end-to-end tests in `artifacts/web/e2e/`
    - Anonymous first-scan happy path → reveal → result → share-card download
    - Anonymous second-scan blocked with sign-in prompt
    - OAuth sign-in (Supabase mocked) → username chooser → claim
    - Daily-limit countdown for Member at 25 Scans
    - Permalink renders for valid id; returns 404 + UNVERIFIED for unknown / expired
    - Feed virtualized scroll loads multiple pages; like toggle works for anonymous and member
    - Leaderboards render TODAY / THIS WEEK / ALL-TIME with correct entries
    - Reduced-motion preference plays cross-fade-only reveal
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.6, 4.10, 8.10, 8.14, 9.1, 9.2, 9.3, 9.4, 9.5, 9.6, 10.1, 10.2, 11.1, 11.2, 11.3, 11.4, 12.15_

- [ ] 15. Implement background jobs and signed internal endpoints
  - [ ] 15.1 Add `POST /api/internal/jobs/anonymous-scan-purge` in `artifacts/api-server/src/routes/internal-jobs.ts`
    - For each Scan with `expires_at <= now() AND expired_at IS NULL`, delete `image_object_key` and `thumbnail_object_key` from Storage, then set `expired_at = now()` only after successful storage delete (image purged before record marked expired)
    - Authenticate via a shared signed-token header
    - _Requirements: 2.9_

  - [ ] 15.2 Add `POST /api/internal/jobs/pending-cleanup-reconciler` in the same file
    - For each `pending_cleanups` row whose paired `scans` insert never landed, delete the orphaned storage objects and remove the `pending_cleanups` row
    - Authenticate via the same signed-token header
    - _Requirements: 2.7, 2.8_

  - [ ] 15.3 Wire Vercel Cron declarations for hourly purge and 10-minute reconciler in `artifacts/api-server/vercel.json`
    - _Requirements: 2.9_

  - [ ] 15.4 Write integration tests for both jobs in `artifacts/api-server/test/jobs.spec.ts`
    - **Property 28: Expired Permalink Unverified** — after purge, `GET /api/scans/{id}` and `GET /scan/{id}` return the 404 + UNVERIFIED view
    - **Property 29: Image Purge Before Record Expiry** — for every row with `expired_at IS NOT NULL`, storage objects do not exist
    - **Validates: Requirements 2.9, 8.14**

- [ ] 16. Implement CI gates in `.github/workflows/ci.yml` and supporting scripts
  - [ ] 16.1 Add a CI workflow that runs `pnpm install --frozen-lockfile`, `pnpm run typecheck`, `pnpm -r run test`, `pnpm -r run test:integration` (with dockerized Postgres), `pnpm -r run test:e2e`, and the visual regression check in order
    - Block the PR if any step fails
    - _Requirements: 6.5, 12.12, 13.1, 13.2_

  - [ ] 16.2 Add a bundle scan in `scripts/src/bundle-scan.ts`
    - Reject any client bundle containing `SUPABASE_SERVICE_ROLE_KEY`, AWS access-key prefixes (`AKIA`), `DATABASE_URL`, or any character from the emoji unicode ranges
    - Run as part of CI after web and share-card builds
    - _Requirements: 12.16, 14.3_

  - [ ] 16.3 Add an ESLint rule in `scripts/src/eslint-rules/no-direct-motion.ts` that bans direct `motion.*` usage outside the allow-listed wrapper components in `@workspace/design-tokens`
    - _Requirements: 12.11_

- [ ] 17. Final checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for a faster MVP, but are recommended given the property-heavy correctness model.
- Each task references specific requirement clauses (not just user stories) for traceability.
- Property tests live next to the code under test using `vitest` + `fast-check`; statistical properties (12, 13, distribution) use a fixed seed and are allowed one re-run on a borderline failure.
- Checkpoints (10, 13, 17) ensure incremental validation between major library, server, and client phases.
- The reveal controller is reused between the web client and tests so timing invariants (Properties 32–36) can be exercised under a fake clock.
- The bundle scan + ESLint rule encode the design's "amber lockdown", "HUD cyan lockdown", and "no spinner" guarantees as CI gates.
- Properties not covered by a dedicated test sub-task are enforced as DB CHECK constraints (Property 20) or RLS / projection contracts (Properties 24, 25) and asserted indirectly via the API integration tests in 11.13 / 11.14.

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "1.2", "1.4", "3.1", "4.1", "5.1", "6.1"] },
    { "id": 1, "tasks": ["1.3", "1.5", "2.1", "3.2", "4.2", "5.2", "6.2", "7.1", "8.1"] },
    { "id": 2, "tasks": ["2.2", "7.2", "8.2", "8.4", "8.6", "9.1"] },
    { "id": 3, "tasks": ["2.3", "2.4", "2.5", "2.6", "2.7", "8.3", "8.5", "8.7", "9.2"] },
    { "id": 4, "tasks": ["8.8", "11.1", "12.1"] },
    { "id": 5, "tasks": ["11.2", "11.3", "12.2"] },
    { "id": 6, "tasks": ["11.4", "11.5", "11.6", "11.7", "11.8", "11.9", "11.10", "11.11", "12.3"] },
    { "id": 7, "tasks": ["11.12", "12.4", "14.1"] },
    { "id": 8, "tasks": ["11.13", "11.14", "12.5", "12.6", "14.2", "15.1", "15.2"] },
    { "id": 9, "tasks": ["14.3", "14.4", "14.7", "14.8", "14.9", "14.10", "14.11", "15.3", "16.2", "16.3"] },
    { "id": 10, "tasks": ["14.5", "14.6", "15.4", "16.1"] },
    { "id": 11, "tasks": ["14.12", "14.13"] }
  ]
}
```


---

# POWERLVL v2 — Implementation Plan

> **Status:** Planned. Do not implement until v1 is fully shipped, live, and stable.
> **Prerequisites:** All v1 tasks complete and passing. Stripe account configured. Pro and Anomaly Boost Stripe products and prices created.

## v2 Overview

v2 adds four production systems: Stripe subscription + credit engine, Scan Battles, Weekly Challenges, and three new Categories. All v2 tasks build on the v1 monorepo without replacing any v1 component.

## v2 Tasks

- [ ] V2-1. Set up Stripe integration in `@workspace/stripe`
  - [ ] V2-1.1 Create `lib/stripe` package with Stripe SDK wrapper
    - Export `createProCheckoutSession`, `createCustomerPortalSession`, `createAnomalyBoostCheckoutSession`, `handleWebhookEvent`
    - Add `stripe_events` dedup table to `lib/db/src/schema/` to ensure idempotent webhook processing
    - Add `pro_subscriptions`, `credit_balances`, `credit_purchases` tables to the Drizzle schema
    - Add `account_suspensions` table
    - Add `profile_banner_key` and `challenge_streak` columns to `members`
    - _Requirements: v2-15.1, v2-15.5, v2-16.1, v2-16.3, v2-16.4, v2-20.1_

  - [ ] V2-1.2 Implement Stripe webhook handler in `artifacts/api-server/src/routes/stripe-webhook.ts`
    - Handle `checkout.session.completed` → provision Pro or credit
    - Handle `customer.subscription.updated` and `customer.subscription.deleted` → sync Pro status
    - Handle `payment_intent.succeeded` → increment `credit_balances.anomaly_boost_count`
    - All processing idempotent via `stripe_events` dedup table
    - _Requirements: v2-15.5, v2-16.1_

  - [ ] V2-1.3 Implement Pro checkout and portal routes in `artifacts/api-server/src/routes/pro.ts`
    - `POST /api/pro/checkout` — create Stripe Checkout session, return URL
    - `POST /api/pro/portal` — create Stripe Customer Portal session, return URL
    - Both require authenticated Member
    - _Requirements: v2-15.1_

  - [ ] V2-1.4 Implement Anomaly Boost credit checkout in `artifacts/api-server/src/routes/credits.ts`
    - `POST /api/credits/anomaly-boost/checkout` — create Stripe Checkout session for one credit unit
    - `GET /api/me/credits` — return current balance and purchase history
    - _Requirements: v2-16.1, v2-16.5_

  - [ ] V2-1.5 Add Pro status check middleware in `artifacts/api-server/src/middleware/pro.ts`
    - `isProActive(memberId, db)` — checks `pro_subscriptions` table, returns boolean
    - Wire into `POST /api/scans` to bypass the 25/day daily limit for Pro Members
    - _Requirements: v2-15.2, v2-15.3, v2-15.6_

  - [ ] V2-1.6 Add Anomaly Boost consumption to the scan pipeline in `artifacts/api-server/src/scan-pipeline/index.ts`
    - Before the scan pipeline runs, call `consumeAnomalyBoost(memberId, db)`
    - If consumed, pass `forceAnomaly: true` to the anomaly draw step
    - On pipeline failure after consumption, run compensating credit refund
    - _Requirements: v2-16.2, v2-16.3, v2-16.4_

  - [ ] V2-1.7 Write integration tests for Stripe webhook handler in `artifacts/api-server/test/stripe-webhook.spec.ts`
    - Cover Pro provisioning, Pro cancellation, credit provisioning, idempotency (duplicate event), invalid signature
    - _Requirements: v2-15.5, v2-16.1_

- [ ] V2-2. Implement Scan Battles
  - [ ] V2-2.1 Add `battles` table to Drizzle schema in `lib/db/src/schema/battles.ts`
    - Indexes: `(challenger_id, status)`, `(opponent_id, status)`, partial `(expires_at)` where `status = 'pending'`
    - _Requirements: v2-17.1_

  - [ ] V2-2.2 Implement Battle routes in `artifacts/api-server/src/routes/battles.ts`
    - `POST /api/battles` — create Battle, validate challenger has a recent Scan in the Category
    - `GET /api/battles/{id}` — public Battle projection
    - `POST /api/battles/{id}/accept` — opponent scans, pipeline runs, winner computed, Battle completed
    - _Requirements: v2-17.1, v2-17.2, v2-17.3, v2-17.4, v2-17.7, v2-17.8_

  - [ ] V2-2.3 Implement Battle Card layout in `artifacts/share-card/src/layouts/battle.tsx`
    - 1080×1080 two-up layout: challenger left, opponent right
    - Winner Score in amber `#F5A623`, loser Score in zinc
    - Both Tier badges, both usernames, Category, "BATTLE" badge, Verification QR encoding `/battle/{id}`
    - _Requirements: v2-17.5_

  - [ ] V2-2.4 Implement Battle Card render endpoint in `artifacts/share-card/src/handlers/battle.ts`
    - `GET /share-card/{battleId}/battle.png`
    - Same CDN caching as standard share cards
    - _Requirements: v2-17.5_

  - [ ] V2-2.5 Add Battle expiry cron job in `artifacts/api-server/src/routes/internal-jobs.ts`
    - `POST /api/internal/jobs/battle-expiry` — set `status = 'expired'` for overdue pending Battles
    - Wire Vercel Cron at 15-minute interval
    - _Requirements: v2-17.7_

  - [ ] V2-2.6 Add Battle routes and Battle Card to web client
    - Result screen: "Challenge" button for Members with a completed Scan
    - `/battle/{id}` permalink page with "VERIFIED BATTLE" badge
    - Battle Card share flow (same platform-targeted dialog as standard cards)
    - Feed entries with "BATTLE" badge
    - _Requirements: v2-17.6, v2-17.9, v2-17.10_

  - [ ] V2-2.7 Write integration tests for Battle pipeline in `artifacts/api-server/test/battles.spec.ts`
    - Cover: create Battle, accept and complete, winner determination (higher score, tie by timestamp), expiry, re-scan prevention, non-member attempt
    - _Requirements: v2-17.1, v2-17.2, v2-17.3, v2-17.7, v2-17.8_

- [ ] V2-3. Implement Weekly Challenges
  - [ ] V2-3.1 Add `challenges`, `challenge_winners`, `member_badges` tables to Drizzle schema
    - _Requirements: v2-18.1, v2-18.4, v2-18.5_

  - [ ] V2-3.2 Add challenge schedule config in `scripts/src/challenge-schedule.ts`
    - Array of `{ week: string; category: Category; title: string }` entries for the next 12 weeks
    - _Requirements: v2-18.1_

  - [ ] V2-3.3 Implement Challenge routes in `artifacts/api-server/src/routes/challenges.ts`
    - `GET /api/challenges/active` — current active Challenge
    - `GET /api/challenges/{id}/leaderboard` — top 100 Scans for the Challenge window
    - _Requirements: v2-18.2, v2-18.3_

  - [ ] V2-3.4 Implement Challenge lifecycle jobs in `artifacts/api-server/src/routes/internal-jobs.ts`
    - `POST /api/internal/jobs/challenge-create` — runs Monday 00:00 UTC, inserts next Challenge row
    - `POST /api/internal/jobs/challenge-award` — runs at `challenge.ends_at + 5 min`, awards top 3 badges, updates `challenge_streak`
    - Wire both as Vercel Cron jobs
    - _Requirements: v2-18.1, v2-18.4, v2-18.7_

  - [ ] V2-3.5 Add Challenge UI to web client
    - Leaderboard page: active Challenge banner with countdown, dedicated Challenge Leaderboard tab
    - Landing surface: active Challenge CTA
    - Profile page: Challenge Winner Badges display, Challenge Streak counter for Pro Members
    - _Requirements: v2-18.3, v2-18.5, v2-18.6, v2-18.7_

  - [ ] V2-3.6 Write integration tests for Challenge lifecycle in `artifacts/api-server/test/challenges.spec.ts`
    - Cover: Challenge creation, Leaderboard query, winner award (top 3), streak increment, streak reset on missed week
    - _Requirements: v2-18.1, v2-18.3, v2-18.4, v2-18.7_

- [ ] V2-4. Implement Pro visual treatments
  - [ ] V2-4.1 Add Pro shimmer to Tier badge in share-card renderer
    - SVG `<animate>` shimmer on the Tier badge border for Pro Members
    - Uses amber `#F5A623` — does not violate the one-amber-element rule (Score is the hero amber element)
    - _Requirements: v2-15.2_

  - [ ] V2-4.2 Add Pro shimmer to Tier badge in web client
    - CSS animation equivalent of the SVG shimmer, using Framer Motion
    - Visible on Result Screen, Feed entries, and Leaderboard entries for Pro Members
    - _Requirements: v2-15.2_

  - [ ] V2-4.3 Add PRO mark to Profile and Leaderboard entries in web client
    - Small "PRO" label in amber next to the username on Profile and Leaderboard
    - _Requirements: v2-15.2_

  - [ ] V2-4.4 Implement profile banner upload and curated selection
    - `PUT /api/me/banner` — upload custom banner (same image pipeline as scan images, max 4 MB, 16:9 crop)
    - 12 curated dark-themed banner options stored in `lib/design-tokens/src/banners/`
    - Profile page renders the banner behind the username/avatar header
    - _Requirements: v2-15.2_

- [ ] V2-5. Implement permalink acquisition CTA
  - [ ] V2-5.1 Add "Scan Your Own" CTA to `/scan/{id}` permalink page in web client
    - Amber primary CTA below the verified Scan result
    - Links to `/scan?ref=permalink&src={scanId}`
    - Visible to both authenticated and anonymous visitors
    - _Requirements: v2-19.1, v2-19.3_

  - [ ] V2-5.2 Add acquisition source logging to scan pipeline
    - When `POST /api/scans` includes `ref=permalink` and `src={scanId}` query params, log a structured `acquisition.permalink` event with the source scan ID
    - _Requirements: v2-19.2_

- [ ] V2-6. Implement account suspension
  - [ ] V2-6.1 Add suspension middleware in `artifacts/api-server/src/middleware/suspension.ts`
    - Check `account_suspensions` table on every authenticated request
    - Return `403 FORBIDDEN` with a generic suspension notice if `banned_at IS NOT NULL`
    - _Requirements: v2-20.2_

  - [ ] V2-6.2 Implement admin suspension routes in `artifacts/api-server/src/routes/admin.ts`
    - `POST /api/admin/members/{id}/suspend` — set `banned_at`, cancel Stripe subscription, log audit event
    - `POST /api/admin/members/{id}/unsuspend` — clear `banned_at`, log audit event
    - Authenticate via a separate admin JWT (not the same as Member JWTs)
    - _Requirements: v2-20.1, v2-20.3, v2-20.5_

- [ ] V2-7. Implement new Categories (FOOD, WORKSPACE, FITS)
  - [ ] V2-7.1 Add new Category types to `lib/scoring/src/types.ts` and `lib/scoring/src/category-stats.ts`
    - Add `FOOD`, `WORKSPACE`, `FITS` to the `Category` enum
    - Add their stat definitions to `CATEGORY_STATS`
    - _Requirements: v2-21.1, v2-21.2_

  - [ ] V2-7.2 Add monoline SVG icons for new Categories to `lib/design-tokens/src/icons/`
    - Fork, desk-lamp, and hanger icons consistent with the existing monoline style
    - _Requirements: v2-21.3_

  - [ ] V2-7.3 Add few-shot commentary examples for new Categories in `lib/vision/src/few-shot/`
    - At least 12 examples per Category, matching brand tone
    - _Requirements: v2-21.4_

  - [ ] V2-7.4 Add fallback commentary templates for new Categories in `lib/vision/src/fallback-library.ts`
    - At least 24 templates per Category spanning all 8 Tiers
    - Run all templates through the slop detector at build time
    - _Requirements: v2-21.5_

  - [ ] V2-7.5 Add "NEW" badge to new Categories in the web client Category selector
    - Display for 14 days after the Category's launch date (stored as a constant in `lib/design-tokens`)
    - _Requirements: v2-21.7_

  - [ ] V2-7.6 Add per-Category Leaderboards for new Categories
    - New Categories automatically appear in the Leaderboard scope selector
    - New Categories are eligible for Weekly Challenges from launch
    - _Requirements: v2-21.6_

- [ ] V2-8. v2 Final checkpoint (LAUNCH GATE)

  Run only after every other V2 task is complete and the cinematic surface review (V2-19) has passed for every revenue-relevant and growth-relevant surface. Implementation surfaces fall into two buckets:

  **Functional checks (every box must be ticked):**
  - All v2 unit, integration, and property tests passing
  - Stripe webhook integration tested end-to-end against Stripe's webhook event-replay tool, with the dedup table preventing double-processing
  - Battle pipeline tested with two real Member accounts: create → accept → winner determination → Battle Card render → Battle permalink → push notification delivered
  - Challenge lifecycle tested with a compressed time window (minutes instead of weeks): create → qualifying scan → top-3 winner award → badge persisted → push notification delivered
  - Anomaly Boost flow tested end-to-end: purchase → consume → forced anomaly → if pipeline fails, credit refund verified
  - Pro visual treatments verified on share cards (static amber border) and web client (animated shimmer); Pro mark verified on Profile and Leaderboard
  - Profile banner upload + curated selection working; banner respected in Profile Share Card
  - All three new Categories (FOOD, WORKSPACE, FITS) verified with real Vision Model calls and slop detector running clean
  - Onboarding flow verified on first-visit cookie absent, skipped on cookie present
  - Push notifications verified: tab-closed delivery via web-push direct, tab-open delivery via Realtime fallback, in-app banner fallback when no subscription
  - Legal pages (Terms, Privacy, Cookies) live and linked from footer; cookie consent banner geolocated to EU/UK/EEA only; age gate active in OAuth callback
  - Data export endpoint returns full archive; account deletion purges every v2 row + cancels active Stripe subscription
  - Analytics events flowing into `analytics_events` table for all 24+ event types; nightly daily-rollup cron running; CI lint blocking third-party SDKs
  - PWA manifest + Service Worker installed; "Add to Home Screen" works on iOS and Android
  - Sitemap regenerated nightly; robots.txt blocks `/api/*`, `/me`, `/auth/*`, `/admin/*`
  - Profile Share Card rendering for every Member with at least one scan
  - `/help` page live with FAQ + contact form; `/status` page reading `service_health` and pulsing on degraded/down states
  - Email capture firing only on the daily-limit-reached prompt for anonymous users; Resend double-opt-in confirmed; unsubscribe links working
  - Referral attribution: `?ref=` cookie capture, `referred_by` set on signup, third-scan reward awarded, 5/month cap enforced
  - Account suspension working end-to-end: suspend → Stripe cancellation → blocked sign-in → audit log entry

  **Cinematic checks (V2-19 must pass first):**
  - Every revenue-relevant surface (Pro Upgrade, Anomaly Boost Purchase, Battle Result, Profile Card) passes the screenshot test
  - Every growth-relevant surface (Onboarding screens 1–3, Permalink CTA, Status page, Help page, Cookie consent banner, Email capture) passes the screenshot test
  - No raw third-party chrome on any POWERLVL surface (Stripe Checkout opens *inside* the custom interstitial, never as a standalone page; OAuth callback returns to a custom interstitial, not a default success page; cookie consent is the custom banner, not the browser default; notification permission is the custom value-prop prompt before the browser native dialog)
  - The screenshot test is the binding criterion: would a stranger save this screenshot? If no, redesign before launch.

## v2 Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["V2-1.1", "V2-2.1", "V2-3.1", "V2-7.1", "V2-7.2"] },
    { "id": 1, "tasks": ["V2-1.2", "V2-1.3", "V2-1.4", "V2-1.5", "V2-2.2", "V2-3.2", "V2-7.3", "V2-7.4"] },
    { "id": 2, "tasks": ["V2-1.6", "V2-1.7", "V2-2.3", "V2-2.4", "V2-3.3", "V2-3.4", "V2-6.1", "V2-6.2"] },
    { "id": 3, "tasks": ["V2-2.5", "V2-2.6", "V2-2.7", "V2-3.5", "V2-3.6", "V2-4.1", "V2-4.2", "V2-4.3", "V2-4.4", "V2-5.1", "V2-5.2", "V2-7.5", "V2-7.6"] },
    { "id": 4, "tasks": ["V2-8"] }
  ]
}
```

## v2 Notes

- Do NOT implement v2 until v1 is fully shipped and live. The v2 data model additions are additive (new tables, new columns) and do not break v1.
- Stripe Checkout handles all payment UI — no custom payment forms. This keeps PCI scope minimal.
- The Anomaly Boost credit refund on pipeline failure is a compensating transaction, not a Stripe refund. The credit is returned to the Member's balance; Stripe refunds are only issued for explicit customer service requests.
- LIMITLESS is never purchasable. The Anomaly Boost guarantees an anomaly but the type is still random — a boosted scan can get SCOUTER_FAILURE just as easily as POWER_SURGE. This is intentional.
- Battle winner determination is purely by Score. No voting, no community input. Clean, objective, fast.
- Weekly Challenge schedule is maintained as a config file, not a database-driven admin UI. This keeps v2 scope tight.
- Squads/Crews are deferred to v3. They require a more complex social graph and are not needed for the initial revenue model.

- [ ] V2-9. Implement first-run onboarding
  - [ ] V2-9.1 Create the onboarding component in `artifacts/web/src/routes/welcome.tsx`
    - 3-screen sequence: Hook (slam animation preview) → Tier Ladder → Categories
    - All screens use the same Framer Motion presets as the rest of the product
    - Screen 1 slam animation is a simplified `<StandardReveal>` with a hardcoded sample score
    - Screen 2 tier ladder animates in staggered bottom-to-top (D first, LIMITLESS last)
    - Screen 3 category grid animates in staggered
    - "Skip" ghost link on every screen; "Begin" / "Next" / "Start Scanning" amber CTAs
    - Set `plvl_onboarded` cookie on completion or skip
    - _Requirements: v2-22.1, v2-22.2, v2-22.3, v2-22.4, v2-22.5, v2-22.6, v2-22.7, v2-22.8_

  - [ ] V2-9.2 Wire onboarding redirect in root route
    - `/` checks for `plvl_onboarded` cookie; redirects to `/welcome` if absent
    - Onboarding component is lazy-loaded and code-split
    - _Requirements: v2-22.1, v2-22.7_

- [ ] V2-10. Implement push notifications
  - [ ] V2-10.1 Add `push_subscriptions` and `pending_notifications` tables to Drizzle schema
    - _Requirements: v2-23.1, v2-23.7_

  - [ ] V2-10.2 Implement push subscription API routes in `artifacts/api-server/src/routes/notifications.ts`
    - `POST /api/me/push-subscription` — store VAPID subscription endpoint, p256dh, auth
    - `DELETE /api/me/push-subscription` — remove subscription (opt out)
    - _Requirements: v2-23.6_

  - [ ] V2-10.3 Implement the notification publisher in `artifacts/api-server/src/lib/notifications.ts`
    - `publishBattleComplete(battle, db)` — sends push to both participants; falls back to `pending_notifications` if no subscription
    - `publishChallengeResult(challengeId, db)` — sends push to all Members who submitted a qualifying Scan; top 3 get winner payload, rest get result payload
    - Uses `web-push` npm package with VAPID keys from env vars
    - _Requirements: v2-23.3, v2-23.4, v2-23.5, v2-23.7_

  - [ ] V2-10.4 Wire notification publisher into Battle and Challenge pipelines
    - Call `publishBattleComplete` after `POST /api/battles/{id}/accept` completes
    - Call `publishChallengeResult` in the challenge-award job after winners are recorded
    - _Requirements: v2-23.3, v2-23.4, v2-23.5_

  - [ ] V2-10.5 Implement Service Worker `push` event handler in `artifacts/web/public/sw.js`
    - On `push` event (delivered by FCM / Mozilla autopush via `web-push` direct), call `self.registration.showNotification(payload.title, { body: payload.body, data: { url: payload.url }, icon: '/icons/icon-192.png' })`.
    - On `notificationclick` event, call `clients.openWindow(event.notification.data.url)` and `event.notification.close()`.
    - **DO NOT subscribe to Supabase Realtime here.** Realtime cannot wake a closed tab. Realtime is the in-app fallback (open-tab toast), handled separately in the React client via `@supabase/realtime-js`.
    - _Requirements: v2-23.3, v2-23.4, v2-23.5_

  - [ ] V2-10.6 Implement permission request flow in web client
    - After first signed-in Scan result is visible, show custom in-app prompt explaining the value
    - Only call `Notification.requestPermission()` after Member taps "Allow" in the custom prompt
    - On grant: call `POST /api/me/push-subscription` with the subscription object
    - On deny or dismiss: do nothing (no retry until next session)
    - _Requirements: v2-23.1, v2-23.2_

  - [ ] V2-10.7 Implement in-app notification banner for fallback
    - On app open, call `GET /api/me/notifications/pending` to check for unread `pending_notifications`
    - Render unread notifications as dismissible banners at the top of the current page
    - On dismiss, call `PATCH /api/me/notifications/{id}/read`
    - _Requirements: v2-23.7_

## Updated v2 Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["V2-1.1", "V2-2.1", "V2-3.1", "V2-7.1", "V2-7.2", "V2-10.1"] },
    { "id": 1, "tasks": ["V2-1.2", "V2-1.3", "V2-1.4", "V2-1.5", "V2-2.2", "V2-3.2", "V2-7.3", "V2-7.4", "V2-10.2"] },
    { "id": 2, "tasks": ["V2-1.6", "V2-1.7", "V2-2.3", "V2-2.4", "V2-3.3", "V2-3.4", "V2-6.1", "V2-6.2", "V2-10.3"] },
    { "id": 3, "tasks": ["V2-2.5", "V2-2.6", "V2-2.7", "V2-3.5", "V2-3.6", "V2-4.1", "V2-4.2", "V2-4.3", "V2-4.4", "V2-5.1", "V2-5.2", "V2-7.5", "V2-7.6", "V2-9.1", "V2-9.2", "V2-10.4", "V2-10.5"] },
    { "id": 4, "tasks": ["V2-10.6", "V2-10.7"] },
    { "id": 5, "tasks": ["V2-8"] }
  ]
}
```


- [ ] V2-11. Implement legal, compliance, and trust pages
  - [ ] V2-11.1 Add static Terms, Privacy, and Cookies pages in `artifacts/web/src/routes/legal/`
    - Markdown source files in the repo, rendered with the same design language
    - Include exact list of data collected, processors, retention windows, and rights
    - _Requirements: v2-24.1, v2-24.2, v2-24.3_

  - [ ] V2-11.2 Implement geolocated cookie consent banner in `artifacts/web/src/components/CookieBanner.tsx`
    - Read `x-vercel-ip-country` from the SSR shim, show only for EU/UK/EEA on first visit
    - Two-button: "Accept" / "Reject non-essential"; result stored in `plvl_consent` cookie (1y)
    - Gate analytics event emission on consent
    - _Requirements: v2-24.4, v2-25.4_

  - [ ] V2-11.3 Implement age gate in OAuth callback flow
    - Read Google's birthdate claim if available
    - Reject sign-in if under-13 (or under-16 in EEA)
    - Add self-attestation checkbox during username selection if birthdate is unavailable
    - Persist `members.age_self_attested_at`
    - _Requirements: v2-24.5_

  - [ ] V2-11.4 Implement data export endpoint in `artifacts/api-server/src/routes/me.ts`
    - `GET /api/me/data-export` returns JSON archive of profile, scans, battles, credit purchases, badges
    - _Requirements: v2-24.6_

  - [ ] V2-11.5 Extend `DELETE /api/me` to purge all v2 records in a single transaction
    - Add deletion of `pro_subscriptions`, `credit_balances`, `credit_purchases`, `battles`, `member_badges`, `push_subscriptions`, `pending_notifications`, plus the `members` row
    - Cancel any active Stripe subscription via the Stripe API as part of the transaction
    - _Requirements: v2-24.7_

- [ ] V2-12. Implement analytics and funnel instrumentation
  - [ ] V2-12.1 Add `analytics_events` and `analytics_daily` tables to Drizzle schema
    - Indexes: `(event_type, created_at DESC)`, `(member_id, created_at DESC)`
    - _Requirements: v2-25.1_

  - [ ] V2-12.2 Implement `lib/analytics` package with the event catalog and `emit(eventType, properties)` helper
    - Strict event-type union; properties typed per event
    - Pipe to `analytics_events` insert, never to a third-party SDK
    - _Requirements: v2-25.1, v2-25.2_

  - [ ] V2-12.3 Wire analytics emission into all v1 and v2 critical paths
    - Scan pipeline: `scan.submitted`, `scan.completed`
    - Share / permalink / QR / CTA: `scan.shared`, `scan.permalink_viewed`, `scan.qr_scanned`, `scan.permalink_cta_clicked`
    - Auth: `signup.completed`, `auth.claim_success`
    - Pro / credits: `pro.checkout_started`, `pro.subscribed`, `pro.cancelled`, `credit.purchased`, `credit.consumed`
    - Battles / challenges: `battle.created`, `battle.accepted`, `battle.completed`, `battle.expired`, `challenge.scan_qualified`
    - Referral: `referral.attributed`
    - Notifications: `notification.delivered`, `notification.failed`
    - _Requirements: v2-25.1_

  - [ ] V2-12.4 Implement nightly daily-rollup cron
    - `POST /api/internal/jobs/analytics-daily` aggregates yesterday's events into `analytics_daily`
    - _Requirements: v2-25.3_

  - [ ] V2-12.5 Add a CI guard rejecting third-party analytics SDKs
    - Lint rule: ban imports of `posthog-js`, `mixpanel-browser`, `amplitude-js`, `@segment/analytics-next`, `gtag`, `analytics`
    - _Requirements: v2-25.2_

- [ ] V2-13. Implement PWA, Service Worker, and SEO
  - [ ] V2-13.1 Add `manifest.webmanifest` and PWA icons to `artifacts/web/public/`
    - 192×192, 512×512, 512×512-maskable PNGs, all using the matte-black + amber wordmark mark
    - _Requirements: v2-26.1_

  - [ ] V2-13.2 Implement Service Worker at `artifacts/web/public/sw.js`
    - `push` event handler → `self.registration.showNotification`
    - `notificationclick` handler → `clients.openWindow(payload.data.url)`
    - `install` event pre-caches matte-black background CSS and the wordmark SVG only
    - SHALL NOT cache HTML, JS bundles, scan responses, or share cards
    - _Requirements: v2-26.2_

  - [ ] V2-13.3 Wire SSR meta tags for `/`, `/scan/{id}`, `/battle/{id}`, `/u/{username}`, `/leaderboards`
    - Per-route OG image URLs (per-scan landscape card, per-battle card, profile share card, static landing/leaderboards OG)
    - _Requirements: v2-26.3_

  - [ ] V2-13.4 Implement `/sitemap.xml` and `/robots.txt`
    - Sitemap regenerated nightly via `POST /api/internal/jobs/sitemap`
    - Robots disallows `/api/*`, `/me`, `/auth/*`, `/admin/*`
    - _Requirements: v2-26.4, v2-26.5_

- [ ] V2-14. Implement Profile Share Card
  - [ ] V2-14.1 Implement `<ProfileCard>` layout in `artifacts/share-card/src/layouts/profile.tsx`
    - 1080×1920, banner header, hero highest-Score + Tier, 2×2 top-Scans grid, aggregate stats, Verification QR encoding `/u/{username}`
    - _Requirements: v2-27.2_

  - [ ] V2-14.2 Implement `GET /share-card/profile/{username}.png` handler
    - `Cache-Control: public, max-age=3600`
    - Returns 404 for unknown username
    - _Requirements: v2-27.3_

  - [ ] V2-14.3 Add "Share Profile" action to Profile page in web client
    - Opens the share dialog with the Profile Share Card preview
    - _Requirements: v2-27.1_

- [ ] V2-15. Implement Help / Support
  - [ ] V2-15.1 Add static FAQ Markdown source and `/help` route in web client
    - _Requirements: v2-28.1_

  - [ ] V2-15.2 Add `support_tickets` table to Drizzle schema
    - _Requirements: v2-28.3_

  - [ ] V2-15.3 Implement `POST /api/support/ticket` in `artifacts/api-server/src/routes/support.ts`
    - Sanitize message via the v1 description sanitizer
    - Rate-limit: 3/IP/hr and 10/Member/hr via the v1 rate limiter
    - _Requirements: v2-28.2, v2-28.3_

  - [ ] V2-15.4 Add account deletion link to `/help`
    - Routes to the `DELETE /api/me` confirmation flow
    - _Requirements: v2-28.4_

- [ ] V2-16. Implement email capture for anonymous non-converters
  - [ ] V2-16.1 Add `email_list` table to Drizzle schema
    - _Requirements: v2-29.2_

  - [ ] V2-16.2 Implement `POST /api/anon/email-list` in `artifacts/api-server/src/routes/email-list.ts`
    - Persist email + `anon_session_id`, send double-opt-in confirmation via Resend
    - _Requirements: v2-29.2_

  - [ ] V2-16.3 Implement double-opt-in confirmation handler
    - `GET /api/email-list/confirm?token=...` sets `confirmed_at` and redirects to a "Subscribed" page
    - _Requirements: v2-29.2_

  - [ ] V2-16.4 Implement unsubscribe handler
    - `GET /api/email-list/unsubscribe?token=...` sets `unsubscribed_at` and redirects to a "Unsubscribed" page
    - Include unsubscribe link in every outgoing email
    - _Requirements: v2-29.3, v2-29.4_

  - [ ] V2-16.5 Render email capture form on the daily-limit-reached prompt for anonymous users
    - _Requirements: v2-29.1_

- [ ] V2-17. Implement referral attribution and reward
  - [ ] V2-17.1 Add `referred_by` and `referral_rewards_this_month` columns to `members`
    - _Requirements: v2-30.3_

  - [ ] V2-17.2 Append `?ref={challenger_member_id}` to Battle share links in the web client
    - _Requirements: v2-30.1_

  - [ ] V2-17.3 Implement referrer cookie capture in `artifacts/api-server/src/middleware/referrer.ts`
    - Set `plvl_referrer` cookie (30-day max-age) when a `?ref` query param is present on Battle routes
    - _Requirements: v2-30.2_

  - [ ] V2-17.4 Apply `referred_by` on signup
    - Read `plvl_referrer` cookie during username save, set `members.referred_by` if present
    - _Requirements: v2-30.3_

  - [ ] V2-17.5 Implement third-scan referral reward in the scan pipeline
    - After a successful Scan, count the Member's total Scans; if exactly 3 and `referred_by IS NOT NULL`, award one Anomaly Boost to the referrer
    - Enforce 5/month cap via `referral_rewards_this_month`
    - Emit `referral.attributed` analytics event
    - _Requirements: v2-30.4, v2-30.5_

  - [ ] V2-17.6 Implement monthly referral counter reset cron
    - `POST /api/internal/jobs/referral-monthly-reset` resets `referral_rewards_this_month` to 0 for all members
    - _Requirements: v2-30.4_

- [ ] V2-18. Implement public status page
  - [ ] V2-18.1 Add `service_health` table to Drizzle schema
    - _Requirements: v2-31.2_

  - [ ] V2-18.2 Implement health-check cron in `artifacts/api-server/src/routes/internal-jobs.ts`
    - `POST /api/internal/jobs/health-check` probes Bedrock, Rekognition, Supabase DB, Supabase Storage, Stripe, Web Push
    - Each probe has a per-service timeout (1–3 s)
    - Update `service_health` rows; emit `service_health.changed` on transitions
    - Wire as a Vercel Cron at 5-minute interval
    - _Requirements: v2-31.2, v2-31.4_

  - [ ] V2-18.3 Implement `/status` route in web client
    - Read `service_health`, render service list with current status and last-changed timestamp
    - Subtle pulse on `degraded` and `down` states; no other animations
    - Same matte-black design language
    - _Requirements: v2-31.1, v2-31.3_

## v2 Task Dependency Graph (CANONICAL — supersedes all earlier graphs in this file)

> Earlier "v2 Task Dependency Graph" and "Updated v2 Task Dependency Graph" sections that appeared above this one were stale snapshots produced as v2 expanded; **the graph below is the only one to follow.** The earlier ones are kept for spec history only and should be ignored at implementation time.

```json
{
  "waves": [
    { "id": 0, "tasks": ["V2-1.1", "V2-2.1", "V2-3.1", "V2-7.1", "V2-7.2", "V2-10.1", "V2-12.1", "V2-12.2", "V2-15.2", "V2-16.1", "V2-17.1", "V2-18.1"] },
    { "id": 1, "tasks": ["V2-1.2", "V2-1.3", "V2-1.4", "V2-1.5", "V2-2.2", "V2-3.2", "V2-7.3", "V2-7.4", "V2-10.2", "V2-11.1", "V2-11.2", "V2-11.3", "V2-13.1", "V2-13.2", "V2-15.1", "V2-15.3", "V2-16.2", "V2-17.2", "V2-17.3", "V2-18.2"] },
    { "id": 2, "tasks": ["V2-1.6", "V2-1.7", "V2-2.3", "V2-2.4", "V2-3.3", "V2-3.4", "V2-6.1", "V2-6.2", "V2-10.3", "V2-11.4", "V2-11.5", "V2-12.3", "V2-13.3", "V2-13.4", "V2-14.1", "V2-14.2", "V2-15.4", "V2-16.3", "V2-16.4", "V2-17.4"] },
    { "id": 3, "tasks": ["V2-2.5", "V2-2.6", "V2-2.7", "V2-3.5", "V2-3.6", "V2-4.1", "V2-4.2", "V2-4.3", "V2-4.4", "V2-5.1", "V2-5.2", "V2-7.5", "V2-7.6", "V2-9.1", "V2-9.2", "V2-10.4", "V2-10.5", "V2-12.4", "V2-12.5", "V2-14.3", "V2-16.5", "V2-17.5", "V2-17.6", "V2-18.3"] },
    { "id": 4, "tasks": ["V2-10.6", "V2-10.7", "V2-19.2"] },
    { "id": 5, "tasks": ["V2-19.1"] },
    { "id": 6, "tasks": ["V2-8"] }
  ]
}
```


- [ ] V2-19. Cinematic surface review (gate before v2 launch)
  - [ ] V2-19.1 For each v2 surface, run the screenshot test
    - Capture a screenshot of the production build of: Pro Upgrade Flow, Anomaly Boost Purchase, Battle Result, Profile Card, Onboarding screens 1–3, Status Page, Help Page, Cookie Consent Banner, Email Capture
    - Owner reviews each: would a stranger save this screenshot? If no, file a redesign issue.
    - SHALL block the v2 launch checkpoint until every v2 revenue-relevant or growth-relevant surface passes the test.
    - _Requirements: v2-32.4_

  - [ ] V2-19.2 CI guard against raw third-party chrome on POWERLVL surfaces
    - Lint: forbid imports of `@stripe/stripe-js` mounted directly into a POWERLVL route component (must be inside a `<ProUpgradeInterstitial>` or `<AnomalyBoostModal>` wrapper)
    - Lint: forbid direct calls to `window.confirm`, `window.alert`, `window.prompt` anywhere in `artifacts/web/src/`
    - Lint: forbid raw `Notification.requestPermission()` outside the `useNotificationPermission` hook (which always shows the custom value-prop prompt first)
    - _Requirements: v2-32.2_