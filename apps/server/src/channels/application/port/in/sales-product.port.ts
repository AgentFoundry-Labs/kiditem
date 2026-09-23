import type { OwnerTransaction } from '../../../../common/owner-transaction';
import type {
  SalesProduct,
  SalesProductCreateInput,
  SalesProductUpdateInput,
  SalesProductOptionsReplaceInput,
  SalesProductListQuery,
  SalesProductListResponse,
  SalesProductMallCategories,
} from '@kiditem/shared/sales-product';

export const SALES_PRODUCT_PORT = Symbol('SALES_PRODUCT_PORT');

/**
 * 원천(1688 · 쿠팡 · 사방넷) 한 줄이 초안 하나를 만들 때 넘기는 사실. 원천 기록은 Sourcing 것이고
 * 여기 값은 초안의 첫 내용일 뿐이다 — 이 뒤로는 초안이 편집 정본이다.
 */
export interface SalesProductDraftSource {
  /** 원천 기록(SourcingCandidate) id. 후보 하나에 초안 하나다. */
  candidateId: string;
  name: string;
  description?: string;
  imageUrls?: readonly string[];
  /** 원천 장터와 주소. 초안에 복사해 두고 목록 탭이 조인 없이 거른다. */
  sourcePlatform?: string | null;
  sourceUrl?: string | null;
  /** 옵션 이름 한 단. 비어 있으면 옵션 없는 단품 하나를 만든다. */
  optionNames?: readonly string[];
  /** 원문(원가 위안 포함). 초안의 `sourceRaw` 로 얼려 둔다 — 화면이 고치지 않는다. */
  costCny?: number | null;
  rawBasics?: Record<string, unknown> | null;
}

/** 후보 거절 · 삭제가 초안에 미친 결과. */
export interface SalesProductDraftRetireResult {
  salesProductId: string | null;
  /** `unused` 로 내렸는가. */
  retired: boolean;
  /** 내리지 못한 이유(몰에 올라가 있거나 실행이 남았다). 내렸으면 null. */
  blockedReason: string | null;
}

/** Channels' shared authoring capability. Editing does not submit to a marketplace. */
export interface SalesProductPort {
  list(organizationId: string, query: SalesProductListQuery): Promise<SalesProductListResponse>;
  get(organizationId: string, salesProductId: string): Promise<SalesProduct>;
  create(organizationId: string, input: SalesProductCreateInput): Promise<SalesProduct>;
  /**
   * 원천 한 줄에서 초안을 만든다. 같은 후보를 두 번 부르면 이미 만든 초안을 돌려준다(멱등) —
   * 수집이 같은 상품을 다시 담아도 초안은 하나다.
   */
  createFromSource(
    organizationId: string,
    input: SalesProductDraftSource,
    transaction?: OwnerTransaction,
  ): Promise<SalesProduct>;
  /** 원천 기록(수집상품)에서 만든 초안 id. 없으면 null. 수집 화면이 초안으로 넘어갈 때 쓴다. */
  findDraftIdForSource(organizationId: string, candidateId: string): Promise<string | null>;
  /** 배치판. 수집상품 목록 한 쪽을 한 번에 옮긴다 — 후보마다 부르면 N+1 이다. */
  findDraftIdsForSources(
    organizationId: string,
    candidateIds: readonly string[],
  ): Promise<Map<string, string>>;
  /**
   * 후보를 거절 · 삭제했을 때 그 초안을 `unused` 로 내린다. 몰에 올라가 있으면 그대로 두고
   * 이유를 돌려준다.
   *
   * 부르는 쪽(Sourcing)의 트랜잭션에서 실행되어 후보 종료와 한 커밋에 들어간다 — 후보만
   * 거절되고 초안이 살아 있는 중간 상태를 두지 않는다.
   */
  retireDraftForSource(
    transaction: OwnerTransaction,
    organizationId: string,
    candidateId: string,
  ): Promise<SalesProductDraftRetireResult>;
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
