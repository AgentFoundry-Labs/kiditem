import type { SalesProductKcStatus } from '@kiditem/shared/sales-product';
import type { MallListingProfile } from '../../../../domain/account/mall-listing-profile';

export const MALL_PUBLISHING_REPOSITORY_PORT = Symbol('MALL_PUBLISHING_REPOSITORY_PORT');

/**
 * 한 몰의 `ChannelAccount` 행. `channel` 이 곧 몰 키다(ADR-0012).
 *
 * 몰 행을 만들고 고치는 곳은 Orders 쇼핑몰 계정 서비스 하나라, 여기서는 있는 행만 읽는다 —
 * 행이 없으면 그 몰은 계정이 없는 것이다. 자격증명 값은 절대 나오지 않는다. 저장돼 있는지
 * 여부만 싣는다.
 */
export interface MallAccountRow {
  mallKey: string;
  channelAccountId: string;
  name: string;
  hasCredentials: boolean;
  /** `config.listingProfile` 문서. 없으면 null. */
  listingProfile: MallListingProfile | null;
}

export interface PreflightProductRow {
  masterProductId: string;
  code: string;
  name: string;
  imageCount: number;
  salePrice: number | null;
  optionNames: string[];
  /** 판매상품이 들고 있는 인증 문서의 번호들. */
  certificationNumbers: readonly string[];
  /** KC 가 이 상품에 걸리는 방식. '해당 없음'은 번호 없이도 송신을 통과한다. */
  kcStatus: SalesProductKcStatus;
  /** 발행된 셀피아 스냅샷의 재고. 재고 연결이 없으면 null(0 이 아니라 모른다). */
  stock: number | null;
}

export interface PreflightProductQuery {
  search?: string;
  masterProductIds?: string[];
  limit: number;
  offset: number;
}

/** 리스팅을 실제로 들고 있는 계정 하나. 매트릭스 열 후보다. */
export interface MallListingAccountRow {
  channelAccountId: string;
  channel: string;
  name: string;
  /** 이 계정의 활성 리스팅 수. */
  listingCount: number;
  /** 이 계정에 올라간 서로 다른 상품 수. */
  productCount: number;
  /** Number of products with at least one published listing. */
  onSaleProductCount: number;
  onSaleListingCount: number;
  onSaleLinkedListingCount: number;
  optionCount: number;
  matchedOptionCount: number;
  onSaleOptionCount: number;
  onSaleMatchedOptionCount: number;
}

export interface MallMatrixQuery {
  search?: string;
  offset: number;
  limit: number;
  /** 이 계정들만 칸으로 채운다. 비면 리스팅이 있는 계정 전부. */
  channelAccountIds?: string[];
  /** 리스팅이 있는 상품만 / 없는 상품만. 비면 전부. */
  listed?: boolean;
}

/** 매트릭스 한 칸의 원재료. 판정은 도메인이 한다. */
export interface MallMatrixListingRow {
  channelAccountId: string;
  status: string | null;
  externalId: string;
  category: string | null;
  updatedAt: Date;
  /** Storefront product number when it differs from the external listing id. */
  storefrontProductId: string | null;
}

export interface MallMatrixProductRow {
  masterProductId: string;
  code: string;
  /** 이 마스터에 이어진 셀피아 상품코드 가운데 번호가 가장 큰 것. 없으면 null. */
  sellpiaCode: string | null;
  name: string;
  /** 몰 리스팅 콘텐츠에서 회수한 대표 이미지. 없으면 null. */
  imageUrl: string | null;
  stock: number | null;
  updatedAt: Date;
  listings: MallMatrixListingRow[];
}

/** 한 몰의 주문 건수. 허브 화면 카드가 쓴다. */
export interface MallOrderCountRow {
  channelAccountId: string;
  orderCount: number;
}

export interface MallPublishingRepositoryPort {
  /** 몰 키(채널)마다 계정 행 하나. 한 채널에 행이 여럿이면 대표 계정 · 먼저 만든 행을 고른다. */
  listMallAccounts(organizationId: string): Promise<MallAccountRow[]>;

  listPreflightProducts(
    organizationId: string,
    query: PreflightProductQuery,
  ): Promise<{ rows: PreflightProductRow[]; total: number }>;

  /** 활성 리스팅을 한 건이라도 가진 계정. 매트릭스 열은 여기서 시작한다. */
  listAccountsWithListings(organizationId: string): Promise<MallListingAccountRow[]>;
  /** 매트릭스 한 페이지. 상품이 행이고 리스팅이 칸의 재료다. */
  listMatrixProducts(
    organizationId: string,
    query: MallMatrixQuery,
  ): Promise<{ rows: MallMatrixProductRow[]; total: number }>;
  /** 계정별 주문 건수. */
  countOrdersByAccount(organizationId: string): Promise<MallOrderCountRow[]>;
  /** Active MasterProduct count used by the hub. */
  countActiveMasterProducts(organizationId: string): Promise<number>;
  /** Visible MasterProduct count used by the matrix total. */
  countVisibleMasterProducts(organizationId: string): Promise<number>;
}
