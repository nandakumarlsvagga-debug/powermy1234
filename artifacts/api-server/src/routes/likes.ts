import { Router, type IRouter } from "express";
import { db, scansTable, likesTable } from "@workspace/db";
import { and, eq, sql } from "drizzle-orm";
import { authenticate } from "../lib/auth.js";
import { readAnonCookie } from "../lib/cookies.js";
import { apiError } from "../lib/errors.js";
import { likeCountCache, getLikeCount } from "./scans.js";

const router: IRouter = Router();

router.post("/scans/:id/like", async (req, res, next) => {
  try {
    const scanId = req.params.id;
    if (!scanId) {
      throw apiError.invalidInput("id is required");
    }

    const auth = await authenticate(req);
    const memberId = auth ? auth.memberId : null;
    const anonSessionId = readAnonCookie(req);

    if (!memberId && !anonSessionId) {
      throw apiError.unauthenticated("Anonymous session or member sign-in required.");
    }

    // Verify scan exists
    const scanRows = await db.select().from(scansTable).where(eq(scansTable.id, scanId));
    if (scanRows.length === 0) {
      throw apiError.notFound("Scan not found");
    }

    const whereClause = memberId
      ? and(eq(likesTable.scanId, scanId), eq(likesTable.memberId, memberId))
      : and(eq(likesTable.scanId, scanId), eq(likesTable.anonSessionId, anonSessionId!));

    const existingLikes = await db.select().from(likesTable).where(whereClause);
    let liked = false;

    if (existingLikes.length > 0) {
      // Unlike
      await db.delete(likesTable).where(whereClause);
      liked = false;
    } else {
      // Like
      await db.insert(likesTable).values({
        scanId,
        memberId: memberId || null,
        anonSessionId: memberId ? null : anonSessionId,
      });
      liked = true;
    }

    // Invalidate the cache for this scan
    likeCountCache.delete(scanId);

    // Get the fresh (or recalculated) count
    const likeCount = await getLikeCount(scanId);

    res.json({
      liked,
      likeCount,
    });
  } catch (err) {
    next(err);
  }
});

export default router;
