import type {
  ThumbnailTrackingStatus,
  UpdateThumbnailTrackingMetrics,
} from '@kiditem/shared/ai';

export const THUMBNAIL_TRACKING_REPOSITORY_PORT = Symbol(
  'THUMBNAIL_TRACKING_REPOSITORY_PORT',
);

export interface ThumbnailTrackingRow {
  id: string;
  organizationId: string;
  listingId: string;
  generationId: string;
  originalGrade: string;
  originalScore: number;
  appliedAt: Date;
  status: string;
  ctrBefore: number | null;
  ctrAfter: number | null;
  reviewsBefore: number | null;
  reviewsAfter: number | null;
  salesBefore: number | null;
  salesAfter: number | null;
  listing: { id: string; master: { id: string; name: string } | null } | null;
}

export interface ThumbnailTrackingSnapshotTargetRow {
  id: string;
  salesBefore: number | null;
  listing: {
    channelName: string | null;
    master: { name: string | null } | null;
  } | null;
}

export interface ThumbnailTrackingSnapshotRow {
  id: string;
  trackingId: string;
  capturedAt: Date;
  capturedDate: Date;
  unitsSold30d: number | null;
  unitsSold7d: number | null;
  revenueKrw: number | null;
  reviewCount: number | null;
  ratingAvg: number | null;
  scrapeStatus: string;
  errorMessage: string | null;
}

export interface CreateThumbnailTrackingInput {
  organizationId: string;
  listingId: string;
  generationId: string;
  originalGrade: string;
  originalScore: number;
}

export interface UpdateThumbnailTrackingInput {
  id: string;
  organizationId: string;
  metrics: UpdateThumbnailTrackingMetrics;
}

export interface UpsertThumbnailTrackingDailySnapshotInput {
  organizationId: string;
  trackingId: string;
  capturedDate: Date;
  unitsSold30d: number | null;
  unitsSold7d: number | null;
  revenueKrw: number | null;
  reviewCount: number | null;
  ratingAvg: number | null;
  rawCellTexts: string[];
  scrapeStatus: string;
  errorMessage: string | null;
  setSalesBefore: boolean;
}

export interface ThumbnailTrackingRepositoryPort {
  findTrackings(
    query: { skip: number; take: number; status?: ThumbnailTrackingStatus },
    organizationId: string,
  ): Promise<ThumbnailTrackingRow[]>;
  countTrackings(
    query: { status?: ThumbnailTrackingStatus },
    organizationId: string,
  ): Promise<number>;
  findFirstListingForMaster(
    masterId: string,
    organizationId: string,
  ): Promise<{ id: string } | null>;
  createTracking(input: CreateThumbnailTrackingInput): Promise<
    | { created: true; row: ThumbnailTrackingRow }
    | { created: false; row: ThumbnailTrackingRow }
    | { created: false; row: null }
  >;
  updateMetrics(input: UpdateThumbnailTrackingInput): Promise<ThumbnailTrackingRow | null>;
  findTrackingForSnapshot(
    trackingId: string,
    organizationId: string,
  ): Promise<ThumbnailTrackingSnapshotTargetRow | null>;
  upsertDailySnapshot(
    input: UpsertThumbnailTrackingDailySnapshotInput,
  ): Promise<ThumbnailTrackingSnapshotRow>;
  listSnapshots(
    trackingId: string,
    organizationId: string,
  ): Promise<ThumbnailTrackingSnapshotRow[]>;
  findActiveTrackings(organizationId: string): Promise<Array<{ id: string }>>;
}
