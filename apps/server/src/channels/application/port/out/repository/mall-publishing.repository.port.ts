export const MALL_PUBLISHING_REPOSITORY_PORT = Symbol('MALL_PUBLISHING_REPOSITORY_PORT');

/**
 * 한 몰의 `ChannelAccount` 앵커.
 *
 * 앵커는 두 모양으로 존재한다. 주문수집 몰은 `channel='order_collection'` +
 * `externalAccountId=<mallKey>` 이고, 쿠팡·로켓처럼 자기 채널을 가진 마켓은
 * `channel=<mallKey>` 다. 어느 쪽이든 리스팅 FK 가 걸릴 수 있는 row 하나다.
 *
 * 자격증명 값은 절대 나오지 않는다. 저장돼 있는지 여부만 싣는다.
 */
export interface MallAccountAnchorRow {
  mallKey: string;
  channelAccountId: string;
  name: string;
  hasCredentials: boolean;
  source: 'order_collection' | 'channel';
}

export interface PromotedMallAccountRow {
  id: string;
  mallKey: string;
  name: string;
  externalAccountId: string | null;
}

export interface MallProfileRow {
  id: string;
  channelAccountId: string;
  mallKey: string;
  name: string;
  isDefault: boolean;
  isActive: boolean;
  asPhone: string | null;
  categoryCode: string | null;
  namePrefix: string | null;
  nameSuffix: string | null;
  shippingJson: unknown;
  returnJson: unknown;
  addressJson: unknown;
  updatedAt: Date;
}

export interface MallProfileWriteInput {
  name: string;
  isDefault?: boolean;
  isActive?: boolean;
  asPhone?: string | null;
  categoryCode?: string | null;
  namePrefix?: string | null;
  nameSuffix?: string | null;
  shippingJson?: Record<string, unknown> | null;
  returnJson?: Record<string, unknown> | null;
  addressJson?: Record<string, unknown> | null;
}

export interface PreflightProductRow {
  masterProductId: string;
  code: string;
  name: string;
  imageCount: number;
  salePrice: number | null;
  optionNames: string[];
  noticeCategory: string | null;
  noticeAttributes: Record<string, unknown> | null;
  certification: { certType: string; validTo: Date | null } | null;
}

export interface PreflightProductQuery {
  search?: string;
  masterProductIds?: string[];
  limit: number;
  offset: number;
}

/** 역추출 소스 한 줄. 쿠팡 리스팅 하나에서 뽑아낸 원본 값이다. */
export interface CoupangNoticeSourceRow {
  masterProductId: string;
  externalId: string;
  productName: string;
  category: string | null;
  manufacturer: string | null;
  brand: string | null;
  modelNumber: string | null;
  searchOptions: { type: string; value: string }[];
}

/** 이미 저장된 기본 고시 행. 운영자가 직접 넣은 행은 덮어쓰지 않기 위해 본다. */
export interface ExistingNoticeRow {
  masterProductId: string;
  source: string;
}

export interface NoticeUpsertInput {
  masterProductId: string;
  noticeCategory: string;
  attributes: Record<string, string>;
}

export interface MallPublishingRepositoryPort {
  /** 매니페스트 키로 찾을 수 있는 몰 계정 앵커 전부. */
  listMallAccountAnchors(organizationId: string): Promise<MallAccountAnchorRow[]>;
  /** 프로필을 붙일 앵커를 보장한다. 이미 있으면 그대로 쓴다. */
  ensureMallAccountAnchor(input: {
    organizationId: string;
    mallKey: string;
    mallName: string;
  }): Promise<PromotedMallAccountRow>;

  listProfiles(organizationId: string, channelAccountId?: string): Promise<MallProfileRow[]>;
  findProfile(organizationId: string, profileId: string): Promise<MallProfileRow | null>;
  createProfile(input: {
    organizationId: string;
    channelAccountId: string;
    data: MallProfileWriteInput;
  }): Promise<MallProfileRow>;
  updateProfile(input: {
    organizationId: string;
    profileId: string;
    data: MallProfileWriteInput;
  }): Promise<MallProfileRow>;
  softDeleteProfile(organizationId: string, profileId: string): Promise<void>;

  listPreflightProducts(
    organizationId: string,
    query: PreflightProductQuery,
  ): Promise<{ rows: PreflightProductRow[]; total: number }>;

  /** 쿠팡 리스팅 중 상품 마스터에 연결된 것들의 원본 값. */
  listCoupangNoticeSources(organizationId: string): Promise<CoupangNoticeSourceRow[]>;
  /** 기본(channel=null) 고시가 이미 있는 상품과 그 출처. */
  listExistingDefaultNotices(organizationId: string): Promise<ExistingNoticeRow[]>;
  /** 역추출 결과를 저장한다. source='coupang_backfill' 로만 쓴다. */
  upsertBackfilledNotices(
    organizationId: string,
    inputs: readonly NoticeUpsertInput[],
  ): Promise<{ created: number; updated: number }>;
}
