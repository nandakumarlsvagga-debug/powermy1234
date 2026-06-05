import React, { createContext, useContext, useEffect, useState } from "react";
import { TIER_ACCENTS } from "@workspace/design-tokens";

// ------------------------------------
// Amber Scoped State & Component
// ------------------------------------
const AmberContext = createContext<{
  register: () => () => void;
  setSlamActive: (active: boolean) => void;
  slamActive: boolean;
}>({
  register: () => () => {},
  setSlamActive: () => {},
  slamActive: false,
});

export const AmberProvider = ({ children }: { children: React.ReactNode }) => {
  const [mountedCount, setMountedCount] = useState(0);
  const [slamActive, setSlamActive] = useState(false);

  const register = () => {
    setMountedCount((c) => {
      const next = c + 1;
      // In development, issue a warning if multiple Amber components are active at once in a viewport
      if (next > 1 && !slamActive) {
        console.warn(
          "POWERLVL Warning: More than one <Amber> component is mounted in the current viewport!"
        );
      }
      return next;
    });
    return () => {
      setMountedCount((c) => c - 1);
    };
  };

  return (
    <AmberContext.Provider value={{ register, setSlamActive, slamActive }}>
      {children}
    </AmberContext.Provider>
  );
};

export const useAmberSlam = () => {
  const { setSlamActive } = useContext(AmberContext);
  return setSlamActive;
};

export const Amber = ({ children, className = "", ...props }: React.HTMLAttributes<HTMLSpanElement>) => {
  const { register } = useContext(AmberContext);

  useEffect(() => {
    const unregister = register();
    return unregister;
  }, [register]);

  return (
    <span
      className={`amber-scope text-brand-amber inline-block ${className}`}
      data-amber-scope
      {...props}
    >
      {children}
    </span>
  );
};

// ------------------------------------
// HUD Overlay Scoped Component
// ------------------------------------
export const HudOverlay = ({ children, className = "", ...props }: React.HTMLAttributes<HTMLDivElement>) => {
  return (
    <div
      className={`hud-scope relative w-full h-full overflow-hidden ${className}`}
      data-hud-scope
      {...props}
    >
      {/* High-tech cyan grid mesh scanlines */}
      <div className="absolute inset-0 pointer-events-none bg-[linear-gradient(to_bottom,rgba(94,234,212,0.04)_1px,transparent_1px)] bg-[size:100%_6px] opacity-40" />
      {/* HUD Corners */}
      <div className="absolute top-4 left-4 w-4 h-4 border-t-2 border-l-2 border-hud-cyan opacity-60" />
      <div className="absolute top-4 right-4 w-4 h-4 border-t-2 border-r-2 border-hud-cyan opacity-60" />
      <div className="absolute bottom-4 left-4 w-4 h-4 border-b-2 border-l-2 border-hud-cyan opacity-60" />
      <div className="absolute bottom-4 right-4 w-4 h-4 border-b-2 border-r-2 border-hud-cyan opacity-60" />
      {children}
    </div>
  );
};

// ------------------------------------
// Skeleton Component
// ------------------------------------
export const Skeleton = ({ className = "", ...props }: React.HTMLAttributes<HTMLDivElement>) => {
  return (
    <div
      className={`animate-pulse bg-graphite border border-neutral-800/80 rounded ${className}`}
      {...props}
    />
  );
};

// ------------------------------------
// Button Component
// ------------------------------------
export const Button = ({
  children,
  className = "",
  variant = "primary",
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost";
}) => {
  const baseStyle =
    "font-mono text-sm px-5 py-2.5 rounded font-bold uppercase tracking-wider transition-all duration-150 cursor-pointer select-none active:scale-[0.98] outline-none border flex items-center justify-center gap-2";
  
  if (variant === "primary") {
    return (
      <button
        className={`${baseStyle} border-brand-amber/40 hover:border-brand-amber hover:bg-brand-amber/10 ${className}`}
        {...props}
      >
        <Amber>{children}</Amber>
      </button>
    );
  }

  let variantStyle = "";
  if (variant === "secondary") {
    variantStyle = "text-white border-neutral-800 bg-neutral-900/50 hover:bg-neutral-900";
  } else {
    variantStyle = "text-neutral-400 hover:text-white border-transparent hover:bg-neutral-900/30";
  }

  return (
    <button className={`${baseStyle} ${variantStyle} ${className}`} {...props}>
      {children}
    </button>
  );
};

// ------------------------------------
// Card Component
// ------------------------------------
export const Card = ({ children, className = "", ...props }: React.HTMLAttributes<HTMLDivElement>) => {
  return (
    <div
      className={`bg-graphite border border-neutral-800 p-6 rounded-lg relative overflow-hidden ${className}`}
      style={{
        boxShadow: "inset 0 1px 0 0 rgba(255, 255, 255, 0.05)",
      }}
      {...props}
    >
      {children}
    </div>
  );
};

// ------------------------------------
// Tier Badge Component
// ------------------------------------
export const TierBadge = ({ tier, className = "" }: { tier: string; className?: string }) => {
  const isLimitless = tier === "LIMITLESS";

  if (isLimitless) {
    return (
      <span
        className={`font-mono font-bold text-xs uppercase tracking-widest px-2.5 py-1 rounded bg-black/60 border limitless-border limitless-text ${className}`}
      >
        {tier}
      </span>
    );
  }

  const accent = TIER_ACCENTS[tier as keyof typeof TIER_ACCENTS] || TIER_ACCENTS.D;

  return (
    <span
      className={`font-mono font-bold text-xs uppercase tracking-widest px-2.5 py-1 rounded bg-black/60 border ${className}`}
      style={{
        color: accent,
        borderColor: accent,
      }}
    >
      {tier}
    </span>
  );
};

// ------------------------------------
// Anomaly Badge Component
// ------------------------------------
export const AnomalyBadge = ({ anomaly, className = "" }: { anomaly: string | null; className?: string }) => {
  if (!anomaly) return null;
  return (
    <span className="font-mono text-[10px] uppercase tracking-wider px-2 py-0.5 rounded border border-brand-amber/20 bg-brand-amber/5">
      <Amber>{anomaly.replace(/_/g, " ")}</Amber>
    </span>
  );
};

// ------------------------------------
// Wordmark SVG Component
// ------------------------------------
export const Wordmark = ({
  width = 200,
  height,
  className = "",
}: {
  width?: number | string;
  height?: number | string;
  className?: string;
}) => (
  <svg
    role="img"
    aria-label="POWERLVL"
    viewBox="0 0 720 120"
    width={width}
    height={height}
    className={`fill-white ${className}`}
  >
    <title>POWERLVL</title>
    <path d="M30 18 H78 a30 30 0 0 1 0 60 H50 V102 H30 Z M50 36 V60 H78 a12 12 0 0 0 0 -24 Z" />
    <path d="M132 16 a44 44 0 0 1 44 44 v0 a44 44 0 0 1 -88 0 v0 a44 44 0 0 1 44 -44 Z M132 36 a24 24 0 0 0 -24 24 v0 a24 24 0 0 0 48 0 v0 a24 24 0 0 0 -24 -24 Z" />
    <path d="M196 18 H216 L228 78 L240 18 H260 L272 78 L284 18 H304 L284 102 H264 L250 42 L236 102 H216 Z" />
    <path d="M318 18 H378 V36 H338 V52 H372 V70 H338 V84 H378 V102 H318 Z" />
    <path d="M392 18 H440 a28 28 0 0 1 14 52 L470 102 H448 L434 72 H412 V102 H392 Z M412 36 V54 H440 a9 9 0 0 0 0 -18 Z" />
    <path d="M488 18 H508 V84 H548 V102 H488 Z" />
    <path d="M558 18 H578 L598 76 L618 18 H638 L608 102 H588 Z" />
    <path d="M650 18 H670 V84 H710 V102 H650 Z" />
  </svg>
);
