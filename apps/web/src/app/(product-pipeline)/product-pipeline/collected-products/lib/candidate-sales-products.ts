import {
  SALES_PRODUCT_FROM_CANDIDATES_MAX,
  type SalesProductCreateInput,
  type SalesProductFromCandidatesRequest,
  type SalesProductFromCandidatesResult,
} from '@kiditem/shared/sales-product';
import {
  candidateToMallProductDraft,
  KIDITEM_MALL_DRAFT_DEFAULTS,
} from '../../_shared/lib/mall-product-draft';
import type { ProductDetailResponse } from './sourcing-api';

/**
 * 수집상품 → 판매상품(수집상품 화면의 몰 대량등록). 몰 공통 등록 초안(`candidateToMallProductDraft`)을 판매상품 내용으로
 * 옮긴다 — 몰 엑셀은 판매상품에서만 만든다(ADR-0014). 서버는 같은 수집상품이면 새로 만들지 않고 이미 만든 판매상품을 쓴다.
 */

/** 사방넷 속성분류코드 023(어린이제품). 우리 수집상품은 모두 어린이제품 고시로 시작한다. */
export const CANDIDATE_NOTICE_CATEGORY = '023';
const MAX_IMAGES = 30;
const MAX_KEYWORDS = 30;
const MAX_KEYWORD_LENGTH = 60;
const PREPARE_CONCURRENCY = 3;

export function salesProductInputFromCandidate(
  detail: ProductDetailResponse,
  detailImageUrl: string | null,
): SalesProductCreateInput {
  const draft = candidateToMallProductDraft({ detail, defaults: KIDITEM_MALL_DRAFT_DEFAULTS, detailImageUrl });
  const variant = draft.variants[0];
  const salePrice = variant?.salePrice ?? 0;
  const listPrice = variant?.listPrice ?? 0;
  const certification = detail.basicInfo.kcCertificationNumber?.trim();
  const keywords = [...new Set(draft.keywords.map((keyword) => keyword.trim().slice(0, MAX_KEYWORD_LENGTH)).filter(Boolean))];
  return {
    name: draft.displayName.trim().slice(0, 255),
    brand: draft.brand,
    manufacturer: draft.maker,
    originCountry: draft.notice.fields.제조국 ?? null,
    keywords: keywords.slice(0, MAX_KEYWORDS),
    taxType: 'taxable',
    salePrice,
    tagPrice: listPrice > salePrice ? listPrice : null,
    imageUrls: [...new Set([draft.representativeImageUrl, ...draft.additionalImageUrls].filter(Boolean))].slice(0, MAX_IMAGES),
    detailHtml: draft.detailImageUrls.length > 0
      ? draft.detailImageUrls.map((url) => `<center><img src="${url}"></center>`).join('\n')
      : null,
    noticeCategory: CANDIDATE_NOTICE_CATEGORY,
    certifications: certification ? [{ number: certification.slice(0, 100) }] : [],
    optionAxes: [],
    options: [{ values: [] }],
  };
}

/** 판매상품으로 만들 수 없는 까닭. 만든 뒤에는 수집상품을 고쳐도 판매상품에 옮겨 가지 않으니 먼저 막는다. */
export function candidateSalesProductGap(input: Pick<SalesProductCreateInput, 'name' | 'salePrice'>): string | null {
  if (!input.name.trim()) return '상품명이 비어 있습니다.';
  if (input.salePrice <= 0) return '판매가가 비어 있습니다(0원). 수집상품 상세에서 판매가를 넣어 주세요.';
  return null;
}

export interface CandidateSalesProductDeps {
  getDetail: (candidateId: string) => Promise<ProductDetailResponse>;
  /** 저장한 상세페이지를 이미지로 만든다. 없거나 못 만들면 null(상세설명 없이 만든다 — 몰 엑셀 확인이 막는다). */
  renderDetailImage: (candidateId: string, detail: ProductDetailResponse) => Promise<string | null>;
  createFromCandidates: (body: SalesProductFromCandidatesRequest) => Promise<SalesProductFromCandidatesResult>;
}

export interface CandidateSalesProductsOutcome {
  products: SalesProductFromCandidatesResult['products'];
  created: number;
  reused: number;
  /** 판매상품으로 만들지 않은 수집상품과 까닭. */
  skipped: { candidateId: string; name: string; reason: string }[];
  /** 상세페이지 이미지가 없어 상세설명 없이 만든 수집상품 이름. */
  withoutDetail: string[];
}

export async function candidatesToSalesProducts(
  candidateIds: readonly string[],
  deps: CandidateSalesProductDeps,
  onProgress?: (done: number, total: number) => void,
): Promise<CandidateSalesProductsOutcome> {
  const ids = [...new Set(candidateIds)];
  if (ids.length === 0) throw new Error('고른 수집상품이 없습니다.');
  if (ids.length > SALES_PRODUCT_FROM_CANDIDATES_MAX) {
    throw new Error(`한 번에 ${SALES_PRODUCT_FROM_CANDIDATES_MAX}개까지 만들 수 있습니다.`);
  }

  const items: SalesProductFromCandidatesRequest['items'] = [];
  const skipped: CandidateSalesProductsOutcome['skipped'] = [];
  const withoutDetail: string[] = [];
  let done = 0;
  onProgress?.(0, ids.length);
  const prepared = new Map<string, SalesProductFromCandidatesRequest['items'][number]>();
  let next = 0;
  const worker = async () => {
    while (next < ids.length) {
      const candidateId = ids[next]!;
      next += 1;
      try {
        const detail = await deps.getDetail(candidateId);
        const detailImageUrl = await deps.renderDetailImage(candidateId, detail).catch(() => null);
        const product = salesProductInputFromCandidate(detail, detailImageUrl);
        const gap = candidateSalesProductGap(product);
        if (gap) {
          skipped.push({ candidateId, name: product.name || detail.name, reason: gap });
        } else {
          if (!detailImageUrl) withoutDetail.push(product.name);
          prepared.set(candidateId, { candidateId, product });
        }
      } catch (error) {
        skipped.push({ candidateId, name: candidateId, reason: error instanceof Error ? error.message : '상품을 읽지 못했습니다.' });
      }
      done += 1;
      onProgress?.(done, ids.length);
    }
  };
  await Promise.all(Array.from({ length: Math.min(PREPARE_CONCURRENCY, ids.length) }, worker));
  // 고른 순서대로 보낸다 — 판매상품코드가 화면 순서를 따른다.
  for (const id of ids) {
    const item = prepared.get(id);
    if (item) items.push(item);
  }

  if (items.length === 0) return { products: [], created: 0, reused: 0, skipped, withoutDetail };
  const result = await deps.createFromCandidates({ items });
  return { ...result, skipped, withoutDetail };
}
