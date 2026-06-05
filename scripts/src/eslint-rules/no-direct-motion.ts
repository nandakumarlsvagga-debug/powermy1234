/**
 * ESLint rule: no-direct-motion — Task 16.3
 *
 * Enforces that Framer Motion's `motion.*` components are only used through
 * the allow-listed wrapper components defined in `@workspace/design-tokens`
 * (or the web client's own design-system wrappers). This prevents ad-hoc
 * animation usage that bypasses the shared motion preset library and the
 * `withReducedMotion` helper.
 *
 * Banned usage:
 *   import { motion } from "framer-motion"            // direct import
 *   motion.div, motion.span, motion.section, etc.     // direct usage
 *
 * Allowed:
 *   All animation that goes through the design-system wrappers (RevealOverlay,
 *   HudOverlay, TierBadge, AnomalyBadge, etc.) which internally use motion.*
 *   via the `SPRINGS`/`EASINGS`/`DURATIONS` token system.
 *
 * To use this rule in a project's ESLint config:
 *   {
 *     "plugins": { "powerlvl": require("./scripts/src/eslint-rules/no-direct-motion") },
 *     "rules": { "powerlvl/no-direct-motion": "error" }
 *   }
 *
 * Requirements: 12.11
 */

import type { Rule } from "eslint";

/**
 * Allow-listed source paths where `motion.*` usage is permitted.
 * These are the wrapper components in the design system that consciously
 * compose motion with the shared preset library.
 */
const ALLOWLISTED_PATHS = [
  // Design tokens package — defines motion primitives
  "@workspace/design-tokens",
  // Web client design-system wrappers — the only allowed consumers
  "src/components/design-system",
  "components/design-system",
  // Share-card layouts can use motion (static satori, no runtime animation)
  "src/layouts",
  "artifacts/share-card/src",
];

/**
 * Check whether the given file path is in the allow-list for direct motion usage.
 */
function isAllowlisted(filename: string): boolean {
  // Normalize path separators
  const normalized = filename.replace(/\\/g, "/");
  return ALLOWLISTED_PATHS.some((allowed) => normalized.includes(allowed));
}

const noDirectMotionRule: Rule.RuleModule = {
  meta: {
    type: "problem",
    docs: {
      description:
        "Disallow direct usage of framer-motion `motion.*` components outside " +
        "the allow-listed design-system wrappers. Use the shared wrapper components " +
        "from `@workspace/design-tokens` or `src/components/design-system/` instead.",
      recommended: true,
      url: "https://github.com/powerlvl/powerlvl#design-system-motion-discipline",
    },
    schema: [
      {
        type: "object",
        properties: {
          allowedPaths: {
            type: "array",
            items: { type: "string" },
            description: "Additional path substrings to allow-list for direct motion usage",
          },
        },
        additionalProperties: false,
      },
    ],
    messages: {
      noDirectImport:
        "Direct import of `motion` from 'framer-motion' is not allowed outside " +
        "the design-system wrappers. Import and use the wrapper components from " +
        "`src/components/design-system/` instead, which apply the shared " +
        "`SPRINGS`/`EASINGS`/`DURATIONS` token presets and `withReducedMotion`.",
      noDirectUsage:
        "Direct usage of `motion.{{ element }}` is not allowed outside the design-system " +
        "wrappers. Use the design-system wrapper components instead.",
    },
  },

  create(context) {
    const filename = context.filename;

    // Collect extra allow-listed paths from rule options
    const options = context.options[0] as { allowedPaths?: string[] } | undefined;
    const extraPaths = options?.allowedPaths ?? [];
    const allAllowedPaths = [...ALLOWLISTED_PATHS, ...extraPaths];

    const normalizedFilename = filename.replace(/\\/g, "/");
    const fileIsAllowlisted = allAllowedPaths.some((p) =>
      normalizedFilename.includes(p)
    );

    if (fileIsAllowlisted) {
      // No restrictions in allow-listed files
      return {};
    }

    // Track whether `motion` was imported from 'framer-motion' in this file
    let motionLocalName: string | null = null;

    return {
      // Detect: import { motion } from 'framer-motion'
      ImportDeclaration(node) {
        if (node.source.value !== "framer-motion") return;

        for (const specifier of node.specifiers) {
          if (
            specifier.type === "ImportSpecifier" &&
            specifier.imported.type === "Identifier" &&
            specifier.imported.name === "motion"
          ) {
            motionLocalName = specifier.local.name;
            context.report({
              node,
              messageId: "noDirectImport",
            });
          }
          // Also catch: import * as m from 'framer-motion' then m.motion.div
          // and: import { motion as m } from 'framer-motion'
          if (
            specifier.type === "ImportNamespaceSpecifier"
          ) {
            // Namespace imports of framer-motion are also banned
            motionLocalName = specifier.local.name;
            context.report({
              node,
              messageId: "noDirectImport",
            });
          }
        }
      },

      // Detect: motion.div, motion.span, etc. (even without re-checking import)
      MemberExpression(node) {
        if (
          motionLocalName !== null &&
          node.object.type === "Identifier" &&
          node.object.name === motionLocalName &&
          node.property.type === "Identifier"
        ) {
          context.report({
            node,
            messageId: "noDirectUsage",
            data: { element: node.property.name },
          });
        }
      },
    };
  },
};

export default noDirectMotionRule;

// CommonJS export for ESLint plugin compatibility
// eslint-disable-next-line @typescript-eslint/no-explicit-any
(noDirectMotionRule as any).default = noDirectMotionRule;

/**
 * Export as an ESLint plugin so it can be used with:
 *
 *   import powerlvlPlugin from './scripts/src/eslint-rules/no-direct-motion'
 *   // or
 *   const powerlvlPlugin = require('./scripts/src/eslint-rules/no-direct-motion')
 *
 *   export default [
 *     {
 *       plugins: { powerlvl: powerlvlPlugin.plugin },
 *       rules: { 'powerlvl/no-direct-motion': 'error' },
 *     }
 *   ]
 */
export const plugin = {
  rules: {
    "no-direct-motion": noDirectMotionRule,
  },
};
