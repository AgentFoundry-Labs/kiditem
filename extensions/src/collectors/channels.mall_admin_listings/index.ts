import {
  MALL_ADMIN_LISTINGS_CHUNK_KIND,
  MALL_ADMIN_LISTINGS_KIND,
  MALL_ADMIN_LISTINGS_SCAN_CHUNK_KIND,
} from '@kiditem/shared/channels-operations';
import {
  MallAdminListingRowSchema,
  MallAdminListingsPlanSchema,
  MallAdminListingsScanSchema,
  type MallAdminListingsPlan,
} from '@kiditem/shared/mall-admin-listings';
import { RuntimeError } from '../../core/errors';
import { ChunkBuffer } from '../chunk-items';
import type { Collector } from '../collector';
import { registerCollector } from '../index';

/** 몰 하나의 등록 상품 목록 읽기(`sites/<mallKey>`의 `listings.ts`가 구현). 옛 읽기기의 결과 모양 그대로다. */
export interface MallListingsReader {
  readListings(plan: Record<string, unknown>): Promise<{ collection: Record<string, unknown>; rows: unknown[]; proof: Record<string, unknown> }>;
}

/** 이 수집기가 쓰는 사이트: 몰 키 → 그 몰 읽기(`sites/mall-admin-listings`가 1차 몰 사이트를 이름으로 찾아 준다). */
export interface MallAdminListingsSite {
  reader(mallKey: string): Partial<MallListingsReader> | null;
}

const RUNTIME_PLAN_INVALID = 'RUNTIME_PLAN_INVALID' as const;
const SOURCE_SNAPSHOT_INVALID = 'SOURCE_SNAPSHOT_INVALID' as const;
const CHUNK_ROWS = 1_000;

/**
 * `channels.mall_admin_listings`(KID-363 L2, 1차 몰 넷): 서버 plan의 몰 하나를 그 몰 사이트로 읽는다(옛 읽기기 본문 그대로).
 * 상품 줄을 1,000개씩 `listing_rows`로, 끝에 읽은 증거 `listing_scan` 하나를 낸다. 목록 전체인지·발행은 서버 finalize가
 * 한다. 모양이 틀린 줄은 올리지 않고 멈춘다(부분 목록은 몰에서 내려간 상품처럼 보인다).
 */
export const mallAdminListingsCollector: Collector<MallAdminListingsPlan, Record<string, unknown>, MallAdminListingsSite> = {
  kind: MALL_ADMIN_LISTINGS_KIND,
  site: 'mall-admin-listings',
  async *collect(rawPlan, site, { signal }) {
    const parsed = MallAdminListingsPlanSchema.safeParse(rawPlan);
    const reader = parsed.success && site ? site.reader(parsed.data.mallKey) : null;
    if (!parsed.success || !reader?.readListings) {
      throw new RuntimeError(RUNTIME_PLAN_INVALID, '이 확장이 가져올 수 없는 몰 상품 목록 계획입니다.', {
        kind: MALL_ADMIN_LISTINGS_KIND,
        mallKey: parsed.success ? parsed.data.mallKey : null,
      });
    }
    const plan = parsed.data;
    const snapshot = await reader.readListings(plan);
    if (signal.aborted) return;
    const scan = MallAdminListingsScanSchema.safeParse({ collection: snapshot.collection, proof: snapshot.proof });
    if (!scan.success) {
      throw new RuntimeError(SOURCE_SNAPSHOT_INVALID, '몰 상품 목록의 읽은 증거가 올바르지 않습니다.', { mallKey: plan.mallKey, stage: 'scan' });
    }
    const progress = { mallKey: plan.mallKey, rows: snapshot.rows.length };
    const buffer = new ChunkBuffer<unknown>({ maxItems: CHUNK_ROWS, label: '몰 상품 한 줄' });
    for (const [index, row] of snapshot.rows.entries()) {
      const checked = MallAdminListingRowSchema.safeParse(row);
      if (!checked.success) {
        throw new RuntimeError(SOURCE_SNAPSHOT_INVALID, '몰 상품 목록에 올바르지 않은 줄이 있습니다.', { mallKey: plan.mallKey, stage: 'row', index });
      }
      const full = buffer.push(checked.data);
      if (full) yield { chunkKind: MALL_ADMIN_LISTINGS_CHUNK_KIND, payload: full, progress };
    }
    const rest = buffer.flush();
    if (rest) yield { chunkKind: MALL_ADMIN_LISTINGS_CHUNK_KIND, payload: rest, progress };
    yield { chunkKind: MALL_ADMIN_LISTINGS_SCAN_CHUNK_KIND, payload: [scan.data], progress };
  },
};

registerCollector(mallAdminListingsCollector);
