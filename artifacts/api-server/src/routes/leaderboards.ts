import { Router, type IRouter } from "express";
import { db, scansTable, membersTable } from "@workspace/db";
import { and, eq, isNotNull, isNull, gte, sql } from "drizzle-orm";
import { apiError } from "../lib/errors.js";

const router: IRouter = Router();

router.get("/leaderboards", async (req, res, next) => {
  try {
    const { window, scope } = req.query;

    if (!window || !scope) {
      throw apiError.invalidInput("window and scope are required query parameters.");
    }

    const validWindows = ["today", "week", "all"];
    if (!validWindows.includes(window as string)) {
      throw apiError.invalidInput("Invalid window parameter.", { field: "window" });
    }

    const validScopes = ["global", "setups", "fitness", "drip", "pets", "rides", "wildcard"];
    if (!validScopes.includes(scope as string)) {
      throw apiError.invalidInput("Invalid scope parameter.", { field: "scope" });
    }

    const baseUrl = `${req.protocol}://${req.get("host")}`;

    const whereConditions = [
      isNotNull(scansTable.memberId),
      isNull(scansTable.expiredAt),
    ];

    if (scope.toString().toLowerCase() !== "global") {
      whereConditions.push(eq(scansTable.category, scope.toString().toUpperCase() as any));
    }

    if (window === "today") {
      whereConditions.push(gte(scansTable.createdAt, new Date(Date.now() - 24 * 60 * 60 * 1000)));
    } else if (window === "week") {
      whereConditions.push(gte(scansTable.createdAt, new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)));
    }

    const rows = await db
      .select({
        id: scansTable.id,
        username: membersTable.username,
        category: scansTable.category,
        score: scansTable.score,
        tier: scansTable.tier,
        anomaly: scansTable.anomalyType,
        createdAt: scansTable.createdAt,
      })
      .from(scansTable)
      .innerJoin(membersTable, eq(membersTable.id, scansTable.memberId))
      .where(and(...whereConditions))
      .orderBy(sql`${scansTable.score} DESC`, sql`${scansTable.createdAt} ASC`)
      .limit(100);

    const entries = rows.map((r, index) => ({
      rank: index + 1,
      scanId: r.id,
      username: r.username,
      category: r.category,
      score: r.score,
      tier: r.tier,
      anomaly: r.anomaly,
      createdAt: r.createdAt,
      permalink: `${baseUrl}/scan/${r.id}`,
    }));

    res.setHeader("Cache-Control", "public, max-age=10, s-maxage=30");
    res.json({
      window,
      scope: scope.toString().toUpperCase(),
      entries,
    });
  } catch (err) {
    next(err);
  }
});

export default router;
