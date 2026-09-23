import type { OwnerTransaction } from '../../../../../common/owner-transaction';
import type { SalesProduct, SalesProductStatus } from '@kiditem/shared/sales-product';

export const SALES_PRODUCT_DRAFT_PORT = Symbol('SALES_PRODUCT_DRAFT_PORT');

/**
 * 초안이 처음 받는 값(KID-313). 원본 기록에서 온 초안은 원본의 이름 · 설명 · 사진 · 출처만 받고,
 * 원가와 원문은 복사하지 않는다 — 필요하면 원본 기록에서 읽는다. 직접 작성 초안은 원본 기록이 없고
 * (`sourceRecordId = null`) 사람이 적은 기본 칸을 받는다.
 */
export interface SalesProductDraftFacts {
  sourceRecordId: string | null;
  name: string;
  description?: string;
  imageUrls?: readonly string[];
  sourcePlatform: string | null;
  sourceUrl?: string | null;
  optionNames?: readonly string[];
  /** 직접 작성이 받은 기본 칸. 비어 있는 칸은 넘기지 않는다. */
  basics?: SalesProductDraftBasics;
  /** 직접 작성이 받은 판매가 · 정상가. 모든 옵션에 같은 값으로 들어간다. */
  salePrice?: number | null;
  normalPrice?: number | null;
}

export interface SalesProductDraftBasics {
  standardCategory?: string | null;
  targetAudience?: string | null;
  ageGroup?: string | null;
  productSize?: string | null;
  colorVariantNames?: string[];
  boxSetQuantity?: number | null;
  brand?: string | null;
  manufacturer?: string | null;
  originCountry?: string | null;
  modelName?: string | null;
  keywords?: string[];
  kcStatus?: 'unknown' | 'exists' | 'none';
}

/**
 * 수집한 상품의 편집 정본은 Channels 의 판매상품 초안이다(KID-310 · KID-313). Sourcing 은 초안 행을
 * 직접 쓰지 않고 이 계약으로만 부탁한다. 입장은 원본 기록을 만드는 트랜잭션 안에서 초안을 찾고
 * 만든다 — 원본 기록과 초안은 한 커밋이다.
 */
export interface SalesProductDraftPort {
  /** 이 원본 기록을 가리키는 판매 상품과 그 상태. 없으면(삭제가 반쯤 끝났다) null. */
  findForSourceRecord(
    organizationId: string,
    sourceRecordId: string,
    transaction?: OwnerTransaction,
  ): Promise<{ salesProductId: string; status: SalesProductStatus } | null>;
  /** 초안 하나를 부르는 쪽 트랜잭션에서 만든다. */
  createDraft(
    transaction: OwnerTransaction,
    organizationId: string,
    facts: SalesProductDraftFacts,
  ): Promise<{ salesProductId: string }>;
  /** 초안 한 줄. 생성 prompt 가 쓰는 값(설명 · 대상 · 크기 · 색상 · 박스)은 여기서 온다. */
  getDraft(organizationId: string, salesProductId: string): Promise<SalesProduct>;
}
