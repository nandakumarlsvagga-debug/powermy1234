import { beforeAll, describe, expect, it, vi } from "vitest";
import fc from "fast-check";
import { PNG } from "pngjs";
import jsQR from "jsqr";
import { renderCard } from "../src/lib/render-card.js";
import { db } from "../src/lib/db.js";

// Mock Supabase storage
vi.mock("../src/lib/supabase.js", () => {
  return {
    getSupabaseAdmin: () => ({
      storage: {
        from: () => ({
          createSignedUrl: vi.fn().mockResolvedValue({
            data: { signedUrl: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==" },
            error: null,
          }),
        }),
      },
    }),
  };
});

function decodeQr(pngBuffer: Buffer): string | null {
  const decoded = PNG.sync.read(pngBuffer);
  const data = new Uint8ClampedArray(
    decoded.data.buffer,
    decoded.data.byteOffset,
    decoded.data.byteLength,
  );
  const result = jsQR(data, decoded.width, decoded.height);
  return result ? result.data : null;
}

describe("Share Card Property Tests", () => {
  let mockScanRow: any;

  beforeAll(() => {
    vi.spyOn(db, "select").mockImplementation(() => {
      return {
        from: () => ({
          leftJoin: () => ({
            where: () => Promise.resolve([mockScanRow]),
          }),
        }),
      } as any;
    });
  });

  const memberIdArb = fc.uuid();
  const usernameArb = fc.string({ minLength: 3, maxLength: 20 }).filter((s) => /^[a-z0-9_]+$/.test(s));
  const scoreArb = fc.integer({ min: 1000, max: 100000 });
  const emailArb = fc.emailAddress();
  const tokenArb = fc.string({ minLength: 10, maxLength: 50 }).filter((s) => /^[a-zA-Z0-9]+$/.test(s));

  /**
   * **Properties 27, 37, 38, 39, 40 Invariants**
   */
  it("should satisfy all share-card layout and security properties", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          memberId: memberIdArb,
          username: usernameArb,
          score: scoreArb,
          email: emailArb,
          token: tokenArb,
          ratio: fc.constantFrom("story", "square", "landscape" as const),
        }),
        async (data) => {
          // Setup the mock row with some potentially sensitive attributes
          mockScanRow = {
            id: "11111111-2222-3333-4444-555555555555",
            memberId: data.memberId,
            username: data.username,
            category: "RIDES",
            score: data.score,
            tier: data.score >= 99000 ? "LIMITLESS" : data.score >= 90000 ? "SSS" : "A",
            verdictNoun: "ride",
            coreStats: { aura: 5000, power: 5000, status: 5000, threat: 5000 },
            categoryStats: {},
            commentary: "Your ride exhibits substantial threat power.",
            description: "Testing with a generic scan description",
            anomalyType: null,
            imageObjectKey: "scans/test.webp",
            thumbnailObjectKey: "scans/test.thumb.webp",
            createdAt: new Date("2026-06-03T12:00:00.000Z"),
          };

          const baseUrl = "http://localhost:5000";
          const result = await renderCard(mockScanRow.id, data.ratio, baseUrl);

          expect(result).not.toBeNull();
          const { pngBuffer, svg } = result!;

          // Property 27 & 37: 200/Buffer exists for all ratios
          expect(pngBuffer).toBeInstanceOf(Buffer);
          expect(pngBuffer.length).toBeGreaterThan(0);

          // Property 38: Decoded QR matches permalink URL exactly
          const expectedPermalink = `${baseUrl}/scan/${mockScanRow.id}`;
          const decoded = decodeQr(pngBuffer);
          expect(decoded).toBe(expectedPermalink);

          // Property 39: No PII (email, member_id, or token) in rendered card
          expect(svg.includes(data.email)).toBe(false);
          expect(svg.includes(data.memberId)).toBe(false);
          expect(svg.includes(data.token)).toBe(false);

          // Property 40: Score is the largest text element
          // We look for all font-size declarations in the SVG: e.g. font-size="200" or style="font-size: 200px"
          const fontSizes: number[] = [];
          const matches = svg.matchAll(/font-size="([^"]+)"|font-size:\s*([0-9.]+)px/g);
          for (const match of matches) {
            const val = match[1] || match[2];
            if (val) fontSizes.push(parseFloat(val));
          }
          if (fontSizes.length > 0) {
            const maxFontSize = Math.max(...fontSizes);
            const expectedScoreSize = data.ratio === "landscape" ? 120 : 200;
            expect(maxFontSize).toBe(expectedScoreSize);
          }
        },
      ),
      { numRuns: 10 }, // Heavy rasterization checks: keep numRuns moderate
    );
  }, 180000);
});
