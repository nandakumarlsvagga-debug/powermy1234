/**
 * Internal background job endpoints.
 *
 * These endpoints are called by Vercel Cron and are NOT user-facing.
 * They are authenticated via a shared `INTERNAL_JOB_SECRET` secret in
 * the `Authorization: Bearer <secret>` header to prevent unauthorized
 * invocation.
 *
 * Task 15.1 — POST /api/internal/jobs/anonymous-scan-purge
 * Task 15.2 — POST /api/internal/jobs/pending-cleanup-reconciler
 *
 * Requirements: 2.7, 2.8, 2.9
 */

import { Router, type IRouter } from "express";
import {
  db,
  scansTable,
  pendingCleanupsTable,
} from "@workspace/db";
import { and, isNull, lt, isNotNull, eq } from "drizzle-orm";
import { getSupabaseAdmin } from "../lib/supabase.js";
import { apiError } from "../lib/errors.js";
import { logger } from "../lib/logger.js";

const router: IRouter = Router();

/**
 * Verify the shared internal job secret from the Authorization header.
 * Returns true when authenticated, false otherwise.
 */
function verifyJobSecret(authHeader: string | undefined): boolean {
  const secret = process.env.INTERNAL_JOB_SECRET;
  if (!secret) {
    // If no secret configured, reject all requests to prevent accidental exposure
    return false;
  }
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return false;
  }
  const provided = authHeader.slice("Bearer ".length).trim();
  // Constant-time comparison to prevent timing attacks
  if (provided.length !== secret.length) return false;
  let diff = 0;
  for (let i = 0; i < provided.length; i++) {
    diff |= provided.charCodeAt(i) ^ secret.charCodeAt(i);
  }
  return diff === 0;
}

/**
 * POST /api/internal/jobs/anonymous-scan-purge
 *
 * Finds all anonymous Scans whose `expires_at` has passed but whose
 * `expired_at` is still null. For each:
 *   1. Delete the image object from Supabase Storage.
 *   2. Delete the thumbnail object from Supabase Storage.
 *   3. Set `expired_at = now()` on the scan row.
 *
 * Image purge happens BEFORE the row is marked expired so that a
 * crash/timeout between steps 2 and 3 leaves the row in a
 * "storage-purged but row not yet marked" state — which the
 * reconciler (task 15.2) can clean up on the next run.
 *
 * Property 28: Expired Permalink Unverified — after purge,
 * GET /api/scans/{id} returns 404 + UNVERIFIED view.
 * Property 29: Image Purge Before Record Expiry — for every row
 * with expired_at IS NOT NULL, storage objects do not exist.
 *
 * Requirements: 2.9
 */
router.post("/internal/jobs/anonymous-scan-purge", async (req, res, next) => {
  try {
    if (!verifyJobSecret(req.headers["authorization"])) {
      throw apiError.unauthenticated("Invalid job secret");
    }

    const now = new Date();
    const supabase = getSupabaseAdmin();

    // Find all expired-but-not-yet-purged anonymous scans
    const expiredScans = await db
      .select({
        id: scansTable.id,
        imageObjectKey: scansTable.imageObjectKey,
        thumbnailObjectKey: scansTable.thumbnailObjectKey,
      })
      .from(scansTable)
      .where(
        and(
          isNotNull(scansTable.expiresAt),
          lt(scansTable.expiresAt, now),
          isNull(scansTable.expiredAt)
        )
      );

    logger.info({ count: expiredScans.length }, "anonymous-scan-purge: found expired scans");

    let purgedCount = 0;
    let errorCount = 0;

    for (const scan of expiredScans) {
      try {
        // Step 1: Delete the image from storage FIRST (before marking row expired)
        const { error: imgError } = await supabase.storage
          .from("scan-images")
          .remove([scan.imageObjectKey]);

        if (imgError) {
          logger.error(
            { err: imgError, scanId: scan.id, key: scan.imageObjectKey },
            "anonymous-scan-purge: failed to delete image from storage"
          );
          errorCount++;
          continue;
        }

        // Step 2: Delete the thumbnail from storage
        const { error: thumbError } = await supabase.storage
          .from("scan-images")
          .remove([scan.thumbnailObjectKey]);

        if (thumbError) {
          logger.error(
            { err: thumbError, scanId: scan.id, key: scan.thumbnailObjectKey },
            "anonymous-scan-purge: failed to delete thumbnail from storage"
          );
          errorCount++;
          continue;
        }

        // Step 3: Mark row as expired ONLY after both storage deletions succeed
        await db
          .update(scansTable)
          .set({ expiredAt: now })
          .where(
            and(
              eq(scansTable.id, scan.id),
              isNull(scansTable.expiredAt) // idempotent guard
            )
          );

        purgedCount++;
        logger.info({ scanId: scan.id }, "anonymous-scan-purge: scan purged");
      } catch (err) {
        logger.error({ err, scanId: scan.id }, "anonymous-scan-purge: unexpected error");
        errorCount++;
      }
    }

    logger.info(
      { total: expiredScans.length, purgedCount, errorCount },
      "anonymous-scan-purge: job complete"
    );

    res.json({
      ok: true,
      scannedCount: expiredScans.length,
      purgedCount,
      errorCount,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/internal/jobs/pending-cleanup-reconciler
 *
 * Finds all `pending_cleanups` rows that are older than 5 minutes.
 * For each:
 *   1. Delete the orphaned storage objects (image + thumbnail).
 *   2. Remove the `pending_cleanups` row.
 *
 * A `pending_cleanups` row is created at storage-write time in the
 * scan pipeline and is deleted in the same DB transaction that
 * persists the Scan row. If the pipeline crashes after writing to
 * storage but before committing the DB transaction, the
 * `pending_cleanups` row will remain while the `scans` row does not
 * exist — an orphaned storage object. This job cleans those up.
 *
 * Requirements: 2.7, 2.8
 */
router.post("/internal/jobs/pending-cleanup-reconciler", async (req, res, next) => {
  try {
    if (!verifyJobSecret(req.headers["authorization"])) {
      throw apiError.unauthenticated("Invalid job secret");
    }

    const supabase = getSupabaseAdmin();

    // Grace period: 5 minutes. Pending rows younger than this may still
    // be associated with an in-flight pipeline request.
    const GRACE_MS = 5 * 60 * 1000;
    const graceCutoff = new Date(Date.now() - GRACE_MS);

    // Fetch all pending cleanup rows older than the grace period
    const pendingRows = await db
      .select({
        scanId: pendingCleanupsTable.scanId,
        imageObjectKey: pendingCleanupsTable.imageObjectKey,
        thumbnailObjectKey: pendingCleanupsTable.thumbnailObjectKey,
        createdAt: pendingCleanupsTable.createdAt,
      })
      .from(pendingCleanupsTable)
      .where(lt(pendingCleanupsTable.createdAt, graceCutoff));

    logger.info(
      { count: pendingRows.length },
      "pending-cleanup-reconciler: found pending cleanup rows"
    );

    let reconciledCount = 0;
    let errorCount = 0;

    for (const pending of pendingRows) {
      try {
        // Check whether the paired scans row exists (the pipeline may have
        // committed successfully but the cleanup delete within the tx was skipped)
        const existingScan = await db
          .select({ id: scansTable.id })
          .from(scansTable)
          .where(eq(scansTable.id, pending.scanId))
          .limit(1);

        if (existingScan.length > 0) {
          // Scan exists — the pipeline committed but the cleanup row was not deleted.
          // This can happen if the transaction succeeded but the DELETE in the
          // transaction itself was skipped. Simply remove the orphaned cleanup row.
          await db
            .delete(pendingCleanupsTable)
            .where(eq(pendingCleanupsTable.scanId, pending.scanId));

          logger.info(
            { scanId: pending.scanId },
            "pending-cleanup-reconciler: stale cleanup row removed (scan exists)"
          );
          reconciledCount++;
          continue;
        }

        // Scan does not exist — storage objects are truly orphaned. Delete them.
        if (pending.imageObjectKey) {
          const { error: imgError } = await supabase.storage
            .from("scan-images")
            .remove([pending.imageObjectKey]);

          if (imgError) {
            logger.warn(
              { err: imgError, scanId: pending.scanId, key: pending.imageObjectKey },
              "pending-cleanup-reconciler: failed to delete orphaned image (may not exist)"
            );
            // Continue — the file may not exist if a previous run cleaned it up or
            // the storage write itself failed before the object was created.
          }
        }

        if (pending.thumbnailObjectKey) {
          const { error: thumbError } = await supabase.storage
            .from("scan-images")
            .remove([pending.thumbnailObjectKey]);

          if (thumbError) {
            logger.warn(
              { err: thumbError, scanId: pending.scanId, key: pending.thumbnailObjectKey },
              "pending-cleanup-reconciler: failed to delete orphaned thumbnail (may not exist)"
            );
          }
        }

        // Remove the pending cleanup row
        await db
          .delete(pendingCleanupsTable)
          .where(eq(pendingCleanupsTable.scanId, pending.scanId));

        reconciledCount++;
        logger.info(
          { scanId: pending.scanId },
          "pending-cleanup-reconciler: orphaned storage cleaned and cleanup row removed"
        );
      } catch (err) {
        logger.error(
          { err, scanId: pending.scanId },
          "pending-cleanup-reconciler: unexpected error for scan"
        );
        errorCount++;
      }
    }

    logger.info(
      { total: pendingRows.length, reconciledCount, errorCount },
      "pending-cleanup-reconciler: job complete"
    );

    res.json({
      ok: true,
      scannedCount: pendingRows.length,
      reconciledCount,
      errorCount,
    });
  } catch (err) {
    next(err);
  }
});

export default router;
