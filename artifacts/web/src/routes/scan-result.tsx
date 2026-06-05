import React, { useState, useEffect } from "react";
import { useParams, Link } from "wouter";
import { Card, Button, TierBadge, AnomalyBadge, Amber } from "../components/design-system/index.js";
import { useGetScan, useGetMe, useClaimScan, useToggleScanLike } from "@workspace/api-client-react";
import { supabase } from "../lib/supabase.js";

export default function ScanResultRoute() {
  const { id } = useParams<{ id: string }>();

  const [activeRatio, setActiveRatio] = useState<"story" | "square" | "landscape">("square");
  const [claimError, setClaimError] = useState<string | null>(null);

  const { data: scan, isLoading: scanLoading, refetch: refetchScan } = useGetScan(id || "");
  const { data: me, refetch: refetchMe } = useGetMe();
  const { mutateAsync: claimScan, isPending: claiming } = useClaimScan();
  const { mutateAsync: toggleLike } = useToggleScanLike();

  // If the user has just logged in and has a claimable scan, attempt to claim it
  useEffect(() => {
    if (me?.member && scan && !scan.username && me.claimableScanIds.includes(scan.id)) {
      claimScan({ id: scan.id })
        .then(() => {
          refetchScan();
          refetchMe();
        })
        .catch(() => {});
    }
  }, [me, scan, claimScan, refetchScan, refetchMe]);

  if (scanLoading) {
    return (
      <div className="flex-1 flex items-center justify-center font-mono text-sm text-neutral-400">
        LOADING DIAGNOSTIC RESULTS...
      </div>
    );
  }

  if (!scan) {
    return (
      <div className="flex-1 flex items-center justify-center font-mono text-sm text-red-500">
        ERROR: SCAN RESULT NOT FOUND
      </div>
    );
  }

  const isClaimable = !scan.username && me?.claimableScanIds.includes(scan.id);

  const handleGoogleLogin = async () => {
    await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
      },
    });
  };

  const handleClaim = async () => {
    setClaimError(null);
    try {
      await claimScan({ id: scan.id });
      refetchScan();
      refetchMe();
    } catch (err: any) {
      setClaimError(err.message || "Failed to claim scan.");
    }
  };

  const handleLike = async () => {
    try {
      await toggleLike({ id: scan.id });
      refetchScan();
    } catch (err) {}
  };

  // Safe percentage helper for stats
  const getPercentage = (val: number) => Math.min(100, Math.max(0, (val / 10000) * 100));

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 py-6 md:py-12 z-10 w-full">
      {/* Left side: Results Display */}
      <div className="lg:col-span-7 flex flex-col gap-6">
        <Card className="flex flex-col gap-6">
          {/* Header */}
          <div className="flex justify-between items-start">
            <div className="flex flex-col">
              <span className="font-mono text-xs text-neutral-500 uppercase tracking-wider">Diagnostic Analysis</span>
              <h1 className="font-sans text-2xl font-black uppercase text-white mt-1">VERDICT REPORT</h1>
            </div>
            <div className="flex gap-2">
              <AnomalyBadge anomaly={scan.anomaly} />
              <TierBadge tier={scan.tier} />
            </div>
          </div>

          {/* Main Hero Score */}
          <div className="bg-black/40 border border-neutral-900 rounded-lg p-8 flex flex-col items-center justify-center text-center relative overflow-hidden">
            <span className="font-mono text-xs text-neutral-500 uppercase tracking-widest">POWER LEVEL SCORE</span>
            <span className="font-mono text-8xl font-black text-brand-amber mt-2 tracking-tighter select-none">
              {scan.score}
            </span>
            <span className="font-sans text-lg font-bold text-neutral-300 uppercase tracking-widest mt-2">
              {scan.verdictNoun}
            </span>
          </div>

          {/* Core Stats Grid */}
          <div className="flex flex-col gap-4">
            <h3 className="font-mono text-xs text-neutral-400 uppercase tracking-wider">Core Energy Signatures</h3>
            <div className="grid grid-cols-2 gap-4">
              {[
                { label: "AURA", val: scan.coreStats.aura },
                { label: "POWER", val: scan.coreStats.power },
                { label: "STATUS", val: scan.coreStats.status },
                { label: "THREAT", val: scan.coreStats.threat },
              ].map((stat) => (
                <div key={stat.label} className="bg-neutral-950/40 border border-neutral-900 p-3.5 rounded flex flex-col gap-2">
                  <div className="flex justify-between text-xs font-mono">
                    <span className="text-neutral-500">{stat.label}</span>
                    <span className="text-white font-semibold">{stat.val}</span>
                  </div>
                  <div className="w-full h-1.5 bg-neutral-900 rounded-full overflow-hidden">
                    <div className="h-full bg-brand-amber" style={{ width: `${getPercentage(stat.val)}%` }} />
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Category Stats Grid */}
          <div className="flex flex-col gap-4">
            <h3 className="font-mono text-xs text-neutral-400 uppercase tracking-wider">{scan.category} Metrics</h3>
            <div className="flex flex-col gap-3">
              {Object.entries(scan.categoryStats).map(([label, val]) => (
                <div key={label} className="flex items-center justify-between text-xs font-mono bg-neutral-950/20 px-4 py-3 border border-neutral-900/50 rounded">
                  <span className="text-neutral-400">{label}</span>
                  <div className="flex items-center gap-4 w-1/2 justify-end">
                    <span className="text-white font-bold">{val}</span>
                    <div className="w-24 h-1.5 bg-neutral-900 rounded-full overflow-hidden hidden sm:block">
                      <div className="h-full bg-hud-cyan" style={{ width: `${getPercentage(val)}%` }} />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Commentary & Description */}
          <div className="border-t border-neutral-900 pt-6 flex flex-col gap-4">
            <div>
              <span className="font-mono text-xs text-neutral-500 uppercase tracking-wider">Commentary</span>
              <p className="font-sans text-base text-neutral-200 italic leading-relaxed mt-1">
                "{scan.commentary}"
              </p>
            </div>
            {scan.description && (
              <div>
                <span className="font-mono text-xs text-neutral-500 uppercase tracking-wider">Context Details</span>
                <p className="font-sans text-xs text-neutral-400 leading-normal mt-1">
                  "{scan.description}"
                </p>
              </div>
            )}
          </div>
        </Card>

        {/* Soft-Auth Claims Prompt */}
        {isClaimable && (
          <Card className="border border-brand-amber/30 bg-brand-amber/5 flex flex-col gap-4">
            <div>
              <h3 className="font-mono text-sm font-bold text-white uppercase tracking-wider">Claim This Scan Result</h3>
              <p className="text-xs text-neutral-400 mt-1">
                Claim this scan to link it to your permanent profile, showcase it on the public feed, and secure leaderboard rankings.
              </p>
            </div>
            <div className="flex flex-col sm:flex-row gap-3">
              {me?.member ? (
                <Button variant="primary" onClick={handleClaim} disabled={claiming} className="w-full sm:w-auto">
                  {claiming ? "Claiming..." : "Claim to Profile"}
                </Button>
              ) : (
                <Button variant="primary" onClick={handleGoogleLogin} className="w-full sm:w-auto">
                  Sign In with Google to Claim
                </Button>
              )}
            </div>
            {claimError && <span className="text-xs font-mono text-red-500 mt-1">{claimError}</span>}
          </Card>
        )}
      </div>

      {/* Right side: Share Card Preview & Controls */}
      <div className="lg:col-span-5 flex flex-col gap-6">
        <Card className="flex flex-col gap-6">
          <div>
            <h3 className="font-mono text-sm font-bold text-white uppercase tracking-wider">Share Card Generator</h3>
            <p className="text-xs text-neutral-400 mt-1">Download aspect ratios tailored for stories, square profiles, or landscape feeds.</p>
          </div>

          {/* Toggle Ratios */}
          <div className="flex gap-2 bg-neutral-950 p-1 border border-neutral-900 rounded">
            {(["story", "square", "landscape"] as const).map((ratio) => (
              <button
                key={ratio}
                onClick={() => setActiveRatio(ratio)}
                className={`flex-1 text-center py-2 rounded text-xs font-mono uppercase tracking-wider transition-all duration-150 cursor-pointer ${
                  activeRatio === ratio
                    ? "bg-neutral-900 border border-neutral-800 text-white font-bold"
                    : "text-neutral-500 hover:text-neutral-300"
                }`}
              >
                {ratio}
              </button>
            ))}
          </div>

          {/* Image Preview Block */}
          <div className="relative w-full aspect-square bg-neutral-950 border border-neutral-900 rounded-lg overflow-hidden flex items-center justify-center p-4">
            <img
              src={scan.shareCardUrls[activeRatio]}
              alt={`Share card preview ${activeRatio}`}
              className="max-w-full max-h-full object-contain shadow-2xl rounded"
            />
          </div>

          {/* Download & Social Controls */}
          <div className="flex flex-col gap-3">
            <a
              href={scan.shareCardUrls[activeRatio]}
              download={`powerlvl-card-${activeRatio}.png`}
              target="_blank"
              rel="noopener noreferrer"
              className="w-full"
            >
              <Button variant="primary" className="w-full">
                Download {activeRatio.toUpperCase()} Card
              </Button>
            </a>

            <div className="flex gap-3">
              <Button variant="secondary" onClick={handleLike} className="flex-1">
                {scan.likedByMe ? "Liked" : "Like Scan"} ({scan.likeCount})
              </Button>
              <button
                onClick={() => {
                  navigator.clipboard.writeText(scan.permalink);
                  alert("Copied permalink to clipboard!");
                }}
                className="flex-1 font-mono text-xs uppercase border border-neutral-800 hover:border-neutral-700 bg-neutral-900/30 hover:bg-neutral-900 text-neutral-300 rounded transition-all cursor-pointer py-2.5 flex items-center justify-center gap-2"
              >
                Copy Link
              </button>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}
