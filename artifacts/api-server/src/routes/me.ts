import { Router, type IRouter } from "express";
import { db, scansTable, membersTable, dailyScanCountsTable, likesTable } from "@workspace/db";
import { and, eq, isNull, sql } from "drizzle-orm";
import { authenticate } from "../lib/auth.js";
import { readAnonCookie, clearAnonCookie } from "../lib/cookies.js";
import { apiError } from "../lib/errors.js";
import { getSupabaseAdmin } from "../lib/supabase.js";

const router: IRouter = Router();

const USERNAME_RE = /^[a-z0-9_]{3,20}$/;

// GET /api/me
router.get("/me", async (req, res, next) => {
  try {
    const auth = await authenticate(req);
    if (!auth) {
      throw apiError.unauthenticated();
    }
    const memberId = auth.memberId;

    const memberRows = await db.select().from(membersTable).where(eq(membersTable.id, memberId));
    const memberExists = memberRows.length > 0;
    const member = memberExists
      ? {
          username: memberRows[0].username,
          avatarInitials: memberRows[0].username.substring(0, 1).toUpperCase(),
        }
      : null;

    const needsUsername = !memberExists;

    // Fetch daily scan counts for the current UTC day
    const utcDay = new Date().toISOString().slice(0, 10);
    const countRows = await db
      .select()
      .from(dailyScanCountsTable)
      .where(and(eq(dailyScanCountsTable.memberId, memberId), eq(dailyScanCountsTable.utcDay, utcDay)));
    
    const used = countRows.length > 0 ? countRows[0].count : 0;
    const nextUtcMidnight = new Date();
    nextUtcMidnight.setUTCHours(24, 0, 0, 0);

    // Fetch claim-eligible scans matching caller's anon session cookie
    const anonSessionId = readAnonCookie(req);
    const claimableScanIds: string[] = [];
    if (anonSessionId) {
      const unclaimedScans = await db
        .select({ id: scansTable.id })
        .from(scansTable)
        .where(and(eq(scansTable.anonSessionId, anonSessionId), isNull(scansTable.memberId)));
      for (const s of unclaimedScans) {
        claimableScanIds.push(s.id);
      }
    }

    res.json({
      member,
      needsUsername,
      dailyQuota: {
        used,
        limit: 25,
        resetAt: nextUtcMidnight,
      },
      claimableScanIds,
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/me/username
router.post("/me/username", async (req, res, next) => {
  try {
    const auth = await authenticate(req);
    if (!auth) {
      throw apiError.unauthenticated();
    }
    const memberId = auth.memberId;

    const { username } = req.body;
    if (!username) {
      throw apiError.invalidInput("username is required", { field: "username" });
    }

    if (username.length < 3 || username.length > 20) {
      throw apiError.invalidInput("Username must be between 3 and 20 characters.", { field: "username", rule: "length" });
    }

    if (!USERNAME_RE.test(username)) {
      throw apiError.invalidInput("Username must contain only lowercase letters, numbers, and underscores.", {
        field: "username",
        rule: "chars",
      });
    }

    // Check if the user already has a username registered
    const existingSelf = await db.select().from(membersTable).where(eq(membersTable.id, memberId));
    if (existingSelf.length > 0) {
      throw apiError.forbidden("Username is already set and cannot be changed.");
    }

    // Case-insensitive uniqueness check
    const existingOther = await db
      .select()
      .from(membersTable)
      .where(sql`lower(${membersTable.username}) = ${username.toLowerCase()}`);
    if (existingOther.length > 0) {
      throw apiError.invalidInput("Username already taken.", { field: "username", rule: "uniqueness" });
    }

    // Create the member row
    await db.insert(membersTable).values({
      id: memberId,
      username,
    });

    res.json({
      member: {
        username,
        avatarInitials: username.substring(0, 1).toUpperCase(),
      },
    });
  } catch (err) {
    next(err);
  }
});

// DELETE /api/me
router.post("/me/delete-account", async (req, res, next) => {
  // Wait, let's map the express route to DELETE /me. In Express router we can map .delete('/me')
  // But wait! Is there a reason to implement both?
  // Let's implement DELETE /me, which is the standard endpoint.
});

// Let's put DELETE handler below as router.delete('/me') instead of post.
router.delete("/me", async (req, res, next) => {
  try {
    const auth = await authenticate(req);
    if (!auth) {
      throw apiError.unauthenticated();
    }
    const memberId = auth.memberId;

    // 1. List all scans to find storage keys to delete
    const scans = await db
      .select({
        imageObjectKey: scansTable.imageObjectKey,
        thumbnailObjectKey: scansTable.thumbnailObjectKey,
      })
      .from(scansTable)
      .where(eq(scansTable.memberId, memberId));

    const keysToDelete = scans.flatMap(s => [s.imageObjectKey, s.thumbnailObjectKey]).filter(Boolean);

    // 2. Delete storage assets first
    const supabase = getSupabaseAdmin();
    if (keysToDelete.length > 0) {
      const { error } = await supabase.storage.from("scan-images").remove(keysToDelete);
      if (error) {
        throw apiError.internal("Failed to delete user storage assets. Deletion aborted.");
      }
    }

    // 3. Delete database records in a transaction
    await db.transaction(async (tx) => {
      // Delete likes
      await tx.delete(likesTable).where(eq(likesTable.memberId, memberId));
      // Delete scans
      await tx.delete(scansTable).where(eq(scansTable.memberId, memberId));
      // Delete daily scan counts
      await tx.delete(dailyScanCountsTable).where(eq(dailyScanCountsTable.memberId, memberId));
      // Delete member row
      await tx.delete(membersTable).where(eq(membersTable.id, memberId));
    });

    // 4. Delete user from Supabase Auth admin client
    const { error: authError } = await supabase.auth.admin.deleteUser(memberId);
    if (authError) {
      // Log it but the DB records are already gone. The user is cleaned up in DB.
      // We still throw an internal error if it fails.
      throw apiError.internal("Failed to delete user authentication record.");
    }

    clearAnonCookie(res);
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});

export default router;
