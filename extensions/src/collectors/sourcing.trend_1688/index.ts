import { SOURCING_CHUNK_KINDS, SOURCING_OPERATION_KINDS } from '@kiditem/shared/sourcing-operation';
import { attentionReporter, type Collector, type OperatorAttention } from '../collector';
import { registerCollector } from '../index';

/** 이 수집기가 1688에서 쓰는 것(`sites/1688`이 구현). */
export interface Trend1688Site {
  offers(keyword: string, options?: { onAttention?(attention: OperatorAttention | null): void | Promise<void> }): Promise<Array<Record<string, unknown>>>;
  close(): Promise<void>;
}

export interface Trend1688Plan {
  keywords: string[];
}

/**
 * `sourcing.trend_1688`(KID-360): 서버가 트렌드 시드에서 정한 키워드마다 1688 검색 상위 상품을 읽어 키워드당 청크
 * 한 장(`offers_1688`, 원소 = 옛 attempt 본문의 `{keyword, items}`)을 낸다. 한 키워드라도 못 읽으면 실행이 실패한다
 * (옛 attempt도 오류가 있으면 SOURCE_PLAN_INCOMPLETE였다). 키워드가 없으면 청크 없이 끝나 빈 발행이 된다.
 */
export const sourcingTrend1688Collector: Collector<Trend1688Plan, Record<string, unknown>, Trend1688Site> = {
  kind: SOURCING_OPERATION_KINDS.trend1688,
  site: 'ali1688',
  async *collect(plan, site, { signal, report }) {
    try {
      for (const [index, keyword] of plan.keywords.entries()) {
        if (signal.aborted) return;
        const items = await site.offers(keyword, { onAttention: attentionReporter(report, { current: index, total: plan.keywords.length, label: keyword }) });
        yield {
          chunkKind: SOURCING_CHUNK_KINDS.offers1688,
          payload: [{ keyword, items }],
          progress: { current: index + 1, total: plan.keywords.length, label: keyword },
        };
      }
    } finally {
      await site.close();
    }
  },
};

registerCollector(sourcingTrend1688Collector);
