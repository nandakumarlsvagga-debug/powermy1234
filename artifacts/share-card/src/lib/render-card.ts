import { createHash } from "node:crypto";
import { Resvg } from "@resvg/resvg-js";
import satori from "satori";
import { db } from "./db.js";
import { getSupabaseAdmin } from "./supabase.js";
import { scansTable, membersTable } from "@workspace/db";
import { eq, and, isNull } from "drizzle-orm";
import { loadFonts } from "./fonts.js";
import React from "react";
import { StoryLayout, SquareLayout, LandscapeLayout } from "../layouts/index.js";

export async function renderCard(
  scanId: string,
  ratio: "story" | "square" | "landscape",
  baseUrl: string,
) {
  // Query scan + join members to get username
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
      anomalyType: scansTable.anomalyType,
      imageObjectKey: scansTable.imageObjectKey,
      thumbnailObjectKey: scansTable.thumbnailObjectKey,
      createdAt: scansTable.createdAt,
    })
    .from(scansTable)
    .leftJoin(membersTable, eq(membersTable.id, scansTable.memberId))
    .where(and(eq(scansTable.id, scanId), isNull(scansTable.expiredAt)));

  if (rows.length === 0) {
    return null;
  }
  const scan = rows[0];

  // Get signed URL from Supabase private storage (valid for 24h)
  const supabase = getSupabaseAdmin();
  const signed = await supabase.storage
    .from("scan-images")
    .createSignedUrl(scan.imageObjectKey, 24 * 60 * 60);
  const imageUrl = signed.data?.signedUrl ?? "";

  // Select layout and dimensions
  let element: React.ReactElement;
  let width: number;
  let height: number;

  const props = {
    scan: scan as any,
    imageUrl,
    baseUrl,
  };

  if (ratio === "story") {
    element = React.createElement(StoryLayout, props);
    width = 1080;
    height = 1920;
  } else if (ratio === "square") {
    element = React.createElement(SquareLayout, props);
    width = 1080;
    height = 1080;
  } else {
    element = React.createElement(LandscapeLayout, props);
    width = 1200;
    height = 628;
  }

  // Load fonts descriptors and subset binary chunks from disk
  const fonts = await loadFonts();

  // Render SVG via Satori
  const svg = await satori(element, {
    width,
    height,
    fonts,
  });

  // Convert SVG to PNG via resvg-js
  const resvg = new Resvg(svg, {
    fitTo: {
      mode: "width",
      value: width,
    },
  });
  const pngBuffer = resvg.render().asPng();

  // Compute deterministic ETag
  const etag = createHash("sha256")
    .update(`${scanId}-${ratio}-v1`)
    .digest("hex");

  return { pngBuffer, svg, etag };
}
