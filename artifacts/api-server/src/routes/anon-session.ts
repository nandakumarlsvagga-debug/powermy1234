import { Router, type IRouter } from "express";
import { CreateAnonSessionBody, CreateAnonSessionResponse } from "@workspace/api-zod";
import { db, anonSessionsTable, scansTable } from "@workspace/db";
import { and, eq, gte, sql } from "drizzle-orm";
import { apiError } from "../lib/errors.js";
import { readAnonCookie, setAnonCookie } from "../lib/cookies.js";
import { isValidTimezone, getLocalDayBounds } from "../lib/timezone.js";

const router: IRouter = Router();

router.post("/anon/session", async (req, res, next) => {
  try {
    const result = CreateAnonSessionBody.safeParse(req.body);
    if (!result.success) {
      const firstError = result.error.errors[0];
      throw apiError.invalidInput(firstError.message, {
        field: firstError.path.join("."),
        rule: firstError.code,
      });
    }

    const { fingerprint, localTz } = result.data;

    if (localTz && !isValidTimezone(localTz)) {
      throw apiError.invalidInput("Invalid localTz", { field: "localTz" });
    }

    let anonSessionId = readAnonCookie(req);
    let sessionExists = false;

    if (anonSessionId) {
      const rows = await db
        .select()
        .from(anonSessionsTable)
        .where(eq(anonSessionsTable.id, anonSessionId));
      if (rows.length > 0) {
        sessionExists = true;
        // Update timezone and lastSeenAt
        await db
          .update(anonSessionsTable)
          .set({
            localTz: localTz ?? rows[0].localTz,
            lastSeenAt: new Date(),
          })
          .where(eq(anonSessionsTable.id, anonSessionId));
      }
    }

    if (!sessionExists) {
      anonSessionId = crypto.randomUUID();
      await db.insert(anonSessionsTable).values({
        id: anonSessionId,
        fingerprint,
        localTz: localTz ?? null,
      });
    }

    // Determine the timezone to use for local-day boundary calculations
    const tz = localTz || "UTC";
    const { startOfDay, resetAt } = getLocalDayBounds(new Date(), tz);

    // Count anonymous scans in the current local day
    const [{ count }] = await db
      .select({ count: sql<number>`count(*)` })
      .from(scansTable)
      .where(
        and(
          eq(scansTable.anonSessionId, anonSessionId!),
          gte(scansTable.createdAt, startOfDay)
        )
      );

    setAnonCookie(res, anonSessionId!);

    const responseData = CreateAnonSessionResponse.parse({
      anonSessionId,
      dailyQuota: {
        used: Number(count),
        limit: 1,
        resetAt,
      },
    });

    res.json(responseData);
  } catch (error) {
    next(error);
  }
});

export default router;
