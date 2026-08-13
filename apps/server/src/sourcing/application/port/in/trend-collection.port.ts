import type {
  TrendCollectResult,
  TrendCollectSource,
} from '../../service/trend-collect.service';

export const TREND_COLLECTION_PORT = Symbol('TREND_COLLECTION_PORT');

export interface TrendCollectionPort {
  collect(
    organizationId: string,
    sources?: TrendCollectSource[],
    /**
     * 수집 직후 증거 원장 적재를 함께 수행할 때 필요한 실행 주체. 증거 수집 run 은
     * 누가 돌렸는지를 기록해야 하므로, 주체를 모르면 적재는 건너뛰고 수집만 한다.
     */
    triggeredByUserId?: string | null,
    /** An Operations run key fences duplicate dispatch after navigation/retry. */
    collectionRunKey?: string,
    signal?: AbortSignal,
  ): Promise<TrendCollectResult>;
}
