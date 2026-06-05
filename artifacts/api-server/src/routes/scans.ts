import { Router, type IRouter } from "express";
import { db, scansTable, membersTable, dailyScanCountsTable } from "@workspace/db";
import { and, eq, isNull, sql } from "drizzle-orm";
import { authenticate } from "../lib/auth.js";
import { readAnonCookie } from "../lib/cookies.js";
import { apiError } from "../lib/errors.js";
import { scanUpload } from "../lib/multipart.js";
import { isValidTimezone } from "../lib/timezone.js";
import { runScanPipeline } from "../scan-pipeline/index.js";
import { getSupabaseAdmin } from "../lib/supabase.js";

const router: IRouter = Router();

// Cache for scan like counts (refreshed every 60s)
export const likeCountCache = new Map<string, { count: number; expiresAt: number }>();

export async function getLikeCount(scanId: string): Promise<number> {
  const cached = likeCountCache.get(scanId);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.count;
  }
  const [{ count }] = await db
    .select({ count: sql<number>`count(*)` })
    .from(sql`likes`)
    .where(sql`scan_id = ${scanId}`);
  const finalCount = Number(count);
  likeCountCache.set(scanId, {
    count: finalCount,
    expiresAt: Date.now() + 60 * 1000,
  });
  return finalCount;
}

export async function getScanPublicProjection(
  scanId: string,
  callerMemberId: string | null,
  callerAnonSessionId: string | null,
  baseUrl: string
): Promise<any> {
  const rows = await db
    .select({
      id: scansTable.id,
      memberId: scansTable.memberId,
      category: scansTable.category,
      score: scansTable.score,
      tier: scansTable.tier,
      verdictNoun: scansTable.verdictNoun,
      coreStats: scansTable.coreStats,
      categoryStats: scansTable.categoryStats,
      commentary: scansTable.commentary,
      description: scansTable.description,
      anomaly: scansTable.anomalyType,
      imageObjectKey: scansTable.imageObjectKey,
      thumbnailObjectKey: scansTable.thumbnailObjectKey,
      createdAt: scansTable.createdAt,
    })
    .from(scansTable)
    .where(and(eq(scansTable.id, scanId), isNull(scansTable.expiredAt)));

  if (rows.length === 0) {
    throw apiError.notFound("Scan not found");
  }
  const row = rows[0];

  let username: string | null = null;
  if (row.memberId) {
    const memberRows = await db
      .select({ username: sql<string>`username` })
      .from(sql`members`)
      .where(sql`id = ${row.memberId}`);
    if (memberRows.length > 0) {
      username = memberRows[0].username;
    }
  }

  // Generate signed URLs (valid for 24h)
  const supabase = getSupabaseAdmin();
  const [imgSigned, thumbSigned] = await Promise.all([
    supabase.storage.from("scan-images").createSignedUrl(row.imageObjectKey, 24 * 60 * 60),
    supabase.storage.from("scan-images").createSignedUrl(row.thumbnailObjectKey, 24 * 60 * 60),
  ]);

  const imageUrl = imgSigned.data?.signedUrl ?? "";
  const thumbnailUrl = thumbSigned.data?.signedUrl ?? "";

  const permalink = `${baseUrl}/scan/${row.id}`;
  const shareCardUrls = {
    story: `${baseUrl}/api/scans/${row.id}/share-card.png?ratio=story`,
    square: `${baseUrl}/api/scans/${row.id}/share-card.png?ratio=square`,
    landscape: `${baseUrl}/api/scans/${row.id}/share-card.png?ratio=landscape`,
  };

  const likeCount = await getLikeCount(row.id);

  let likedByMe = false;
  if (callerMemberId) {
    const likeRows = await db
      .select()
      .from(sql`likes`)
      .where(and(sql`scan_id = ${row.id}`, sql`member_id = ${callerMemberId}`));
    likedByMe = likeRows.length > 0;
  } else if (callerAnonSessionId) {
    const likeRows = await db
      .select()
      .from(sql`likes`)
      .where(and(sql`scan_id = ${row.id}`, sql`anon_session_id = ${callerAnonSessionId}`));
    likedByMe = likeRows.length > 0;
  }

  return {
    id: row.id,
    username,
    category: row.category,
    score: row.score,
    tier: row.tier,
    verdictNoun: row.verdictNoun,
    coreStats: row.coreStats as any,
    categoryStats: row.categoryStats as any,
    commentary: row.commentary,
    description: row.description,
    anomaly: row.anomaly,
    imageUrl,
    thumbnailUrl,
    createdAt: row.createdAt,
    permalink,
    shareCardUrls,
    likeCount,
    likedByMe,
  };
}

// POST /api/scans
router.post("/scans", (req, res, next) => {
  scanUpload(req, res, async (err) => {
    try {
      if (err) {
        if (err.name === "MulterError") {
          if (err.code === "LIMIT_FILE_SIZE") {
            throw apiError.imageInvalid("Image exceeds 8 MB upload limit", "size");
          }
          throw apiError.imageInvalid(err.message, "format");
        }
        throw err;
      }

      const auth = await authenticate(req);
      const memberId = auth ? auth.memberId : null;
      const anonSessionId = readAnonCookie(req);

      if (!memberId && !anonSessionId) {
        throw apiError.unauthenticated("Anonymous session or member sign-in required.");
      }

      const { category, description, localDate, localTz } = req.body;

      if (!category || !localDate) {
        throw apiError.invalidInput("category and localDate are required fields.");
      }

      const validCategories = ["SETUPS", "FITNESS", "DRIP", "PETS", "RIDES", "WILDCARD"];
      if (!validCategories.includes(category)) {
        throw apiError.invalidInput("Invalid category", { field: "category" });
      }

      if (!/^\d{4}-\d{2}-\d{2}$/.test(localDate)) {
        throw apiError.invalidInput("Invalid localDate format. Expected YYYY-MM-DD.", { field: "localDate" });
      }

      // Validate localDate ± 26 hours limit
      const [year, month, day] = localDate.split("-").map(Number);
      const noonUtc = Date.UTC(year, month - 1, day, 12, 0, 0);
      const diffMs = Math.abs(noonUtc - Date.now());
      if (diffMs > 26 * 60 * 60 * 1000) {
        throw apiError.invalidInput("localDate is out of acceptable bounds", { field: "localDate" });
      }

      if (localTz && !isValidTimezone(localTz)) {
        throw apiError.invalidInput("Invalid localTz timezone.", { field: "localTz" });
      }

      if (!req.file) {
        throw apiError.imageInvalid("No image file provided.", "format");
      }

      const baseUrl = `${req.protocol}://${req.get("host")}`;

      const result = await runScanPipeline({
        imageBytes: req.file.buffer,
        declaredMime: req.file.mimetype,
        category: category as any,
        description: description || undefined,
        localDate,
        localTz: localTz || undefined,
        memberId,
        anonSessionId,
        clientIp: req.ip || req.socket.remoteAddress || "127.0.0.1",
        baseUrl,
      });

      // Update likedByMe and likeCount specifically for this caller
      const scanPublic = await getScanPublicProjection(result.scan.id, memberId, anonSessionId, baseUrl);

      res.json({
        scan: scanPublic,
        reveal: result.reveal,
      });
    } catch (pipelineErr) {
      next(pipelineErr);
    }
  });
});

// GET /api/scans/{id}
router.get("/scans/:id", async (req, res, next) => {
  try {
    const scanId = req.params.id;
    if (!scanId) {
      throw apiError.invalidInput("id is required");
    }

    const auth = await authenticate(req);
    const memberId = auth ? auth.memberId : null;
    const anonSessionId = readAnonCookie(req);
    const baseUrl = `${req.protocol}://${req.get("host")}`;

    const scanPublic = await getScanPublicProjection(scanId, memberId, anonSessionId, baseUrl);
    res.json(scanPublic);
  } catch (err) {
    next(err);
  }
});

// GET /api/scans/{id}/share-card.png
router.get("/scans/:id/share-card.png", async (req, res, next) => {
  try {
    const scanId = req.params.id;
    const ratio = req.query.ratio as string;

    if (!scanId || !ratio) {
      throw apiError.invalidInput("id and ratio are required");
    }

    const validRatios = ["story", "square", "landscape"];
    if (!validRatios.includes(ratio)) {
      throw apiError.invalidInput("Invalid ratio", { field: "ratio" });
    }

    const baseUrl = `${req.protocol}://${req.get("host")}`;
    const shareCardUrl = `${baseUrl}/share-card/${scanId}/${ratio}.png`;

    const response = await fetch(shareCardUrl);
    if (!response.ok) {
      res.status(503).json({
        code: "SERVICE_UNAVAILABLE",
        message: "Share card temporarily unavailable",
      });
      return;
    }

    const buffer = await response.arrayBuffer();
    res.setHeader("Content-Type", "image/png");
    res.setHeader("Cache-Control", "public, max-age=86400, s-maxage=86400, immutable");
    const etag = response.headers.get("etag");
    if (etag) {
      res.setHeader("ETag", etag);
    }
    res.send(Buffer.from(buffer));
  } catch (err) {
    next(err);
  }
});

// POST /api/scans/{id}/claim
router.post("/scans/:id/claim", async (req, res, next) => {
  try {
    const scanId = req.params.id;
    const auth = await authenticate(req);
    if (!auth) {
      throw apiError.unauthenticated();
    }
    const memberId = auth.memberId;
    const anonSessionId = readAnonCookie(req);
    const baseUrl = `${req.protocol}://${req.get("host")}`;

    const scanRows = await db.select().from(scansTable).where(eq(scansTable.id, scanId));
    if (scanRows.length === 0) {
      throw apiError.notFound("Scan not found");
    }
    const scan = scanRows[0];

    if (scan.memberId === memberId) {
      // Idempotent success
      const scanPublic = await getScanPublicProjection(scanId, memberId, anonSessionId, baseUrl);
      res.json({ scan: scanPublic });
      return;
    }

    if (scan.memberId !== null) {
      throw apiError.forbidden("Cannot claim a scan owned by another member");
    }

    if (!anonSessionId || scan.anonSessionId !== anonSessionId) {
      throw apiError.forbidden("Cannot claim a scan from a different browser session");
    }

    // Atomically claim and update daily counts
    const utcDay = new Date().toISOString().slice(0, 10);
    await db.transaction(async (tx) => {
      await tx
        .update(scansTable)
        .set({
          memberId: memberId,
          anonSessionId: null,
        })
        .where(eq(scansTable.id, scanId));

      await tx
        .insert(dailyScanCountsTable)
        .values({
          memberId,
          utcDay,
          count: 1,
        })
        .onConflictDoUpdate({
          target: [dailyScanCountsTable.memberId, dailyScanCountsTable.utcDay],
          set: {
            count: sql`${dailyScanCountsTable.count} + 1`,
          },
        });
    });

    const updatedScanPublic = await getScanPublicProjection(scanId, memberId, anonSessionId, baseUrl);
    res.json({ scan: updatedScanPublic });
  } catch (err) {
    next(err);
  }
});

export default router;
