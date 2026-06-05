import { beforeAll, describe, expect, it, vi } from "vitest";
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

describe("Share Card Snapshots", () => {
  const mockScanBase = {
    id: "11111111-2222-3333-4444-555555555555",
    memberId: "22222222-3333-4444-5555-666666666666",
    username: "coder_bob",
    category: "SETUPS",
    score: 50000,
    tier: "A",
    verdictNoun: "setup",
    coreStats: { aura: 5000, power: 5000, status: 5000, threat: 5000 },
    categoryStats: { display: 5000, cleanliness: 5000 },
    commentary: "Your system has exceptional aesthetic balance.",
    description: "My minimal coding desk setup",
    anomalyType: null,
    imageObjectKey: "scans/test.webp",
    thumbnailObjectKey: "scans/test.thumb.webp",
    createdAt: new Date("2026-06-03T12:00:00.000Z"),
  };

  const tiers = [
    { tier: "D", score: 3000, verdict: "rookie" },
    { tier: "C", score: 10000, verdict: "apprentice" },
    { tier: "B", score: 25000, verdict: "enthusiast" },
    { tier: "A", score: 45000, verdict: "veteran" },
    { tier: "S", score: 65000, verdict: "master" },
    { tier: "SS", score: 80000, verdict: "legend" },
    { tier: "SSS", score: 95000, verdict: "godlike" },
    { tier: "LIMITLESS", score: 99500, verdict: "limitless" },
  ];

  const ratios = ["story", "square", "landscape"] as const;

  const anomalies = [
    "SCOUTER_FAILURE",
    "UNREGISTERED_ENERGY",
    "POWER_SURGE_DETECTED",
    "FORBIDDEN_AURA",
    "CHAOS_SPIKE",
  ];

  // Set up Drizzle select mock
  let currentMockRow: any = mockScanBase;

  beforeAll(() => {
    vi.spyOn(db, "select").mockImplementation(() => {
      return {
        from: () => ({
          leftJoin: () => ({
            where: () => Promise.resolve([currentMockRow]),
          }),
        }),
      } as any;
    });
  });

  // Generate 8 tiers x 3 ratios = 24 snapshot cases
  for (const t of tiers) {
    for (const ratio of ratios) {
      it(`should render snapshot for tier ${t.tier} with ${ratio} ratio`, async () => {
        currentMockRow = {
          ...mockScanBase,
          tier: t.tier,
          score: t.score,
          verdictNoun: t.verdict,
        };

        const result = await renderCard(mockScanBase.id, ratio, "http://localhost:5000");
        expect(result).not.toBeNull();
        expect(result!.pngBuffer).toBeInstanceOf(Buffer);
        expect(result!.pngBuffer.length).toBeGreaterThan(0);
        expect(result!.etag).toBeDefined();

        // Check format of ETag
        expect(result!.etag.length).toBe(64); // sha256 hex string length
      });
    }
  }

  // Generate anomaly snapshots for square ratio
  for (const anomaly of anomalies) {
    it(`should render snapshot for anomaly ${anomaly} in square ratio`, async () => {
      currentMockRow = {
        ...mockScanBase,
        tier: "S",
        score: 68000,
        verdictNoun: "glitch",
        anomalyType: anomaly,
      };

      const result = await renderCard(mockScanBase.id, "square", "http://localhost:5000");
      expect(result).not.toBeNull();
      expect(result!.pngBuffer).toBeInstanceOf(Buffer);
      expect(result!.pngBuffer.length).toBeGreaterThan(0);
    });
  }
});
