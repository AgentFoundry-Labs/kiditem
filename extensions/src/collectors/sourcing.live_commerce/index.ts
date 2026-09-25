import { SOURCING_CHUNK_KINDS, SOURCING_OPERATION_KINDS } from '@kiditem/shared/sourcing-operation';
import { attentionReporter, type Collector, type OperatorAttention } from '../collector';
import { registerCollector } from '../index';

/** 이 수집기가 방송 페이지에서 쓰는 것(`sites/live-commerce`가 구현). */
export interface LiveCommerceSite {
  broadcast(pageUrl: string, options?: { onAttention?(attention: OperatorAttention | null): void | Promise<void> }): Promise<{
    source: '1688' | 'douyin';
    pageUrl: string;
    broadcast: Record<string, unknown>;
    products: Array<Record<string, unknown>>;
  }>;
}

export interface LiveCommercePlan {
  source: '1688' | 'douyin';
  pageUrl: string;
}

/**
 * `sourcing.live_commerce`(KID-360): 서버가 얼린 방송 주소 하나를 읽어 방송 한 장(`live_broadcast`,
 * `{source, pageUrl, broadcast}`)과 상품들(`live_products`)을 낸다. 상품이 없으면 방송 청크만 간다.
 */
export const sourcingLiveCommerceCollector: Collector<LiveCommercePlan, Record<string, unknown>, LiveCommerceSite> = {
  kind: SOURCING_OPERATION_KINDS.liveCommerce,
  site: 'live-commerce',
  async *collect(plan, site, { signal, report }) {
    if (signal.aborted) return;
    const captured = await site.broadcast(plan.pageUrl, { onAttention: attentionReporter(report, { current: 0, total: 1, label: '방송' }) });
    if (signal.aborted) return;
    yield {
      chunkKind: SOURCING_CHUNK_KINDS.liveBroadcast,
      payload: [{ source: captured.source, pageUrl: captured.pageUrl, broadcast: captured.broadcast }],
      progress: { current: 1, total: 1, label: '방송' },
    };
    if (captured.products.length > 0) {
      yield { chunkKind: SOURCING_CHUNK_KINDS.liveProducts, payload: captured.products, progress: { products: captured.products.length } };
    }
  },
};

registerCollector(sourcingLiveCommerceCollector);
