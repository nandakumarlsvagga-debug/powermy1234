import React, { useState, useEffect, useRef } from "react";
import { useGetFeed, useToggleScanLike } from "@workspace/api-client-react";
import { Card, Button, TierBadge, AnomalyBadge, Amber } from "../components/design-system/index.js";
import { useVirtualizer } from "@tanstack/react-virtual";
import { Link } from "wouter";

export default function FeedRoute() {
  const [entries, setEntries] = useState<any[]>([]);
  const [cursor, setCursor] = useState<string | undefined>(undefined);
  const [hasMore, setHasMore] = useState(true);

  const { data, isLoading, refetch } = useGetFeed({ cursor, limit: 20 });
  const { mutateAsync: toggleLike } = useToggleScanLike();

  useEffect(() => {
    if (data) {
      if (data.entries.length === 0) {
        setHasMore(false);
        return;
      }
      setEntries((prev) => {
        // filter out duplicates
        const existingIds = new Set(prev.map((e) => e.id));
        const filtered = data.entries.filter((e) => !existingIds.has(e.id));
        return [...prev, ...filtered];
      });
      setHasMore(data.nextCursor !== null);
    }
  }, [data]);

  const loadMore = () => {
    if (data?.nextCursor && hasMore && !isLoading) {
      setCursor(data.nextCursor);
    }
  };

  const parentRef = useRef<HTMLDivElement>(null);

  const rowVirtualizer = useVirtualizer({
    count: entries.length + (hasMore ? 1 : 0),
    getScrollElement: () => parentRef.current,
    estimateSize: () => 500, // estimated height of feed card
    overscan: 3,
  });

  const handleLike = async (id: string) => {
    try {
      const res = await toggleLike({ id });
      setEntries((prev) =>
        prev.map((e) => (e.id === id ? { ...e, likedByMe: res.liked, likeCount: res.likeCount } : e))
      );
    } catch (err) {}
  };

  const virtualItems = rowVirtualizer.getVirtualItems();

  useEffect(() => {
    const lastItem = virtualItems[virtualItems.length - 1];
    if (lastItem && lastItem.index >= entries.length && hasMore && !isLoading) {
      loadMore();
    }
  }, [virtualItems, entries.length, hasMore, isLoading]);

  return (
    <div className="flex-1 flex flex-col max-w-xl w-full mx-auto py-6 z-10">
      <div className="flex flex-col mb-6">
        <span className="font-mono text-xs text-neutral-500 uppercase tracking-wider">Ledger Feed</span>
        <h1 className="font-sans text-2xl font-black uppercase text-white mt-1">PUBLIC DIARY</h1>
      </div>

      <div
        ref={parentRef}
        className="flex-grow overflow-y-auto h-[70vh] border border-neutral-900 rounded-lg p-4 bg-black/20"
      >
        <div
          style={{
            height: `${rowVirtualizer.getTotalSize()}px`,
            width: "100%",
            position: "relative",
          }}
        >
          {virtualItems.map((virtualRow) => {
            const isLoaderRow = virtualRow.index >= entries.length;
            const scan = entries[virtualRow.index];

            return (
              <div
                key={virtualRow.key}
                style={{
                  position: "absolute",
                  top: 0,
                  left: 0,
                  width: "100%",
                  height: `${virtualRow.size}px`,
                  transform: `translateY(${virtualRow.start}px)`,
                }}
                className="py-2.5"
              >
                {isLoaderRow ? (
                  <div className="flex items-center justify-center p-4 font-mono text-xs text-neutral-600">
                    DIAGNOSTICS: RETRIEVING MORE RECORDS...
                  </div>
                ) : (
                  <Card className="flex flex-col gap-4 h-full justify-between">
                    {/* Header */}
                    <div className="flex justify-between items-start">
                      <div className="flex flex-col">
                        <span className="font-mono text-xs text-neutral-300">
                          {scan.username ? `@${scan.username}` : "ANONYMOUS GUEST"}
                        </span>
                        <span className="text-[10px] text-neutral-500 font-mono mt-0.5">
                          {new Date(scan.createdAt).toLocaleDateString()}
                        </span>
                      </div>
                      <div className="flex gap-2">
                        <AnomalyBadge anomaly={scan.anomaly} />
                        <TierBadge tier={scan.tier} />
                      </div>
                    </div>

                    {/* Image Target */}
                    <div className="relative aspect-video rounded overflow-hidden bg-neutral-950/80 border border-neutral-900 flex items-center justify-center">
                      <img src={scan.imageUrl} className="object-cover w-full h-full" alt="Scan target" />
                    </div>

                    {/* Score Summary */}
                    <div className="flex justify-between items-center bg-black/40 border border-neutral-900 px-4 py-2.5 rounded">
                      <div className="flex flex-col">
                        <span className="text-[9px] font-mono text-neutral-500 uppercase tracking-wider">SCORE</span>
                        <span className="text-xl font-mono font-bold text-brand-amber leading-none mt-1">
                          {scan.score}
                        </span>
                      </div>
                      <div className="flex flex-col items-end">
                        <span className="text-[9px] font-mono text-neutral-500 uppercase tracking-wider">VERDICT</span>
                        <span className="text-xs font-sans font-bold text-neutral-300 uppercase tracking-wider leading-none mt-1">
                          {scan.verdictNoun}
                        </span>
                      </div>
                    </div>

                    {/* Commentary */}
                    <p className="text-xs text-neutral-400 italic line-clamp-2">
                      "{scan.commentary}"
                    </p>

                    {/* Action Panel */}
                    <div className="flex gap-2 mt-2 pt-3 border-t border-neutral-900/50">
                      <Button
                        variant="secondary"
                        onClick={() => handleLike(scan.id)}
                        className="flex-1 py-1.5 text-xs"
                      >
                        {scan.likedByMe ? "Liked" : "Like"} ({scan.likeCount})
                      </Button>
                      <Link href={`/scan/${scan.id}`} className="flex-1">
                        <Button variant="ghost" className="w-full py-1.5 text-xs">
                          View Ledger
                        </Button>
                      </Link>
                    </div>
                  </Card>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
