import {
  COMPETITOR_CATALOG_CHUNK_KIND,
  COMPETITOR_CATALOG_KIND,
  type CompetitorCatalogItem,
  type CompetitorCatalogPlan,
  type CompetitorCatalogTarget,
} from '@kiditem/shared/advertising-operations';
import { attentionReporter, type Collector, type OperatorAttention } from '../collector';
import { registerCollector } from '../index';

/** 이 수집기가 판매자샵에서 쓰는 것(`sites/coupang-shop`이 구현). */
export interface CoupangShopCatalogSite {
  catalog(target: CompetitorCatalogTarget, productLimit: number, options?: { onAttention?(attention: OperatorAttention | null): void | Promise<void> }): Promise<CompetitorCatalogItem>;
  close(): Promise<void>;
}

/**
 * `advertising.competitor_catalog`(KID-362): 서버가 고른 판매자샵마다 최신순 상품을 상한(`productLimit`)까지 읽어 판매자마다
 * 청크 한 장(`seller_catalog`)을 낸다. 한 판매자라도 못 읽으면 실행이 실패한다(서버가 모든 판매자를 요구한다). 읽기만 한다.
 */
export const advertisingCompetitorCatalogCollector: Collector<CompetitorCatalogPlan, Record<string, unknown>, CoupangShopCatalogSite> = {
  kind: COMPETITOR_CATALOG_KIND,
  site: 'coupang-shop',
  async *collect(plan, site, { signal, report }) {
    try {
      for (const [index, target] of plan.targets.entries()) {
        if (signal.aborted) return;
        const catalog = await site.catalog(target, plan.productLimit, {
          onAttention: attentionReporter(report, { current: index, total: plan.targets.length, label: target.sellerName }),
        });
        yield {
          chunkKind: COMPETITOR_CATALOG_CHUNK_KIND,
          payload: [catalog],
          progress: { current: index + 1, total: plan.targets.length, label: target.sellerName },
        };
      }
    } finally {
      await site.close();
    }
  },
};

registerCollector(advertisingCompetitorCatalogCollector);
