import type {
  TrendCollectResult,
  TrendCollectSource,
  TrendSourceCollectResult,
} from '../../service/trend-collect.service';

export const TREND_COLLECTION_PORT = Symbol('TREND_COLLECTION_PORT');

export interface TrendCollectionControls {
  signal?: AbortSignal;
}

export interface TrendCollectionPort {
  /** Server-owned 1688 targets used to create an immutable browser child input. */
  list1688Targets(organizationId: string): Promise<Array<{
    label: string;
    keyword: string;
  }>>;
  collectSource(
    organizationId: string,
    source: TrendCollectSource,
    triggeredByUserId?: string | null,
    collectionRunKey?: string,
    controls?: TrendCollectionControls,
  ): Promise<TrendSourceCollectResult & { businessDate: string }>;
  collect(
    organizationId: string,
    sources?: TrendCollectSource[],
    /** Optional requesting user recorded on the canonical source attempt. */
    triggeredByUserId?: string | null,
    /** An explicit request key replays the original source attempt. */
    collectionRunKey?: string,
    signal?: AbortSignal,
  ): Promise<TrendCollectResult>;
}
