export const LIVE_COMMERCE_REPOSITORY_PORT = Symbol('LiveCommerceRepositoryPort');

export const LIVE_COMMERCE_SOURCES = ['taobao', '1688', 'douyin'] as const;
export type LiveCommerceSource = (typeof LIVE_COMMERCE_SOURCES)[number];

export interface LiveCommerceBroadcastSnapshotUpsert {
  organizationId: string;
  businessDate: Date;
  source: LiveCommerceSource;
  broadcastId: string;
  title: string | null;
  broadcasterId: string | null;
  broadcasterName: string | null;
  status: string | null;
  viewerCount: number | null;
  likeCount: number | null;
  startedAt: Date | null;
  endedAt: Date | null;
  coverImageUrl: string | null;
  sourceUrl: string | null;
  capturedAt: Date;
}

export interface LiveCommerceProductSnapshotUpsert {
  organizationId: string;
  businessDate: Date;
  source: LiveCommerceSource;
  broadcastId: string;
  productId: string;
  rank: number | null;
  title: string | null;
  priceCny: number | null;
  salesCount: number | null;
  imageUrl: string | null;
  sourceUrl: string | null;
  capturedAt: Date;
}

export type LiveCommerceBroadcastSnapshotRow = Omit<LiveCommerceBroadcastSnapshotUpsert, 'organizationId'>;

export type LiveCommerceProductSnapshotRow = Omit<LiveCommerceProductSnapshotUpsert, 'organizationId'>;

export interface LiveCommerceSnapshotQuery {
  organizationId: string;
  days: number;
  source?: LiveCommerceSource;
}

export interface LiveCommerceRepositoryPort {
  upsertBroadcastSnapshots(rows: LiveCommerceBroadcastSnapshotUpsert[]): Promise<number>;
  upsertProductSnapshots(rows: LiveCommerceProductSnapshotUpsert[]): Promise<number>;
  findBroadcastSnapshots(query: LiveCommerceSnapshotQuery): Promise<LiveCommerceBroadcastSnapshotRow[]>;
  findProductSnapshots(query: LiveCommerceSnapshotQuery): Promise<LiveCommerceProductSnapshotRow[]>;
}
