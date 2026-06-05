import React from "react";
import { COLORS, TIER_ACCENTS } from "@workspace/design-tokens";
import {
  Wordmark,
  ScannedImage,
  Score,
  TierBadge,
  CoreStatsGrid,
  Commentary,
  DescriptionLine,
  AnomalyBadge,
  VerificationCorner,
  MetaFooter,
} from "../components/index.js";
import { type LayoutProps } from "./types.js";

export const StoryLayout = ({ scan, imageUrl, baseUrl }: LayoutProps) => {
  const accentColor = TIER_ACCENTS[scan.tier as keyof typeof TIER_ACCENTS] || TIER_ACCENTS.D;
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        width: "1080px",
        height: "1920px",
        backgroundColor: COLORS.matteBlack,
        color: COLORS.white,
        padding: "64px",
        boxSizing: "border-box",
        justifyContent: "space-between",
      }}
    >
      {/* Top Header */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          width: "100%",
        }}
      >
        <Wordmark width={280} />
        <AnomalyBadge anomaly={scan.anomalyType} />
      </div>

      {/* Scanned Image Section */}
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          width: "100%",
          height: "900px",
          position: "relative",
          borderRadius: "8px",
          overflow: "hidden",
          border: "1px solid #2A2A2D",
          marginTop: "32px",
          marginBottom: "32px",
        }}
      >
        <ScannedImage imageUrl={imageUrl} width={952} height={900} style={{ width: "100%", height: "100%" }} />
        {/* Tier badge absolute overlay */}
        <div style={{ position: "absolute", top: "24px", right: "24px", display: "flex" }}>
          <TierBadge tier={scan.tier} />
        </div>
      </div>

      {/* Score and stats */}
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          width: "100%",
          gap: "32px",
          flexGrow: 1,
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-end",
            width: "100%",
          }}
        >
          <div style={{ display: "flex", flexDirection: "column" }}>
            <span
              style={{
                fontFamily: "Geist Mono",
                fontSize: "14px",
                color: "#8E8E93",
                letterSpacing: "1.5px",
                marginBottom: "8px",
              }}
            >
              POWER LEVEL
            </span>
            <Score score={scan.score} style={{ fontSize: "200px", lineHeight: "170px" }} />
          </div>
          {/* Verdict Noun */}
          <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end" }}>
            <span style={{ fontFamily: "Geist Mono", fontSize: "14px", color: "#8E8E93" }}>
              VERDICT
            </span>
            <span
              style={{
                fontFamily: "Geist",
                fontSize: "36px",
                fontWeight: 700,
                color: accentColor,
                textTransform: "uppercase",
                marginTop: "4px",
              }}
            >
              {scan.verdictNoun}
            </span>
          </div>
        </div>

        <CoreStatsGrid coreStats={scan.coreStats} accentColor={accentColor} />

        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: "16px",
            marginTop: "24px",
            justifyContent: "center",
          }}
        >
          <Commentary text={scan.commentary} />
          <DescriptionLine text={scan.description} />
        </div>
      </div>

      {/* Bottom Area */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-end",
          width: "100%",
          marginTop: "48px",
        }}
      >
        <div style={{ display: "flex", flexDirection: "column", flexGrow: 1, marginRight: "48px" }}>
          <MetaFooter username={scan.username} category={scan.category} createdAt={scan.createdAt} />
        </div>
        <div style={{ display: "flex", marginBottom: "-12px" }}>
          <VerificationCorner scanId={scan.id} size={264} baseUrl={baseUrl} />
        </div>
      </div>
    </div>
  );
};
