# POWERLVL — Complete Project Handoff

> **For:** Claude Opus (Claude Code session)
> **From:** Kiro planning session
> **Date:** May 2026
> **Status:** v1 spec complete, implementation in progress. v2 spec complete and merged into the same files (clearly delimited as "v2 — ..." sections).
> **Read order:** This file → `.kiro/specs/powerlvl-v1/design.md` (v1 sections in full, v2 sections for context) → `.kiro/specs/powerlvl-v1/requirements.md` → `.kiro/specs/powerlvl-v1/tasks.md`.

---

## What This Product Is

POWERLVL is a premium social AI-powered web app. Tagline: **"Everything has a power level. What's yours?"**

Users upload a photo, pick a category, and receive a cinematic 7–10 second "scouter-style" reveal with a fictional POWERLVL score (1,000–100,000), a tier badge (D through LIMITLESS), four core stats, five category stats, and one line of dramatic commentary. Results are deterministic per image+category, shareable as server-rendered PNG cards in three aspect ratios, and rankable on leaderboards.

**Product philosophy:** This is NOT an AI image analysis tool. It is a social power-fantasy system optimized for dopamine reveals, screenshot virality, and leaderboard competition. Everything is judged against: "Bro look at my score."

**Vibe target:** "Apple designed a Dragon Ball scouter." 70% minimal, 30% immersive. Otherworldly — should feel like an artifact from another product universe.

**Owner context:** Solo dev, hobby project, dead broke. Running on free tiers. $100 AWS credit is the AI budget. UI is the make-or-break factor — production-ready Apple-tier polish required from day one.

---

## Repository State (after cleanup)

```
powermy1234/
├── artifacts/
│   └── api-server/          # Express 5 skeleton (existing, extend this)
├── lib/
│   ├── api-spec/            # OpenAPI source + Orval codegen config
│   ├── api-client-react/    # Orval-generated React Query hooks
│   ├── api-zod/             # Orval-generated Zod schemas
│   ├── db/                  # Drizzle ORM (v1 schema in place; extend for v2)
│   └── (new libs created during v1 implementation)
├── scripts/
│   └── src/index.ts         # Placeholder
├── .kiro/specs/powerlvl-v1/ # Full spec (requirements + design + tasks; both v1 and v2)
├── HANDOFF.md               # This file
├── package.json             # pnpm workspace root
├── pnpm-workspace.yaml      # Catalog + workspace config
└── tsconfig.{json,base.json}
```

**What was deleted (intentionally):**
- `.migration-backup/` — Bolt prototype (reference only, now gone)
- `artifacts/powerlvl/` — prior AI's scaffolded frontend (slop, thrown out)
- `artifacts/mockup-sandbox/` — Replit canvas preview (unused)

**What needs to be created from scratch (v1):**
- `artifacts/web/` — React 19 + Vite frontend
- `artifacts/share-card/` — Vercel OG share card renderer
- New `lib/` packages already partially built per task list: scoring, vision, moderation, images, ratelimit, design-tokens, qr, reveal-controller, description-sanitizer

**v2 will additionally create:**
- `lib/stripe`, `lib/pro`, `lib/analytics`
- `artifacts/share-card/src/layouts/battle.tsx` and `profile.tsx`
- New web client routes for `/welcome`, `/help`, `/terms`, `/privacy`, `/cookies`, `/status`, `/battle/{id}`, `/battle/{id}/join`

---

## Tech Stack (Locked — Do Not Change)

| Layer | Technology |
|-------|-----------|
| Frontend | React 19, Vite, TailwindCSS 4, shadcn/ui, Framer Motion, Wouter |
| Backend | Express 5 on Vercel serverless |
| Database | Supabase Postgres via Drizzle ORM |
| Auth | Supabase Auth — Google OAuth only (NO magic link) |
| Storage | Supabase Storage (private bucket, signed URLs ≤24h) |
| AI Vision | Amazon Bedrock Nova Lite (temperature=0, top_p=0.1) |
| Moderation | AWS Rekognition Content Moderation |
| Share Cards | Vercel OG (satori + resvg-js) — server-side only, no html2canvas |
| Hosting | Vercel hobby tier (frontend + API + share card functions) |
| Package Manager | pnpm workspaces |
| API Contract | OpenAPI spec → Orval codegen → typed React Query hooks + Zod schemas |
| Payments (v2) | Stripe Checkout + Stripe Customer Portal (no custom payment UI) |
| Email (v2) | Resend free tier (3000 emails/month) for double-opt-in + unsubscribe |
| Push Notifications (v2) | Web Push API with VAPID keys + `web-push` npm; Realtime is fallback only |

---

## Design System (Non-Negotiable)

The UI is the make-or-break factor. The owner's #1 concern is avoiding "AI slop" UI.

### Cinematic Direction (READ THIS BEFORE THE RULES BELOW)

The rules below ban specific AI-generated visual tells. **They do NOT ban ambition, drama, or heavy design.** The product feel is Apple Fitness × Arc Browser × PS5 × F1 telemetry × Dragon Ball scouter — none of those references are plain. They are heavily designed and heavily *edited*.

When you read "restrained," "minimal," or "discipline" in this document or the spec, read it as **"editing, not absence."** One loud thing per screen, ten quiet things around it, all of them intentional. The score reveal is theatrical. The Battle Result should feel like a UFC walkout. The Pro upgrade should feel like activating something. The Profile share card should feel like a trading card someone saves to their phone.

If you ship a generic SaaS settings page, a form-style upload box, a dashboard-style status grid, or default Stripe chrome on a POWERLVL canvas, you have failed the cinematic direction even if you have followed every literal rule below. The rules are anti-tropes; the goal is *otherworldly*.

For v2 specifically, see the section "**v2 Cinematic Direction**" and "**v2 Surface-Level Cinematic Briefs**" in `design.md`. They contain creative briefs per surface (Pro Upgrade Flow, Anomaly Boost Purchase, Battle Result, Profile Card, Onboarding, Status Page, etc.). Implement those surfaces against the briefs, not against your default instinct.

### Color Tokens (exactly five, no others)
```
#0A0A0B  — matte black (backgrounds)
#1A1A1D  — graphite (surfaces)
#FAFAFA  — white (primary typography)
#F5A623  — amber (RESTRAINED accent — Score number, active CTA, amber-tier badges only)
#5EEAD4  — HUD cyan (scanner HUD during reveal ONLY)
```

### Rules
- Amber: max ONE amber element per viewport at any time (except during slam phase)
- HUD cyan: scanner HUD during reveal ONLY — nowhere else
- No glowing borders on standard UI elements
- No drop shadows on cards (use 1px border + inset border for depth)
- No full-page or animated background gradients
- No neon stroke effects
- No esports-style angle cuts on panels
- No emoji anywhere in production UI (custom monoline SVGs only)
- No generic spinners (skeleton placeholders only)
- Max 2 HUD chrome elements (corner brackets, scan-ID labels) per viewport
- Every screen has ONE dominant hero element

### Typography
- Display: Geist or Inter Tight (geometric sans)
- Numbers: Geist Mono or JetBrains Mono (tabular monospaced — ALL numeric values)
- Max 2 font families total

### Motion
- All animations via Framer Motion using a shared preset library
- Default easing: `cubic-bezier(0.16, 1, 0.3, 1)`
- Non-reveal transitions: ≤300ms
- 60fps target on 2022-class mid-tier Android
- Reduced-motion: cross-fade fallback for all transform/scale animations

### Per-Tier Accent Colors
```
D = zinc | C = sky | B = emerald | A = amber | S = orange | SS = rose | SSS = violet | LIMITLESS = animated white-gold
```

### Score Size
- Mobile (<1024px): minimum 80px
- Desktop (≥1024px): minimum 144px
- Score is always the largest element on the Result Screen

---

## Product Spec Location

Full spec lives at `.kiro/specs/powerlvl-v1/`:
- `requirements.md` — **32 requirements** with EARS-format acceptance criteria (14 v1 + 18 v2)
- `design.md` — full architecture, data models, API surface, scoring math, pipeline detail, plus v2 sections at the end (including **v2 Cinematic Direction** and per-surface creative briefs)
- `tasks.md` — 17 v1 task groups + 19 v2 task groups, with sub-tasks, property tests, and dependency graphs for both

**Read these files before writing any code.** They are the source of truth.

---

## v1 Implementation Status

### Completed (marked `[x]` in tasks.md)
- Task 1.1 — `@workspace/design-tokens` package
- Task 1.2 — Drizzle schema (all v1 tables)
- Task 1.3 — SQL migrations (derive_tier function, scans_public_v view, RLS policies)
- Task 1.4 — OpenAPI spec extended with v1 endpoint catalog
- Task 1.5 — API client + Zod schemas regenerated
- Task 2.1 — `@workspace/scoring` core (score, tier, stats, PRNG)
- Task 2.2 — Anomaly engine
- Task 3.1 — `@workspace/description-sanitizer`
- Task 3.2 — Sanitizer property tests
- Task 4.1 — `@workspace/qr` package
- Task 4.2 — QR round-trip tests
- Task 5.1 — `@workspace/images` (sharp pipeline)
- Task 5.2 — Image processor unit tests
- Task 6.1 — `@workspace/moderation` (Rekognition adapter)
- Task 6.2 — Moderation unit tests
- Task 7.1 — `@workspace/ratelimit` (Postgres token bucket)
- Task 7.2 — Rate limiter integration tests
- Task 8.1 — `@workspace/vision` skeleton + banned-words list
- Task 8.2 — Slop detector
- Task 8.4 — Fallback commentary library
- Task 8.6 — Bedrock Nova Lite adapter
- Task 9.1 — `@workspace/reveal-controller`
- Task 12.1 — `artifacts/share-card` bootstrap

### v1 — Not Started
- Task 2.3–2.7 — Scoring property tests
- Task 8.3 — Slop detector property tests
- Task 8.5 — Fallback library property tests
- Task 8.7 — `analyzeImage` orchestration (retry → fallback → slop → commentary)
- Task 8.8 — Vision orchestration unit tests
- Task 9.2 — Reveal controller property tests
- Task 10 — Checkpoint (all shared library tests passing)
- Task 11 (all sub-tasks) — API server pipeline and routes
- Task 12.2–12.6 — Share card components, layouts, render endpoints, tests
- Task 13 — Checkpoint (server + rendering tests passing)
- Task 14 (all sub-tasks) — Web client (landing, scan setup, reveal, result, feed, leaderboards, profile, auth)
- Task 15 — Background jobs (anonymous scan purge, pending cleanup reconciler)
- Task 16 — CI gates (typecheck, tests, bundle scan, ESLint rules)
- Task 17 — v1 Final checkpoint

### v2 — Not Started
All v2 tasks (V2-1 through V2-18) are pending. Do not begin v2 until v1 ships and is live.

### Recommended Starting Point for Opus
Start at **Task 8.7** (`analyzeImage` orchestration) — it's the last unfinished piece of the shared library layer. Then proceed through the v1 task dependency graph in order: 8.8 → 9.2 → Checkpoint 10 → Task 11 → Task 12 → Checkpoint 13 → Task 14 → Task 15 → Task 16 → Checkpoint 17.

Do NOT skip checkpoints. They exist to catch integration failures before they compound.

---

## Key Architectural Decisions (Read Before Coding)

### Scoring is deterministic and server-side
The Vision Model returns ONLY trait confidences (1–10 per stat), commentary, and an advisory anomaly suggestion. The server computes Score, Tier, stats, and anomaly trigger independently. The model never emits a final score. This is non-negotiable.

### Same image + same category = same score
Scoring is fully deterministic. Pass 1 (Nova Lite "Read") emits a structured `CulturalReading` at `temperature=0`, `top_p=0.1`. Pass 2 (`renderScore`) is pure TypeScript — same `CulturalReading` always produces the same score, tier, verdict noun, and stats. No image-hash caching in v1.

### Dual-Pass Cultural Scoring Engine (the architectural commitment)
POWERLVL does NOT use a single "ask the model for a score" call. The architecture is:

1. **Pass 1 — READ**: Nova Lite reads the image, emits a `CulturalReading` (image_subjects, archetype, taste_demonstrated, cultural_recognition, joke_target, memetic_status, subject_class, etc.) — **NO numbers, NO score, NO tier**.
2. **Pass 2 — RENDER**: pure TypeScript function `renderScore(reading) → { score, tier, verdictNoun, stats }`. Applies cultural-fairness modifiers in fixed order (anti-iconic ceiling, satirical-inversion floor, reverence floor, iconic floor, brand bonuses, pretension penalty). Fully deterministic.
3. **Pass 3 — VOICE**: Nova Lite is called again with the cultural reading + the rendered score + tier + verdict noun, and writes ONE line of commentary tuned to the moment.

The full prompts, schema, modifier rules, verdict-noun pool, and few-shot examples for both passes live in `.kiro/specs/powerlvl-v1/nova-lite-system-prompt.md`. **READ THAT FILE BEFORE TOUCHING ANY VISION OR SCORING CODE.**

### Cultural fairness invariants (the floors and ceilings — protected by property tests)
- `anti_iconic` subjects (terrorist glorification, hate movements) → score capped at D-tier (≤4,999). The Kim Jong Un test: a plain photo lands here. A Kim-Jong-Un-in-a-frock satirical inversion gets a different class (see below).
- `satirical_inversion` + `joke_target=the_powerful` → score floored at S-tier (≥55,000). The people are winning; the score reflects it.
- `reverence_protected` (kids, elderly, religious imagery, memorials, first-attempt earnest uploads) → score floored at B-tier (≥15,000). Beloved scorers respect first attempts.
- `iconic` → S-tier floor; `iconic_meme` → SS-tier floor.
- `powerlvl_brand_visible` (POWERLVL sticker / shirt / mug in frame) → score pulled toward S-tier, capped at S-ceiling (74,999). **NEVER unlocks LIMITLESS via brand alone.** The flywheel rewards seeing POWERLVL but doesn't betray LIMITLESS's protection.
- `taste_brands_visible` (Margiela, Carhartt, HHKB, Aesop, etc. — small curated allowlist) → bonus capped at A-ceiling (54,999). The product feels culturally fluent; brands don't unlock high tiers on their own.
- `pretension >= 70` + mid/trying-too-hard → cap at C-ceiling+5,000. Mall fashion stays mall fashion.
- LIMITLESS gate: score ≥99,000 requires `subjectClass ∈ {iconic, iconic_meme}` AND `culturalRecognition ≥ 95`. There is no shortcut.

### LIMITLESS is mythical
Target frequency: 1 in 25,000 scans. The Dual-Pass renderer's modifier engine + the `1.45` ease-in curve are calibrated for this. **Do NOT make LIMITLESS purchasable, brandable, or referrable. It must be earned through total cultural energy.**

### Anomaly rate: 6–8% combined
Visual-only anomalies (SCOUTER_FAILURE, UNREGISTERED_ENERGY) are more common than score-modifier anomalies. Anomalies run AFTER the cultural-fairness modifier engine but before the final clamp. See `ANOMALY_WEIGHTS` in design.md and the prompt file.

### v2 Anomaly Boost preserves determinism
Anomaly Boost does NOT re-roll until non-null. It uses a separate deterministic seed (`sha256(...|"boost")`) and a normalized boosted distribution that excludes the null branch. Same image + same category + boost → same forced anomaly type.

### Share cards are server-rendered only
No html2canvas, no client-side canvas. Vercel OG (satori + resvg-js) only. This is non-negotiable for IG/TikTok quality.

### Pro shimmer has two implementations
Web client = animated CSS sweep on the Tier badge. Share card (PNG, satori) = static 2 px amber border on the Tier badge plus a small "PRO" mark in the meta footer. **Do not use SVG `<animate>` on the share card** — satori produces static PNGs, the animation is silently dropped.

### Push notifications use Web Push direct (NOT Realtime as the trigger)
v2 architecture: API server uses `web-push` library with VAPID keys → POSTs to the browser's push endpoint URL → push service (FCM/Mozilla autopush) wakes the Service Worker → `self.registration.showNotification`. Supabase Realtime is the in-app fallback only (open-tab toast). Do not route push through Realtime — it cannot wake a closed tab.

### Battle accept is TOCTOU-safe
The accept endpoint runs a single conditional `UPDATE ... WHERE status='pending' AND expires_at > now() AND challenger_id != caller` and acts on `RETURNING`. If zero rows are returned, the battle is unavailable. Do not check then update — that races with the cron expiry job.

### Every share card has a verification QR
The QR encodes the absolute permalink URL. The permalink page shows a "VERIFIED SCAN" badge. Fake screenshots → QR resolves to "SCAN NOT FOUND / UNVERIFIED". This is the anti-faking system.

### Auth is Google OAuth only
No magic link. Supabase Auth with Google as the required provider. Anonymous-first: first scan requires no auth. Soft-auth prompt appears after the reveal animation completes.

### Image minimization
- Max upload: 8 MB
- Min dimensions: 256px shorter edge
- Server-side processing: strip EXIF, downscale to ≤1600px long edge, encode AVIF/WebP at ≤300KB
- Thumbnail: 480px long edge WebP for feed/leaderboard
- Anonymous scan images purged after 30 days (atomic: image first, then mark expired)

### Analytics is first-party only
v2 emits structured events to `analytics_events` Postgres table. No PostHog, no Mixpanel, no Amplitude, no Segment, no GA. CI lints for these imports. Event properties never include image bytes, descriptions, commentary, raw email, or IP addresses.

---

## v2 Product Vision (Locked, Spec'd)

> Implementation forbidden until v1 ships and is live.

### Revenue Model

**POWERLVL PRO — $4.99/month**

Pro is identity-and-status, not features. People pay for the social signal.

What Pro includes:
- Unlimited scans per day (free tier: 25/day)
- Exclusive Pro tier badge — animated shimmer on web client, static amber border on share cards
- Custom profile banner (upload at 1500×500, 4 MB max, OR choose from 12 curated dark-themed options)
- Priority feed placement (Pro scans surface higher)
- Early access to new categories before public launch
- Visible PRO mark on profile page and leaderboard entries
- Challenge Streak counter on profile (consecutive weeks with a qualifying scan)

What Pro does NOT include:
- Purchasable LIMITLESS — never, ever, no exceptions
- Rescan tokens — owner explicitly removed this
- Scan history advantage — everyone gets the same retention
- Any scoring advantage — scores, tiers, anomaly rates identical to free

**POWERLVL CREDITS — One-time only**

- **Anomaly Boost** ($1.49) — guarantees your next scan triggers an anomaly. Type still random (weighted draw). Cannot be stacked. Cannot be gifted. Expires 7 days after purchase. Determinism preserved via seeded boosted draw.

### Scan Battles
Head-to-head challenges. Score decides the winner. 48-hour expiry. Battle Card is 1080×1080 two-up. Same Category required for both participants. Re-scanning to game results is disallowed (each Member scans exactly once per Battle).

### Weekly Challenges
Monday 00:00 UTC reset. Category-specific. Top-3 finishers earn a permanent Challenge Winner Badge. Pro members get a Challenge Streak counter. Schedule maintained as a config file, not a database-driven admin UI.

### New Categories (v2)
- **FOOD** — Presentation Score, Flavor Aura, Rarity Index, Threat to Diet, Aesthetic Output
- **WORKSPACE** — Focus Energy, Ergonomic Power, Aesthetic Level, Productivity Aura, Threat Output
- **FITS** — Drip Level, Fit Score, Aura Output, Trend Sync, Flex Value

Each requires 12+ few-shot examples and 24+ fallback templates spanning all 8 tiers.

### Onboarding
3-screen sequence on first visit. Hook (single hero = looping slam animation), Tier Ladder (D through LIMITLESS), Categories (the 6 v1 categories + the 3 new v2 categories). Skippable on every screen. `plvl_onboarded` cookie prevents repeat shows.

### Push Notifications
Web Push API with VAPID. Trigger events: battle complete (both participants), battle expired (challenger), challenge winner (top 3), challenge result (non-winner). Two-step permission request reduces denial rates: custom in-app value-prop prompt → browser native permission dialog only on Allow. Fallback to in-app banner via `pending_notifications` table.

### Permalink Acquisition CTA
Every `/scan/{id}` page has a prominent "Scan Your Own" amber CTA below the verified result. Tracked via `?ref=permalink&src={scanId}` for funnel measurement.

### Account Suspension
Internal admin endpoint sets `banned_at`. Suspension cancels active Stripe subscription. Generic message to user; reason internal-only. All actions audited.

### Legal & Compliance
Terms / Privacy / Cookies / Help / Status pages. EU/UK/EEA cookie consent banner. Age gate (13+ globally, 16+ in EEA) via OAuth birthdate or self-attestation. Data export (`GET /api/me/data-export`). Account deletion purges every v1 + v2 row in a single transaction.

### Analytics
First-party `analytics_events` Postgres table. 24+ event types covering scan funnel, auth, payments, battles, challenges, referrals, notifications. Daily rollup cron. CI lint bans third-party SDK imports.

### PWA + SEO
Web app manifest, Service Worker (push + notificationclick + minimal install caching). Per-route OG meta tags. `/sitemap.xml` and `/robots.txt`.

### Profile Share Card
1080×1920. Hero highest-Score, 2×2 top-scans grid, aggregate stats, Verification QR encoding `/u/{username}`. Cached 1 hour.

### Help / Support
`/help` page with FAQ + contact form. Stripe-required chargeback contact surface. Sanitized via v1 description sanitizer. Rate-limited.

### Email Capture
After anonymous user hits the daily limit, inline form below the sign-in prompt. Resend double-opt-in. Unsubscribe link in every email.

### Referral Attribution
Battle share links carry `?ref={member_id}`. `plvl_referrer` cookie persists 30 days. After referred new member's 3rd scan, referrer earns 1 free Anomaly Boost (capped at 5/month per referrer).

### Status Page
Public `/status` page reading `service_health` Postgres table. 5-minute cron probes Bedrock, Rekognition, Supabase DB+Storage, Stripe, Web Push. Self-hosted, same matte-black design.

---

## What Opus Should NOT Do

**Visual / cinematic anti-patterns** (these are the AI-slop tells the owner is afraid of — they are NOT the same as "be creative within rails"):

- Do not change the design system color tokens
- Do not add emoji to the production UI
- Do not use html2canvas or client-side canvas for share cards
- Do not add magic link auth
- Do not make LIMITLESS purchasable
- Do not add comments, follows, or DMs (v1 or v2)
- Do not use generic spinners — skeleton placeholders only
- Do not add drop shadows to cards
- Do not add glowing borders to standard UI elements
- Do not add full-page gradients
- Do not ship a "Drag image here" grey rectangle uploader
- Do not embed raw default Stripe Checkout chrome on a POWERLVL surface — wrap it in a custom POWERLVL-branded interstitial
- Do not use the browser native `window.confirm` / `window.alert` / `window.prompt` for ANY user-facing flow
- Do not call `Notification.requestPermission()` directly — always show the custom value-prop prompt first
- Do not design any v2 revenue-relevant surface as a form, list, settings page, or dashboard — design it as a *moment*

**Implementation anti-patterns:**

- Do not skip the property-based tests — they encode correctness invariants
- Do not skip the checkpoints (tasks 10, 13, 17, V2-19)
- Do not write the API server to trust client-supplied scores or tiers
- Do not expose service-role keys or AWS credentials in client-side code
- Do not log raw image bytes or full descriptions in structured logs
- Do not implement Anomaly Boost as "re-roll until non-null" — it must use the seeded boosted distribution to preserve determinism
- Do not put SVG `<animate>` in share-card components — satori does not animate
- Do not route push notifications through Supabase Realtime — Realtime cannot wake a closed tab; use `web-push` direct
- Do not check-then-update on Battle accept — use a single conditional UPDATE with RETURNING to avoid the TOCTOU race against the expiry cron
- Do not import third-party analytics SDKs (PostHog, Mixpanel, Amplitude, Segment, GA) — first-party only
- **Do not collapse the Dual-Pass into a single Nova Lite call** — Pass 1 reads culture, Pass 2 is pure code, Pass 3 writes voice. Never ask the model for a final score, tier, or verdict noun directly.
- **Do not let Pass 1 emit numeric scores** — if it tries to emit `score`/`tier`/`verdict_noun` fields, server discards them silently. The contract is enforced by Zod at parse time.
- **Do not let brand bonuses unlock LIMITLESS** — the `powerlvl_brand_visible` cap (74,999) and `taste_brands_visible` cap (54,999) are non-negotiable. The Iconic floor + cultural recognition gate are the only paths to LIMITLESS.
- **Do not skip the canonical anchor tests** — anchors A-1 through A-17 in `nova-lite-system-prompt.md` Block N are the cultural reputation of the product. CI MUST FAIL if any anchor regresses.

**What "restrained" does NOT mean:**

- It does not mean plain
- It does not mean dashboard-style
- It does not mean form-style
- It does not mean stripping animation away
- It does not mean using default browser/SDK chrome

It means *editing*. One loud thing per screen, ten quiet things around it. The score reveal is theatrical. Surfaces should feel like an artifact from another product universe, not a competent SaaS settings panel.

---

## Environment Variables Required

```bash
# --- v1 ---

# Supabase
SUPABASE_URL=
SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
DATABASE_URL=                    # Postgres connection string (Supabase pooler)

# AWS
AWS_ACCESS_KEY_ID=
AWS_SECRET_ACCESS_KEY=
AWS_REGION=us-east-1             # or wherever Bedrock Nova Lite is available

# App
PLVL_ANON_COOKIE_SECRET=         # HMAC secret for signed plvl_anon cookie (32+ random bytes)
INTERNAL_JOB_SECRET=             # Shared secret for internal cron job endpoints
APP_BASE_URL=                    # Absolute base URL for permalinks, e.g. https://powerlvl.app

# --- v2 ---

# Stripe
STRIPE_SECRET_KEY=
STRIPE_PUBLISHABLE_KEY=
STRIPE_WEBHOOK_SECRET=
STRIPE_PRO_PRICE_ID=
STRIPE_ANOMALY_BOOST_PRICE_ID=

# Push (Web Push / VAPID)
VAPID_PUBLIC_KEY=                # also exposed to the web client at build time
VAPID_PRIVATE_KEY=               # server-only
VAPID_SUBJECT=mailto:owner@powerlvl.app

# Email (Resend)
RESEND_API_KEY=
EMAIL_FROM_ADDRESS=POWERLVL <hello@powerlvl.app>
EMAIL_UNSUBSCRIBE_SECRET=        # HMAC secret for unsubscribe tokens

# Admin
ADMIN_JWT_SECRET=                # separate from Member JWTs; for /api/admin/* routes
ADMIN_ALLOWLIST_EMAILS=          # comma-separated list of operator emails
```

---

## Open Questions / Unconfirmed Defaults

These are spec'd with reasonable defaults but the owner did not explicitly confirm. Validate before launching the relevant feature, do not silently change them.

| Item | Current default in spec | Why it's a default, not a hard rule |
|------|-------------------------|-------------------------------------|
| Referral reward cap | 5 free Anomaly Boosts per referrer per calendar month | Owner moved on without confirming the exact cap. Calculated as: 5 × $1.49 = $7.45 of reward per referrer. If a referrer brings 5 paying members at $4.99/month, payback is positive within month 1. If the cap proves too generous (farming, fake accounts), tighten to 3/month or to "1 reward per referred member who reaches 10 scans" instead. |
| Referral trigger threshold | Referred member's 3rd Scan | Picked to balance "real engagement" vs "fast feedback to referrer." Validate against actual signup-to-3rd-scan rate after launch. |
| Anomaly Boost expiry | 7 days from purchase | Picked to create urgency. If users complain about wasted credits, extend to 30 days. |
| Daily anonymous scan limit | 1 / browser / local-day | Locked in v1 as "instant gratification but enough friction to drive sign-up." Anything higher dilutes the sign-up nudge. |
| Pro early-access window for new categories | "before public launch" — duration unspecified | Recommend 7 days exclusive Pro access, then public. Validates whether early-access actually drives Pro conversion. |
| Battle expiry window | 48 hours | Picked because most opponents respond same-day; 48h handles weekend latency. Could shrink to 24h if engagement data shows opponents almost always respond within a day. |

If Opus is unsure about any of these at implementation time, ship the default and add it to a `/admin` settings UI (out of scope for v2 but flagged for v3) so the owner can tune without a deploy.

## Spec Reading Order

When you open this project in a fresh Claude Code session, read in this order:

1. **`HANDOFF.md`** (this file) — vision, status, what NOT to do, open questions
2. **`.kiro/specs/powerlvl-v1/nova-lite-system-prompt.md`** — **READ THIS BEFORE ANY VISION/SCORING WORK**. Full Pass 1 + Pass 3 prompts, the renderer specification (Pass 2), the cultural fairness modifier engine, the verdict-noun pool, the taste-brand allowlist, and the canonical anchor tests.
3. **`.kiro/specs/powerlvl-v1/design.md`**
   - Read all v1 sections in full (lines 1–1900 approximately)
   - Pay specific attention to **"Dual-Pass Cultural Scoring Engine"** (it supersedes the older "Deterministic Scoring" / "Anomaly Engine input" / "Vision Model Integration" sections, which are marked SUPERSEDED inline)
   - For v2 work, read the "v2 Cinematic Direction" section and the "v2 Surface-Level Cinematic Briefs" section BEFORE any v2 technical section
4. **`.kiro/specs/powerlvl-v1/requirements.md`** — pull the requirement clauses referenced by your current task. Requirements 5 and 6 are now the dual-pass requirements; Requirement 7 (anomalies) is unchanged.
5. **`.kiro/specs/powerlvl-v1/tasks.md`**
   - Use the **canonical v2 task dependency graph** at the bottom of the file
   - **Ignore the earlier two dependency graphs** (marked stale)
   - For v1 dual-pass work, look at the new `2-DP`, `8-DP`, and `1-DP` task groups
   - Tasks reference requirement clauses for traceability — follow the references back to validate scope

---

## Useful Commands

```bash
# Install dependencies
pnpm install

# Full typecheck
pnpm run typecheck

# Run all tests
pnpm -r run test

# Regenerate API client from OpenAPI spec
pnpm --filter @workspace/api-spec run codegen

# Push DB schema changes (dev only)
pnpm --filter @workspace/db run push

# Run API server in dev
pnpm --filter @workspace/api-server run dev

# Run web client in dev
pnpm --filter @workspace/web run dev
```

---

## Summary for Opus

You are implementing POWERLVL — a premium social AI-powered web app where users upload photos and receive cinematic fictional power level reveals. The v1 spec is complete and detailed. The shared libraries are mostly built. v2 spec is also complete and merged into the same files (clearly delimited as "v2 — ..." sections). You should NOT touch v2 implementation until v1 ships and is live.

**Phase 1 — Finish v1:**

1. Finish the remaining shared library tasks (8.7, 8.8, 9.2)
2. Pass Checkpoint 10 (all shared library tests green)
3. Build the API server pipeline (Task 11, all sub-tasks)
4. Build the share card renderer (Task 12, all sub-tasks)
5. Pass Checkpoint 13 (server + rendering tests green)
6. Build the web client (Task 14, all sub-tasks) — **this is the most important phase, UI quality is the make-or-break factor**
7. Add background jobs (Task 15)
8. Add CI gates (Task 16)
9. Pass final Checkpoint 17 (v1)

**Phase 2 — v2 (only after v1 is live):**

Follow the v2 task dependency graph at the bottom of `tasks.md`. Start with foundational table additions (V2-1.1, V2-2.1, V2-3.1, V2-7.1, V2-7.2, V2-10.1, V2-12.1, V2-12.2, V2-15.2, V2-16.1, V2-17.1, V2-18.1) all in parallel.

**Implementation discipline:**

- Read `.kiro/specs/powerlvl-v1/design.md` in full before writing any v1 code. Re-read the relevant v2 section before writing any v2 code.
- The design doc is the implementation blueprint, not a suggestion.
- The UI must be otherworldly. Not a typical web app. Not AI slop. References: Apple Fitness, Arc Browser, PS5 system UI, Formula 1 telemetry, Dragon Ball scouter. Every screen has one dominant hero element. The score is always the hero.
- When in doubt about the visual language, the answer is restraint.
- When the spec and your instinct disagree, follow the spec — both have been pressure-tested with the owner across many planning sessions.
