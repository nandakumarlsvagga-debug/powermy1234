import React, { useEffect, useState, useRef } from "react";
import { useLocation, useParams } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import { HudOverlay, Card, Skeleton } from "../components/design-system/index.js";
import { createRevealController } from "@workspace/reveal-controller";
import { supabase } from "../lib/supabase.js";

// Helper to map anomaly types to reveal variants
const mapAnomalyToVariant = (anomaly: string | null): any => {
  if (!anomaly) return "standard";
  switch (anomaly) {
    case "POWER_SURGE_DETECTED": return "power_surge";
    case "FORBIDDEN_AURA": return "forbidden_aura";
    case "SCOUTER_FAILURE": return "scouter_failure";
    case "UNREGISTERED_ENERGY": return "unregistered_energy";
    case "CHAOS_SPIKE": return "chaos_spike";
    default: return "standard";
  }
};

export default function ScanRunRoute() {
  const { id } = useParams<{ id: string }>();
  const [, setLocation] = useLocation();

  const [phase, setPhase] = useState<string>("idle");
  const [variant, setVariant] = useState<string>("standard");
  const [scanData, setScanData] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  const controllerRef = useRef<any>(null);

  useEffect(() => {
    if (!id) return;

    // Prefers reduced motion check
    const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    // Load data from session storage or fetch
    let scanPromise: Promise<any>;
    const cachedScan = sessionStorage.getItem(`scan_result_${id}`);

    if (cachedScan) {
      const scan = JSON.parse(cachedScan);
      setScanData(scan);
      setVariant(mapAnomalyToVariant(scan.anomaly));
      scanPromise = Promise.resolve({
        scan,
        reveal: {
          revealVariant: mapAnomalyToVariant(scan.anomaly),
          serverElapsedMs: 1500,
        },
      });
    } else {
      // Direct navigate / refresh fallback: fetch from API
      scanPromise = fetch(`/api/scans/${id}`)
        .then((r) => {
          if (!r.ok) throw new Error("Scan target not found.");
          return r.json();
        })
        .then((scan) => {
          setScanData(scan);
          setVariant(mapAnomalyToVariant(scan.anomaly));
          return {
            scan,
            reveal: {
              revealVariant: mapAnomalyToVariant(scan.anomaly),
              serverElapsedMs: 0,
            },
          };
        })
        .catch((err) => {
          setError(err.message);
          return null;
        });
    }

    const ctrl = createRevealController();
    controllerRef.current = ctrl;

    const handle = ctrl.start({
      submittedAt: performance.now(),
      responsePromise: scanPromise,
      reducedMotion: prefersReducedMotion,
      onPhase: (currentPhase, ctx) => {
        setPhase(currentPhase);
        if (ctx.revealVariant) {
          setVariant(ctx.revealVariant);
        }
        if (currentPhase === "done") {
          setLocation(`/scan/result/${id}`);
        }
      },
    });

    return () => {
      handle.cancel();
    };
  }, [id, setLocation]);

  if (error) {
    return (
      <div className="flex-1 flex items-center justify-center font-mono text-sm text-red-500">
        SCAN ERROR: {error}
      </div>
    );
  }

  // Pre-load layout placeholder if scan data hasn't arrived
  const imageUrl = scanData?.imageUrl ?? "";

  const renderOverlay = () => {
    switch (variant) {
      case "power_surge":
        return (
          <div className="absolute inset-0 pointer-events-none bg-brand-amber/10 mix-blend-color-dodge animate-pulse">
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(245,166,35,0.2),transparent_70%)]" />
          </div>
        );
      case "forbidden_aura":
        return (
          <div className="absolute inset-0 pointer-events-none bg-purple-950/20 mix-blend-color-burn">
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(168,85,247,0.15),transparent_70%)] animate-ping" />
          </div>
        );
      case "scouter_failure":
        return (
          <div className="absolute inset-0 pointer-events-none bg-red-950/10 backdrop-invert-0 animate-ping">
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 font-mono text-[10px] text-red-500 bg-black/90 px-3 py-1 border border-red-900/60 uppercase tracking-widest">
              Critical Heat Overload - Diagnostics Fault
            </div>
          </div>
        );
      case "unregistered_energy":
        return (
          <div className="absolute inset-0 pointer-events-none bg-hud-cyan/10 mix-blend-screen animate-pulse">
            <div className="absolute inset-0 bg-[linear-gradient(45deg,rgba(94,234,212,0.15)_0%,transparent_100%)]" />
          </div>
        );
      case "chaos_spike":
        return (
          <div className="absolute inset-0 pointer-events-none bg-white/5 animate-flash">
            <div className="absolute inset-0 bg-[repeating-linear-gradient(0deg,rgba(255,255,255,0.05),rgba(255,255,255,0.05)_2px,transparent_2px,transparent_4px)]" />
          </div>
        );
      default:
        return null;
    }
  };

  return (
    <div className="flex-1 flex flex-col items-center justify-center relative w-full max-w-lg mx-auto py-12">
      <HudOverlay className="aspect-[3/4] w-full bg-black/80 border border-neutral-900 rounded-lg overflow-hidden flex flex-col relative">
        {/* Render Anomaly Custom Visual Overlays */}
        {renderOverlay()}

        {/* Diagnostic Status Header */}
        <div className="absolute top-4 left-1/2 -translate-x-1/2 z-20 font-mono text-[10px] tracking-widest text-hud-cyan/70 uppercase">
          {phase === "lockOn" && "LOCKING SCANNING TARGET..."}
          {phase === "scanSweep" && "ANALYZING CHROMATIC MATRIX..."}
          {phase === "analysis" && "CALCULATING POWER METRICS..."}
          {phase === "slam" && "CALCULATION COMPLETED"}
          {phase === "reveal" && "METRICS LOCKED"}
        </div>

        {/* Middle Image Target Display */}
        <div className="flex-1 flex items-center justify-center p-8 relative">
          {imageUrl ? (
            <div className="relative w-full aspect-square border border-neutral-800 rounded overflow-hidden bg-neutral-900/20">
              <img src={imageUrl} className="object-cover w-full h-full" alt="Target pixels" />
              
              {/* Scan Sweep Line */}
              {phase === "scanSweep" && (
                <motion.div
                  initial={{ top: "0%" }}
                  animate={{ top: "100%" }}
                  transition={{ duration: 1.5, ease: "linear", repeat: Infinity }}
                  className="absolute left-0 w-full h-1 bg-hud-cyan shadow-[0_0_8px_rgba(94,234,212,0.8)] z-10"
                />
              )}

              {/* Analysis HUD crosshairs */}
              {phase === "analysis" && (
                <div className="absolute inset-0 bg-black/30 flex items-center justify-center">
                  <div className="w-24 h-24 border border-dashed border-hud-cyan/60 rounded-full animate-spin" />
                  <div className="absolute w-12 h-12 border border-hud-cyan/40 rounded-full animate-ping" />
                </div>
              )}
            </div>
          ) : (
            <Skeleton className="w-full aspect-square" />
          )}
        </div>

        {/* Slam Animation Phase */}
        <AnimatePresence>
          {(phase === "slam" || phase === "reveal") && scanData && (
            <motion.div
              initial={{ scale: 2.5, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ type: "spring", damping: 15 }}
              className="absolute inset-0 flex flex-col items-center justify-center bg-black/90 z-30"
            >
              <span className="font-mono text-xs text-neutral-500 uppercase tracking-widest">POWER LEVEL</span>
              <span className="font-mono text-7xl sm:text-8xl font-black text-brand-amber mt-2 tracking-tight">
                {scanData.score}
              </span>
              <span className="font-sans text-lg font-bold text-neutral-400 mt-2 uppercase tracking-wide">
                {scanData.verdictNoun}
              </span>
            </motion.div>
          )}
        </AnimatePresence>
      </HudOverlay>
    </div>
  );
}
