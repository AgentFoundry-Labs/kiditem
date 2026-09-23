import type { OwnerTransaction } from '../../../../common/owner-transaction';
import type {
  SalesProduct,
  SalesProductCreateInput,
  SalesProductUpdateInput,
  SalesProductOptionsReplaceInput,
  SalesProductListQuery,
  SalesProductListResponse,
  SalesProductMallCategories,
  SalesProductStatus,
} from '@kiditem/shared/sales-product';

export const SALES_PRODUCT_PORT = Symbol('SALES_PRODUCT_PORT');

/**
 * 초안이 처음 받는 값(KID-313). 원본 기록에서 온 초안은 원본의 이름 · 설명 · 사진 · 출처만 받는다 —
 * 원가와 원문은 복사하지 않고 원본 기록에서 읽는다. 직접 작성 초안은 원본 기록이 없다
 * (`sourceRecordId = null`)는 것만 다르고 같은 문으로 들어온다.
 */
export interface SalesProductDraftSource {
  /** 원본 기록(SourceRecord) id. 원본 하나에 초안 하나다. 직접 작성은 null. */
  sourceRecordId: string | null;
  name: string;
  description?: string;
  imageUrls?: readonly string[];
  /** 원천 장터와 주소. 초안에 복사해 두고 목록 탭이 조인 없이 거른다. */
  sourcePlatform: string | null;
  sourceUrl?: string | null;
  /** 옵션 이름 한 단. 비어 있으면 옵션 없는 단품 하나를 만든다. */
  optionNames?: readonly string[];
  /** 직접 작성이 받은 기본 칸. */
  basics?: {
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
  };
  /** 직접 작성이 받은 판매가 · 정상가. 모든 옵션에 같은 값으로 들어간다. */
  salePrice?: number | null;
  normalPrice?: number | null;
}

/** 초안 내리기의 결과. */
export interface SalesProductDraftRetireResult {
  salesProductId: string | null;
  retired: boolean;
  blockedReason: string | null;
}

/** Channels' shared authoring capability. Editing does not submit to a marketplace. */
export interface SalesProductPort {
  list(organizationId: string, query: SalesProductListQuery): Promise<SalesProductListResponse>;
  get(organizationId: string, salesProductId: string): Promise<SalesProduct>;
  create(organizationId: string, input: SalesProductCreateInput): Promise<SalesProduct>;
  /**
   * 초안 하나를 만든다. 원본 기록에서 온 초안은 원본을 입장시킨 Sourcing 트랜잭션 안에서 만든다 —
   * 원본 기록과 초안은 한 커밋이다(KID-313). 만든 초안의 id 를 돌려준다.
   */
  createDraft(
    organizationId: string,
    input: SalesProductDraftSource,
    transaction?: OwnerTransaction,
  ): Promise<string>;
  /** 이 원본 기록을 가리키는 판매 상품과 그 상태. 없으면 null. 원본 입장이 거절 이유를 정할 때 쓴다. */
  findForSourceRecord(
    organizationId: string,
    sourceRecordId: string,
    transaction?: OwnerTransaction,
  ): Promise<{ salesProductId: string; status: SalesProductStatus } | null>;
  /** 원천 기록이 없는 초안을 내린다(수집상품 화면의 삭제). 몰에 있거나 등록 실행이 살아 있으면 이유만 돌려준다. */
  retireDraft(organizationId: string, salesProductId: string): Promise<SalesProductDraftRetireResult>;
  /**
   * 팔기로 정한 시점에 KID 를 발급한다(상품 + 파는 단품). 멱등이다 — 이미 있으면 그대로 둔다.
   * 부르는 곳은 첫 등록 설정 생성 · 몰 엑셀 파일 · 직접 작성뿐이다(ADR-0022).
   */
  ensureSalesProductCodes(organizationId: string, salesProductId: string): Promise<{ code: string; issued: number }>;
  update(organizationId: string, salesProductId: string, input: SalesProductUpdateInput): Promise<SalesProduct>;
  replaceOptions(organizationId: string, salesProductId: string, input: SalesProductOptionsReplaceInput): Promise<SalesProduct>;
  mallCategories(organizationId: string, mallKey: string): Promise<SalesProductMallCategories>;
}
