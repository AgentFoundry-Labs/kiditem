import { SOURCING_CHUNK_KINDS, SOURCING_OPERATION_KINDS } from '@kiditem/shared/sourcing-operation';
import type { Collector } from '../collector';
import { registerCollector } from '../index';

/** 이 수집기가 운영자 탭에서 쓰는 것(`sites/product-page`가 구현). */
export interface ProductExtensionSite {
  extract(sourceUrl: string): Promise<{ product: Record<string, unknown>; description?: Record<string, unknown>; hadDescription: boolean }>;
}

export interface ProductExtensionPlan {
  sourceUrl: string;
}

/**
 * `sourcing.product_extension`(KID-360): 운영자가 연 1688·Alibaba 상품 탭(서버가 얼린 주소)을 읽어 상품 문서 한 장
 * (`product_document`, 옛 extension-ingest 완료 본문 `{product, description?, hadDescription}`)을 낸다.
 */
export const sourcingProductExtensionCollector: Collector<ProductExtensionPlan, Record<string, unknown>, ProductExtensionSite> = {
  kind: SOURCING_OPERATION_KINDS.productExtension,
  site: 'product-page',
  async *collect(plan, site, { signal }) {
    if (signal.aborted) return;
    const document = await site.extract(plan.sourceUrl);
    if (signal.aborted) return;
    yield { chunkKind: SOURCING_CHUNK_KINDS.productDocument, payload: [document], progress: { current: 1, total: 1, label: '상품' } };
  },
};

registerCollector(sourcingProductExtensionCollector);
