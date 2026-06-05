import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";
import sharp from "sharp";
import { db, scansTable, membersTable, dailyScanCountsTable, likesTable, anonSessionsTable } from "@workspace/db";
import { and, eq, sql } from "drizzle-orm";
import app from "../src/app.js";
import { signAnonCookieValue } from "../src/lib/cookies.js";

// Mock @workspace/vision to avoid actual Bedrock Converse calls
vi.mock("@workspace/vision", async () => {
  const actual = await vi.importActual<typeof import("@workspace/vision")>("@workspace/vision");
  return {
    ...actual,
    analyzeImage: vi.fn().mockResolvedValue({
      culturalReading: { image_subjects: ["monitor"] },
      rendered: {
        score: 50000,
        tier: "A",
        coreStats: { aura: 5000, power: 5000, status: 5000, threat: 5000 },
        categoryStats: { cleanliness: 5000, display: 5000 },
        verdictNoun: "setup",
        modifiersApplied: [],
        scorePreModifiers: 50000,
        scorePreAnomaly: 50000,
      },
      commentary: "Your battle station is highly optimized.",
      commentarySource: "model",
      anomaly: null,
      forcedAnomaly: null,
      pass1LatencyMs: 200,
      pass3LatencyMs: 200,
      pass1Retried: false,
      pass3Retried: false,
    }),
  };
});

// Mock @workspace/moderation to avoid actual AWS Rekognition calls
vi.mock("@workspace/moderation", () => {
  return {
    moderate: vi.fn().mockResolvedValue({ ok: true, flaggedLabels: [] }),
    ModerationUnavailableError: class extends Error {
      name = "ModerationUnavailableError";
    },
  };
});

// Mock Supabase storage and auth client admin methods
vi.mock("../src/lib/supabase.js", () => {
  return {
    getSupabaseAdmin: () => ({
      storage: {
        from: () => ({
          upload: vi.fn().mockResolvedValue({ data: {}, error: null }),
          remove: vi.fn().mockResolvedValue({ data: {}, error: null }),
          createSignedUrl: vi.fn().mockResolvedValue({ data: { signedUrl: "http://signed-url.com/full.webp" }, error: null }),
          createSignedUrls: vi.fn().mockResolvedValue({
            data: [
              { path: "full.webp", signedUrl: "http://signed-url.com/full.webp" },
              { path: "thumb.webp", signedUrl: "http://signed-url.com/thumb.webp" },
            ],
            error: null,
          }),
        }),
      },
      auth: {
        admin: {
          deleteUser: vi.fn().mockResolvedValue({ error: null }),
        },
      },
    }),
  };
});

// Mock authenticate helper to simulate logged-in members via Authorization headers
vi.mock("../src/lib/auth.js", () => {
  return {
    authenticate: vi.fn(async (req) => {
      const authHeader = req.headers["authorization"];
      if (authHeader && authHeader.startsWith("Bearer member-")) {
        const memberId = authHeader.replace("Bearer member-", "");
        return { memberId, payload: { sub: memberId } };
      }
      return null;
    }),
  };
});

let skipReason = "";

describe.skipIf(() => skipReason !== "")("Scan Pipeline & API endpoints", () => {
  let validImageBuffer: Buffer;
  const anonSessionId = "11111111-2222-3333-4444-555555555555";
  const memberId = "22222222-3333-4444-5555-666666666666";

  beforeAll(async () => {
    try {
      await db.execute(sql`SELECT 1`);
    } catch (err) {
      skipReason = `Database connection failed: ${(err as Error).message}`;
      return;
    }

    // Programmatically generate a small valid 300x300 JPEG
    validImageBuffer = await sharp({
      create: {
        width: 300,
        height: 300,
        channels: 3,
        background: { r: 100, g: 150, b: 200 },
      },
    })
      .jpeg()
      .toBuffer();
  });

  beforeEach(async () => {
    if (skipReason) return;
    // Truncate tables to isolate tests
    await db.execute(sql`TRUNCATE TABLE scans, members, likes, anon_sessions, daily_scan_counts, pending_cleanups RESTART IDENTITY CASCADE`);
    vi.clearAllMocks();
  });

  describe("POST /api/scans", () => {
    it("should reject with 403 when CSRF header is missing on mutation", async () => {
      const res = await request(app)
        .post("/api/scans")
        .attach("image", validImageBuffer, "test.jpg")
        .field("category", "SETUPS")
        .field("localDate", "2026-06-03");

      expect(res.status).toBe(403);
      expect(res.body.code).toBe("FORBIDDEN");
      expect(res.body.message).toContain("CSRF");
    });

    it("should allow a happy path scan for an authenticated Member", async () => {
      // Seed member record
      await db.insert(membersTable).values({
        id: memberId,
        username: "super_coder",
      });

      const res = await request(app)
        .post("/api/scans")
        .set("X-PLVL-Client", "web")
        .set("Authorization", `Bearer member-${memberId}`)
        .attach("image", validImageBuffer, "test.jpg")
        .field("category", "SETUPS")
        .field("localDate", "2026-06-03");

      expect(res.status).toBe(200);
      expect(res.body.scan).toBeDefined();
      expect(res.body.scan.score).toBe(50000);
      expect(res.body.scan.username).toBe("super_coder");
      expect(res.body.reveal.revealVariant).toBe("standard");

      // Verify DB persistence
      const scans = await db.select().from(scansTable).where(eq(scansTable.memberId, memberId));
      expect(scans.length).toBe(1);
      expect(scans[0].score).toBe(50000);
    });

    it("should allow a happy path scan for an Anonymous User with cookie", async () => {
      // Seed anon session
      await db.insert(anonSessionsTable).values({
        id: anonSessionId,
        fingerprint: "fingerprint_123",
      });

      const signedCookie = `plvl_anon=${signAnonCookieValue(anonSessionId)}`;

      const res = await request(app)
        .post("/api/scans")
        .set("X-PLVL-Client", "web")
        .set("Cookie", [signedCookie])
        .attach("image", validImageBuffer, "test.jpg")
        .field("category", "FITNESS")
        .field("localDate", "2026-06-03");

      expect(res.status).toBe(200);
      expect(res.body.scan.username).toBeNull();
      expect(res.body.scan.category).toBe("FITNESS");

      // Verify DB persistence
      const scans = await db.select().from(scansTable).where(eq(scansTable.anonSessionId, anonSessionId));
      expect(scans.length).toBe(1);
      expect(scans[0].memberId).toBeNull();
    });

    it("should reject with 429 when Anonymous User daily scan limit is exceeded", async () => {
      await db.insert(anonSessionsTable).values({
        id: anonSessionId,
        fingerprint: "fingerprint_123",
      });

      // Insert 1 existing scan for this guest session today
      await db.insert(scansTable).values({
        id: crypto.randomUUID(),
        anonSessionId,
        category: "SETUPS",
        score: 50000,
        tier: "A",
        coreStats: { aura: 5000, power: 5000, status: 5000, threat: 5000 },
        categoryStats: {},
        commentary: "Existing scan",
        commentarySource: "model",
        verdictNoun: "setup",
        scorePreAnomaly: 50000,
        scorePreModifiers: 50000,
        imageObjectKey: "scans/foo.webp",
        thumbnailObjectKey: "scans/foo.thumb.webp",
        imagePerceptualHash: "1234567890abcdef",
        createdAt: new Date(),
      });

      const signedCookie = `plvl_anon=${signAnonCookieValue(anonSessionId)}`;

      const res = await request(app)
        .post("/api/scans")
        .set("X-PLVL-Client", "web")
        .set("Cookie", [signedCookie])
        .attach("image", validImageBuffer, "test.jpg")
        .field("category", "SETUPS")
        .field("localDate", "2026-06-03");

      expect(res.status).toBe(429);
      expect(res.body.code).toBe("DAILY_LIMIT_REACHED");
      expect(res.body.message).toContain("limit");
    });
  });

  describe("GET /api/scans/:id", () => {
    it("should return a scan successfully", async () => {
      const scanId = crypto.randomUUID();
      await db.insert(scansTable).values({
        id: scanId,
        anonSessionId,
        category: "RIDES",
        score: 90000,
        tier: "SSS",
        coreStats: { aura: 9000, power: 9000, status: 9000, threat: 9000 },
        categoryStats: {},
        commentary: "Ultimate ride.",
        commentarySource: "model",
        verdictNoun: "ride",
        scorePreAnomaly: 90000,
        scorePreModifiers: 90000,
        imageObjectKey: "scans/ride.webp",
        thumbnailObjectKey: "scans/ride.thumb.webp",
        imagePerceptualHash: "1234567890abcdef",
      });

      const res = await request(app)
        .get(`/api/scans/${scanId}`);

      expect(res.status).toBe(200);
      expect(res.body.score).toBe(90000);
      expect(res.body.category).toBe("RIDES");
      expect(res.body.imageUrl).toBe("http://signed-url.com/full.webp");
    });

    it("should return 404 if scan is not found", async () => {
      const res = await request(app)
        .get(`/api/scans/${crypto.randomUUID()}`);
      expect(res.status).toBe(404);
      expect(res.body.code).toBe("NOT_FOUND");
    });
  });

  describe("POST /api/scans/:id/claim", () => {
    it("should allow claiming an unclaimed scan", async () => {
      await db.insert(membersTable).values({
        id: memberId,
        username: "claimed_member",
      });

      const scanId = crypto.randomUUID();
      await db.insert(scansTable).values({
        id: scanId,
        anonSessionId,
        category: "SETUPS",
        score: 60000,
        tier: "S",
        coreStats: { aura: 6000, power: 6000, status: 6000, threat: 6000 },
        categoryStats: {},
        commentary: "Unclaimed setup.",
        commentarySource: "model",
        verdictNoun: "setup",
        scorePreAnomaly: 60000,
        scorePreModifiers: 60000,
        imageObjectKey: "scans/setup.webp",
        thumbnailObjectKey: "scans/setup.thumb.webp",
        imagePerceptualHash: "1234567890abcdef",
      });

      const signedCookie = `plvl_anon=${signAnonCookieValue(anonSessionId)}`;

      const res = await request(app)
        .post(`/api/scans/${scanId}/claim`)
        .set("X-PLVL-Client", "web")
        .set("Authorization", `Bearer member-${memberId}`)
        .set("Cookie", [signedCookie]);

      expect(res.status).toBe(200);
      expect(res.body.scan.username).toBe("claimed_member");

      // Verify in DB
      const [scan] = await db.select().from(scansTable).where(eq(scansTable.id, scanId));
      expect(scan.memberId).toBe(memberId);
      expect(scan.anonSessionId).toBeNull();
    });

    it("should reject with 403 on claim browser mismatch", async () => {
      await db.insert(membersTable).values({
        id: memberId,
        username: "other_member",
      });

      const scanId = crypto.randomUUID();
      await db.insert(scansTable).values({
        id: scanId,
        anonSessionId, // belongs to anonSessionId
        category: "SETUPS",
        score: 60000,
        tier: "S",
        coreStats: { aura: 6000, power: 6000, status: 6000, threat: 6000 },
        categoryStats: {},
        commentary: "Unclaimed setup.",
        commentarySource: "model",
        verdictNoun: "setup",
        scorePreAnomaly: 60000,
        scorePreModifiers: 60000,
        imageObjectKey: "scans/setup.webp",
        thumbnailObjectKey: "scans/setup.thumb.webp",
        imagePerceptualHash: "1234567890abcdef",
      });

      // Pass cookie for a different session
      const wrongSignedCookie = `plvl_anon=${signAnonCookieValue("88888888-8888-8888-8888-888888888888")}`;

      const res = await request(app)
        .post(`/api/scans/${scanId}/claim`)
        .set("X-PLVL-Client", "web")
        .set("Authorization", `Bearer member-${memberId}`)
        .set("Cookie", [wrongSignedCookie]);

      expect(res.status).toBe(403);
      expect(res.body.code).toBe("FORBIDDEN");
    });
  });

  describe("POST /api/internal/jobs/anonymous-scan-purge", () => {
    beforeAll(() => {
      process.env.INTERNAL_JOB_SECRET = "test-job-secret";
    });

    it("should reject with 401 if unauthorized", async () => {
      const res = await request(app)
        .post("/api/internal/jobs/anonymous-scan-purge")
        .set("Authorization", "Bearer invalid-secret");
      expect(res.status).toBe(401);
    });

    it("should purge expired anonymous scans and delete storage objects", async () => {
      const scanId = crypto.randomUUID();
      const pastDate = new Date(Date.now() - 3600 * 1000); // 1 hour ago
      
      // Insert an expired anonymous scan
      await db.insert(scansTable).values({
        id: scanId,
        anonSessionId,
        category: "SETUPS",
        score: 50000,
        tier: "A",
        coreStats: { aura: 5000, power: 5000, status: 5000, threat: 5000 },
        categoryStats: {},
        commentary: "Expired scan",
        commentarySource: "model",
        verdictNoun: "setup",
        scorePreAnomaly: 50000,
        scorePreModifiers: 50000,
        imageObjectKey: "scans/expired.webp",
        thumbnailObjectKey: "scans/expired.thumb.webp",
        imagePerceptualHash: "1234567890abcdef",
        expiresAt: pastDate,
        expiredAt: null,
      });

      const res = await request(app)
        .post("/api/internal/jobs/anonymous-scan-purge")
        .set("Authorization", "Bearer test-job-secret");

      expect(res.status).toBe(200);
      expect(res.body.purgedCount).toBe(1);

      // Verify row is marked as expired
      const [updatedScan] = await db.select().from(scansTable).where(eq(scansTable.id, scanId));
      expect(updatedScan.expiredAt).not.toBeNull();
    });
  });

  describe("POST /api/internal/jobs/pending-cleanup-reconciler", () => {
    beforeAll(() => {
      process.env.INTERNAL_JOB_SECRET = "test-job-secret";
    });

    it("should reconcile stale cleanup rows without matching scans", async () => {
      const staleDate = new Date(Date.now() - 10 * 60 * 1000); // 10 mins ago (older than 5 min grace)
      const orphanScanId = crypto.randomUUID();

      // Insert stale pending cleanup row (no matching scan exists)
      await db.insert(pendingCleanupsTable).values({
        id: crypto.randomUUID(),
        scanId: orphanScanId,
        imageObjectKey: "cleanups/orphan.webp",
        thumbnailObjectKey: "cleanups/orphan.thumb.webp",
        createdAt: staleDate,
      });

      const res = await request(app)
        .post("/api/internal/jobs/pending-cleanup-reconciler")
        .set("Authorization", "Bearer test-job-secret");

      expect(res.status).toBe(200);
      expect(res.body.reconciledCount).toBe(1);

      // Verify row is deleted
      const cleanups = await db.select().from(pendingCleanupsTable).where(eq(pendingCleanupsTable.scanId, orphanScanId));
      expect(cleanups.length).toBe(0);
    });

    it("should reconcile stale cleanup rows WITH matching scans (scan exists, just delete cleanup row)", async () => {
      const staleDate = new Date(Date.now() - 10 * 60 * 1000); // 10 mins ago
      const existingScanId = crypto.randomUUID();

      // Insert scan row
      await db.insert(scansTable).values({
        id: existingScanId,
        anonSessionId,
        category: "SETUPS",
        score: 50000,
        tier: "A",
        coreStats: { aura: 5000, power: 5000, status: 5000, threat: 5000 },
        categoryStats: {},
        commentary: "Existing scan",
        commentarySource: "model",
        verdictNoun: "setup",
        scorePreAnomaly: 50000,
        scorePreModifiers: 50000,
        imageObjectKey: "scans/existing.webp",
        thumbnailObjectKey: "scans/existing.thumb.webp",
        imagePerceptualHash: "1234567890abcdef",
      });

      // Insert pending cleanup row for this existing scan
      await db.insert(pendingCleanupsTable).values({
        id: crypto.randomUUID(),
        scanId: existingScanId,
        imageObjectKey: "cleanups/existing.webp",
        thumbnailObjectKey: "cleanups/existing.thumb.webp",
        createdAt: staleDate,
      });

      const res = await request(app)
        .post("/api/internal/jobs/pending-cleanup-reconciler")
        .set("Authorization", "Bearer test-job-secret");

      expect(res.status).toBe(200);

      // Verify cleanup row is deleted
      const cleanups = await db.select().from(pendingCleanupsTable).where(eq(pendingCleanupsTable.scanId, existingScanId));
      expect(cleanups.length).toBe(0);

      // Verify scan still exists
      const scans = await db.select().from(scansTable).where(eq(scansTable.id, existingScanId));
      expect(scans.length).toBe(1);
    });
  });
});
