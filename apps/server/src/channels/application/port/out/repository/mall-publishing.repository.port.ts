import type { MallListingProfile } from '../../../../domain/mall/mall-listing-profile';
import type { PreflightKc } from '../../../../domain/mall/mall-publish-preflight';

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
  /** 이 상품에 이어진 수집상품의 `rawData.manualBasics` KC 입력값. 이어진 수집상품이 없으면 null. */
  kc: PreflightKc | null;
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
  /** 이 계정의 활성 옵션 수. 매칭률의 분모다. */
  optionCount: number;
  /** 그 가운데 셀피아 재고 레시피가 있는 옵션 수. 매칭률의 분자다. */
  matchedOptionCount: number;
  /**
   * 판매중 리스팅의 활성 옵션 수. 화면이 보여 주는 매칭률의 분모다.
   *
   * 판매종료 · 보류 리스팅은 셀피아에 그 상품이 없어 영원히 이어지지 않는다. 섞어 세면
   * 지금 손댈 수 있는 몫이 보이지 않는다(사장님 2026-09-17: "판매중인 상품 매칭률
   * 높이는게 우선").
   */
  onSaleOptionCount: number;
  /** 그 가운데 레시피가 있는 옵션 수. */
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
}

export interface MallMatrixProductRow {
  masterProductId: string;
  code: string;
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
  /** 판매 가능한 상품 마스터 수. 허브 중앙 숫자다. */
  countActiveMasterProducts(organizationId: string): Promise<number>;
}
