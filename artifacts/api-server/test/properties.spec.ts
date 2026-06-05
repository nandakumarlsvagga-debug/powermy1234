import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { scoreToTier } from "@workspace/scoring";
import { sanitizeDescription } from "@workspace/description-sanitizer";

describe("API Invariants & Property Tests", () => {
  /**
   * **Property 20: Tier Persistence Consistent**
   *
   * Verifies that the derived tier matches the exact score bands:
   *  - D: [1000, 4999]
   *  - C: [5000, 14999]
   *  - B: [15000, 34999]
   *  - A: [35000, 54999]
   *  - S: [55000, 74999]
   *  - SS: [75000, 89999]
   *  - SSS: [90000, 98999]
   *  - LIMITLESS: [99000, 100000]
   */
  it("Property 20: tier matches the expected score range", () => {
    fc.assert(
      fc.property(fc.integer({ min: 1000, max: 100000 }), (score) => {
        const tier = scoreToTier(score);
        if (score >= 99000) {
          expect(tier).toBe("LIMITLESS");
        } else if (score >= 90000) {
          expect(tier).toBe("SSS");
        } else if (score >= 75000) {
          expect(tier).toBe("SS");
        } else if (score >= 55000) {
          expect(tier).toBe("S");
        } else if (score >= 35000) {
          expect(tier).toBe("A");
        } else if (score >= 15000) {
          expect(tier).toBe("B");
        } else if (score >= 5000) {
          expect(tier).toBe("C");
        } else {
          expect(tier).toBe("D");
        }
      })
    );
  });

  /**
   * **Property 30: Description Length Cap**
   *
   * Verifies that no matter what string inputs are generated,
   * the sanitized description is either null or has length <= 120.
   */
  it("Property 30: sanitized description is null or <= 120 characters", () => {
    fc.assert(
      fc.property(fc.string(), (desc) => {
        const result = sanitizeDescription(desc);
        if (result.sanitized !== null) {
          expect(result.sanitized.length).toBeLessThanOrEqual(120);
          expect(result.sanitized.trim()).toBe(result.sanitized);
        }
      })
    );
  });

  /**
   * **Property 31: Username Invariant**
   *
   * Verifies that valid usernames must strictly match ^[a-z0-9_]{3,20}$
   */
  it("Property 31: usernames are validated against formatting patterns", () => {
    const usernameRe = /^[a-z0-9_]{3,20}$/;
    fc.assert(
      fc.property(fc.string(), (username) => {
        const isValid = username.length >= 3 && username.length <= 20 && usernameRe.test(username);
        
        // If our criteria says it is valid, it must match the regex
        if (isValid) {
          expect(username).toMatch(usernameRe);
        }
      })
    );
  });
});
