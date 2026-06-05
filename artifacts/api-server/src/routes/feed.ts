import { Router, type IRouter } from "express";
import { db, scansTable, membersTable, likesTable } from "@workspace/db";
import { and, eq, isNull, lt, sql, inArray } from "drizzle-orm";
import { authenticate } from "../lib/auth.js";
import { readAnonCookie } from "../lib/cookies.js";
import { apiError } from "../lib/errors.js";
import { getSupabaseAdmin } from "../lib/supabase.js";
import { likeCountCache } from "./scans.js";

const router: IRouter = Router();

router.get("/feed", async (req, res, next) => {
  try {
    const rawLimit = req.query.limit;
    const rawCursor = req.query.cursor;

    const limit = rawLimit ? Math.min(20, Math.max(1, Number(rawLimit))) : 20;
    let cursorDate: Date | null = null;
    if (rawCursor) {
      const parsed = new Date(rawCursor as string);
      if (isNaN(parsed.getTime())) {
        throw apiError.invalidInput("Invalid cursor date format.", { field: "cursor" });
      }
      cursorDate = parsed;
    }

    const auth = await authenticate(req);
    const memberId = auth ? auth.memberId : null;
    const anonSessionId = readAnonCookie(req);

    const baseUrl = `${req.protocol}://${req.get("host")}`;

    // Query scans + join members
    const whereConditions = [isNull(scansTable.expiredAt)];
    if (cursorDate) {
      whereConditions.push(lt(scansTable.createdAt, cursorDate));
    }

    const rows = await db
      .select({
        id: scansTable.id,
        memberId: scansTable.memberId,
        username: membersTable.username,
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
      .leftJoin(membersTable, eq(membersTable.id, scansTable.memberId))
      .where(and(...whereConditions))
      .orderBy(sql`${scansTable.createdAt} DESC`)
      .limit(limit + 1);

    const hasMore = rows.length > limit;
    const pageRows = hasMore ? rows.slice(0, limit) : rows;

    let nextCursor: Date | null = null;
    if (hasMore && pageRows.length > 0) {
      nextCursor = pageRows[pageRows.length - 1].createdAt;
    }

    // Batch generate signed storage URLs
    const urlMap = new Map<string, string>();
    if (pageRows.length > 0) {
      const paths: string[] = [];
      for (const r of pageRows) {
        paths.push(r.imageObjectKey);
        paths.push(r.thumbnailObjectKey);
      }
      const supabase = getSupabaseAdmin();
      const { data: signedData } = await supabase.storage.from("scan-images").createSignedUrls(paths, 24 * 60 * 60);
      if (signedData) {
        for (const item of signedData) {
          if (item.path && item.signedUrl) {
            urlMap.set(item.path, item.signedUrl);
          }
        }
      }
    }

    // Batch get likes state
    const scanIds = pageRows.map(r => r.id);
    const likedScanIds = new Set<string>();
    const likeCounts = new Map<string, number>();

    if (scanIds.length > 0) {
      if (memberId) {
        const likeRows = await db
          .select({ scanId: likesTable.scanId })
          .from(likesTable)
          .where(and(inArray(likesTable.scanId, scanIds), eq(likesTable.memberId, memberId)));
        for (const r of likeRows) likedScanIds.add(r.scanId);
      } else if (anonSessionId) {
        const likeRows = await db
          .select({ scanId: likesTable.scanId })
          .from(likesTable)
          .where(and(inArray(likesTable.scanId, scanIds), eq(likesTable.anonSessionId, anonSessionId)));
        for (const r of likeRows) likedScanIds.add(r.scanId);
      }

      // Grouped counts query
      const counts = await db
        .select({ scanId: likesTable.scanId, count: sql<number>`count(*)` })
        .from(likesTable)
        .where(inArray(likesTable.scanId, scanIds))
        .groupBy(likesTable.scanId);
      for (const c of counts) {
        const countVal = Number(c.count);
        likeCounts.set(c.scanId, countVal);
        // Seed likeCountCache
        likeCountCache.set(c.scanId, {
          count: countVal,
          expiresAt: Date.now() + 60 * 1000,
        });
      }
    }

    const entries = pageRows.map(r => {
      const imageUrl = urlMap.get(r.imageObjectKey) ?? "";
      const thumbnailUrl = urlMap.get(r.thumbnailObjectKey) ?? "";
      const likeCount = likeCounts.get(r.id) ?? 0;
      const likedByMe = likedScanIds.has(r.id);

      return {
        id: r.id,
        username: r.username ?? null,
        category: r.category,
        score: r.score,
        tier: r.tier,
        verdictNoun: r.verdictNoun,
        coreStats: r.coreStats as any,
        categoryStats: r.categoryStats as any,
        commentary: r.commentary,
        description: r.description,
        anomaly: r.anomaly,
        imageUrl,
        thumbnailUrl,
        createdAt: r.createdAt,
        permalink: `${baseUrl}/scan/${r.id}`,
        shareCardUrls: {
          story: `${baseUrl}/api/scans/${r.id}/share-card.png?ratio=story`,
          square: `${baseUrl}/api/scans/${r.id}/share-card.png?ratio=square`,
          landscape: `${baseUrl}/api/scans/${r.id}/share-card.png?ratio=landscape`,
        },
        likeCount,
        likedByMe,
      };
    });

    res.setHeader("Cache-Control", "private, max-age=0, must-revalidate");
    res.json({
      entries,
      nextCursor,
    });
  } catch (err) {
    next(err);
  }
});

export default router;
