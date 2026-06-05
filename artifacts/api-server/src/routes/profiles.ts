import { Router, type IRouter } from "express";
import { db, scansTable, membersTable, likesTable } from "@workspace/db";
import { and, eq, isNull, lt, sql, inArray } from "drizzle-orm";
import { authenticate } from "../lib/auth.js";
import { readAnonCookie } from "../lib/cookies.js";
import { apiError } from "../lib/errors.js";
import { getSupabaseAdmin } from "../lib/supabase.js";
import { likeCountCache } from "./scans.js";

const router: IRouter = Router();

interface ProfileStats {
  highestScore: number;
  totalScans: number;
  highestTier: "D" | "C" | "B" | "A" | "S" | "SS" | "SSS" | "LIMITLESS";
  expiresAt: number;
}

// 5-minute aggregate stats cache
const profileStatsCache = new Map<string, ProfileStats>();

async function getProfileAggregates(memberId: string): Promise<Omit<ProfileStats, "expiresAt">> {
  const cached = profileStatsCache.get(memberId);
  if (cached && cached.expiresAt > Date.now()) {
    return {
      highestScore: cached.highestScore,
      totalScans: cached.totalScans,
      highestTier: cached.highestTier,
    };
  }

  const [stats] = await db
    .select({
      highestScore: sql<number>`COALESCE(max(${scansTable.score}), 0)`,
      totalScans: sql<number>`count(*)`,
    })
    .from(scansTable)
    .where(and(eq(scansTable.memberId, memberId), isNull(scansTable.expiredAt)));

  const tierRow = await db
    .select({ tier: scansTable.tier })
    .from(scansTable)
    .where(and(eq(scansTable.memberId, memberId), isNull(scansTable.expiredAt)))
    .orderBy(sql`${scansTable.score} DESC`)
    .limit(1);

  const highestScore = Number(stats?.highestScore ?? 0);
  const totalScans = Number(stats?.totalScans ?? 0);
  const highestTier = tierRow.length > 0 ? tierRow[0].tier : "D";

  profileStatsCache.set(memberId, {
    highestScore,
    totalScans,
    highestTier,
    expiresAt: Date.now() + 5 * 60 * 1000,
  });

  return { highestScore, totalScans, highestTier };
}

// Helper to fetch scans for a member with cursor pagination
async function fetchMemberScans(
  memberId: string,
  callerMemberId: string | null,
  callerAnonSessionId: string | null,
  limit: number,
  cursorDate: Date | null,
  baseUrl: string
): Promise<{ entries: any[]; nextCursor: Date | null }> {
  const whereConditions = [eq(scansTable.memberId, memberId), isNull(scansTable.expiredAt)];
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
    if (callerMemberId) {
      const likeRows = await db
        .select({ scanId: likesTable.scanId })
        .from(likesTable)
        .where(and(inArray(likesTable.scanId, scanIds), eq(likesTable.memberId, callerMemberId)));
      for (const r of likeRows) likedScanIds.add(r.scanId);
    } else if (callerAnonSessionId) {
      const likeRows = await db
        .select({ scanId: likesTable.scanId })
        .from(likesTable)
        .where(and(inArray(likesTable.scanId, scanIds), eq(likesTable.anonSessionId, callerAnonSessionId)));
      for (const r of likeRows) likedScanIds.add(r.scanId);
    }

    const counts = await db
      .select({ scanId: likesTable.scanId, count: sql<number>`count(*)` })
      .from(likesTable)
      .where(inArray(likesTable.scanId, scanIds))
      .groupBy(likesTable.scanId);
    for (const c of counts) {
      const countVal = Number(c.count);
      likeCounts.set(c.scanId, countVal);
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

  return { entries, nextCursor };
}

// GET /api/profiles/{username}
router.get("/profiles/:username", async (req, res, next) => {
  try {
    const username = req.params.username;
    if (!username) {
      throw apiError.invalidInput("username is required");
    }

    // Case-insensitive lookup
    const memberRows = await db
      .select()
      .from(membersTable)
      .where(sql`lower(${membersTable.username}) = ${username.toLowerCase()}`);

    if (memberRows.length === 0) {
      throw apiError.notFound("Profile not found");
    }
    const member = memberRows[0];

    const aggregates = await getProfileAggregates(member.id);

    const auth = await authenticate(req);
    const callerMemberId = auth ? auth.memberId : null;
    const callerAnonSessionId = readAnonCookie(req);
    const baseUrl = `${req.protocol}://${req.get("host")}`;

    const { entries: scans, nextCursor } = await fetchMemberScans(
      member.id,
      callerMemberId,
      callerAnonSessionId,
      20,
      null,
      baseUrl
    );

    res.json({
      profile: {
        username: member.username,
        avatarInitials: member.username.substring(0, 1).toUpperCase(),
        aggregates,
      },
      scans,
      nextCursor,
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/profiles/{username}/scans
router.get("/profiles/:username/scans", async (req, res, next) => {
  try {
    const username = req.params.username;
    const rawLimit = req.query.limit;
    const rawCursor = req.query.cursor;

    if (!username) {
      throw apiError.invalidInput("username is required");
    }

    const limit = rawLimit ? Math.min(20, Math.max(1, Number(rawLimit))) : 20;
    let cursorDate: Date | null = null;
    if (rawCursor) {
      const parsed = new Date(rawCursor as string);
      if (isNaN(parsed.getTime())) {
        throw apiError.invalidInput("Invalid cursor date format.", { field: "cursor" });
      }
      cursorDate = parsed;
    }

    // Case-insensitive lookup
    const memberRows = await db
      .select()
      .from(membersTable)
      .where(sql`lower(${membersTable.username}) = ${username.toLowerCase()}`);

    if (memberRows.length === 0) {
      throw apiError.notFound("Profile not found");
    }
    const member = memberRows[0];

    const auth = await authenticate(req);
    const callerMemberId = auth ? auth.memberId : null;
    const callerAnonSessionId = readAnonCookie(req);
    const baseUrl = `${req.protocol}://${req.get("host")}`;

    const { entries, nextCursor } = await fetchMemberScans(
      member.id,
      callerMemberId,
      callerAnonSessionId,
      limit,
      cursorDate,
      baseUrl
    );

    res.json({
      entries,
      nextCursor,
    });
  } catch (err) {
    next(err);
  }
});

export default router;
