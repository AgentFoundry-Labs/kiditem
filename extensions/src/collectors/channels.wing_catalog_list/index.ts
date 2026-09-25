import type { CoupangCatalogBasicProductV1 } from '@kiditem/shared/coupang-catalog-snapshot';
import { WING_CATALOG_CHUNK_KINDS, WING_CATALOG_LIST_KIND } from '@kiditem/shared/coupang-catalog-snapshot';
import { RuntimeError } from '../../core/errors';
import { ChunkBuffer } from '../chunk-items';
import type { CollectedChunk, Collector } from '../collector';
import { registerCollector } from '../index';

/** 이 수집기가 Wing에서 쓰는 것(`sites/wing`이 구현, 입구가 넘긴다). */
export interface WingCatalogListSite {
  /** 목록 한 페이지(500개). 페이지 안의 모양·행 수 검증은 사이트가 한다. `vendorId`가 있으면 다른 판매자 행을 거절한다. */
  searchInventory(page: number, vendorId: string | null): Promise<{
    page: number;
    pageSize: number;
    totalItems: number;
    totalPages: number;
    products: CoupangCatalogBasicProductV1[];
  }>;
}

export interface WingCatalogListPlan {
  channelAccountId: string;
  /** 계정의 Wing 판매자 ID(서버 plan). 다른 판매자로 로그인된 Wing의 목록을 이 계정에 올리지 않는다. */
  vendorId?: string | null;
}

export const CATALOG_LIST_INCOMPLETE = 'CATALOG_LIST_INCOMPLETE' as const;
const PRODUCTS_PER_CHUNK = 20;

/**
 * `channels.wing_catalog_list`(KID-354·351 작업 ①): Wing 목록 전체를 1페이지부터 받아 `listing_basics`로 보낸다.
 * 페이지 수·상품 수가 Wing `pagination`과 끝까지 맞아야 완결이다 — 아니면 `CATALOG_LIST_INCOMPLETE`로 실패해 서버가
 * 부분 목록을 반영하지 않는다. 상세 대상 계산은 서버가 한다(result.next → 상세 kind).
 */
export const wingCatalogListCollector: Collector<WingCatalogListPlan, Record<string, unknown>, WingCatalogListSite> = {
  kind: WING_CATALOG_LIST_KIND,
  site: 'wing',
  async *collect(plan, site, { signal }) {
    const buffer = new ChunkBuffer<CoupangCatalogBasicProductV1>({ maxItems: PRODUCTS_PER_CHUNK, label: 'Wing 목록 상품' });
    const seen = new Set<string>();
    let expected: { totalItems: number; totalPages: number } | null = null;
    let progress: Record<string, unknown> = {};
    const chunk = (payload: CoupangCatalogBasicProductV1[]): CollectedChunk => ({ chunkKind: WING_CATALOG_CHUNK_KINDS.listingBasics, payload, progress });
    for (let page = 1; expected === null || page <= expected.totalPages; page += 1) {
      if (signal.aborted) return;
      const result = await site.searchInventory(page, plan.vendorId ?? null);
      if (expected === null) expected = { totalItems: result.totalItems, totalPages: result.totalPages };
      else if (result.totalItems !== expected.totalItems || result.totalPages !== expected.totalPages) {
        throw incomplete(`수집 중 Wing 상품 수가 바뀌었습니다(${expected.totalItems} → ${result.totalItems}). 다시 동기화해 주세요.`);
      }
      progress = { listedProducts: seen.size + result.products.length, totalProducts: expected.totalItems, page, totalPages: expected.totalPages };
      for (const product of result.products) {
        if (seen.has(product.externalProductId)) {
          throw incomplete(`Wing 목록의 페이지가 겹쳤습니다(${product.externalProductId}). 다시 동기화해 주세요.`);
        }
        seen.add(product.externalProductId);
        const full = buffer.push(product);
        if (full) yield chunk(full);
      }
    }
    if (expected && seen.size !== expected.totalItems) {
      throw incomplete(`Wing 목록을 다 받지 못했습니다(${seen.size}/${expected.totalItems}). 다시 동기화해 주세요.`);
    }
    const rest = buffer.flush();
    if (rest) yield chunk(rest);
  },
};

function incomplete(message: string): RuntimeError {
  return new RuntimeError(CATALOG_LIST_INCOMPLETE, message);
}

registerCollector(wingCatalogListCollector);
