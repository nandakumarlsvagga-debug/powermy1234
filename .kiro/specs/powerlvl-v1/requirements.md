# Requirements Document

## Introduction

POWERLVL is a premium social, AI-powered web app built around a single dopamine loop: upload a photo, watch a cinematic scan animation, and get a fictional power level revealed on a screenshot-worthy card. The tagline is "Everything has a power level. What's yours?" The product is not an image-analysis tool; it is a power-fantasy / scouter system optimized for dramatic reveals, share cards, and leaderboard competition. Users select one of six Categories (Setups, Fitness, Drip, Pets, Rides, Wildcard), upload an image, watch a seven-to-ten-second cinematic reveal, and receive a Score (1,000–100,000), a Tier (D through LIMITLESS), four Core Stats, five Category Stats, a single line of dramatic commentary, and occasionally a rare Anomaly event. Results are deterministic per image and Category, sharable as server-rendered cards in three aspect ratios — each carrying a verification QR code so screenshots can be authenticated against a public permalink and fake scores are detectable — rankable on Leaderboards across three time windows, and browsable in a public Feed. The first scan is anonymous; deeper participation (saving scans, claiming Leaderboard placement, profile pages) requires an OAuth-based account. The visual language is otherworldly — POWERLVL should feel like an artifact from another product universe, not a typical web app: matte-black canvases, restrained chrome, hand-tuned cinematic motion, and a single hero element on every screen.

## Glossary

- **POWERLVL**: The system as a whole — frontend, API, scoring engine, share-card renderer, and supporting services.
- **Scanner**: The end-to-end upload, analysis, and reveal pipeline experienced by the user.
- **Scan**: A single completed analysis of one image, with a stored Score, Tier, stats, commentary, optional Anomaly, and a permalink.
- **Score**: The integer power level assigned to a Scan, in the inclusive range 1,000 to 100,000.
- **Tier**: The named bucket assigned to a Score (D, C, B, A, S, SS, SSS, or LIMITLESS).
- **Category**: One of six user-selectable contexts for a Scan: SETUPS, FITNESS, DRIP, PETS, RIDES, WILDCARD.
- **Core Stats**: The four stats present on every Scan — AURA, POWER, STATUS, THREAT — each in the inclusive range 0 to 10,000.
- **Category Stats**: The five Category-specific stats produced for each Scan, each in the inclusive range 0 to 10,000.
- **Anomaly**: A rare reveal event with its own visual treatment and optional Score modifier.
- **Vision Model**: The AI vision service used to analyze the uploaded image — Amazon Bedrock Nova Lite, with prompt engineering and a curated fallback commentary library to handle quality control.
- **Moderation Service**: The pre-analysis content moderation layer (AWS Rekognition Content Moderation).
- **Slop Detector**: The server-side validator that rejects Vision Model commentary failing brand-tone, length, or content-grounding checks.
- **Fallback Commentary Library**: The curated set of commentary templates per Category and per Tier, used when the Vision Model output fails Slop Detector checks.
- **Share Card**: The server-rendered PNG image generated for each Scan, sized for stories, square posts, and link-unfurls.
- **Anonymous User**: A visitor who has not signed in.
- **Member**: A signed-in user with a saved account and username.
- **Leaderboard**: A ranked list of top Scans across a time window and scope.
- **Feed**: The public chronological list of recent Scans.
- **Profile**: A Member's public page at `/u/{username}` plus their personal scan history view.
- **Verification QR**: The QR code rendered on every Share Card encoding the Scan permalink URL, used by viewers to confirm a screenshot is genuine.
- **Hero Element**: The revealed Score on the Result Screen, the Share Card preview on the Result Screen, the wordmark on the Landing surface, and the Score text on the Share Card image.
- **HUD Chrome**: Decorative telemetry elements rendered around or adjacent to a primary surface — corner brackets, scan-ID labels, sweep lines, and similar overlays.

## Requirements

### Requirement 1: Anonymous First-Scan Access

**User Story:** As a first-time visitor, I want to scan an image without creating an account, so that I can experience POWERLVL instantly without friction interrupting the dopamine reveal.

#### Acceptance Criteria

1. WHEN a visitor opens POWERLVL for the first time and uploads an image, THE POWERLVL SHALL return a Scan result containing the visitor's Score, Tier, Core Stats, Category Stats, commentary, and any Anomaly state, without prompting for sign-in.
2. THE POWERLVL SHALL grant each Anonymous User up to 1 Scan per browser per calendar day in the visitor's local time zone, where the Anonymous User is identified by the combination of browser fingerprint and a cookie set on first visit.
3. IF an Anonymous User attempts a second Scan within the same calendar day, THEN THE POWERLVL SHALL prevent the new Scan from starting and display a sign-in prompt indicating that signing in unlocks additional Scans.
4. WHEN an Anonymous User's reveal animation completes and the Result Screen is fully visible, THE POWERLVL SHALL display a dismissible soft-auth prompt offering to claim the Scan, save it to a Profile, and unlock Leaderboard placement, while keeping the Scan result visible and interactive.
5. THE POWERLVL SHALL allow the Anonymous User to complete the upload, analyze, reveal, and share-card-download steps of their allowed Scan without any required authentication step blocking the flow.
6. WHEN a Scan is created, THE POWERLVL SHALL also generate the Scan's Share Card and the Scan's public permalink without requiring authentication.

### Requirement 2: Image Upload, Validation, and Content Moderation

**User Story:** As a user, I want to upload an image safely, so that the experience is fast, free of harmful content, and free of accidentally leaked location metadata.

#### Acceptance Criteria

1. THE POWERLVL SHALL accept user-uploaded images via file picker, drag-and-drop, and mobile camera capture.
2. WHEN an image is submitted, THE POWERLVL SHALL perform server-side MIME-type sniffing and image-decoder validation, and SHALL reject any upload whose declared content type does not match the decoded bytes.
3. IF an upload is larger than 8 megabytes, OR has a shorter edge of fewer than 256 pixels, OR is not in the format set {JPEG, PNG, HEIC, WebP}, THEN THE POWERLVL SHALL reject the upload and display a message that names the violated limit, lists the accepted formats, and gives the maximum file size and minimum dimensions.
4. WHEN an upload passes format and dimension checks, THE POWERLVL SHALL screen the image with the Moderation Service for explicit content, graphic violence, and hate symbols before any Vision Model analysis is performed.
5. IF the Moderation Service flags the image, THEN THE POWERLVL SHALL reject the upload, display a rejection notice that names the triggered moderation category, and discard the image without writing it to persistent storage.
6. IF the Moderation Service is unavailable or returns an error, THEN THE POWERLVL SHALL reject the upload, notify the user that screening is temporarily unavailable, SHALL NOT invoke the Vision Model, and SHALL NOT persist the image.
7. WHEN an accepted image is stored, THE POWERLVL SHALL strip EXIF GPS coordinates and other PII metadata fields, downscale the image so that its longer edge is at most 1600 pixels, re-encode it as AVIF (preferred) or WebP at a quality target producing a final file size of 300 kilobytes or less, and persist only the processed image. THE POWERLVL SHALL additionally generate and persist a 480-pixel long-edge thumbnail variant for use in Feed and Leaderboard rendering.
8. THE POWERLVL SHALL store images in a private storage bucket using opaque object keys, and SHALL serve images to clients only via signed URLs whose validity does not exceed 24 hours.
9. THE POWERLVL SHALL purge unclaimed Anonymous Scans 30 days after their creation by first deleting the image bytes from storage and only then marking the Scan record as expired, so that no Scan record remains live without its image.
10. WHEN a Member's account is deleted, THE POWERLVL SHALL purge all images and Scan records previously owned by that Member.

### Requirement 3: Pre-Scan Inputs

**User Story:** As a user, I want to manually choose a category and optionally describe my image, so that the result feels tailored and competes only against entries in its own ecosystem.

#### Acceptance Criteria

1. WHEN the user reaches the Scan setup screen, THE POWERLVL SHALL present exactly six selectable Categories: SETUPS, FITNESS, DRIP, PETS, RIDES, and WILDCARD.
2. THE POWERLVL SHALL render each Category using a custom monoline SVG icon, and SHALL NOT display emoji glyphs as Category icons in the production interface.
3. THE POWERLVL SHALL require the user to manually select a Category and SHALL NOT auto-classify the Category from the image.
4. IF the user submits a Scan without a Category selected, THEN THE POWERLVL SHALL block the submission and SHALL display a visible message indicating that a Category must be selected.
5. WHEN a Scan is submitted, THE POWERLVL SHALL associate the selected Category with the resulting Scan, SHALL compute Category Stats based on that Category, and SHALL NOT allow the Category to be changed after submission.
6. THE POWERLVL SHALL allow the user to optionally enter a description of the image of up to 120 characters, SHALL display the remaining character count while the user types, and SHALL prevent entry of further characters once 120 characters have been entered.
7. WHEN a description is submitted, THE POWERLVL SHALL pass the description through a profanity filter and a prompt-injection filter, SHALL strip or reject content that the filters flag, and SHALL only forward the sanitized description to the Vision Model.
8. WHERE a sanitized description with at least one non-whitespace character is provided, THE POWERLVL SHALL include it as input to the Vision Model so it may influence commentary tone, and SHALL display the sanitized description on the Result Screen, the Share Card, and the Feed entry for the resulting Scan.

### Requirement 4: Cinematic Scanner Reveal and Result Display

**User Story:** As a user, I want a cinematic, dramatic, hand-tuned reveal of my power level, so that the moment feels addictive and screenshot-worthy.

#### Acceptance Criteria

1. WHEN a Scan is submitted, THE POWERLVL SHALL play a multi-phase reveal sequence in this order: lock-on, scan sweep, analysis, slam, and final reveal.
2. WHEN a Scan is submitted, THE POWERLVL SHALL complete the entire reveal sequence in between 7 and 10 seconds inclusive.
3. WHEN the Vision Model response arrives before the choreographed slam moment, THE POWERLVL SHALL hold the analysis phase until the minimum dramatic duration has elapsed and only then trigger the slam phase.
4. IF the Vision Model response has not arrived by the choreographed slam moment, THEN THE POWERLVL SHALL extend the analysis phase by up to an additional 4 seconds, while keeping the total reveal sequence within 10 seconds end-to-end.
5. IF the Vision Model fails to return a usable response within the extended analysis budget, THEN THE POWERLVL SHALL play a SCOUTER FAILURE-style fallback reveal, compute a deterministic neutral-stat result for the Scan, and surface the result with the Anomaly badge SCOUTER FAILURE attached.
6. WHEN the slam phase fires, THE POWERLVL SHALL display the final Score as the largest foreground element on the screen, with the Tier badge, Core Stats, Category Stats, and commentary not yet visible.
7. WHEN the reveal sequence completes, THE POWERLVL SHALL display the Tier badge first, then the four Core Stats, then the five Category Stats, and finally the commentary line, with each successive element appearing only after the previous one is visible, so that the Score reads alone first.
8. THE POWERLVL SHALL render the reveal without any spinner, and SHALL render any pre-reveal loading state as a skeleton placeholder whose layout matches the final Result Screen layout.
9. THE POWERLVL SHALL preload the critical reveal assets — fonts, tier badge SVGs, anomaly overlays, and HUD elements — so that they are available before the user can interact with the Scan submit control.
10. WHILE the user has the reduced-motion preference enabled at the operating system or browser level, THE POWERLVL SHALL replace all transform-based and scale-based animations of the reveal with cross-fade transitions while preserving the content, ordering, and the Score-first visual hierarchy.

### Requirement 5: AI Vision Analysis with Dual-Pass Cultural Scoring

**User Story:** As a user, I want the AI to read my image culturally — knowing what it is, what culture would do with it, who any joke is on, what taste it shows — so that the resulting score feels fair and the commentary feels written for me.

#### Acceptance Criteria

1. WHEN a Scan is submitted and accepted by the Moderation Service, THE POWERLVL SHALL call Amazon Bedrock Nova Lite for **Pass 1 (Read)** with `temperature=0` and `top_p=0.1`, passing the processed image, the selected Category, and the optional sanitized description as inputs, and SHALL receive a structured `CulturalReading` JSON object matching the schema in `nova-lite-system-prompt.md` Block 2 — containing `image_subjects`, `archetype`, `subject_class`, `joke_target`, `memetic_status`, `taste_demonstrated_score`, `cultural_recognition_score`, `absurdity_level`, `sincerity_level`, `pretension_level`, `menace_level`, `wholesomeness_level`, `powerlvl_brand_visible`, `taste_brands_visible`, `category_match_score`, `anomaly_signal`, and `cultural_notes`.
2. THE POWERLVL SHALL require Pass 1 to emit zero numeric score fields, zero tier fields, and zero verdict-noun fields. The Vision Model SHALL NOT compute any final result; the server SHALL ignore any such field if emitted.
3. THE POWERLVL SHALL run **Pass 2 (Render)** as a pure-TypeScript deterministic function `renderScore(culturalReading, seed) → RenderedScore` matching the schema in `nova-lite-system-prompt.md` Block K, with no AI call, no I/O, and no clock dependencies. The `RenderedScore` SHALL contain `score`, `tier`, `verdictNoun`, `coreStats`, `categoryStats`, `modifiersApplied`, and `scorePreModifiers`.
4. THE POWERLVL SHALL apply the cultural-fairness modifiers in the exact fixed order specified in `nova-lite-system-prompt.md` Block L Step 2: (1) anti-iconic ceiling, (2) satirical-inversion floor, (3) reverence-protected floor, (4) iconic floor, (5) iconic-meme floor, (6) POWERLVL-brand pull + cap, (7) taste-brand bonus + cap, (8) pretension penalty, (9) self-aware affection, (10) out-of-scope cap, (11) final clamp.
5. THE POWERLVL SHALL guarantee that no `RenderedScore` reaches the LIMITLESS tier (≥99,000) unless the `CulturalReading.subjectClass` is `iconic` AND the `CulturalReading.culturalRecognition` is at least 95.
6. THE POWERLVL SHALL select the verdict noun deterministically from the curated pool specified in `nova-lite-system-prompt.md` Block O, using the rendered tier, the dominant flavor (menace / absurdity / wholesome / pretension / meme / iconic / default), and a SHA-256 hash of `(scanId, tier, flavor)` seeded into a Mulberry32 PRNG, so that the same `CulturalReading` + `scanId` always yields the same verdict noun.
7. WHEN Pass 2 has produced a `RenderedScore` AND the anomaly engine has run (applying any anomaly modifier to the score), THE POWERLVL SHALL call Amazon Bedrock Nova Lite for **Pass 3 (Voice)** with `temperature=0` and `top_p=0.1`, passing the `CulturalReading`, post-anomaly `score`, `tier`, `verdictNoun`, `category`, and `description` as inputs per `nova-lite-system-prompt.md` Block P, and SHALL receive a single commentary line in the format `{ "commentary": string }` per Block Q.
8. THE POWERLVL SHALL run the Pass 3 commentary through the slop detector (banned words per Block R, 8–14 word count, image-noun grounding against `imageSubjects`) and SHALL replace the commentary with a draw from the Fallback Commentary Library matching `(category, tier)` if it fails any check.
9. IF Pass 1 returns a response that fails the validation contract in `nova-lite-system-prompt.md` Block 9 (missing required fields, non-integer numeric fields, unrecognized enum values), THEN THE POWERLVL SHALL clamp out-of-range values, default unrecognized enums, drop invalid taste-brand slugs, and retry once with the same inputs only if required fields are missing entirely.
10. IF Pass 1 retry fails, THEN THE POWERLVL SHALL synthesize a deterministic neutral `CulturalReading` per Block 9 (subjectClass = mid, tasteDemonstrated = 50, culturalRecognition = 50, all levels at 3–5), force the Anomaly to `SCOUTER_FAILURE`, and continue to Pass 2 and Pass 3 with the synthesized reading.
11. IF Pass 3 fails to parse OR the slop detector rejects AND the retry also fails, THEN THE POWERLVL SHALL fall back to the Fallback Commentary Library keyed by `(category, tier)` and persist the resulting commentary as the final commentary for the Scan.
12. THE POWERLVL SHALL keep aggregate Bedrock Nova Lite invocations under 120 requests per minute (60 scans per minute × 2 passes per scan) under steady-state load.
13. THE POWERLVL SHALL validate every Pass 1 response against the Block 9 validation contract before passing it to Pass 2, including: dropping abstract nouns from `image_subjects`, clamping out-of-range score/level values, validating `taste_brands_visible` slugs against the Block 6 allowlist, and treating `anomaly_signal` as advisory only (never used to trigger the anomaly draw).

### Requirement 6: Cultural Fairness Floors, Ceilings, and Determinism

**User Story:** As a user, I want POWERLVL to score with cultural taste — protecting children, mocking the powerful when the joke is on them, refusing to glorify violence, and rewarding people who show their work — so that the product feels fair and culturally fluent.

#### Acceptance Criteria

1. THE POWERLVL SHALL assign every Scan a final Score that is an integer in the inclusive range 1,000 to 100,000.
2. THE POWERLVL SHALL assign every Scan exactly one Tier from `{D, C, B, A, S, SS, SSS, LIMITLESS}` using these inclusive Score ranges: D (1,000–4,999), C (5,000–14,999), B (15,000–34,999), A (35,000–54,999), S (55,000–74,999), SS (75,000–89,999), SSS (90,000–98,999), LIMITLESS (99,000–100,000).
3. THE POWERLVL SHALL assign every Scan exactly one Verdict Noun from the curated pool in `nova-lite-system-prompt.md` Block O that matches the assigned Tier. The Verdict Noun SHALL be persisted alongside the Tier and surfaced on the Result Screen, the Share Card, the Permalink page, the Feed entry, and the Leaderboard entry.
4. THE POWERLVL SHALL derive the four Core Stats (AURA, POWER, STATUS, THREAT) and five Category Stats from the `CulturalReading` cultural signals using the per-category mapping in `nova-lite-system-prompt.md` Block L Step 5, with each stat as an integer in the inclusive range 0 to 10,000.
5. THE POWERLVL SHALL produce identical `RenderedScore` outputs (score, tier, verdict noun, stats, modifiers applied) for identical `CulturalReading` + `scanId` inputs across calls. This is the **mathematically guaranteed** determinism boundary.
6. THE POWERLVL SHALL distribute scores so that, over any rolling window of at least 10,000 Scans, at least 80 percent of Scans land in the inclusive range 15,000 to 70,000, and the rate of LIMITLESS Scores falls between 1 in 50,000 and 1 in 12,500 Scans.
7. THE POWERLVL SHALL enforce the following cultural-fairness floors and ceilings as testable invariants, applied in the exact fixed order from Block L Step 2:
   - **anti-iconic ceiling**: subjectClass = `anti_iconic` → score ≤ 4,999
   - **satirical-inversion floor**: subjectClass = `satirical_inversion` AND jokeTarget = `the_powerful` → score ≥ 55,000
   - **reverence-protected floor**: subjectClass ∈ `{reverence_protected, sacred_or_memorial, first_attempt_earnest}` → score ≥ 15,000
   - **iconic floor**: subjectClass = `iconic` → score ≥ 55,000
   - **iconic-meme floor**: subjectClass = `iconic` AND memeticStatus ∈ `{iconic_template, fresh_meme}` → score ≥ 75,000
   - **POWERLVL-brand cap**: powerlvlBrandVisible = true → score ≤ 74,999 (NEVER LIMITLESS via brand alone)
   - **taste-brand cap**: tasteBrandsVisible non-empty AND subjectClass ∈ `{trying_too_hard, mid}` → score ≤ 54,999
   - **pretension penalty**: pretension ≥ 70 AND subjectClass ∈ `{trying_too_hard, mid}` → score ≤ 19,999
   - **self-aware affection**: jokeTarget = `self_aware` → score ≥ 15,000 AND score ≤ 74,999
   - **out-of-scope cap**: categoryMatchScore ≤ 2 → score ≤ 14,999
   - **LIMITLESS gate**: score ≥ 99,000 → subjectClass = `iconic` AND culturalRecognition ≥ 95
8. THE POWERLVL SHALL pass all 17 canonical anchor tests defined in `nova-lite-system-prompt.md` Block N. Each anchor tests a hand-authored `CulturalReading` fixture against an expected score/tier range. These anchors represent the cultural reputation of the product and CI SHALL fail if any anchor regresses.
9. THE POWERLVL SHALL pass all 19 property-test invariants defined in `nova-lite-system-prompt.md` Block M. CI SHALL fail if any invariant regresses.
10. THE POWERLVL SHALL define the WILDCARD Category Stats as: `Mystery Factor`, `Aura Output`, `Chaos Index`, `Rarity Score`, `Energy Signature`.
11. THE POWERLVL SHALL define the per-Category Stats as: SETUPS = `{Processing Power, Lock-In Rate, Build Quality, Threat Output, RGB Stability}`; FITNESS = `{Power Output, Discipline Index, Stamina Core, Aura Level, Threat Rating}`; DRIP = `{Rizz Level, Style Sync, Flex Value, Trend Energy, Aura Output}`; PETS = `{Menace Level, Chaos Index, Divine Energy, Brain Activity, Aura Output}`; RIDES = `{Horsepower Aura, Dominance Output, Street Presence, Threat Level, Engine Energy}`.
12. THE POWERLVL SHALL log every modifier that fires during Pass 2 (name, condition, action, score-before, score-after) and persist the `modifiersApplied` array and `scorePreModifiers` value alongside the Scan for auditability.


### Requirement 7: Anomaly Event System

**User Story:** As a user, I want rare anomaly events on some scans, so that occasional results feel exceptional, varied, and uniquely screenshot-worthy.

#### Acceptance Criteria

1. THE POWERLVL SHALL support five distinct Anomaly types: POWER SURGE DETECTED, FORBIDDEN AURA, SCOUTER FAILURE, UNREGISTERED ENERGY, and CHAOS SPIKE.
2. THE POWERLVL SHALL trigger an Anomaly on between 6 and 8 percent of Scans inclusive across the population, with the type and trigger decision determined server-side via a weighted random distribution that is independent per Scan; the weighting SHALL favor visual-only Anomalies (SCOUTER FAILURE, UNREGISTERED ENERGY) over score-modifier Anomalies (POWER SURGE DETECTED, FORBIDDEN AURA, CHAOS SPIKE) so that score-altering events remain rarer than purely visual ones.
3. THE POWERLVL SHALL assign at most one Anomaly to any given Scan.
4. WHEN the Anomaly POWER SURGE DETECTED is assigned to a Scan, THE POWERLVL SHALL apply a positive Score modifier in the inclusive range 5 to 10 percent, and SHALL render a white-flash plus screen-shake reveal variant where the screen shake amplitude does not exceed 4 pixels.
5. WHEN the Anomaly FORBIDDEN AURA is assigned to a Scan, THE POWERLVL SHALL apply a negative Score modifier in the inclusive range 5 to 10 percent, and SHALL render a red CRT-glitch overlay with distorted commentary text.
6. WHEN the Anomaly SCOUTER FAILURE is assigned to a Scan, THE POWERLVL SHALL leave the Score unmodified, and SHALL render a garbled-then-recovered Score animation lasting between 1 and 2 seconds inclusive with visible glitch artifacts.
7. WHEN the Anomaly UNREGISTERED ENERGY is assigned to a Scan, THE POWERLVL SHALL leave the Score unmodified, and SHALL display "???" in place of the Score for between 1.4 and 1.6 seconds inclusive before slamming the Score in.
8. WHEN the Anomaly CHAOS SPIKE is assigned to a Scan, THE POWERLVL SHALL apply a Score modifier in the inclusive range -15 to +15 percent, and SHALL scramble the Score during reveal before locking the final value.
9. IF any Anomaly Score modifier would push the Score outside the inclusive range 1,000 to 100,000, THEN THE POWERLVL SHALL clamp the modified Score to that range.
10. WHEN any Anomaly is assigned to a Scan, THE POWERLVL SHALL display a labeled Anomaly badge whose label equals the Anomaly type on the Result Screen, the Share Card, and the Feed entry for that Scan.

### Requirement 8: Server-Rendered Share Card, Verification QR, and Public Permalink

**User Story:** As a user, I want a high-quality share card in three aspect ratios with a verification QR code, so that I can post my result to Instagram Stories, TikTok, Discord, X square, and X landscape, and so anyone seeing my screenshot can verify the score is real and not faked.

#### Acceptance Criteria

1. WHEN a Scan completes, THE POWERLVL SHALL generate three PNG Share Card images for that Scan: a story image at 1080 by 1920 pixels, a square image at 1080 by 1080 pixels, and a landscape image at 1200 by 628 pixels.
2. THE POWERLVL SHALL render Share Card images server-side via SVG-to-PNG generation through Vercel OG (satori plus resvg), and SHALL NOT depend on client-side canvas or screenshot rendering.
3. THE POWERLVL SHALL include on every Share Card the following elements: the POWERLVL wordmark, the user's image with a subtle Scanner HUD overlay, the Score rendered as the largest text element on the card, the Tier badge, the four Core Stats, the commentary line, the Scan ID, a Verification QR encoding the absolute URL of the Scan permalink, and the short visible permalink path `/scan/{id}` rendered next to the QR.
4. THE POWERLVL SHALL render the Verification QR with sufficient quiet zone, contrast, and module size that it scans reliably from a phone camera held against a 9:16 share card displayed at fullscreen on a typical phone.
5. THE POWERLVL SHALL place the Verification QR in a fixed corner of every Share Card layout, at a size that is clearly readable but does not visually compete with the Score.
6. IF a Scan has a sanitized description, THEN THE POWERLVL SHALL include that description on the Share Card as a subtle secondary line that does not visually compete with the Score.
7. IF a Scan has an associated Anomaly, THEN THE POWERLVL SHALL include the corresponding Anomaly badge and visual treatment on the Share Card for that Scan.
8. THE POWERLVL SHALL NOT include on any Share Card the user's email address, account ID, authentication token, or any other personally identifying information beyond the Member's chosen public username.
9. THE POWERLVL SHALL serve every generated Share Card image with public CDN caching headers permitting at least 24 hours of cacheability.
10. WHEN a Scan is created, THE POWERLVL SHALL provide a public permalink at `/scan/{id}` that is accessible without authentication.
11. WHEN a visitor opens a Scan permalink, THE POWERLVL SHALL display the original uploaded image, the Score, the Tier, the Core Stats, the Category Stats, the commentary, the Anomaly badge if present, the Member's public username (or "anonymous" for unclaimed Scans), the Scan creation timestamp, and a "verified scan" badge confirming the Scan exists in the POWERLVL database.
12. WHEN a Scan permalink is requested, THE POWERLVL SHALL include Open Graph and Twitter card metadata in the response that references the appropriate Share Card image URL for the platform unfurling the link, such that previews on Instagram, TikTok, Discord, and X consume the metadata without additional system-side handling.
13. IF a Share Card image generation request fails for a Scan, THEN THE POWERLVL SHALL preserve the Scan record and present an error indication on the Scan's permalink page identifying that the Share Card is temporarily unavailable.
14. IF a permalink request references a Scan ID that does not exist OR has been expired, THEN THE POWERLVL SHALL return a clear not-found response that explicitly indicates the Scan is unverified, so that QR scans of fake screenshots resolve to a visible failure rather than a silent error.

### Requirement 9: Authentication, Soft Auth Claim, and Daily Scan Limits

**User Story:** As a returning user, I want to sign in via OAuth, so that I can claim my anonymous scans, save my history, and appear on leaderboards without managing email links.

#### Acceptance Criteria

1. THE POWERLVL SHALL support sign-in via OAuth providers, with Google as a required provider, and SHALL NOT offer magic-link email authentication in this release.
2. WHEN a user signs in for the first time, THE POWERLVL SHALL prompt the user to choose a username of 3 to 20 characters drawn from the character set {lowercase letters, digits, underscore}, that is unique among existing Members, and SHALL use the chosen username as the Member's public Profile URL slug.
3. IF the chosen username does not satisfy the length, character, or uniqueness rules, THEN THE POWERLVL SHALL reject the username, display an error indicating the violated rule, and allow the user to try a different username without re-authenticating.
4. WHILE a Member is signed in, THE POWERLVL SHALL allow up to 25 Scans per UTC calendar day per Member account.
5. IF a Member has reached the 25-Scan daily limit on the current UTC calendar day, THEN THE POWERLVL SHALL block additional Scans until the next UTC calendar day begins, preserve the Member's current daily Scan count, and display the time remaining until the next reset.
6. WHEN an Anonymous User who just completed a Scan signs in via the post-reveal soft-auth prompt within the same browser session, THE POWERLVL SHALL associate that just-completed Scan with the resulting Member account so that it appears in the Member's Profile history and is eligible for Leaderboards.
7. THE POWERLVL SHALL require a Member account to participate in Leaderboards and to have a Profile.
8. THE POWERLVL SHALL allow public viewing of Leaderboards, Profiles, the Feed, and Scan permalinks without authentication.

### Requirement 10: Leaderboards

**User Story:** As a user, I want leaderboards across time windows and categories, so that I can see who currently holds the highest power levels and try to climb them.

#### Acceptance Criteria

1. THE POWERLVL SHALL provide Leaderboards across three time windows: TODAY (the rolling 24-hour window ending at the current moment), THIS WEEK (the rolling 7-day window ending at the current moment), and ALL-TIME (every qualifying Scan ever created).
2. THE POWERLVL SHALL provide, within each time window, one GLOBAL board that mixes all Categories and one per-Category board for each of the six Categories, for a total of 21 board views.
3. THE POWERLVL SHALL display up to the top 100 Scans on each board, ranked by Score in descending order, and SHALL break ties between equal Scores by ordering the earlier Scan creation timestamp ahead of the later one. WHEN fewer than 100 qualifying Scans exist for a board, THE POWERLVL SHALL display all qualifying Scans.
4. THE POWERLVL SHALL include only Scans associated with a Member account in Leaderboards and SHALL omit Scans created while Anonymous and never claimed.
5. WHEN a Scan is among the top 100 Scans for a board within the board's time window, THE POWERLVL SHALL display the Scan with the Member's current public username, the Tier badge, the Score, the Category, the Anomaly badge if present, the Scan creation timestamp, and a link to the Scan permalink.
6. THE POWERLVL SHALL NOT expose on any Leaderboard view the Member's email, account ID, IP address, or any field beyond those listed in criterion 5.
7. WHEN a Scan crosses outside the rolling time window of a board, THE POWERLVL SHALL remove the Scan from that board within 5 minutes of the boundary being crossed.

### Requirement 11: Public Feed and User Profiles

**User Story:** As a user, I want a public feed and profile pages, so that I can browse recent scans and showcase my own collection.

#### Acceptance Criteria

1. THE POWERLVL SHALL render a public global Feed of Scans ordered by Scan creation time with newest first, accessible without authentication or account creation.
2. THE POWERLVL SHALL load Feed entries via virtualized infinite scroll in pages of 20 Scans, rendering only the entries within and adjacent to the visible viewport and fetching the next page as the visitor scrolls toward the end of the loaded list.
3. WHEN any visitor, including Anonymous Users, activates Like on a Scan in the Feed, THE POWERLVL SHALL toggle that visitor's like for the Scan such that each visitor contributes at most one like per Scan.
4. WHEN any visitor, including Anonymous Users, activates Share on a Scan in the Feed, THE POWERLVL SHALL open a Share dialog that displays the appropriate Share Card aspect ratio for the visitor's chosen target platform.
5. THE POWERLVL SHALL limit social interactions in this release to likes and shares, and SHALL NOT expose user-facing functionality for comments, follows, or direct messaging.
6. WHEN a Member opens their own Profile, THE POWERLVL SHALL display the Member's complete Scan history ordered by Scan creation time newest first, highest Score across all Scans, total Scan count, and highest Tier achieved.
7. THE POWERLVL SHALL serve a public Profile page at `/u/{username}` for every existing Member, showing the Member's username, avatar (defaulting to the first letter of the username rendered as initials when no avatar image is set), Scan history ordered by Scan creation time newest first, and aggregate stats consisting of highest Score, total Scan count, and highest Tier achieved.
8. IF a visitor requests `/u/{username}` for a username that does not correspond to an existing Member, THEN THE POWERLVL SHALL display a Profile-not-found view indicating the user does not exist while keeping the rest of the public navigation reachable.

### Requirement 12: Visual and Motion Design System

**User Story:** As a user, I want a premium, restrained, distinctive interface, so that POWERLVL feels like a flagship social product instead of a generic AI tool.

#### Acceptance Criteria

1. THE POWERLVL SHALL use exactly five color tokens across all production surfaces: matte black `#0A0A0B` for backgrounds, graphite `#1A1A1D` for surfaces, white `#FAFAFA` for primary typography, amber `#F5A623` as a restrained accent, and HUD cyan `#5EEAD4` for the scanner HUD during reveals.
2. THE POWERLVL SHALL use amber `#F5A623` only on the revealed Score number, the active primary call-to-action button, and amber-Tier badges, where an amber-toned element is any element rendering `#F5A623` as fill, stroke, or text color, and SHALL display no more than one amber-toned element per viewport at any time, except during the slam phase of the reveal.
3. THE POWERLVL SHALL use HUD cyan `#5EEAD4` only inside the scanner HUD during the reveal sequence, and SHALL NOT use it as a fill, stroke, or text color anywhere else in production interfaces.
4. THE POWERLVL SHALL apply a per-Tier accent color system: D = zinc, C = sky, B = emerald, A = amber, S = orange, SS = rose, SSS = violet, LIMITLESS = animated white-gold.
5. THE POWERLVL SHALL use at most two type families across the product: a precision geometric sans (Geist or Inter Tight) for display and editorial copy, and a tabular monospaced face (Geist Mono or JetBrains Mono) for all numeric values, HUD labels, and system text.
6. THE POWERLVL SHALL render every numeric value using tabular monospaced figures so digits remain horizontally aligned during animation and on the Share Card.
7. THE POWERLVL SHALL lay out every screen on an 8-point spacing grid, and SHALL maintain a minimum 32-pixel clearance between every Hero Element and any adjacent UI element on the same surface.
8. THE POWERLVL SHALL render the Score on the Result Screen at a minimum of 80 pixels at viewport widths below 1024 pixels and at a minimum of 144 pixels at viewport widths of 1024 pixels and above, such that the Score is the largest single rendered element on the Result Screen by pixel height.
9. THE POWERLVL SHALL limit decorative HUD Chrome to no more than two surfaces in any single viewport.
10. THE POWERLVL SHALL render production interfaces without glowing borders on standard UI elements, without drop shadows on cards, and without full-page or animated background gradients; cards SHALL use a 1-pixel outer border together with an inset border whose contrast against the card surface is lower than the outer border's contrast for depth, and a glow effect SHALL be permitted only on the Score number during the reveal animation.
11. THE POWERLVL SHALL implement all motion using a single shared Framer Motion preset library of springs and easings, and SHALL NOT define per-component custom spring or easing values outside that shared library; non-spring transitions SHALL use cubic-bezier(0.16, 1, 0.3, 1) as the default premium easing.
12. THE POWERLVL SHALL deliver the reveal animation, navigation transitions, and Feed scroll without dropping a frame across the measured interaction on a 2022-class mid-tier Android device with at least 6 gigabytes of RAM, targeting 60 frames per second.
13. THE POWERLVL SHALL render every screen correctly without horizontal overflow at viewport widths of 375 pixels, 768 pixels, 1024 pixels, and 1440 pixels.
14. THE POWERLVL SHALL complete every non-reveal UI transition in 300 milliseconds or less, and SHALL NOT use generic spinners anywhere in the interface, instead presenting layout-matching skeleton placeholders during loading states.
15. WHILE the user has the reduced-motion preference enabled at the operating system or browser level, THE POWERLVL SHALL replace all transform-based and scale-based animations with cross-fade transitions while preserving content, ordering, and the Score-first visual hierarchy.
16. THE POWERLVL SHALL render every Category, navigation, and HUD icon as a custom monoline SVG, and SHALL NOT use emoji glyphs anywhere in the production interface.
17. THE POWERLVL SHALL deliver a typography-first POWERLVL wordmark with no mascot and no pictorial mark, in SVG and PNG variants suitable for nav, the reveal, and Share Cards.

### Requirement 13: Performance Budgets

**User Story:** As a user, I want the experience to feel fast on a phone over 4G, so that the reveal lands without ever feeling like a generic slow web app.

#### Acceptance Criteria

1. THE POWERLVL SHALL achieve a Largest Contentful Paint of 2.5 seconds or less at the 75th percentile of measurements, on a representative 4G mobile profile.
2. THE POWERLVL SHALL keep server cold-start latency at 1.5 seconds or less at the 95th percentile of measurements.
3. THE POWERLVL SHALL preload the critical reveal assets — fonts, tier badge SVGs, anomaly overlays, HUD elements — so that they are available before the Scan submit control becomes interactive.
4. THE POWERLVL SHALL never render a generic spinner, and SHALL instead render skeleton placeholders whose layout matches the final layout exactly while data loads.
5. THE POWERLVL SHALL keep the application stable, and the Scanner reveal interactive, for thousands of concurrent users on the chosen free-tier hosting and database plans.

### Requirement 14: Security, Abuse Controls, and Data Access

**User Story:** As the operator, I want strict access controls and abuse controls in place from day one, so that the app stays stable, costs stay bounded, and user data stays private.

#### Acceptance Criteria

1. THE POWERLVL SHALL apply per-IP-per-hour and per-Member-per-hour Scan rate limits, set to 10 Scans per IP per hour and 30 Scans per Member per hour, and SHALL block requests exceeding either limit with a clear error message and the time remaining until the limit resets.
2. THE POWERLVL SHALL apply a per-IP rate limit of 5 Share-Card render requests per second, and SHALL block requests exceeding that limit with a clear error message.
3. THE POWERLVL SHALL keep AWS service credentials and Supabase service-role keys only in server-side environment variables on Vercel, and SHALL NOT bundle, log, or expose any of these secrets in client-side code.
4. THE POWERLVL SHALL configure Supabase row-level security policies such that a Member can read and write only Scans associated with their own account, and the public Leaderboard projection SHALL expose only the fields {username, category, score, tier, anomaly, created_at} for any Scan it includes.
5. THE POWERLVL SHALL filter every user-supplied description for profanity and prompt-injection patterns before forwarding the description to the Vision Model, and SHALL strip or reject content that the filters flag.
6. THE POWERLVL SHALL log Vision Model invocations, Moderation Service invocations, and rate-limit rejections as structured events suitable for cost and abuse review, and SHALL NOT log raw image bytes or full descriptions in those structured events.

---

# POWERLVL v2 — Requirements

> **Status:** Planned. Do not implement until v1 is fully shipped and live.
> **Design language:** Identical to v1. Same color tokens, same motion system, same otherworldly aesthetic.
> **Revenue model:** POWERLVL PRO subscription ($4.99/mo) + Anomaly Boost credit ($1.49 one-time).

## v2 Introduction

v2 transforms POWERLVL from a viral toy into a sustainable social product. The core dopamine loop is unchanged. v2 adds the social glue (Scan Battles), the retention engine (Weekly Challenges), the revenue layer (Pro subscription + Anomaly Boost credit), and the acquisition surface (permalink "Scan your own" CTA). The design language, color system, and motion system are identical to v1.

## v2 Glossary

- **Pro Member**: A Member with an active POWERLVL PRO subscription.
- **Anomaly Boost**: A one-time purchasable credit that guarantees the next Scan triggers an Anomaly.
- **Battle**: A head-to-head Scan comparison between two Members under the same Category, decided by Score.
- **Challenge**: A weekly community event where all Scans in a specific Category compete for the highest Score.
- **Battle Card**: A server-rendered 1080×1080 PNG showing both Scans side-by-side with the winner highlighted.
- **Challenge Winner Badge**: A permanent badge awarded to the top 3 Members at the end of a weekly Challenge.

## v2 Requirements

### Requirement 15: POWERLVL PRO Subscription

**User Story:** As a power user, I want a Pro subscription, so that I can unlock unlimited scans, exclusive visual identity, and priority placement that signals my status in the community.

#### Acceptance Criteria

1. THE POWERLVL SHALL offer a POWERLVL PRO subscription at $4.99 per month, processed via Stripe Checkout.
2. WHEN a Member subscribes to Pro, THE POWERLVL SHALL immediately grant: unlimited Scans per day (removing the 25/day cap), an animated shimmer variant on their Tier badge on Share Cards and Leaderboard entries, a custom profile banner (upload or choose from 12 curated dark-themed options), priority placement in the global Feed algorithm, early access to new Categories before public launch, and a visible PRO mark on their Profile page and Leaderboard entries.
3. THE POWERLVL SHALL verify Pro status server-side on every Scan request and SHALL NOT trust any client-supplied claim of Pro status.
4. WHEN a Pro subscription lapses or is cancelled, THE POWERLVL SHALL revert the Member to the 25/day scan limit and remove Pro visual treatments from new Scans; existing Scans retain their Pro badge treatment.
5. THE POWERLVL SHALL handle Stripe webhook events `customer.subscription.updated` and `customer.subscription.deleted` to keep Pro status in sync within 60 seconds of the event.
6. THE POWERLVL SHALL NOT grant Pro Members any scoring advantage — Scores, Tiers, and Anomaly rates are identical for Pro and free Members.
7. THE POWERLVL SHALL NOT make LIMITLESS purchasable under any Pro tier or credit system.

### Requirement 16: Anomaly Boost Credit

**User Story:** As a user, I want to be able to guarantee my next scan triggers an anomaly, so that I can chase a specific visual reveal without waiting for random chance.

#### Acceptance Criteria

1. THE POWERLVL SHALL offer a single Anomaly Boost credit at $1.49 per unit, processed via Stripe.
2. WHEN a Member has an unused Anomaly Boost credit and submits a Scan, THE POWERLVL SHALL guarantee the Scan triggers an Anomaly, with the Anomaly type still determined by the standard weighted random draw.
3. THE POWERLVL SHALL consume the Anomaly Boost credit atomically before the Scan pipeline runs — decrement the credit balance first, then run the scan — so that a pipeline failure does not silently consume the credit without producing a result.
4. IF the Scan pipeline fails after the credit is consumed, THE POWERLVL SHALL refund the credit to the Member's balance.
5. THE POWERLVL SHALL display the Member's current Anomaly Boost credit balance on their Profile page and on the Scan setup screen.
6. THE POWERLVL SHALL expire unused Anomaly Boost credits 7 days after purchase and notify the Member 24 hours before expiry.
7. THE POWERLVL SHALL NOT allow Anomaly Boost credits to be gifted, transferred, or stacked (only one credit consumed per Scan).

### Requirement 17: Scan Battles

**User Story:** As a Member, I want to challenge another Member to a head-to-head Scan Battle, so that we can compare our power levels in the same Category and share the result.

#### Acceptance Criteria

1. THE POWERLVL SHALL allow any Member who has completed a Scan to initiate a Battle by selecting "Challenge" from their Result Screen, which generates a unique Battle link valid for 48 hours.
2. WHEN a visitor opens a Battle link, THE POWERLVL SHALL require them to sign in as a Member and then scan under the same Category as the challenger before the Battle expires.
3. THE POWERLVL SHALL determine the Battle winner by Score — the Member with the higher Score wins; in the event of an exact tie, the earlier Scan creation timestamp wins.
4. WHEN both Members have scanned, THE POWERLVL SHALL immediately reveal the Battle result to both participants and generate a Battle Card.
5. THE POWERLVL SHALL render the Battle Card as a server-rendered 1080×1080 PNG showing both uploaded images side-by-side, both Scores (winner in amber `#F5A623`, loser in zinc), both Tier badges, the Category, and a "BATTLE" badge; the Battle Card SHALL include a Verification QR encoding the Battle permalink.
6. THE POWERLVL SHALL provide a public Battle permalink at `/battle/{id}` showing the full Battle result, both Scans, and a "VERIFIED BATTLE" badge.
7. IF a Battle link expires before the opponent scans, THE POWERLVL SHALL mark the Battle as expired and notify the challenger.
8. THE POWERLVL SHALL allow each participant to scan only once per Battle — re-scanning to improve a Battle result is not permitted.
9. THE POWERLVL SHALL display Battles in the public Feed with a "BATTLE" badge, showing both participants' usernames, the Category, and the winner's Score.
10. THE POWERLVL SHALL allow any visitor to share a Battle Card using the same platform-targeted share flow as standard Scan Cards.

### Requirement 18: Weekly Challenges

**User Story:** As a Member, I want weekly community challenges, so that I have a reason to return every week and compete for a permanent badge on my profile.

#### Acceptance Criteria

1. THE POWERLVL SHALL activate a new Challenge every Monday at 00:00 UTC, specifying a Category and a title (e.g., "SETUPS WEEK").
2. THE POWERLVL SHALL automatically include all Scans in the Challenge Category submitted during the Challenge window in the Challenge Leaderboard.
3. THE POWERLVL SHALL display a dedicated Challenge Leaderboard showing the top 100 Scans for the active Challenge, ranked by Score descending with the same tiebreak rule as the main Leaderboard.
4. WHEN a Challenge ends, THE POWERLVL SHALL award a permanent Challenge Winner Badge to the Members holding ranks 1, 2, and 3 on the final Challenge Leaderboard.
5. THE POWERLVL SHALL display Challenge Winner Badges on the Member's Profile page and on their Leaderboard entries, permanently.
6. THE POWERLVL SHALL display the current Challenge prominently on the Leaderboard page and on the landing surface so visitors understand the active competition.
7. THE POWERLVL SHALL allow Pro Members to see a "Challenge Streak" counter on their Profile showing consecutive weeks in which they submitted at least one qualifying Scan.

### Requirement 19: Permalink Acquisition CTA

**User Story:** As a visitor who scanned a QR code on a share card, I want a clear invitation to scan my own image, so that I can immediately participate after seeing someone else's result.

#### Acceptance Criteria

1. WHEN any visitor opens a Scan permalink at `/scan/{id}`, THE POWERLVL SHALL display a prominent "Scan Your Own" call-to-action below the verified Scan result, using the same amber primary CTA style as the landing page.
2. THE POWERLVL SHALL track the source of new Scans initiated from a permalink page so the operator can measure QR-driven acquisition.
3. THE POWERLVL SHALL display the "Scan Your Own" CTA for both authenticated and anonymous visitors, and SHALL NOT require sign-in before the visitor can begin their first Scan.

### Requirement 20: Account Suspension and Abuse Controls

**User Story:** As the operator, I want a basic account suspension system, so that I can handle chargebacks, abuse, and ban evasion without manual database edits.

#### Acceptance Criteria

1. THE POWERLVL SHALL support marking a Member account as suspended via an internal admin endpoint, setting a `banned_at` timestamp and an optional `ban_reason`.
2. WHEN a suspended Member attempts to sign in or submit a Scan, THE POWERLVL SHALL block the action and display a message indicating the account is suspended.
3. THE POWERLVL SHALL cancel any active Pro subscription for a suspended Member via the Stripe API at the time of suspension.
4. THE POWERLVL SHALL NOT expose the ban reason to the suspended Member — only a generic suspension notice.
5. THE POWERLVL SHALL log all suspension events as structured audit records including the operator identity, timestamp, and reason.

### Requirement 21: New Categories (FOOD, WORKSPACE, FITS)

**User Story:** As a user, I want new categories to scan, so that the product stays fresh and I can flex in more areas of my life.

#### Acceptance Criteria

1. THE POWERLVL SHALL add three new Categories in v2: FOOD, WORKSPACE, and FITS.
2. THE POWERLVL SHALL define five Category Stats for each new Category: FOOD = {Presentation Score, Flavor Aura, Rarity Index, Threat to Diet, Aesthetic Output}; WORKSPACE = {Focus Energy, Ergonomic Power, Aesthetic Level, Productivity Aura, Threat Output}; FITS = {Drip Level, Fit Score, Aura Output, Trend Sync, Flex Value}.
3. THE POWERLVL SHALL render each new Category with a custom monoline SVG icon consistent with the existing icon set.
4. THE POWERLVL SHALL include at least 12 few-shot commentary examples per new Category in the Vision Model system prompt.
5. THE POWERLVL SHALL include at least 24 fallback commentary templates per new Category spanning all 8 Tiers.
6. THE POWERLVL SHALL provide per-Category Leaderboards and Challenge eligibility for each new Category from launch.
7. WHEN a new Category launches, THE POWERLVL SHALL surface it as "NEW" in the Category selector for 14 days after launch.

### Requirement 22: First-Run Onboarding

**User Story:** As a first-time visitor, I want a brief onboarding that shows me what POWERLVL is and how it works, so that I understand the tier ladder and the scan loop before I upload my first image.

#### Acceptance Criteria

1. WHEN a visitor opens POWERLVL for the very first time (no prior visit cookie), THE POWERLVL SHALL display a 3-screen onboarding sequence before the landing surface.
2. THE POWERLVL SHALL render the onboarding in the same visual language as the rest of the product — matte black, cinematic spacing, no tutorial-style illustrations or generic UI patterns.
3. THE POWERLVL SHALL show on screen 1: the POWERLVL wordmark, the tagline "Everything has a power level. What's yours?", and a brief animated preview of the scan reveal (a looping 3-second clip of the slam phase with a sample score).
4. THE POWERLVL SHALL show on screen 2: the full tier ladder from D to LIMITLESS with each tier's accent color and a one-line description, emphasizing that LIMITLESS is mythical and extremely rare.
5. THE POWERLVL SHALL show on screen 3: every active Category at the time the visitor opens onboarding, each with its monoline SVG icon and a one-line description, so the visitor understands that Categories are separate competitive ecosystems. AT v2 LAUNCH this is the six v1 Categories plus FOOD, WORKSPACE, and FITS — nine in total. The screen lays them out in a 3×3 grid for nine; the layout SHALL adapt automatically (2×3 for six, 3×3 for nine, etc.) based on the active Category list.
6. THE POWERLVL SHALL allow the visitor to skip the onboarding at any point and proceed directly to the scanner.
7. WHEN the visitor completes or skips the onboarding, THE POWERLVL SHALL set a cookie marking onboarding as seen so it is never shown again on that browser.
8. THE POWERLVL SHALL complete the onboarding sequence in no more than 30 seconds if the visitor reads every screen without skipping.

### Requirement 23: Battle and Challenge Push Notifications

**User Story:** As a Member involved in a Battle or Challenge, I want push notifications so that I know when my opponent has scanned and when a Challenge result is in, without having to check the app.

#### Acceptance Criteria

1. THE POWERLVL SHALL request web push notification permission from Members after they complete their first Scan as a signed-in Member, using a non-blocking prompt that appears after the result screen is visible.
2. THE POWERLVL SHALL NOT request push notification permission from Anonymous Users or before the first signed-in Scan is complete.
3. WHEN a Battle opponent completes their Scan, THE POWERLVL SHALL send a push notification to the challenger containing the Battle result (winner, both Scores, and a link to the Battle permalink).
4. WHEN a Weekly Challenge ends and the Member placed in the top 3, THE POWERLVL SHALL send a push notification informing the Member of their rank and the Challenge Winner Badge they earned.
5. WHEN a Weekly Challenge ends and the Member submitted a qualifying Scan but did not place in the top 3, THE POWERLVL SHALL send a push notification showing their final rank and the top score.
6. THE POWERLVL SHALL allow Members to opt out of push notifications at any time from their Profile settings, and SHALL respect the browser-level notification permission revocation immediately.
7. IF a Member has not granted push notification permission, THE POWERLVL SHALL fall back to displaying an in-app notification banner the next time the Member opens the app.

### Requirement 24: Legal Pages, Compliance, and Age Gate

**User Story:** As the operator, I want full legal compliance and trust pages, so that POWERLVL satisfies Stripe, OAuth provider, and GDPR/CCPA requirements once payments are accepted.

#### Acceptance Criteria

1. THE POWERLVL SHALL serve a public Terms of Service page at `/terms` covering acceptable use, content licensing, liability disclaimer, dispute resolution, and minimum age (13+ globally, 16+ in the EEA).
2. THE POWERLVL SHALL serve a public Privacy Policy page at `/privacy` listing every category of data collected, processing purpose, retention window, sub-processor (Supabase, AWS, Stripe, Vercel), and the user's data-export and deletion rights.
3. THE POWERLVL SHALL serve a public Cookie Policy page at `/cookies` listing every cookie set by the product, its purpose, and its retention window.
4. WHEN a first-time visitor's IP geolocates to the EU, UK, or EEA, THE POWERLVL SHALL display a cookie consent banner with two clear options ("Accept" and "Reject non-essential") and SHALL store the result in a `plvl_consent` cookie before allowing analytics events to be emitted.
5. WHEN a user signs in for the first time, THE POWERLVL SHALL verify the user is at least 13 years old (16 in the EEA) by checking the OAuth provider's birthdate claim if available, or by requiring an explicit self-attestation checkbox during username selection.
6. THE POWERLVL SHALL provide a `GET /api/me/data-export` endpoint returning a JSON archive of the Member's profile, scans, battles, credit purchases, and badges, deliverable within the same response.
7. WHEN a Member submits an account deletion via `DELETE /api/me`, THE POWERLVL SHALL purge all v1 and v2 records owned by that Member in a single transaction (scans, images, likes, daily counts, pro subscription, credit balances, credit purchases, battles where they are challenger or opponent, badges, push subscriptions, pending notifications, and the member row itself).

### Requirement 25: Analytics and Funnel Instrumentation

**User Story:** As the operator, I want first-party analytics events on every revenue-relevant and viral-relevant action, so that I can measure the funnel and improve conversion without depending on third-party trackers.

#### Acceptance Criteria

1. THE POWERLVL SHALL emit structured analytics events to a first-party `analytics_events` Postgres table for every event in the v2 design's event catalog.
2. THE POWERLVL SHALL NOT use any third-party analytics SDK that ships in the client bundle, and SHALL NOT include user-identifying personal data in event properties (no email, no IP, no image bytes, no description text, no commentary text).
3. THE POWERLVL SHALL roll up daily event counts into an `analytics_daily` summary table via a nightly cron job for fast dashboard queries.
4. WHEN a visitor has rejected non-essential cookies via the cookie consent banner, THE POWERLVL SHALL still emit essential events required for service operation (rate-limit checks, scan submission, scan completion) but SHALL NOT emit funnel-only events (`scan.shared`, `scan.permalink_cta_clicked`, `referral.attributed`, etc.).

### Requirement 26: Progressive Web App and SEO

**User Story:** As a mobile user, I want to install POWERLVL to my home screen, and as the operator I want public pages indexed correctly by search engines, so that the app gains a native-app retention loop and a discoverable web presence.

#### Acceptance Criteria

1. THE POWERLVL SHALL ship a Web App Manifest at `/manifest.webmanifest` with name "POWERLVL", `display: standalone`, `background_color: #0A0A0B`, `theme_color: #0A0A0B`, and 192×192 / 512×512 / 512×512-maskable icon variants.
2. THE POWERLVL SHALL register a Service Worker at `/sw.js` that handles `push` and `notificationclick` events for push notification delivery, and SHALL NOT cache HTML, JS bundles, scan responses, or share cards.
3. THE POWERLVL SHALL emit per-route Open Graph and Twitter card meta tags via the SSR shim for `/`, `/scan/{id}`, `/battle/{id}`, `/u/{username}`, and `/leaderboards`.
4. THE POWERLVL SHALL serve a `/sitemap.xml` listing all public Profiles and the most recent 10,000 Scans, regenerated nightly.
5. THE POWERLVL SHALL serve a `/robots.txt` allowing indexing of public surfaces and disallowing `/api/*`, `/me`, `/auth/*`, and `/admin/*`.

### Requirement 27: Profile Share Card

**User Story:** As a Member, I want to share my whole profile (not just one scan), so that I can flex my full collection of scores in one image.

#### Acceptance Criteria

1. WHEN any visitor opens a Member's public Profile at `/u/{username}`, THE POWERLVL SHALL display a "Share Profile" action that opens a share dialog containing a server-rendered Profile Share Card.
2. THE POWERLVL SHALL render the Profile Share Card as a 1080×1920 PNG containing: the Member's username, profile banner, initials avatar, POWERLVL wordmark, the Member's highest Score with its Tier badge, a 2×2 grid of the four highest-scoring Scans (thumbnail + Score + Tier), aggregate stats (total Scans, highest Tier, Challenge wins, Battle wins), and a Verification QR encoding `/u/{username}`.
3. THE POWERLVL SHALL serve the Profile Share Card via `GET /share-card/profile/{username}.png` with `Cache-Control: public, max-age=3600`.
4. THE POWERLVL SHALL NOT include on the Profile Share Card any field beyond the public Profile projection (no email, no account ID, no auth token).

### Requirement 28: Help and Support Surface

**User Story:** As a user, I want a help page with FAQ and a contact form, so that I can get answers and report issues without needing the operator's email; as the operator, I want this to satisfy Stripe's chargeback contact-surface requirement.

#### Acceptance Criteria

1. THE POWERLVL SHALL serve a public Help page at `/help` containing a static FAQ rendered from a Markdown source file in the repository.
2. THE POWERLVL SHALL include on the Help page a contact form with fields for name (optional), email (required), subject, and message.
3. WHEN the contact form is submitted, THE POWERLVL SHALL sanitize the message via the v1 description sanitizer, persist a `support_tickets` row, and rate-limit submissions to 3 per IP per hour and 10 per Member per hour.
4. THE POWERLVL SHALL include a clear link to account deletion (the `DELETE /api/me` confirmation flow) on the Help page.

### Requirement 29: Email Capture for Anonymous Non-Converters

**User Story:** As an anonymous user who has scanned and hit the daily limit, I want to leave my email so I get notified about new categories and challenges, so that I can engage later without committing to a full sign-up right now.

#### Acceptance Criteria

1. WHEN an Anonymous User attempts a second Scan within the same calendar day and is blocked by the daily limit, THE POWERLVL SHALL display an inline email capture form below the existing sign-in prompt offering to add the visitor to a notification list.
2. WHEN the visitor submits an email, THE POWERLVL SHALL persist an `email_list` row keyed on the email and the `anon_session_id`, send a double-opt-in confirmation email via the configured provider, and SHALL NOT mark the address as confirmed until the user clicks the confirmation link.
3. THE POWERLVL SHALL include an unsubscribe link in every email it sends, and SHALL respect unsubscribe clicks by setting `email_list.unsubscribed_at` and excluding the address from all future broadcasts.
4. THE POWERLVL SHALL NOT send unsolicited promotional emails to addresses that have not been confirmed.

### Requirement 30: Referral Attribution and Reward

**User Story:** As a Member who challenges a non-member to a Battle, I want credit when they sign up and engage, so that the viral loop rewards the people driving growth.

#### Acceptance Criteria

1. WHEN a Member creates a Battle, THE POWERLVL SHALL append `?ref={challenger_member_id}` to the Battle share link.
2. WHEN a non-member opens a Battle link with a `ref` query parameter, THE POWERLVL SHALL store the referrer's Member ID in a `plvl_referrer` cookie valid for 30 days.
3. WHEN a new Member completes signup with a `plvl_referrer` cookie present, THE POWERLVL SHALL set `members.referred_by` to the referrer's Member ID and SHALL NOT modify this column on subsequent sessions.
4. WHEN a referred new Member completes their third Scan, THE POWERLVL SHALL award one free Anomaly Boost credit to the referrer's `credit_balances`, capped at 5 referral rewards per referrer per calendar month.
5. THE POWERLVL SHALL emit a `referral.attributed` analytics event whenever a referral reward is awarded.

### Requirement 31: Public Status Page

**User Story:** As a user or operator, I want a public status page so I know whether outages are on POWERLVL's side or my own.

#### Acceptance Criteria

1. THE POWERLVL SHALL serve a public Status page at `/status` listing the operational state of: Bedrock Nova Lite, AWS Rekognition, Supabase Postgres, Supabase Storage, Stripe, and Web Push delivery.
2. THE POWERLVL SHALL run a health-check cron every 5 minutes that probes each service and updates a `service_health` Postgres table with `operational` / `degraded` / `down` plus a `last_change_at` timestamp.
3. THE POWERLVL SHALL render the Status page in the same matte-black design language as the rest of the product, with no animations beyond a subtle pulse on `degraded` and `down` states.
4. WHEN a service status transitions, THE POWERLVL SHALL emit a `service_health.changed` analytics event so the operator can review incident history.

### Requirement 32: Cinematic Direction (Anti-Plain Mandate)

**User Story:** As the owner, I want the v2 surfaces to feel cinematic and over-designed within the v1 design rails, so that the product reads as otherworldly across every screen — not as a competent-but-plain SaaS once payments are added.

#### Acceptance Criteria

1. THE POWERLVL SHALL treat the v1 design rules (one amber element per viewport, no glow on standard UI, no drop shadows, no full-page gradients, no emoji, single-hero-per-screen) as **anti-trope rails, not a creativity cap**, and SHALL deliver every v2 surface with the same level of cinematic ambition as the v1 reveal.
2. THE POWERLVL SHALL NOT ship any v2 surface that uses raw default chrome from a third-party SDK (Stripe Checkout, Supabase Auth, browser native permission prompts, browser native cookie banners) on a POWERLVL-owned canvas — third-party flows SHALL be wrapped in a custom POWERLVL-branded container before opening.
3. THE POWERLVL SHALL NOT ship any v2 surface whose primary metaphor is a form, a list, a settings page, or a dashboard; every revenue-relevant surface (Pro Upgrade, Anomaly Boost Purchase, Battle Result, Profile Card, Onboarding) SHALL be designed as a moment, not a screen.
4. THE POWERLVL SHALL pass a "screenshot test" for every v2 surface: a stranger viewing a screenshot SHALL be able to tell at a glance that it is POWERLVL and not a generic AI-generated SaaS. Surfaces that fail this test SHALL be redesigned before launch.
5. WHEN the cinematic direction in `design.md` (under "v2 Cinematic Direction" and "v2 Surface-Level Cinematic Briefs") conflicts with a literal reading of the technical sections, THE POWERLVL SHALL resolve the conflict in favor of the cinematic direction so long as the conflict does not violate a v1 anti-trope rule.
