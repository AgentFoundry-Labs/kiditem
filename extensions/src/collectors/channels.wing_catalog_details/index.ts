import type {
  CoupangCatalogDetailProductV1,
  WingCatalogDeletionConfirmationItem,
} from '@kiditem/shared/coupang-catalog-snapshot';
import { WING_CATALOG_CHUNK_KINDS, WING_CATALOG_DETAILS_KIND } from '@kiditem/shared/coupang-catalog-snapshot';
import { ChunkBuffer } from '../chunk-items';
import type { CollectedChunk, Collector } from '../collector';
import { registerCollector } from '../index';

/** 이 수집기가 Wing에서 쓰는 것(`sites/wing`이 구현, 입구가 넘긴다). */
export interface WingCatalogDetailsSite {
  /** 상품 상세 하나. Wing에 그 상품이 없으면(404) null. */
  productDetail(externalProductId: string): Promise<CoupangCatalogDetailProductV1 | null>;
  /** 사라진 상품 최대 100개의 삭제 여부. 입력 순서대로 하나씩 돌려준다. */
  probeDeleted(externalProductIds: readonly string[]): Promise<WingCatalogDeletionConfirmationItem[]>;
}

export interface WingCatalogDetailsPlan {
  channelAccountId: string;
  detailTargetProductIds: string[];
  absentProductIds: string[];
}

const DETAILS_PER_CHUNK = 20;
const PROBE_BATCH = 100;

/**
 * `channels.wing_catalog_details`(KID-354·351 작업 ①·③): 서버 plan이 정한 대상만 상세를 받아 `full_details`로,
 * 목록에서 사라진 상품은 100개씩 삭제 여부를 물어 `deletion_confirmation`으로 보낸다. 대상 계산·반영은 서버가 한다.
 * 상세가 없는(404) 대상은 건너뛴다 — 서버가 그 상품을 그대로 두어 다음 동기화가 다시 잡는다.
 */
export const wingCatalogDetailsCollector: Collector<WingCatalogDetailsPlan, Record<string, unknown>, WingCatalogDetailsSite> = {
  kind: WING_CATALOG_DETAILS_KIND,
  site: 'wing',
  async *collect(plan, site, { signal }) {
    const targets = plan.detailTargetProductIds;
    const absent = plan.absentProductIds;
    const missing: string[] = [];
    let detailsDone = 0;
    let absentChecked = 0;
    const progress = () => ({
      detailsDone,
      detailTargets: targets.length,
      absentChecked,
      absentTotal: absent.length,
      detailsMissing: [...missing],
    });
    const details = new ChunkBuffer<CoupangCatalogDetailProductV1>({ maxItems: DETAILS_PER_CHUNK, label: 'Wing 상세 상품' });
    const chunk = (chunkKind: string, payload: unknown[]): CollectedChunk => ({ chunkKind, payload, progress: progress() });
    for (const externalProductId of targets) {
      if (signal.aborted) return;
      const product = await site.productDetail(externalProductId);
      if (!product) {
        missing.push(externalProductId);
        continue;
      }
      detailsDone += 1;
      const full = details.push(product);
      if (full) yield chunk(WING_CATALOG_CHUNK_KINDS.fullDetails, full);
    }
    const rest = details.flush();
    if (rest) yield chunk(WING_CATALOG_CHUNK_KINDS.fullDetails, rest);
    for (let offset = 0; offset < absent.length; offset += PROBE_BATCH) {
      if (signal.aborted) return;
      const confirmations = await site.probeDeleted(absent.slice(offset, offset + PROBE_BATCH));
      absentChecked += confirmations.length;
      yield chunk(WING_CATALOG_CHUNK_KINDS.deletionConfirmation, confirmations);
    }
  },
};

registerCollector(wingCatalogDetailsCollector);
