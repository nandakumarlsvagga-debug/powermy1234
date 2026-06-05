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

export const LandscapeLayout = ({ scan, imageUrl, baseUrl }: LayoutProps) => {
  const accentColor = TIER_ACCENTS[scan.tier as keyof typeof TIER_ACCENTS] || TIER_ACCENTS.D;
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "row",
        width: "1200px",
        height: "628px",
        backgroundColor: COLORS.matteBlack,
        color: COLORS.white,
        padding: "40px",
        boxSizing: "border-box",
        justifyContent: "space-between",
        alignItems: "center",
      }}
    >
      {/* Left Column: Image */}
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          width: "480px",
          height: "480px",
          position: "relative",
          borderRadius: "8px",
          overflow: "hidden",
          border: "1px solid #2A2A2D",
        }}
      >
        <ScannedImage imageUrl={imageUrl} width={480} height={480} style={{ width: "100%", height: "100%" }} />
        <div style={{ position: "absolute", top: "16px", right: "16px", display: "flex" }}>
          <TierBadge tier={scan.tier} />
        </div>
      </div>

      {/* Right Column: All scan details */}
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          width: "600px",
          height: "480px",
          justifyContent: "space-between",
        }}
      >
        {/* Header */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            width: "100%",
          }}
        >
          <Wordmark width={180} />
          <AnomalyBadge anomaly={scan.anomalyType} />
        </div>

        {/* Score and Verdict */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-end",
            width: "100%",
            marginTop: "12px",
            marginBottom: "12px",
          }}
        >
          <div style={{ display: "flex", flexDirection: "column" }}>
            <span style={{ fontFamily: "Geist Mono", fontSize: "12px", color: "#8E8E93" }}>
              POWER LEVEL
            </span>
            <Score score={scan.score} style={{ fontSize: "120px", lineHeight: "100px" }} />
          </div>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end" }}>
            <span style={{ fontFamily: "Geist Mono", fontSize: "12px", color: "#8E8E93" }}>
              VERDICT
            </span>
            <span
              style={{
                fontFamily: "Geist",
                fontSize: "20px",
                fontWeight: 700,
                color: accentColor,
                textTransform: "uppercase",
                marginTop: "2px",
              }}
            >
              {scan.verdictNoun}
            </span>
          </div>
        </div>

        <CoreStatsGrid coreStats={scan.coreStats} accentColor={accentColor} />

        <div style={{ display: "flex", flexDirection: "column", gap: "6px", marginTop: "12px" }}>
          <Commentary text={scan.commentary} style={{ fontSize: "16px" }} />
          <DescriptionLine text={scan.description} />
        </div>

        {/* Footer Area */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-end",
            width: "100%",
            marginTop: "auto",
            paddingTop: "12px",
          }}
        >
          <div style={{ display: "flex", flexDirection: "column", flexGrow: 1, marginRight: "24px" }}>
            <MetaFooter username={scan.username} category={scan.category} createdAt={scan.createdAt} />
          </div>
          <div style={{ display: "flex", marginBottom: "-12px" }}>
            <VerificationCorner scanId={scan.id} size={160} baseUrl={baseUrl} />
          </div>
        </div>
      </div>
    </div>
  );
};
