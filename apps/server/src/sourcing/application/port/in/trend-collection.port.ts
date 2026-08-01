import type {
  TrendCollectResult,
  TrendCollectSource,
} from '../../service/trend-collect.service';

export const TREND_COLLECTION_PORT = Symbol('TREND_COLLECTION_PORT');

export interface TrendCollectionPort {
  collect(
    organizationId: string,
    sources?: TrendCollectSource[],
  ): Promise<TrendCollectResult>;
}
