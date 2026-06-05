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

export const SquareLayout = ({ scan, imageUrl, baseUrl }: LayoutProps) => {
  const accentColor = TIER_ACCENTS[scan.tier as keyof typeof TIER_ACCENTS] || TIER_ACCENTS.D;
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        width: "1080px",
        height: "1080px",
        backgroundColor: COLORS.matteBlack,
        color: COLORS.white,
        padding: "48px",
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
          height: "60px",
        }}
      >
        <Wordmark width={240} />
        <AnomalyBadge anomaly={scan.anomalyType} />
      </div>

      {/* Main Content Area: Split 2 columns */}
      <div
        style={{
          display: "flex",
          width: "100%",
          height: "720px",
          gap: "40px",
          alignItems: "center",
          marginTop: "24px",
          marginBottom: "24px",
        }}
      >
        {/* Left Column: Image */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            width: "472px",
            height: "100%",
            position: "relative",
            borderRadius: "8px",
            overflow: "hidden",
            border: "1px solid #2A2A2D",
            justifyContent: "center",
          }}
        >
          <ScannedImage imageUrl={imageUrl} width={472} height={720} style={{ width: "100%", height: "100%" }} />
          <div style={{ position: "absolute", top: "20px", right: "20px", display: "flex" }}>
            <TierBadge tier={scan.tier} />
          </div>
        </div>

        {/* Right Column: Score, stats, commentary */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            width: "472px",
            height: "100%",
            justifyContent: "space-between",
          }}
        >
          {/* Score & Verdict Header */}
          <div style={{ display: "flex", flexDirection: "column", width: "100%" }}>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "flex-end",
                width: "100%",
              }}
            >
              <div style={{ display: "flex", flexDirection: "column" }}>
                <span style={{ fontFamily: "Geist Mono", fontSize: "12px", color: "#8E8E93" }}>
                  POWER LEVEL
                </span>
                <Score score={scan.score} style={{ fontSize: "200px", lineHeight: "170px" }} />
              </div>
              <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end" }}>
                <span style={{ fontFamily: "Geist Mono", fontSize: "12px", color: "#8E8E93" }}>
                  VERDICT
                </span>
                <span
                  style={{
                    fontFamily: "Geist",
                    fontSize: "24px",
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
          </div>

          <CoreStatsGrid coreStats={scan.coreStats} accentColor={accentColor} />

          <div style={{ display: "flex", flexDirection: "column", gap: "8px", marginTop: "12px" }}>
            <Commentary text={scan.commentary} style={{ fontSize: "18px" }} />
            <DescriptionLine text={scan.description} />
          </div>
        </div>
      </div>

      {/* Bottom Area */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-end",
          width: "100%",
          height: "110px",
        }}
      >
        <div style={{ display: "flex", flexDirection: "column", flexGrow: 1, marginRight: "48px" }}>
          <MetaFooter username={scan.username} category={scan.category} createdAt={scan.createdAt} />
        </div>
        <div style={{ display: "flex", marginBottom: "-12px" }}>
          <VerificationCorner scanId={scan.id} size={220} baseUrl={baseUrl} />
        </div>
      </div>
    </div>
  );
};
