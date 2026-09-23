import type { OwnerTransaction } from '../../../../../common/owner-transaction';
import type {
  SalesProduct,
  SalesProductCertification,
  SalesProductDeliveryFeeType,
  SalesProductListQuery,
  SalesProductKcStatus,
  SalesProductListResponse,
  SalesProductStatus,
  SalesProductTaxType,
} from '@kiditem/shared/sales-product';
import type { ExistingSalesProductOption, SalesProductOptionReplacementPlan } from '../../../../domain/sales-product/sales-product';
import type { LinkCandidateListing, LinkCandidateProduct, SalesProductLinkPlan } from '../../../../domain/sales-product/sales-product-links';
import type {
  MallPriceAdoptionWrite,
  MallPriceCandidateListingOption,
  MallPriceCandidateProduct,
} from '../../../../domain/sales-product/sales-product-mall-prices';
import type { CoupangCatalogFacts } from '../../../../domain/registration/bulk-sheet/coupang-catalog-edit';
import type { MallSheetSourceProduct } from '../../../../domain/registration/bulk-sheet/mall-sheet-product';
import type { SalesProductBasicsRecord } from '../../../../domain/sales-product/sales-product-basics';

export const SALES_PRODUCT_REPOSITORY_PORT = Symbol('SALES_PRODUCT_REPOSITORY_PORT');

/** 판매상품 기본 칸 — 도메인이 정한 모양 그대로다(다시 가져오기 병합이 같은 칸을 센다). */
export type { SalesProductBasicsRecord };

export interface SalesProductCreateRecord extends SalesProductBasicsRecord {
  /** 발급된 KID. 아직 팔기로 정하지 않은 초안은 null 이다. */
  code: string | null;
  sabangnetGoodsNo: string | null;
  optionAxes: string[];
  sourceRaw: Record<string, unknown> | null;
  /** 이 초안을 만든 원천 기록(수집상품) id. */
  sourceCandidateId?: string | null;
  /** 원천 장터와 주소. 초안을 만들 때만 쓰고 바꾸지 않는다. */
  sourcePlatform?: string | null;
  sourceUrl?: string | null;
}

/** 다시 가져오기가 병합하는 지금 판매상품: 기본 칸과, 지난 가져오기의 원문(없으면 null). */
export interface SalesProductImportCurrent {
  fingerprint: string;
  imageUrls: string[];
  basics: SalesProductBasicsRecord;
  sourceRaw: unknown;
}

export interface SalesProductOptionState {
  productId: string;
  productCode: string | null;
  productName: string;
  status: SalesProductStatus;
  version: number;
  options: ExistingSalesProductOption[];
}

/** 후보 거절 · 삭제가 초안을 `unused` 로 내린 결과. */
export interface SalesProductDraftRetireRow {
  salesProductId: string | null;
  retired: boolean;
  activeListingCount: number;
  activeExecutionCount: number;
}

export interface SabangnetImportProductWrite {
  /** `overrides_only`: 상품 · 단품은 그대로 두고 몰별 값만 쓴다(바뀐 게 없는 상품). */
  mode: 'upsert' | 'preserve';
  existingProductId?: string;
  expectedVersion?: number;
  create: SalesProductCreateRecord;
  plan: SalesProductOptionReplacementPlan;
  overrides: {
    channelAccountId: string;
    data: SalesProductChannelOverrideRecord;
  }[];
}

export interface SalesProductChannelOverrideRecord {
  /** Import-only exact source option identity and resolved final price, never a live ratio. */
  optionPrices?: readonly { sabangnetOptionCode: string; salePrice: number }[];
  salePrice: number | null;
  priceRateBp: number | null;
  costPrice: number | null;
  name: string | null;
  detailHtml: string | null;
  promoText: string | null;
  noticeCategory: string | null;
  stockPercent: number | null;
  /** 없으면(undefined) 지금 값을 그대로 둔다. 사람이 몰별 값을 고쳐도 옮겨 온 사방넷 값이 지워지지 않게. */
  adapterValues?: Record<string, string> | null;
  sourceRaw?: Record<string, string> | null;
}

export interface SalesProductImportResult {
  created: number;
  updated: number;
  unchanged: number;
  overridesSaved: number;
}

export interface SalesProductRepositoryPort {
  /** Allocate from the shared noncycling KID sequence, never from existing row maxima. */
  allocateCode(organizationId: string): Promise<string>;
  /**
   * 팔기로 정한 시점에 KID 를 채운다(상품 + 파는 단품 전부). 이미 있으면 그대로 두는 멱등 연산이고,
   * 판매상품 줄을 잠근 채 한 트랜잭션에서 끝난다.
   */
  ensureCodes(organizationId: string, salesProductId: string): Promise<{ code: string; issued: number }>;
  /** 배치판. 몰 엑셀 한 파일이 상품마다 트랜잭션을 여는 것을 막는다 — 한 번에 한 트랜잭션이다. */
  ensureCodesForMany(organizationId: string, salesProductIds: readonly string[]): Promise<number>;
  readMasterProductCodes(organizationId: string, ids: readonly string[]): Promise<Map<string, string>>;
  list(organizationId: string, query: SalesProductListQuery): Promise<SalesProductListResponse>;
  get(organizationId: string, salesProductId: string, transaction?: OwnerTransaction): Promise<SalesProduct | null>;
  /** 이 조직에서 쓴 판매상품코드 중 `K` 다음 번호를 고를 때 쓴다. */
  listCodesWithPrefix(organizationId: string, prefix: string): Promise<string[]>;
  /** `transaction` 을 주면 그 트랜잭션에서 쓴다 — 수집은 후보와 초안이 한 커밋이다. */
  create(
    organizationId: string,
    record: SalesProductCreateRecord,
    plan: SalesProductOptionReplacementPlan,
    transaction?: OwnerTransaction,
  ): Promise<string>;
  /** 버전이 다르면 false. 없는 상품이면 NotFound. */
  updateBasics(
    organizationId: string,
    salesProductId: string,
    expectedVersion: number,
    patch: Partial<SalesProductBasicsRecord>,
  ): Promise<boolean>;
  readOptionState(organizationId: string, salesProductId: string): Promise<SalesProductOptionState | null>;
  /** 가져오기용: 판매상품코드 → 지금 단품 상태. */
  readImportOptionStates(
    organizationId: string,
    codes: readonly string[],
  ): Promise<Map<string, SalesProductOptionState>>;
  /** 버전이 다르면 false. */
  applyOptionPlan(input: {
    organizationId: string;
    salesProductId: string;
    expectedVersion: number;
    optionAxes: string[];
    plan: SalesProductOptionReplacementPlan;
    /** 저장 뒤 상태. 팔 옵션에 값이 다 차면 `active`, 아니면 `draft` 다. */
    status: SalesProductStatus;
  }): Promise<boolean>;
  /** 이 조직의 활성 셀피아 SKU 가 맞는지. 아닌 id 를 돌려준다. */
  findInvalidMasterProductIds(organizationId: string, skuIds: readonly string[]): Promise<string[]>;
  /** 몰 계정 행(ADR-0012): 몰 키 → 계정 id. */
  listChannelAccounts(organizationId: string): Promise<{ id: string; channel: string; name: string }[]>;
  /** 사방넷 엑셀을 판매상품코드 기준으로 한 번에 쓴다. 같은 파일을 두 번 올려도 같은 결과다. */
  importSabangnet(
    organizationId: string,
    writes: readonly SabangnetImportProductWrite[],
  ): Promise<SalesProductImportResult>;
  /** 잇기 후보: 이 조직의 활성 몰 상품(옵션 · 레시피 유무)과 판매상품(단품 · 셀피아 구성). */
  readLinkCandidates(organizationId: string): Promise<{
    listings: LinkCandidateListing[];
    products: LinkCandidateProduct[];
  }>;
  /** 몰 상품 · 몰 옵션에 판매상품 · 단품을 잇는다. 이미 이어진 칸은 덮지 않는다. 쓴 수를 돌려준다. */
  applyLinks(
    organizationId: string,
    plan: Pick<SalesProductLinkPlan, 'listingLinks' | 'optionLinks'>,
  ): Promise<{ listings: number; options: number }>;
  /** 가져오기 미리보기: 코드별 내용 해시와 지금 값(이미 옮긴 사진 · 사람이 고친 칸을 알아보려고). */
  readImportFingerprints(
    organizationId: string,
    codes: readonly string[],
  ): Promise<Map<string, SalesProductImportCurrent>>;
  /** 몰 가격 가져오기 후보: 판매상품(단품 추가금액 · 몰별 값)과 이어진 활성 몰 옵션의 가격. */
  readMallPriceCandidates(organizationId: string): Promise<{
    products: (MallPriceCandidateProduct & { code: string | null; name: string })[];
    listingOptions: MallPriceCandidateListingOption[];
  }>;
  /** 명시한 대상·버전에 옵션별 최종가를 반영한다. 없거나 바뀐 대상은 거부한다. */
  setChannelOverrideSalePrices(
    organizationId: string,
    writes: readonly MallPriceAdoptionWrite[],
  ): Promise<number>;
  /** 가져오기: 판매상품코드 → id(이미 있는 것만). */
  readProductIdsByCodes(organizationId: string, codes: readonly string[]): Promise<Map<string, string>>;
  /**
   * 상품 × 몰 값의 사방넷 키(`sabangnet…`)만 바꿔 쓴다. 다른 키와 몰별 판매가 · 상품명 등은 그대로 두고, 몰별 값 줄이
   * 없으면 만든다. 쓴 줄 수를 돌려준다.
   */
  mergeSabangnetMallValues(
    organizationId: string,
    writes: readonly { salesProductId: string; channelAccountId: string; values: Record<string, string> }[],
  ): Promise<number>;
  /** 몰 키의 계정들에서 판매상품이 쓴 사방넷 분류 경로 — 많이 쓴 순. */
  listMallCategories(
    organizationId: string,
    mallKey: string,
  ): Promise<{ path: string; title: string | null; count: number }[]>;
  /** 가져오기: 자체상품코드 → 판매상품코드(이미 있는 것만). */
  findCodesByOwnCodes(organizationId: string, ownCodes: readonly string[]): Promise<Map<string, string>>;
  /** 사진 옮기기: 이 조직 판매상품의 사진 주소와 버전. */
  listImageUrls(organizationId: string): Promise<{ id: string; code: string | null; version: number; imageUrls: string[]; detailHtml: string | null; extraDetailHtml: string[]; sourceRaw: unknown }[]>;
  /** 버전이 같을 때만 사진 주소를 바꾸고 버전을 올린다. 버전이 다르면 false. */
  replaceImageUrls(input: {
    organizationId: string;
    salesProductId: string;
    expectedVersion: number;
    imageUrls: string[];
    detailHtml?: string | null;
    extraDetailHtml?: string[];
    /** 상세를 고치면서 옮긴 원문(기준값 디지스트). 주면 같은 문장에서 쓴다. */
    sourceRaw?: Record<string, unknown>;
  }): Promise<boolean>;
  /**
   * 쿠팡상품정보 수정요청: 윙 옵션 ID → 그 옵션과 이어진 우리 단품 · 판매상품이 아는 값.
   * 이어지지 않은 옵션은 빠진다 — 채울 근거가 없다.
   */
  readCoupangCatalogFacts(
    organizationId: string,
    optionIds: readonly string[],
  ): Promise<CoupangCatalogFacts[]>;
  /** 몰 엑셀: 이 조직의 판매상품(없는 id 는 빠진다), 코드 순. */
  readMallSheetProducts(organizationId: string, salesProductIds: readonly string[]): Promise<MallSheetSourceProduct[]>;
  /**
   * 몰 엑셀: 이 몰들에 아직 없는 판매중 판매상품 — 그 몰 상품과 이어지지 않았고 사방넷이 그 몰에 보낸 적도 없는 것.
   * `maybeListed` 는 이어지지 않았지만 사방넷이 보낸 적이 있어 뺀 수.
   */
  findMallSheetMissing(
    organizationId: string,
    mallKeys: readonly string[],
  ): Promise<{ salesProductIds: string[]; maybeListed: number }>;
  /** 몰 분류 추천의 근거: 판매상품 × 몰의 분류 경로(사람이 정한 `categoryPath`, 없으면 사방넷 경로)와 판매상품 이름. */
  listMallCategoryPaths(
    organizationId: string,
  ): Promise<{ salesProductId: string; mallKey: string; path: string; name: string }[]>;
  /** 원천 기록 id → 그 후보에서 만든 초안 id(있으면). 초안은 후보당 하나다. */
  findIdBySourceCandidate(
    organizationId: string,
    candidateId: string,
    transaction?: OwnerTransaction,
  ): Promise<string | null>;
  /** 배치판. 수집상품 목록이 후보마다 초안을 되읽으면 N+1 이다. 초안이 없는 후보는 맵에 없다. */
  findIdsBySourceCandidates(
    organizationId: string,
    candidateIds: readonly string[],
  ): Promise<Map<string, string>>;
  /**
   * 후보에서 만든 초안을 `unused` 로 내린다. 활성 몰 상품이나 살아 있는 등록 실행이 있으면 내리지
   * 않고 그 수를 돌려준다 — 후보 거절을 막지는 않는다.
   */
  /** 부르는 쪽의 트랜잭션에서 실행한다 — 후보 종료와 한 커밋이다. */
  retireDraftForSource(
    transaction: OwnerTransaction,
    organizationId: string,
    candidateId: string,
  ): Promise<SalesProductDraftRetireRow>;
  /** 판매상품으로 찾은 초안을 내린다(원천 기록이 없는 초안의 삭제). 규칙은 retireDraftForSource 와 같다. */
  retireDraft(
    transaction: OwnerTransaction,
    organizationId: string,
    salesProductId: string,
  ): Promise<SalesProductDraftRetireRow>;
  /** 초안 내리기와 그 작업공간 보관을 한 커밋에 묶는다. 트랜잭션은 persistence 만 연다. */
  runInTransaction<T>(work: (transaction: OwnerTransaction) => Promise<T>): Promise<T>;
  /** 우리 저장소 주소 → 몰이 읽는 공개 복사본(있는 것만). */
  readPublicImages(organizationId: string, sourceUrls: readonly string[]): Promise<Map<string, string>>;
  /** 공개 복사본을 저장한다(같은 주소면 바꾼다). 쓴 수. */
  savePublicImages(
    organizationId: string,
    images: readonly { sourceUrl: string; publicUrl: string; host: string }[],
  ): Promise<number>;
  /**
   * 상품 × 몰 계정의 등록 설정에 `categoryPath` 하나만 쓴다(다른 칸은 그대로, 설정이 없으면 만든다). 쓴 줄 수.
   * 상품 × 몰 계정당 활성 설정은 하나라 고를 것이 없다.
   */
  setMallCategoryPaths(
    organizationId: string,
    writes: readonly { salesProductId: string; channelAccountId: string; path: string }[],
  ): Promise<number>;
}
