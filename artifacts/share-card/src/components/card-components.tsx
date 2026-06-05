import React from "react";
import { COLORS, TIER_ACCENTS } from "@workspace/design-tokens";
import { renderQrSvg } from "@workspace/qr";

export const Wordmark = ({ width = 240, height }: { width?: number | string; height?: number | string }) => (
  <svg
    role="img"
    aria-label="POWERLVL"
    viewBox="0 0 720 120"
    width={width}
    height={height}
    fill={COLORS.white}
  >
    <title>POWERLVL</title>
    {/* P */}
    <path d="M30 18 H78 a30 30 0 0 1 0 60 H50 V102 H30 Z M50 36 V60 H78 a12 12 0 0 0 0 -24 Z" />
    {/* O */}
    <path d="M132 16 a44 44 0 0 1 44 44 v0 a44 44 0 0 1 -88 0 v0 a44 44 0 0 1 44 -44 Z M132 36 a24 24 0 0 0 -24 24 v0 a24 24 0 0 0 48 0 v0 a24 24 0 0 0 -24 -24 Z" />
    {/* W */}
    <path d="M196 18 H216 L228 78 L240 18 H260 L272 78 L284 18 H304 L284 102 H264 L250 42 L236 102 H216 Z" />
    {/* E */}
    <path d="M318 18 H378 V36 H338 V52 H372 V70 H338 V84 H378 V102 H318 Z" />
    {/* R */}
    <path d="M392 18 H440 a28 28 0 0 1 14 52 L470 102 H448 L434 72 H412 V102 H392 Z M412 36 V54 H440 a9 9 0 0 0 0 -18 Z" />
    {/* L */}
    <path d="M488 18 H508 V84 H548 V102 H488 Z" />
    {/* V */}
    <path d="M558 18 H578 L598 76 L618 18 H638 L608 102 H588 Z" />
    {/* L */}
    <path d="M650 18 H670 V84 H710 V102 H650 Z" />
  </svg>
);

export const ScannedImage = ({
  imageUrl,
  width,
  height,
  style,
}: {
  imageUrl: string;
  width?: number | string;
  height?: number | string;
  style?: React.CSSProperties;
}) => (
  <img src={imageUrl} width={width} height={height} style={{ objectFit: "cover", ...style }} />
);

export const Score = ({ score, style }: { score: number; style?: React.CSSProperties }) => (
  <div
    style={{
      fontFamily: "Geist Mono",
      color: COLORS.amber,
      fontWeight: 600,
      display: "flex",
      ...style,
    }}
  >
    {score}
  </div>
);

export const TierBadge = ({ tier }: { tier: string }) => {
  const accent = TIER_ACCENTS[tier as keyof typeof TIER_ACCENTS] || TIER_ACCENTS.D;
  const isLimitless = tier === "LIMITLESS";

  const badgeStyle: React.CSSProperties = {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: "2px",
    borderStyle: "solid",
    borderColor: isLimitless ? "#FFE082" : accent,
    borderRadius: "4px",
    padding: "4px 12px",
    backgroundColor: "rgba(26, 26, 29, 0.8)",
  };

  const textStyle: React.CSSProperties = {
    fontFamily: "Geist Mono",
    fontWeight: 700,
    fontSize: "24px",
    color: isLimitless ? "#FFE082" : accent,
  };

  return (
    <div style={badgeStyle}>
      <span style={textStyle}>{tier}</span>
    </div>
  );
};

export const CoreStatsGrid = ({
  coreStats,
  accentColor,
}: {
  coreStats: { aura: number; power: number; status: number; threat: number };
  accentColor: string;
}) => {
  const statItems = [
    { label: "AURA", value: coreStats.aura ?? 0 },
    { label: "POWER", value: coreStats.power ?? 0 },
    { label: "STATUS", value: coreStats.status ?? 0 },
    { label: "THREAT", value: coreStats.threat ?? 0 },
  ];

  const renderItem = (stat: typeof statItems[0]) => {
    const percentage = Math.min(100, Math.max(0, (stat.value / 10000) * 100));
    return (
      <div
        key={stat.label}
        style={{
          display: "flex",
          flexDirection: "column",
          flex: 1,
          backgroundColor: "rgba(26, 26, 29, 0.6)",
          border: "1px solid #2A2A2D",
          borderRadius: "4px",
          padding: "12px",
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            marginBottom: "6px",
            alignItems: "center",
          }}
        >
          <span style={{ fontFamily: "Geist", fontSize: "14px", color: "#8E8E93" }}>
            {stat.label}
          </span>
          <span
            style={{
              fontFamily: "Geist Mono",
              fontSize: "14px",
              color: COLORS.white,
              fontWeight: 500,
            }}
          >
            {stat.value}
          </span>
        </div>
        <div
          style={{
            width: "100%",
            height: "4px",
            backgroundColor: "#2A2A2D",
            borderRadius: "2px",
            overflow: "hidden",
            display: "flex",
          }}
        >
          <div
            style={{
              width: `${percentage}%`,
              height: "100%",
              backgroundColor: accentColor,
            }}
          />
        </div>
      </div>
    );
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", width: "100%", gap: "16px" }}>
      <div style={{ display: "flex", width: "100%", gap: "16px" }}>
        {renderItem(statItems[0])}
        {renderItem(statItems[1])}
      </div>
      <div style={{ display: "flex", width: "100%", gap: "16px" }}>
        {renderItem(statItems[2])}
        {renderItem(statItems[3])}
      </div>
    </div>
  );
};

export const Commentary = ({ text, style }: { text: string; style?: React.CSSProperties }) => (
  <div
    style={{
      fontFamily: "Geist",
      fontSize: "20px",
      lineHeight: "1.4",
      color: COLORS.white,
      fontStyle: "italic",
      textAlign: "center",
      display: "flex",
      justifyContent: "center",
      ...style,
    }}
  >
    "{text}"
  </div>
);

export const DescriptionLine = ({ text }: { text: string | null }) => {
  if (!text) return null;
  return (
    <div
      style={{
        fontFamily: "Geist",
        fontSize: "14px",
        color: "#8E8E93",
        textAlign: "center",
        display: "flex",
        justifyContent: "center",
      }}
    >
      Context: "{text}"
    </div>
  );
};

export const AnomalyBadge = ({ anomaly }: { anomaly: string | null }) => {
  if (!anomaly) return null;
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        backgroundColor: "rgba(245, 166, 35, 0.15)",
        border: `1px solid ${COLORS.amber}`,
        borderRadius: "4px",
        padding: "4px 8px",
      }}
    >
      <span
        style={{
          fontFamily: "Geist Mono",
          fontSize: "12px",
          color: COLORS.amber,
          fontWeight: 600,
          letterSpacing: "1px",
        }}
      >
        {anomaly.replace(/_/g, " ")}
      </span>
    </div>
  );
};

export const VerificationCorner = ({
  scanId,
  size,
  baseUrl,
}: {
  scanId: string;
  size: number;
  baseUrl: string;
}) => {
  const permalink = `${baseUrl}/scan/${scanId}`;
  const qrSvg = renderQrSvg(permalink, { size });
  const qrDataUrl = `data:image/svg+xml;base64,${Buffer.from(qrSvg).toString("base64")}`;

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: "6px",
      }}
    >
      <img src={qrDataUrl} width={size} height={size} style={{ borderRadius: "4px" }} />
      <span
        style={{
          fontFamily: "Geist Mono",
          fontSize: "10px",
          color: "#8E8E93",
          letterSpacing: "0.5px",
        }}
      >
        VERIFIED
      </span>
    </div>
  );
};

export const MetaFooter = ({
  username,
  category,
  createdAt,
}: {
  username: string | null;
  category: string;
  createdAt: Date | string;
}) => {
  const dateStr = new Date(createdAt).toISOString().slice(0, 10);
  const displayUser = username ? `@${username}` : "GUEST SCAN";

  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        width: "100%",
        borderTop: "1px solid #2A2A2D",
        paddingTop: "12px",
        marginTop: "auto",
      }}
    >
      <span
        style={{
          fontFamily: "Geist Mono",
          fontSize: "14px",
          color: COLORS.white,
          fontWeight: 500,
        }}
      >
        {displayUser}
      </span>
      <span
        style={{
          fontFamily: "Geist Mono",
          fontSize: "14px",
          color: "#8E8E93",
        }}
      >
        {category.toUpperCase()} // {dateStr}
      </span>
    </div>
  );
};
