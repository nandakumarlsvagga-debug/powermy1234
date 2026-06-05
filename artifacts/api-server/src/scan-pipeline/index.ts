import { db, scansTable, pendingCleanupsTable, dailyScanCountsTable } from "@workspace/db";
import { and, eq, gte, sql } from "drizzle-orm";
import { processImage, ImageInvalidError } from "@workspace/images";
import { sanitizeDescription } from "@workspace/description-sanitizer";
import { moderate, ModerationUnavailableError } from "@workspace/moderation";
import { analyzeImage, type VisionRequest } from "@workspace/vision";
import { getSupabaseAdmin } from "../lib/supabase.js";
import { apiError } from "../lib/errors.js";
import { getLocalDayBounds, getLocalMidnightInUtc } from "../lib/timezone.js";
import { createRateLimiter } from "@workspace/ratelimit";
import crypto from "node:crypto";
import { logger } from "../lib/logger.js";

function computeStableSeed(
  memberId: string | null,
  anonSessionId: string | null,
  pHash: string,
  category: string
): string {
  const parts = [memberId || "", anonSessionId || "", pHash, category];
  return crypto.createHash("sha256").update(parts.join("")).digest("hex");
}

export interface ScanPipelineInput {
  imageBytes: Buffer;
  declaredMime: string;
  category: "SETUPS" | "FITNESS" | "DRIP" | "PETS" | "RIDES" | "WILDCARD";
  description?: string;
  localDate: string;
  localTz?: string;
  memberId: string | null;
  anonSessionId: string | null;
  clientIp: string;
  baseUrl: string;
}

export interface ScanPipelineResult {
  scan: any;
  reveal: {
    serverElapsedMs: number;
    revealVariant: "standard" | "power_surge" | "forbidden_aura" | "scouter_failure" | "unregistered_energy" | "chaos_spike";
  };
}

export async function runScanPipeline(input: ScanPipelineInput): Promise<ScanPipelineResult> {
  const tStart = Date.now();
  const {
    imageBytes,
    declaredMime,
    category,
    description,
    localDate,
    localTz,
    memberId,
    anonSessionId,
    clientIp,
    baseUrl,
  } = input;

  // 1. Rate Limiting (IP and Member)
  const limiter = createRateLimiter({ db });
  
  const ipKey = `scan:ip:${clientIp}`;
  const ipLimit = await limiter.consume(ipKey, 10, 10 / 3600);
  if (!ipLimit.ok) {
    logger.warn({ key: ipKey, retryAfterSec: ipLimit.retryAfterSec }, "ratelimit.reject");
    throw apiError.rateLimited(ipLimit.retryAfterSec);
  }

  if (memberId) {
    const memberKey = `scan:member:${memberId}`;
    const memberLimit = await limiter.consume(memberKey, 30, 30 / 3600);
    if (!memberLimit.ok) {
      logger.warn({ key: memberKey, retryAfterSec: memberLimit.retryAfterSec }, "ratelimit.reject");
      throw apiError.rateLimited(memberLimit.retryAfterSec);
    }
  }

  // 2. Daily Limit Checks
  const tz = localTz || "UTC";
  const { startOfDay, resetAt } = getLocalDayBounds(new Date(), tz);

  if (!memberId) {
    if (!anonSessionId) {
      throw apiError.unauthenticated("Anonymous session required for guest scan.");
    }
    // Count guest scans in their local day
    const [{ count }] = await db
      .select({ count: sql<number>`count(*)` })
      .from(scansTable)
      .where(
        and(
          eq(scansTable.anonSessionId, anonSessionId),
          gte(scansTable.createdAt, startOfDay)
        )
      );

    if (Number(count) >= 1) {
      throw apiError.dailyLimitReached(resetAt, "Anonymous daily limit reached.");
    }
  } else {
    // Count member scans in UTC day
    const utcDay = new Date().toISOString().slice(0, 10);
    const memberCounts = await db
      .select()
      .from(dailyScanCountsTable)
      .where(
        and(
          eq(dailyScanCountsTable.memberId, memberId),
          eq(dailyScanCountsTable.utcDay, utcDay)
        )
      );

    const currentCount = memberCounts.length > 0 ? memberCounts[0].count : 0;
    const nextUtcMidnight = new Date();
    nextUtcMidnight.setUTCHours(24, 0, 0, 0);

    if (currentCount >= 25) {
      throw apiError.dailyLimitReached(nextUtcMidnight, "Member daily limit reached.");
    }
  }

  // 3. Image Validation via @workspace/images
  let processedImage;
  try {
    processedImage = await processImage({ bytes: imageBytes, declaredMime });
  } catch (err) {
    if (err instanceof ImageInvalidError) {
      throw apiError.imageInvalid(err.message, err.reason);
    }
    throw err;
  }

  // 4. Description Sanitization
  const sanitizedDesc = description ? sanitizeDescription(description).sanitized : null;

  // 5. Moderation Check via @workspace/moderation
  try {
    const modVerdict = await moderate(processedImage.processed);
    if (!modVerdict.ok) {
      throw apiError.moderationRejected(modVerdict.flaggedLabels);
    }
  } catch (err) {
    if (err instanceof ModerationUnavailableError) {
      throw apiError.moderationUnavailable(err.message);
    }
    throw err;
  }

  // 6. Supabase Storage Upload
  const scanId = crypto.randomUUID();
  const now = new Date();
  const yyyy = String(now.getUTCFullYear());
  const mm = String(now.getUTCMonth() + 1).padStart(2, "0");

  const imageObjectKey = `scans/${yyyy}/${mm}/${scanId}.${processedImage.format}`;
  const thumbnailObjectKey = `scans/${yyyy}/${mm}/${scanId}.thumb.webp`;

  // Write pending cleanup entry
  await db.insert(pendingCleanupsTable).values({
    scanId,
    imageObjectKey,
    thumbnailObjectKey,
  });

  const supabase = getSupabaseAdmin();
  try {
    const [imgUpload, thumbUpload] = await Promise.all([
      supabase.storage.from("scan-images").upload(imageObjectKey, processedImage.processed, {
        contentType: `image/${processedImage.format}`,
        upsert: true,
      }),
      supabase.storage.from("scan-images").upload(thumbnailObjectKey, processedImage.thumbnail, {
        contentType: "image/webp",
        upsert: true,
      }),
    ]);

    if (imgUpload.error) throw imgUpload.error;
    if (thumbUpload.error) throw thumbUpload.error;
  } catch (storageErr) {
    logger.error({ err: storageErr, scanId }, "Storage upload failed");
    throw apiError.internal("Failed to upload image to storage");
  }

  // 7. Vision Analysis & Scoring
  const seedHex = computeStableSeed(memberId, anonSessionId, processedImage.perceptualHash, category);
  
  // Decide what bytes to send to Bedrock.
  // Since Bedrock doesn't support AVIF, we pass processed WebP or the WebP thumbnail.
  const bedrockImageBytes = processedImage.format === "webp" ? processedImage.processed : processedImage.thumbnail;

  const visionRequest: VisionRequest = {
    imageBytes: bedrockImageBytes,
    imageMediaType: "image/webp",
    category,
    description: sanitizedDesc,
    perceptualHash: processedImage.perceptualHash,
  };

  const visionResult = await analyzeImage(visionRequest);

  // 8. DB Persistence (in a single database transaction)
  const expiresAt = memberId ? null : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // guests expire in 30 days
  const utcDay = new Date().toISOString().slice(0, 10);

  let username: string | null = null;
  if (memberId) {
    const memberRows = await db
      .select({ username: sql<string>`username` })
      .from(sql`members`)
      .where(sql`id = ${memberId}`);
    if (memberRows.length > 0) {
      username = memberRows[0].username;
    }
  }

  await db.transaction(async (tx) => {
    // Write scans table
    await tx.insert(scansTable).values({
      id: scanId,
      memberId,
      anonSessionId: memberId ? null : anonSessionId,
      category,
      description: sanitizedDesc,
      score: visionResult.rendered.score,
      tier: visionResult.rendered.tier,
      coreStats: visionResult.rendered.coreStats,
      categoryStats: visionResult.rendered.categoryStats,
      commentary: visionResult.commentary,
      commentarySource: visionResult.commentarySource === "model" ? "model" : "fallback",
      anomalyType: visionResult.anomaly?.anomalyType ?? null,
      anomalyModifierPct: visionResult.anomaly ? String(visionResult.anomaly.modifierPct) : null,
      scorePreAnomaly: visionResult.scorePreAnomaly,
      culturalReading: visionResult.culturalReading,
      verdictNoun: visionResult.rendered.verdictNoun,
      modifiersApplied: visionResult.rendered.modifiersApplied,
      scorePreModifiers: visionResult.rendered.scorePreModifiers,
      imageObjectKey,
      thumbnailObjectKey,
      imagePerceptualHash: processedImage.perceptualHash,
      modelResponse: visionResult.culturalReading,
      expiresAt,
    });

    // Increment member daily scan counts
    if (memberId) {
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
    }

    // Delete pending cleanup record
    await tx.delete(pendingCleanupsTable).where(eq(pendingCleanupsTable.scanId, scanId));
  });

  // Emit event
  logger.info(
    {
      scanId,
      memberId,
      category,
      score: visionResult.rendered.score,
      tier: visionResult.rendered.tier,
      anomaly: visionResult.anomaly?.anomalyType ?? null,
    },
    "scan.created"
  );

  // 9. Pre-warm Share Cards (fire-and-forget, silent errors)
  const preWarm = async () => {
    const ratios = ["story", "square", "landscape"];
    for (const ratio of ratios) {
      fetch(`${baseUrl}/api/scans/${scanId}/share-card.png?ratio=${ratio}`).catch((err) => {
        logger.error({ err, scanId, ratio }, "Share card pre-warm failed");
      });
    }
  };
  preWarm();

  // 10. Generate Signed URLs for the response
  const [imgSigned, thumbSigned] = await Promise.all([
    supabase.storage.from("scan-images").createSignedUrl(imageObjectKey, 24 * 60 * 60),
    supabase.storage.from("scan-images").createSignedUrl(thumbnailObjectKey, 24 * 60 * 60),
  ]);

  const imageUrl = imgSigned.data?.signedUrl ?? "";
  const thumbnailUrl = thumbSigned.data?.signedUrl ?? "";

  const permalink = `${baseUrl}/scan/${scanId}`;
  const shareCardUrls = {
    story: `${baseUrl}/api/scans/${scanId}/share-card.png?ratio=story`,
    square: `${baseUrl}/api/scans/${scanId}/share-card.png?ratio=square`,
    landscape: `${baseUrl}/api/scans/${scanId}/share-card.png?ratio=landscape`,
  };

  const elapsed = Date.now() - tStart;

  // Map anomaly type to reveal variant
  let revealVariant: "standard" | "power_surge" | "forbidden_aura" | "scouter_failure" | "unregistered_energy" | "chaos_spike" = "standard";
  if (visionResult.anomaly) {
    const at = visionResult.anomaly.anomalyType;
    if (at === "POWER_SURGE_DETECTED") revealVariant = "power_surge";
    else if (at === "FORBIDDEN_AURA") revealVariant = "forbidden_aura";
    else if (at === "SCOUTER_FAILURE") revealVariant = "scouter_failure";
    else if (at === "UNREGISTERED_ENERGY") revealVariant = "unregistered_energy";
    else if (at === "CHAOS_SPIKE") revealVariant = "chaos_spike";
  }

  return {
    scan: {
      id: scanId,
      username,
      category,
      score: visionResult.rendered.score,
      tier: visionResult.rendered.tier,
      verdictNoun: visionResult.rendered.verdictNoun,
      coreStats: visionResult.rendered.coreStats,
      categoryStats: visionResult.rendered.categoryStats,
      commentary: visionResult.commentary,
      description: sanitizedDesc,
      anomaly: visionResult.anomaly?.anomalyType ?? null,
      imageUrl,
      thumbnailUrl,
      createdAt: now,
      permalink,
      shareCardUrls,
      likeCount: 0,
      likedByMe: false,
    },
    reveal: {
      serverElapsedMs: elapsed,
      revealVariant,
    },
  };
}
