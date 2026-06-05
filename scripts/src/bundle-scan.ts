#!/usr/bin/env tsx
/**
 * Bundle Security Scanner — Task 16.2
 *
 * Scans the built web client bundle for forbidden patterns that must
 * never appear in client-side code:
 *   1. `SUPABASE_SERVICE_ROLE_KEY` — server-only service role key
 *   2. `AKIA` prefix — AWS access key ID prefix (IAM key exposure)
 *   3. `DATABASE_URL` — Postgres connection string (includes credentials)
 *   4. Emoji unicode ranges — forbidden in production UI per design system
 *
 * Usage:
 *   tsx scripts/src/bundle-scan.ts [--dir <path>]
 *
 * Default bundle directory: artifacts/web/dist
 *
 * Exit codes:
 *   0 — all checks passed
 *   1 — one or more violations found
 *
 * Requirements: 12.16, 14.3
 */

import { readdir, readFile } from "node:fs/promises";
import { join, extname } from "node:path";
import { fileURLToPath } from "node:url";

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const ROOT = join(__dirname, "..", "..");

/** Extensions to scan inside the bundle output. */
const SCAN_EXTENSIONS = new Set([".js", ".mjs", ".cjs", ".ts", ".jsx", ".tsx"]);

/**
 * Forbidden patterns that must never appear in client-side bundle code.
 *
 * Each entry has:
 *   - `name`: human-readable label for the violation report
 *   - `pattern`: regex or string to search for
 *   - `description`: why this is forbidden
 */
const FORBIDDEN_PATTERNS: Array<{
  name: string;
  pattern: RegExp;
  description: string;
}> = [
  {
    name: "SUPABASE_SERVICE_ROLE_KEY",
    pattern: /SUPABASE_SERVICE_ROLE_KEY/,
    description:
      "The Supabase service role key must never be embedded in client bundles — it bypasses Row-Level Security.",
  },
  {
    name: "AWS IAM Key Prefix (AKIA)",
    pattern: /AKIA[A-Z0-9]{16}/,
    description:
      "An AWS access key ID was detected in the bundle. Credentials must never be embedded in client code.",
  },
  {
    name: "DATABASE_URL",
    pattern: /DATABASE_URL/,
    description:
      "The Postgres connection string (which contains credentials) must never appear in client bundles.",
  },
  {
    name: "VAPID_PRIVATE_KEY",
    pattern: /VAPID_PRIVATE_KEY/,
    description:
      "The VAPID private key is server-only and must never appear in client bundles.",
  },
  {
    name: "STRIPE_SECRET_KEY",
    pattern: /STRIPE_SECRET_KEY/,
    description:
      "The Stripe secret key must never be embedded in client bundles.",
  },
  {
    name: "Third-party analytics SDK (PostHog)",
    pattern: /posthog(?:\.io|-js|\/posthog)/i,
    description:
      "PostHog is banned per design.md. Use the first-party analytics_events table only.",
  },
  {
    name: "Third-party analytics SDK (Mixpanel)",
    pattern: /mixpanel/i,
    description:
      "Mixpanel is banned per design.md. Use the first-party analytics_events table only.",
  },
  {
    name: "Third-party analytics SDK (Amplitude)",
    pattern: /amplitude/i,
    description:
      "Amplitude is banned per design.md. Use the first-party analytics_events table only.",
  },
  {
    name: "Third-party analytics SDK (Segment)",
    pattern: /segment\.com|@segment\//i,
    description:
      "Segment is banned per design.md. Use the first-party analytics_events table only.",
  },
  {
    name: "Third-party analytics SDK (Google Analytics)",
    pattern: /\bgtag\b|google-analytics|googletagmanager/i,
    description:
      "Google Analytics is banned per design.md. Use the first-party analytics_events table only.",
  },
  {
    name: "Emoji (production UI ban)",
    pattern:
      /[\u{1F300}-\u{1F9FF}\u{1FA00}-\u{1FAFF}\u{2600}-\u{269F}\u{26A1}-\u{26FF}\u{2700}-\u{2712}\u{2714}-\u{2716}\u{2719}-\u{27BF}\u{1F000}-\u{1FFFF}]/u,
    description:
      "Emoji are forbidden in the production UI per the design system. Use monoline SVG icons only.",
  },
];

// ---------------------------------------------------------------------------
// File traversal
// ---------------------------------------------------------------------------

async function* walkDir(dir: string): AsyncGenerator<string> {
  let entries: string[];
  try {
    entries = await readdir(dir);
  } catch {
    return;
  }
  for (const entry of entries) {
    const fullPath = join(dir, entry);
    // Simple heuristic: detect directories by trying to readdir them
    try {
      const subEntries = await readdir(fullPath);
      void subEntries; // it's a directory
      yield* walkDir(fullPath);
    } catch {
      // It's a file
      if (SCAN_EXTENSIONS.has(extname(entry))) {
        yield fullPath;
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Scanner
// ---------------------------------------------------------------------------

interface Violation {
  file: string;
  pattern: string;
  description: string;
  matchSnippet: string;
}

async function scanFile(
  filePath: string,
  patterns: typeof FORBIDDEN_PATTERNS
): Promise<Violation[]> {
  let content: string;
  try {
    const buf = await readFile(filePath);
    content = buf.toString("utf8");
  } catch (err) {
    console.error(`[bundle-scan] Could not read ${filePath}: ${err}`);
    return [];
  }

  const violations: Violation[] = [];
  for (const { name, pattern, description } of patterns) {
    const match = pattern.exec(content);
    if (match) {
      // Show a short snippet around the match for context
      const start = Math.max(0, match.index - 30);
      const end = Math.min(content.length, match.index + match[0].length + 30);
      const snippet = content.slice(start, end).replace(/\n/g, "↵");
      violations.push({
        file: filePath,
        pattern: name,
        description,
        matchSnippet: `...${snippet}...`,
      });
    }
  }
  return violations;
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  // Parse --dir argument or fall back to default
  const args = process.argv.slice(2);
  const dirArgIdx = args.indexOf("--dir");
  const bundleDir =
    dirArgIdx !== -1 && args[dirArgIdx + 1]
      ? args[dirArgIdx + 1]!
      : join(ROOT, "artifacts", "web", "dist");

  console.log(`[bundle-scan] Scanning bundle at: ${bundleDir}`);
  console.log(`[bundle-scan] Checking ${FORBIDDEN_PATTERNS.length} forbidden patterns\n`);

  const allViolations: Violation[] = [];
  let fileCount = 0;

  for await (const filePath of walkDir(bundleDir)) {
    fileCount++;
    const fileViolations = await scanFile(filePath, FORBIDDEN_PATTERNS);
    allViolations.push(...fileViolations);
  }

  if (fileCount === 0) {
    console.warn(
      `[bundle-scan] WARNING: No JS/TS files found in ${bundleDir}. ` +
        `Run the web build first: pnpm --filter @workspace/web run build`
    );
    process.exit(1);
  }

  console.log(`[bundle-scan] Scanned ${fileCount} file(s)\n`);

  if (allViolations.length === 0) {
    console.log("✓ [bundle-scan] All security checks passed — no forbidden patterns found.");
    process.exit(0);
  }

  console.error(`✗ [bundle-scan] FAILED — ${allViolations.length} violation(s) found:\n`);
  for (const v of allViolations) {
    console.error(`  Pattern : ${v.pattern}`);
    console.error(`  File    : ${v.file}`);
    console.error(`  Why     : ${v.description}`);
    console.error(`  Snippet : ${v.matchSnippet}`);
    console.error();
  }

  process.exit(1);
}

main().catch((err) => {
  console.error("[bundle-scan] Unexpected error:", err);
  process.exit(1);
});
