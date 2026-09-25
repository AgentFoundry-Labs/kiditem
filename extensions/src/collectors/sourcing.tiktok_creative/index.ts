import { SOURCING_CHUNK_KINDS, SOURCING_OPERATION_KINDS } from '@kiditem/shared/sourcing-operation';
import type { Collector } from '../collector';
import { registerCollector } from '../index';

export interface TiktokTargetLike {
  id: string;
}

/** 이 수집기가 Creative Center에서 쓰는 것(`sites/tiktok-cc`가 구현). */
export interface TiktokCreativeSite<TTarget extends TiktokTargetLike = TiktokTargetLike> {
  targetFor(targetId: string): TTarget;
  target(target: TTarget, defaultRegion: string | null): Promise<{ region: string | null; items: Array<Record<string, unknown>> }>;
  close(): Promise<void>;
}

export interface TiktokCreativePlan {
  targetIds: string[];
  maxItems: number;
  regionOverride: string | null;
}

/** 어느 화면에서도 지역을 읽지 못했을 때(옛 수집기 값). */
const FALLBACK_REGION = 'US';

/**
 * `sourcing.tiktok_creative`(KID-360): 서버 plan의 대상(해시태그·상품·시드 키워드)을 차례로 읽어 `trendType::entityKey`로
 * 겹침을 걸러 `maxItems`까지 모은다. 상한에 닿으면 남은 대상은 건너뛴다(서버가 방문 순서의 앞부분으로 인정). 한 대상이라도
 * 못 읽으면 실행이 실패한다. 지역은 대상마다 같아야 하므로 끝까지 모은 뒤 대상당 청크(`creative_trends`)로 낸다.
 */
export const sourcingTiktokCreativeCollector: Collector<TiktokCreativePlan, Record<string, unknown>, TiktokCreativeSite> = {
  kind: SOURCING_OPERATION_KINDS.tiktokCreative,
  site: 'tiktok',
  async *collect(plan, site, { signal }) {
    const visits: Array<{ targetId: string; items: Array<Record<string, unknown>> }> = [];
    const seen = new Set<string>();
    let region: string | null = plan.regionOverride;
    let total = 0;
    try {
      for (const targetId of plan.targetIds) {
        if (signal.aborted) return;
        const captured = await site.target(site.targetFor(targetId), region);
        region ??= captured.region;
        const items: Array<Record<string, unknown>> = [];
        for (const item of captured.items) {
          if (total >= plan.maxItems) break;
          if (!item.trendType || !item.entityKey) continue;
          const key = `${String(item.trendType)}::${String(item.entityKey)}`;
          if (seen.has(key)) continue;
          seen.add(key);
          items.push(item);
          total += 1;
        }
        visits.push({ targetId, items });
        if (total >= plan.maxItems) break;
      }
    } finally {
      await site.close();
    }
    for (const [index, visit] of visits.entries()) {
      yield {
        chunkKind: SOURCING_CHUNK_KINDS.creativeTrends,
        payload: [{ targetId: visit.targetId, region: region ?? FALLBACK_REGION, items: visit.items }],
        progress: { current: index + 1, total: visits.length, label: visit.targetId },
      };
    }
  },
};

registerCollector(sourcingTiktokCreativeCollector);
