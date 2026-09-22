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
import { candidateSalesProductGap } from '@/lib/candidate-sales-product-registration';
import type { ProductDetailResponse } from './sourcing-api';

export { candidateSalesProductGap } from '@/lib/candidate-sales-product-registration';

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
/** 옵션 있는 상품의 단 이름. 수집상품은 종류(모양 · 색상)를 한 줄로만 적는다. */
const CANDIDATE_OPTION_AXIS = '종류';
/** 판매상품 단품 상한(사방넷 단품과 같은 눈금). */
const MAX_OPTION_VALUES = 50;

export function salesProductInputFromCandidate(
  detail: ProductDetailResponse,
  detailImageUrl: string | null,
  confirmed?: { name?: string; salePrice?: number },
): SalesProductCreateInput {
  const draft = candidateToMallProductDraft({ detail, defaults: KIDITEM_MALL_DRAFT_DEFAULTS, detailImageUrl });
  const variant = draft.variants[0];
  const salePrice = variant?.salePrice ?? 0;
  const listPrice = variant?.listPrice ?? 0;
  const certification = detail.basicInfo.kcCertificationNumber?.trim();
  const keywords = [...new Set(draft.keywords.map((keyword) => keyword.trim().slice(0, MAX_KEYWORD_LENGTH)).filter(Boolean))];
  // 상품 등록 초안에서 받은 사방넷 칸이 있으면 그것이 이긴다(사람이 적은 값이다).
  const basics = detail.basicInfo;
  return {
    name: (confirmed?.name ?? draft.displayName).trim().slice(0, 255),
    ownCode: basics.ownCode?.trim() || null,
    modelName: basics.modelName?.trim() || null,
    brand: basics.brand?.trim() || draft.brand,
    manufacturer: basics.manufacturer?.trim() || draft.maker,
    originCountry: basics.originCountry?.trim() || (draft.notice.fields.제조국 ?? null),
    keywords: keywords.slice(0, MAX_KEYWORDS),
    taxType: basics.taxType === 'tax_free' ? 'tax_free' : 'taxable',
    imageUrls: [...new Set([draft.representativeImageUrl, ...draft.additionalImageUrls].filter(Boolean))].slice(0, MAX_IMAGES),
    detailHtml: draft.detailImageUrls.length > 0
      ? draft.detailImageUrls.map((url) => `<center><img src="${url}"></center>`).join('\n')
      : null,
    noticeCategory: CANDIDATE_NOTICE_CATEGORY,
    certifications: certification
      ? [{
        number: certification.slice(0, 100),
        ...(basics.certificationIssuer?.trim() ? { issuer: basics.certificationIssuer.trim().slice(0, 100) } : {}),
        ...(basics.certificationField?.trim() ? { field: basics.certificationField.trim().slice(0, 100) } : {}),
      }]
      : [],
    deliveryFee: basics.deliveryFee && basics.deliveryFee > 0 ? basics.deliveryFee : null,
    deliveryFeeType: deliveryFeeTypeOf(basics.deliveryFeeType),
    ...optionsFromCandidate(
      basics.optionNames,
      confirmed?.salePrice ?? salePrice,
      listPrice > (confirmed?.salePrice ?? salePrice) ? listPrice : null,
    ),
  };
}

/**
 * 수집상품의 옵션 종류(잔디인형 모양 같은 것) → 판매상품 단품.
 *
 * 종류가 없으면 옵션 없는 상품(값 없는 단품 하나)이다. 있으면 `종류` 한 단으로 두고 종류마다 단품을 만든다 —
 * 단품코드는 서버가 판매상품코드로 붙이고, 추가금액은 0으로 시작한다(몰마다 다른 값은 판매상품 편집에서 고친다).
 */
function optionsFromCandidate(
  optionNames: readonly string[] | undefined,
  salePrice: number,
  normalPrice: number | null,
): Pick<SalesProductCreateInput, 'optionAxes' | 'options'> {
  const values = [...new Set((optionNames ?? []).map((name) => name.trim()).filter(Boolean))].slice(0, MAX_OPTION_VALUES);
  if (values.length === 0) return { optionAxes: [], options: [{ values: [], salePrice, normalPrice }] };
  return {
    optionAxes: [CANDIDATE_OPTION_AXIS],
    options: values.map((value) => ({ values: [value], salePrice, normalPrice })),
  };
}

function deliveryFeeTypeOf(value: string | undefined): SalesProductCreateInput['deliveryFeeType'] {
  const types = ['free', 'prepay', 'collect', 'collect_or_prepay'] as const;
  const found = types.find((type) => type === value?.trim());
  return found ?? null;
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
