import type {
  SalesProduct,
  SalesProductCertification,
  SalesProductChannelOverrideInput,
  SalesProductDeliveryFeeType,
  SalesProductListQuery,
  SalesProductListResponse,
  SalesProductStatus,
  SalesProductTaxType,
} from '@kiditem/shared/sales-product';
import type { ExistingSalesProductOption, SalesProductOptionReplacementPlan } from '../../../../domain/sales-product';
import type { LinkCandidateListing, LinkCandidateProduct, SalesProductLinkPlan } from '../../../../domain/sales-product-links';
import type {
  MallPriceCandidateListingOption,
  MallPriceCandidateProduct,
} from '../../../../domain/sales-product-mall-prices';

export const SALES_PRODUCT_REPOSITORY_PORT = Symbol('SALES_PRODUCT_REPOSITORY_PORT');

/** 판매상품 기본 칸(옵션 제외). 저장소는 값을 그대로 쓴다 — 검증은 서비스가 끝낸다. */
export interface SalesProductBasicsRecord {
  name: string;
  ownCode: string | null;
  shortName: string | null;
  englishName: string | null;
  printName: string | null;
  modelName: string | null;
  modelNo: string | null;
  brand: string | null;
  manufacturer: string | null;
  originCountry: string | null;
  originRegion: string | null;
  keywords: string[];
  standardCategory: string | null;
  status: SalesProductStatus;
  taxType: SalesProductTaxType;
  deliveryFeeType: SalesProductDeliveryFeeType | null;
  deliveryFee: number | null;
  costPrice: number | null;
  salePrice: number;
  tagPrice: number | null;
  stockManaged: boolean;
  imageUrls: string[];
  detailHtml: string | null;
  extraDetailHtml: string[];
  noticeCategory: string | null;
  noticeValues: string[];
  certifications: SalesProductCertification[];
  importDeclarationNo: string | null;
  adminMemo: string | null;
}

export interface SalesProductCreateRecord extends SalesProductBasicsRecord {
  code: string;
  sabangnetGoodsNo: string | null;
  optionAxes: string[];
  sourceRaw: Record<string, string> | null;
}

export interface SalesProductOptionState {
  productCode: string;
  version: number;
  options: ExistingSalesProductOption[];
}

export interface SabangnetImportProductWrite {
  /** `overrides_only`: 상품 · 단품은 그대로 두고 몰별 값만 쓴다(바뀐 게 없는 상품). */
  mode: 'upsert' | 'overrides_only';
  create: SalesProductCreateRecord;
  plan: SalesProductOptionReplacementPlan;
  overrides: {
    channelAccountId: string;
    data: SalesProductChannelOverrideRecord;
  }[];
}

export interface SalesProductChannelOverrideRecord {
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
  list(organizationId: string, query: SalesProductListQuery): Promise<SalesProductListResponse>;
  get(organizationId: string, salesProductId: string): Promise<SalesProduct | null>;
  /** 이 조직에서 쓴 판매상품코드 중 `K` 다음 번호를 고를 때 쓴다. */
  listCodesWithPrefix(organizationId: string, prefix: string): Promise<string[]>;
  create(
    organizationId: string,
    record: SalesProductCreateRecord,
    plan: SalesProductOptionReplacementPlan,
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
  readOptionStatesByCodes(
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
  }): Promise<boolean>;
  /** 보낸 칸만 바꾼다(undefined 는 지금 값 그대로, null 은 비움). 줄이 없으면 만든다. */
  upsertChannelOverride(input: {
    organizationId: string;
    salesProductId: string;
    channelAccountId: string;
    data: Partial<SalesProductChannelOverrideRecord>;
  }): Promise<void>;
  deleteChannelOverride(input: {
    organizationId: string;
    salesProductId: string;
    channelAccountId: string;
  }): Promise<void>;
  /** 이 조직의 활성 셀피아 SKU 가 맞는지. 아닌 id 를 돌려준다. */
  findInvalidSellpiaSkuIds(organizationId: string, skuIds: readonly string[]): Promise<string[]>;
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
  /** 가져오기 미리보기: 코드별 내용 해시와 지금 사진 주소(이미 옮긴 사진을 알아보려고). */
  readImportFingerprints(
    organizationId: string,
    codes: readonly string[],
  ): Promise<Map<string, { fingerprint: string; imageUrls: string[] }>>;
  /** 몰 가격 가져오기 후보: 판매상품(단품 추가금액 · 몰별 값)과 이어진 활성 몰 옵션의 가격. */
  readMallPriceCandidates(organizationId: string): Promise<{
    products: (MallPriceCandidateProduct & { code: string; name: string })[];
    listingOptions: MallPriceCandidateListingOption[];
  }>;
  /** 상품 × 몰 계정의 몰별 판매가만 쓴다(다른 칸은 그대로, 줄이 없으면 만든다). 쓴 줄 수. */
  setChannelOverrideSalePrices(
    organizationId: string,
    writes: readonly { salesProductId: string; channelAccountId: string; salePrice: number }[],
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
  listImageUrls(organizationId: string): Promise<{ id: string; code: string; version: number; imageUrls: string[] }[]>;
  /** 버전이 같을 때만 사진 주소를 바꾸고 버전을 올린다. 버전이 다르면 false. */
  replaceImageUrls(input: {
    organizationId: string;
    salesProductId: string;
    expectedVersion: number;
    imageUrls: string[];
  }): Promise<boolean>;
}

export type { SalesProductChannelOverrideInput };
