import {
  KEYWORD_SERP_CHUNK_KIND,
  KEYWORD_SERP_KIND,
  type KeywordSerpChunkItem,
  type KeywordSerpItem,
  type KeywordSerpPlan,
} from '@kiditem/shared/advertising-operations';
import { attentionReporter, type Collector, type OperatorAttention } from '../collector';
import { registerCollector } from '../index';

/** 이 수집기가 쿠팡 검색에서 쓰는 것(`sites/coupang-search`의 SERP 읽기가 구현). */
export interface KeywordSerpSite {
  serp(keyword: string, maxPages: number, options?: { onAttention?(attention: OperatorAttention | null): void | Promise<void> }): Promise<{
    pagesScanned: number;
    stopReason: KeywordSerpChunkItem['stopReason'];
    items: KeywordSerpItem[];
  }>;
  closeSerp(): Promise<void>;
}

/**
 * `advertising.keyword_serp`(KID-362): 계획한 키워드마다 www.coupang.com 검색 결과를 최대 `maxPages`쪽 읽어 키워드마다
 * 청크 한 장(`keyword_serp`)을 낸다. 보안 확인 화면에서는 운영자를 기다리며 progress에 `attention`을 싣는다.
 * 어느 상품이 몇 위인지는 서버 finalize가 plan의 대상으로 정한다. 읽기만 한다.
 */
export const advertisingKeywordSerpCollector: Collector<KeywordSerpPlan, Record<string, unknown>, KeywordSerpSite> = {
  kind: KEYWORD_SERP_KIND,
  site: 'coupang-search',
  async *collect(plan, site, { signal, report }) {
    try {
      for (const [index, { keyword, maxPages }] of plan.keywords.entries()) {
        if (signal.aborted) return;
        const read = await site.serp(keyword, maxPages, {
          onAttention: attentionReporter(report, { current: index, total: plan.keywords.length, label: keyword }),
        });
        const chunk: KeywordSerpChunkItem = { keyword, capturedAt: new Date().toISOString(), ...read };
        yield {
          chunkKind: KEYWORD_SERP_CHUNK_KIND,
          payload: [chunk],
          progress: { current: index + 1, total: plan.keywords.length, label: keyword },
        };
      }
    } finally {
      await site.closeSerp();
    }
  },
};

registerCollector(advertisingKeywordSerpCollector);
