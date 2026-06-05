import React, { useState } from "react";
import { Link } from "wouter";
import { useGetLeaderboard } from "@workspace/api-client-react";
import { Card, Button, TierBadge, AnomalyBadge } from "../components/design-system/index.js";
import { LeaderboardWindow, LeaderboardScope } from "@workspace/api-client-react";

export default function LeaderboardsRoute() {
  const [activeWindow, setActiveWindow] = useState<LeaderboardWindow>("today");
  const [activeScope, setActiveScope] = useState<LeaderboardScope>("global");

  const { data: leaderboard, isLoading } = useGetLeaderboard({
    window: activeWindow,
    scope: activeScope,
  });

  const windows: Array<{ id: LeaderboardWindow; label: string }> = [
    { id: "today", label: "Today" },
    { id: "week", label: "This Week" },
    { id: "all", label: "All-Time" },
  ];

  const scopes: Array<{ id: LeaderboardScope; label: string }> = [
    { id: "global", label: "Global" },
    { id: "setups", label: "Setups" },
    { id: "fitness", label: "Fitness" },
    { id: "drip", label: "Drip" },
    { id: "pets", label: "Pets" },
    { id: "rides", label: "Rides" },
    { id: "wildcard", label: "Wildcard" },
  ];

  return (
    <div className="flex-1 flex flex-col w-full mx-auto py-6 z-10">
      <div className="flex flex-col mb-6">
        <span className="font-mono text-xs text-neutral-500 uppercase tracking-wider">Ledger Ledger</span>
        <h1 className="font-sans text-2xl font-black uppercase text-white mt-1">LEADERBOARDS</h1>
      </div>

      {/* Tabs */}
      <div className="flex flex-col gap-4 mb-6">
        {/* Window Tabs */}
        <div className="flex gap-2 bg-neutral-950 p-1 border border-neutral-900 rounded max-w-sm">
          {windows.map((win) => (
            <button
              key={win.id}
              onClick={() => setActiveWindow(win.id)}
              className={`flex-1 text-center py-2 rounded text-xs font-mono uppercase tracking-wider transition-all duration-150 cursor-pointer ${
                activeWindow === win.id
                  ? "bg-neutral-900 border border-neutral-800 text-white font-bold"
                  : "text-neutral-500 hover:text-neutral-300"
              }`}
            >
              {win.label}
            </button>
          ))}
        </div>

        {/* Scope Tabs */}
        <div className="flex flex-wrap gap-2">
          {scopes.map((sc) => (
            <button
              key={sc.id}
              onClick={() => setActiveScope(sc.id)}
              className={`px-4 py-2 rounded text-xs font-mono uppercase tracking-wider transition-all duration-150 cursor-pointer border ${
                activeScope === sc.id
                  ? "bg-brand-amber/10 border-brand-amber text-white font-bold"
                  : "border-neutral-900 bg-neutral-950/20 text-neutral-500 hover:border-neutral-800 hover:text-neutral-300"
              }`}
            >
              {sc.label}
            </button>
          ))}
        </div>
      </div>

      {/* Records Table */}
      <Card className="p-0 overflow-hidden">
        {isLoading ? (
          <div className="p-12 text-center font-mono text-xs text-neutral-500">
            DIAGNOSTICS: COMPILING LEADERBOARD RECORDS...
          </div>
        ) : !leaderboard || leaderboard.entries.length === 0 ? (
          <div className="p-12 text-center font-mono text-xs text-neutral-500">
            NO RANKED DIAGNOSTIC SCANS DETECTED IN THIS CYCLE
          </div>
        ) : (
          <div className="overflow-x-auto w-full">
            <table className="w-full text-left border-collapse font-mono text-xs text-neutral-300">
              <thead>
                <tr className="border-b border-neutral-900 bg-neutral-950 text-neutral-500 uppercase font-semibold">
                  <th className="py-4 px-6 text-center w-16">Rank</th>
                  <th className="py-4 px-6">Operator</th>
                  <th className="py-4 px-6 text-center">Category</th>
                  <th className="py-4 px-6 text-right">Score</th>
                  <th className="py-4 px-6 text-center">Tier</th>
                  <th className="py-4 px-6">Special Anomaly</th>
                  <th className="py-4 px-6 text-center">Diagnostics</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-900/50">
                {leaderboard.entries.map((entry) => (
                  <tr key={entry.scanId} className="hover:bg-neutral-900/10 transition-colors">
                    <td className="py-4 px-6 text-center font-bold text-neutral-400">
                      #{entry.rank}
                    </td>
                    <td className="py-4 px-6">
                      <Link href={`/u/${entry.username}`} className="text-white hover:text-brand-amber transition-colors font-semibold">
                        @{entry.username}
                      </Link>
                    </td>
                    <td className="py-4 px-6 text-center text-neutral-500 uppercase">
                      {entry.category}
                    </td>
                    <td className="py-4 px-6 text-right text-brand-amber font-bold text-sm">
                      {entry.score}
                    </td>
                    <td className="py-4 px-6 text-center">
                      <TierBadge tier={entry.tier} className="scale-90" />
                    </td>
                    <td className="py-4 px-6">
                      <AnomalyBadge anomaly={entry.anomaly} />
                    </td>
                    <td className="py-4 px-6 text-center">
                      <Link href={`/scan/${entry.scanId}`}>
                        <span className="text-hud-cyan hover:underline cursor-pointer">
                          View Ledger
                        </span>
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
