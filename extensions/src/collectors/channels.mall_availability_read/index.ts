import {
  MALL_AVAILABILITY_READ_KIND,
  MALL_AVAILABILITY_ROWS_CHUNK_KIND,
  MallAvailabilityReadPlanSchema,
  type MallAvailabilityReadPlan,
  type MallAvailabilityReadResult,
  type MallAvailabilityRow,
} from '@kiditem/shared/channels-operations';
import { findChannel } from '@kiditem/shared/channel-registry';
import { RuntimeError } from '../../core/errors';
import type { CollectedChunk, CollectFinish, Collector } from '../collector';
import { registerCollector } from '../index';

/** 몰이 준 지금 상태 한 상품(옛 `read` 결과 모양). 판매중이면 재고 모름(null), 못 사면 0과 몰의 상태 글자. */
export interface MallAvailabilityReadProduct {
  code: string;
  options: Array<{ optionCode: string; stock: number | null; rocket: boolean; state?: string }>;
}

/** 이 수집기가 쓰는 사이트: 몰 키 → 그 몰 읽기(`sites/mall-write`). 몰이 거절한 답·로그인은 사이트가 던진다. */
export interface MallAvailabilityReadSite {
  reader(mallKey: string): { read(codes: string[]): Promise<{ products: MallAvailabilityReadProduct[]; missing: string[] }> } | null;
}

/** 한 번에 읽는 리스팅 수(옛 `READ_LIMIT` — 윙 등록현황 한 페이지). */
const READ_BATCH = 50;

/**
 * `channels.mall_availability_read`(KID-256 — 옛 `readMallAvailability`, 품절 후보 미리보기·자동 실시간 확인): 몰에서 지금
 * 판매 상태를 읽기만 한다. 50개씩 읽어 묶음마다 `availability_rows`를 낸다. 옵션 단위 몰(쿠팡 윙)은 옵션마다 한 줄이고
 * 로켓그로스 옵션을 표시한다. 리스팅 단위 몰은 상품마다 한 줄(옵션 id 없음)이다.
 */
export const mallAvailabilityReadCollector: Collector<MallAvailabilityReadPlan, MallAvailabilityReadResult & Record<string, unknown>, MallAvailabilityReadSite> = {
  kind: MALL_AVAILABILITY_READ_KIND,
  site: 'mall-write',
  async *collect(rawPlan, site): AsyncGenerator<CollectedChunk, CollectFinish<MallAvailabilityReadResult & Record<string, unknown>>, undefined> {
    const parsed = MallAvailabilityReadPlanSchema.safeParse(rawPlan);
    if (!parsed.success) throw new RuntimeError('RUNTIME_PLAN_INVALID', '이 확장이 실행할 수 없는 판매 상태 읽기 계획입니다.', { kind: MALL_AVAILABILITY_READ_KIND });
    const plan = parsed.data;
    const reader = site?.reader(plan.mallKey) ?? null;
    if (!reader) {
      throw new RuntimeError('RUNTIME_PLAN_INVALID', `이 확장에 ${plan.mallKey} 몰 판매 상태 읽기가 없습니다.`, { kind: MALL_AVAILABILITY_READ_KIND, mallKey: plan.mallKey });
    }
    const byOption = findChannel(plan.mallKey)?.soldOutScope === 'option';
    const codes = [...new Set(plan.externalListingIds)];
    const rows: MallAvailabilityRow[] = [];
    const missing: string[] = [];
    for (let start = 0; start < codes.length; start += READ_BATCH) {
      const batch = codes.slice(start, start + READ_BATCH);
      const read = await reader.read(batch);
      const observedAt = new Date().toISOString();
      const batchRows = read.products.flatMap((product) => product.options.map((option): MallAvailabilityRow => ({
        externalListingId: product.code,
        externalOptionId: byOption ? option.optionCode : null,
        available: option.stock !== 0,
        stock: option.stock,
        rocket: option.rocket,
        observedStatus: option.state ?? null,
        observedAt,
      })));
      missing.push(...read.missing);
      rows.push(...batchRows);
      if (batchRows.length > 0) {
        yield { chunkKind: MALL_AVAILABILITY_ROWS_CHUNK_KIND, payload: batchRows, progress: { mallKey: plan.mallKey, read: Math.min(start + batch.length, codes.length), total: codes.length } };
      }
    }
    return { result: { rowCount: rows.length, missingExternalListingIds: missing, rows } };
  },
};

registerCollector(mallAvailabilityReadCollector);
