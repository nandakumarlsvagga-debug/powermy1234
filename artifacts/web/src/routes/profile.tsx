import React, { useEffect, useState } from "react";
import { useParams, useLocation, Link } from "wouter";
import { useGetProfile, useGetProfileScans, useGetMe } from "@workspace/api-client-react";
import { Card, Button, TierBadge, AnomalyBadge } from "../components/design-system/index.js";

export default function ProfileRoute() {
  const { username } = useParams<{ username?: string }>();
  const [location, setLocation] = useLocation();

  const isMeRoute = location === "/me";

  // Fetch private me state for redirect logic
  const { data: me, isLoading: meLoading } = useGetMe({
    query: {
      enabled: isMeRoute,
    } as any,
  });

  // Handle /me redirection
  useEffect(() => {
    if (isMeRoute && !meLoading) {
      if (me?.member?.username) {
        setLocation(`/u/${me.member.username}`, { replace: true });
      } else if (me?.needsUsername) {
        setLocation("/auth/username", { replace: true });
      } else {
        setLocation("/", { replace: true });
      }
    }
  }, [isMeRoute, me, meLoading, setLocation]);

  // Load public profile
  const targetUsername = username || "";
  const { data: profileData, isLoading: profileLoading, error: profileError } = useGetProfile(
    targetUsername,
    {
      query: {
        enabled: !isMeRoute && !!targetUsername,
      } as any,
    }
  );

  const [scans, setScans] = useState<any[]>([]);
  const [cursor, setCursor] = useState<string | undefined>(undefined);
  const [hasMore, setHasMore] = useState(true);

  // Load profile scans
  const { data: scansData, isLoading: scansLoading } = useGetProfileScans(
    targetUsername,
    { cursor, limit: 20 },
    {
      query: {
        enabled: !isMeRoute && !!targetUsername,
      } as any,
    }
  );

  useEffect(() => {
    if (profileData?.scans) {
      setScans(profileData.scans);
      setHasMore(profileData.nextCursor !== null);
    }
  }, [profileData]);

  useEffect(() => {
    if (scansData) {
      if (scansData.entries.length === 0) {
        setHasMore(false);
        return;
      }
      setScans((prev) => {
        const existingIds = new Set(prev.map((s) => s.id));
        const filtered = scansData.entries.filter((s) => !existingIds.has(s.id));
        return [...prev, ...filtered];
      });
      setHasMore(scansData.nextCursor !== null);
    }
  }, [scansData]);

  const loadMore = () => {
    if (scansData?.nextCursor && hasMore && !scansLoading) {
      setCursor(scansData.nextCursor);
    }
  };

  if (isMeRoute || meLoading) {
    return (
      <div className="flex-1 flex items-center justify-center font-mono text-sm text-neutral-400">
        REDIRECTING TO SESSION PROFILE...
      </div>
    );
  }

  if (profileLoading) {
    return (
      <div className="flex-1 flex items-center justify-center font-mono text-sm text-neutral-400">
        RETRIEVING LEGER PROFILE DETAILS...
      </div>
    );
  }

  // Profile not found
  if (profileError || !profileData) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center text-center gap-4 py-24 z-10">
        <h1 className="font-mono text-xl font-bold uppercase tracking-wider text-red-500">OPERATOR PROFILE NOT FOUND</h1>
        <p className="text-sm text-neutral-400 max-w-md">
          The requested username is not registered in the POWERLVL ledger database.
        </p>
        <Link href="/">
          <Button variant="secondary">Return Home</Button>
        </Link>
      </div>
    );
  }

  const { profile } = profileData;

  return (
    <div className="flex flex-col gap-8 py-6 md:py-12 z-10 w-full">
      {/* Profile Header Card */}
      <Card className="flex flex-col md:flex-row items-center gap-6 p-8">
        {/* Avatar */}
        <div className="w-24 h-24 rounded-full bg-neutral-900 border border-neutral-800 flex items-center justify-center font-mono text-3xl font-bold text-brand-amber">
          {profile.avatarInitials}
        </div>

        {/* User Info */}
        <div className="flex-1 flex flex-col items-center md:items-start text-center md:text-left gap-1">
          <span className="font-mono text-xs text-neutral-500 uppercase tracking-wider">Operator Profile</span>
          <h1 className="font-mono text-2xl font-bold text-white">@{profile.username}</h1>
        </div>

        {/* Aggregates */}
        <div className="flex gap-6 border-t md:border-t-0 md:border-l border-neutral-900 pt-6 md:pt-0 md:pl-8 w-full md:w-auto justify-around">
          <div className="flex flex-col items-center md:items-start">
            <span className="font-mono text-[9px] text-neutral-500 uppercase tracking-widest">HIGHEST SCORE</span>
            <span className="font-mono text-xl font-bold text-brand-amber mt-1">
              {profile.aggregates.highestScore}
            </span>
          </div>
          <div className="flex flex-col items-center md:items-start">
            <span className="font-mono text-[9px] text-neutral-500 uppercase tracking-widest">HIGHEST TIER</span>
            <div className="mt-1">
              <TierBadge tier={profile.aggregates.highestTier} className="scale-90" />
            </div>
          </div>
          <div className="flex flex-col items-center md:items-start">
            <span className="font-mono text-[9px] text-neutral-500 uppercase tracking-widest">TOTAL SCANS</span>
            <span className="font-mono text-xl font-bold text-white mt-1">
              {profile.aggregates.totalScans}
            </span>
          </div>
        </div>
      </Card>

      {/* History Grid */}
      <div className="flex flex-col gap-4">
        <h2 className="font-mono text-sm font-bold uppercase tracking-wider text-white">Scan History</h2>
        
        {scans.length === 0 ? (
          <div className="bg-graphite border border-neutral-900 p-12 rounded-lg text-center font-mono text-xs text-neutral-500">
            THIS OPERATOR HAS NOT UPLOADED ANY SCANS YET
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {scans.map((scan) => (
              <Card key={scan.id} className="flex flex-col gap-4">
                <div className="flex justify-between items-start">
                  <span className="text-[10px] text-neutral-500 font-mono">
                    {new Date(scan.createdAt).toLocaleDateString()}
                  </span>
                  <div className="flex gap-2">
                    <AnomalyBadge anomaly={scan.anomaly} />
                    <TierBadge tier={scan.tier} />
                  </div>
                </div>

                <div className="relative aspect-video rounded overflow-hidden bg-neutral-950 border border-neutral-900 flex items-center justify-center">
                  <img src={scan.imageUrl} className="object-cover w-full h-full" alt="Scan target" />
                </div>

                <div className="flex justify-between items-center bg-black/40 border border-neutral-900 px-3 py-2 rounded">
                  <div className="flex flex-col">
                    <span className="text-[9px] font-mono text-neutral-500 leading-none">SCORE</span>
                    <span className="text-base font-mono font-bold text-brand-amber mt-1 leading-none">
                      {scan.score}
                    </span>
                  </div>
                  <div className="flex flex-col items-end">
                    <span className="text-[9px] font-mono text-neutral-500 leading-none">VERDICT</span>
                    <span className="text-xs font-sans font-bold text-neutral-300 uppercase tracking-wider mt-1 leading-none">
                      {scan.verdictNoun}
                    </span>
                  </div>
                </div>

                <Link href={`/scan/${scan.id}`} className="mt-2">
                  <Button variant="secondary" className="w-full py-2 text-xs">
                    View Verified Ledger
                  </Button>
                </Link>
              </Card>
            ))}
          </div>
        )}

        {/* Load More Button */}
        {hasMore && scans.length > 0 && (
          <div className="flex justify-center mt-6">
            <Button variant="secondary" onClick={loadMore} disabled={scansLoading}>
              {scansLoading ? "LOADING SCANS..." : "LOAD MORE SCANS"}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
