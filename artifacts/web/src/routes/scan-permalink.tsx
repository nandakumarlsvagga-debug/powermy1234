import React, { useState } from "react";
import { useParams, Link } from "wouter";
import { Card, Button, TierBadge, AnomalyBadge, Amber } from "../components/design-system/index.js";
import { useGetScan, useToggleScanLike } from "@workspace/api-client-react";

export default function ScanPermalinkRoute() {
  const { id } = useParams<{ id: string }>();

  const [activeRatio, setActiveRatio] = useState<"story" | "square" | "landscape">("square");

  const { data: scan, isLoading: scanLoading, error: scanError, refetch: refetchScan } = useGetScan(id || "");
  const { mutateAsync: toggleLike } = useToggleScanLike();

  if (scanLoading) {
    return (
      <div className="flex-1 flex items-center justify-center font-mono text-sm text-neutral-400">
        VERIFYING POWER LEVEL RECORDS...
      </div>
    );
  }

  // Handle scan not found or expired scans (Drizzle mock returns null on expired scan search)
  if (scanError || !scan) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center text-center gap-4 py-24 z-10">
        <h1 className="font-mono text-xl font-bold uppercase tracking-wider text-red-500">UNVERIFIED — RECORD NOT FOUND</h1>
        <p className="text-sm text-neutral-400 max-w-md">
          The requested scan id does not exist in the decentralized ledger, or the anonymous scan retention period (24 hours) has expired.
        </p>
        <Link href="/scan" className="mt-4">
          <Button variant="primary">Scan New Target</Button>
        </Link>
      </div>
    );
  }

  const handleLike = async () => {
    try {
      await toggleLike({ id: scan.id });
      refetchScan();
    } catch (err) {}
  };

  const getPercentage = (val: number) => Math.min(100, Math.max(0, (val / 10000) * 100));

  const displayUser = scan.username ? `@${scan.username}` : "ANONYMOUS GUEST";
  const dateStr = new Date(scan.createdAt).toLocaleDateString(undefined, {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 py-6 md:py-12 z-10 w-full">
      {/* Left Column: Visual Scan Details & Verification */}
      <div className="lg:col-span-7 flex flex-col gap-6">
        <Card className="flex flex-col gap-6">
          {/* Header */}
          <div className="flex justify-between items-start">
            <div className="flex flex-col">
              <div className="flex items-center gap-2">
                <span className="font-mono text-[10px] text-green-400 font-bold uppercase tracking-widest bg-green-950/30 border border-green-500/20 px-2 py-0.5 rounded">
                  VERIFIED SCAN
                </span>
              </div>
              <h1 className="font-sans text-2xl font-black uppercase text-white mt-2">DIAGNOSTIC LEDGER</h1>
            </div>
            <div className="flex gap-2">
              <AnomalyBadge anomaly={scan.anomaly} />
              <TierBadge tier={scan.tier} />
            </div>
          </div>

          {/* Original Image Target */}
          <div className="relative w-full aspect-video border border-neutral-900 rounded-lg overflow-hidden bg-black/40">
            <img src={scan.imageUrl} className="object-contain w-full h-full" alt="Original scan target" />
          </div>

          {/* Score details */}
          <div className="flex items-center justify-between bg-neutral-950/40 border border-neutral-900 p-6 rounded-lg">
            <div className="flex flex-col">
              <span className="font-mono text-[10px] text-neutral-500 uppercase tracking-widest">RECORDED POWER LEVEL</span>
              <span className="font-mono text-5xl font-black text-brand-amber mt-1 select-none">
                {scan.score}
              </span>
            </div>
            <div className="flex flex-col items-end text-right">
              <span className="font-mono text-[10px] text-neutral-500 uppercase tracking-widest">VERDICT CATEGORY</span>
              <span className="font-sans text-lg font-bold text-neutral-300 uppercase tracking-wider mt-1">
                {scan.verdictNoun}
              </span>
            </div>
          </div>

          {/* Core Stats */}
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

          {/* Category Stats */}
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

          {/* Commentary */}
          <div className="border-t border-neutral-900 pt-6 flex flex-col gap-4">
            <div>
              <span className="font-mono text-xs text-neutral-500 uppercase tracking-wider">Commentary</span>
              <p className="font-sans text-base text-neutral-200 italic leading-relaxed mt-1">
                "{scan.commentary}"
              </p>
            </div>
            <div className="flex justify-between items-center text-xs font-mono border-t border-neutral-900 pt-4 mt-2 text-neutral-500">
              <span>SCANNER OPERATOR: <span className="text-neutral-300 font-semibold">{displayUser}</span></span>
              <span>SCANNED ON: <span className="text-neutral-300 font-semibold">{dateStr}</span></span>
            </div>
          </div>
        </Card>
      </div>

      {/* Right Column: Share Card Download Area */}
      <div className="lg:col-span-5 flex flex-col gap-6">
        <Card className="flex flex-col gap-6">
          <div>
            <h3 className="font-mono text-sm font-bold text-white uppercase tracking-wider">Share Card Generator</h3>
            <p className="text-xs text-neutral-400 mt-1">Generate dynamic PNG layouts to share verified results.</p>
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
