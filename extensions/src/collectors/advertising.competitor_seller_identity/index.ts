import {
  COMPETITOR_SELLER_IDENTITY_CHUNK_KIND,
  COMPETITOR_SELLER_IDENTITY_KIND,
  type CompetitorSellerIdentityItem,
  type CompetitorSellerIdentityPlan,
} from '@kiditem/shared/advertising-operations';
import { attentionReporter, type Collector, type OperatorAttention } from '../collector';
import { registerCollector } from '../index';

/** 이 수집기가 쿠팡 상품 상세에서 쓰는 것(`sites/coupang-product`가 구현). */
export interface CoupangProductSellerSite {
  sellerIdentity(link: string, options: { label: string; onAttention?(attention: OperatorAttention | null): void | Promise<void> }): Promise<{
    sellerName: string;
    sellerId: string;
    sellerStoreUrl: string;
  } | null>;
  close(): Promise<void>;
}

/**
 * `advertising.competitor_seller_identity`(KID-362): 계획한 경쟁 상품의 상세를 상품마다 한 번 열어(같은 상품이 여러 키워드에
 * 있어도 한 번) 판매자 상점 링크를 읽고, 그 상품의 대상마다 원소를 만들어 상품마다 청크 한 장(`seller_identity`)을 낸다.
 * 판매자를 못 읽은 상품은 건너뛴다 — 계획한 대상을 모두 확인했는지는 서버 finalize가 본다. 읽기만 한다.
 */
export const advertisingCompetitorSellerIdentityCollector: Collector<CompetitorSellerIdentityPlan, Record<string, unknown>, CoupangProductSellerSite> = {
  kind: COMPETITOR_SELLER_IDENTITY_KIND,
  site: 'coupang-product',
  async *collect(plan, site, { signal, report }) {
    const byProduct = new Map<string, CompetitorSellerIdentityPlan['targets']>();
    for (const target of plan.targets) byProduct.set(target.productKey, [...(byProduct.get(target.productKey) ?? []), target]);
    try {
      let index = 0;
      for (const [productKey, targets] of byProduct) {
        if (signal.aborted) return;
        const first = targets[0]!;
        const seller = await site.sellerIdentity(first.link, {
          label: first.name || productKey,
          onAttention: attentionReporter(report, { current: index, total: byProduct.size, label: first.name || productKey }),
        });
        index += 1;
        const capturedAt = new Date().toISOString();
        const items: CompetitorSellerIdentityItem[] = seller
          ? targets.map((target) => ({
            keyword: target.keyword,
            productKey: target.productKey,
            productId: target.productId,
            vendorItemId: target.vendorItemId,
            link: target.link,
            ...seller,
            capturedAt,
          }))
          : [];
        yield {
          chunkKind: COMPETITOR_SELLER_IDENTITY_CHUNK_KIND,
          payload: items,
          progress: { current: index, total: byProduct.size, label: first.name || productKey },
        };
      }
    } finally {
      await site.close();
    }
  },
};

registerCollector(advertisingCompetitorSellerIdentityCollector);
