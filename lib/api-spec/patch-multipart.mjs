// Post-codegen patch for orval's react-query client.
//
// Orval emits a defensive runtime check for every multipart form field:
//
//   X instanceof Blob ? X : new Blob([X], { type: "text/plain" })
//
// For string-typed fields (enums, plain `string`s, etc.) TypeScript rejects
// the `X instanceof Blob` left-hand side with TS2358 because the field
// type is not assignable to a value that could be a Blob. The runtime
// guard is also unnecessary for those fields — `FormData.append` accepts
// strings directly.
//
// This script rewrites only that exact orval-generated tri-line pattern,
// substituting the field reference (or its string-coerced form when the
// runtime type is unknown) so the generated client typechecks cleanly.
//
// Binary-typed fields (e.g. `image: Blob`) are not matched because orval
// does not wrap them in this guard — they are passed through directly.

import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

/**
 * @param {string} source
 * @returns {{ next: string; replacements: number }}
 */
function rewriteSource(source) {
  // Match orval's exact pattern, keeping the `<expr>` in capture group 1 so we
  // can validate that all three references are identical before substituting.
  // Whitespace between tokens uses `\s+`/`\s*` so the patch is robust to
  // prettier's line wrapping, which can split the ternary across multiple
  // lines after orval's internal `prettier: true` formatting pass.
  const pattern =
    /([A-Za-z_$][A-Za-z0-9_$.[\]]*)\s+instanceof\s+Blob\s*\?\s*\1\s*:\s*new\s+Blob\(\s*\[\s*\1\s*\]\s*,\s*\{\s*type:\s*"text\/plain"\s*\}\s*\)/g;

  let replacements = 0;
  const next = source.replace(pattern, (_match, expr) => {
    replacements += 1;
    // FormData.append accepts string | Blob; for our string-typed multipart
    // fields, passing the value directly is correct and avoids the Blob wrap.
    // We coerce with String(...) so the call is valid even if the upstream
    // type is later widened (e.g. number | string), which keeps the patch
    // safe under spec drift.
    return `String(${expr})`;
  });

  return { next, replacements };
}

async function patchFile(path) {
  const source = await readFile(path, "utf8");
  const { next, replacements } = rewriteSource(source);
  if (replacements === 0) return 0;
  if (next !== source) await writeFile(path, next, "utf8");
  return replacements;
}

const args = process.argv.slice(2);
const tsArgs = args.filter((arg) => arg.endsWith(".ts"));
// Always include the known generated client file. orval's `afterAllFilesWrite`
// hook may inject additional file paths (zod target files, etc.) when wired
// at a single project level it injects only that project's outputs, but to be
// robust against config drift we always patch the api-client-react entry.
const fallback = fileURLToPath(
  new URL("../api-client-react/src/generated/api.ts", import.meta.url),
);
const targets = Array.from(new Set([fallback, ...tsArgs]));

let total = 0;
for (const target of targets) {
  try {
    total += await patchFile(target);
  } catch (err) {
    if (err && err.code === "ENOENT") continue;
    throw err;
  }
}

if (total > 0) {
  console.log(
    `[patch-multipart] Rewrote ${total} \`instanceof Blob\` guard${total === 1 ? "" : "s"} in generated client.`,
  );
} else {
  console.log(
    `[patch-multipart] No \`instanceof Blob\` guards found to rewrite (targets: ${targets.length}).`,
  );
}
