// task 16.1 will invoke this
//
// CI guard for `lib/api-spec` codegen output.
//
// Regenerates `@workspace/api-client-react` and `@workspace/api-zod` from the
// current OpenAPI spec, then fails non-zero if the working tree (compared to
// the git index) shows any modifications or untracked files inside the
// generated directories. A clean diff means the committed generated files are
// in sync with `lib/api-spec/openapi.yaml`.
//
// Usage: invoked via the workspace `codegen:check` script.

import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";
import process from "node:process";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..", "..");

const GENERATED_PATHS = [
  "lib/api-client-react/src/generated",
  "lib/api-zod/src/generated",
] as const;

interface RunResult {
  status: number;
  stdout: string;
  stderr: string;
}

function run(
  cmd: string,
  args: readonly string[],
  opts: { inherit?: boolean } = {},
): RunResult {
  // On Windows, `pnpm` resolves to `pnpm.cmd`, which Node refuses to launch
  // without a shell. We only invoke trusted binaries with literal arguments
  // here, so enabling `shell: true` is safe; the args list is fully controlled
  // by this script and does not contain any user-provided strings.
  const result = spawnSync(cmd, args, {
    cwd: repoRoot,
    encoding: "utf8",
    shell: process.platform === "win32",
    stdio: opts.inherit ? "inherit" : "pipe",
  });
  return {
    status: typeof result.status === "number" ? result.status : 1,
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
  };
}

function fail(message: string): never {
  console.error(`\n[codegen-check] FAILED: ${message}`);
  console.error(
    "[codegen-check] Run `pnpm --filter @workspace/api-spec run codegen` locally and commit the result.",
  );
  process.exit(1);
}

console.log(
  "[codegen-check] Regenerating api-client-react and api-zod from openapi.yaml...",
);
const codegen = run(
  "pnpm",
  ["--filter", "@workspace/api-spec", "exec", "orval", "--config", "./orval.config.ts"],
  { inherit: true },
);
if (codegen.status !== 0) {
  fail(`orval exited with status ${codegen.status}.`);
}

console.log(
  "[codegen-check] Checking git diff against generated paths:",
  GENERATED_PATHS.join(", "),
);
const diff = run("git", [
  "diff",
  "--exit-code",
  "--",
  ...GENERATED_PATHS,
]);
if (diff.status !== 0) {
  if (diff.stdout) console.log(diff.stdout);
  if (diff.stderr) console.error(diff.stderr);
  fail("Generated client/zod files diverge from the OpenAPI spec.");
}

const untracked = run("git", [
  "ls-files",
  "--others",
  "--exclude-standard",
  "--",
  ...GENERATED_PATHS,
]);
if (untracked.status !== 0) {
  if (untracked.stderr) console.error(untracked.stderr);
  fail(`git ls-files exited with status ${untracked.status}.`);
}
const untrackedFiles = untracked.stdout.split("\n").filter((line) => line.trim().length > 0);
if (untrackedFiles.length > 0) {
  console.error("[codegen-check] Untracked generated files detected:");
  for (const file of untrackedFiles) console.error(`  ${file}`);
  fail("Untracked generated files are not committed.");
}

console.log(
  "[codegen-check] OK — generated files are in sync with lib/api-spec/openapi.yaml.",
);
