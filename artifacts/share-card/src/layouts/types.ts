export interface LayoutProps {
  scan: {
    id: string;
    username: string | null;
    category: string;
    score: number;
    tier: string;
    verdictNoun: string;
    coreStats: { aura: number; power: number; status: number; threat: number };
    categoryStats: Record<string, number>;
    commentary: string;
    description: string | null;
    anomalyType: string | null;
    imageObjectKey: string;
    thumbnailObjectKey: string;
    createdAt: Date | string;
  };
  imageUrl: string;
  baseUrl: string;
}
