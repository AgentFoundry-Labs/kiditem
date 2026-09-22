export type ChannelCatalogIdentityOption = {
  externalOptionId: string;
  optionName: string | null;
  salePrice: number | null;
  sellerSku: string | null;
  barcode: string | null;
  modelNumber: string | null;
  skuStatus: string | null;
  attributes: unknown;
  raw: Record<string, unknown>;
  media?: readonly ChannelCatalogIdentityMedia[];
};

export type ChannelCatalogIdentityMedia = {
  sourceUrl: string;
  role: 'primary' | 'detail' | 'option';
  sortOrder: number;
  externalOptionId: string | null;
};

export type ChannelCatalogIdentityProduct = {
  externalProductId: string;
  registeredName: string | null;
  displayName: string | null;
  category: string | null;
  manufacturer: string | null;
  brand: string | null;
  productStatus: string | null;
  raw: Record<string, unknown>;
  media?: readonly ChannelCatalogIdentityMedia[];
  options: ChannelCatalogIdentityOption[];
};

/**
 * 원천이 읽지 않는 옵션 칸. 몰마다 목록에 내주는 칸이 다르다 — 윙 엑셀은 판매자코드도
 * 판매가도 싣지 않고, 사방넷 송신 기록과 몰 관리자 목록에는 모델번호 칸이 없다.
 */
export type ChannelCatalogUnobservedOptionField =
  | 'optionName'
  | 'salePrice'
  | 'sellerSku'
  | 'barcode'
  | 'modelNumber'
  | 'skuStatus';

export type ChannelCatalogIdentityUpsertInput = {
  organizationId: string;
  channelAccountId: string;
  products: ChannelCatalogIdentityProduct[];
  lastImportRunId: string | null;
  rawSource: string;
  /**
   * 이 원천이 읽지 않는 옵션 칸. 여기 적힌 칸은 저장된 관측값을 그대로 둔다. 적지 않은 칸은
   * 이 원천이 관측한 값으로 덮으며, `null` 은 "비어 있는 것을 보았다"는 뜻이다. 읽지 않는
   * 칸도 값은 `null` 로 넘긴다 — 선언과 값이 따로 놀지 않게 둘 다 필수다.
   *
   * 원천마다 몰이 목록에 내주는 칸이 다르므로 호출부가 매번 밝힌다. 모두 읽는 원천은 `[]`.
   *
   * 리스팅 칸(`displayName`·`category`·`manufacturer`·`brand`·`productStatus`)은 규칙이
   * 다르다. 거기서는 `null` 이 저장값을 그대로 두는 뜻이다(`COALESCE`). 몰 목록 하나가 상품
   * 칸을 부분적으로만 내주는 일이 흔해서, 리스팅 쪽은 빈 값을 "못 봤다"로 읽는 편이 맞고
   * 옵션 쪽은 원천이 옵션 한 줄을 통째로 관측하므로 빈 값이 "비어 있더라"가 된다.
   */
  unobservedOptionFields: readonly ChannelCatalogUnobservedOptionField[];
};

/**
 * Wing 목록(basics) 단계의 입력. 이 단계는 모든 칸을 `COALESCE` 로 합쳐 상세 단계의 값을
 * 지우지 않으므로 관측 선언을 따로 받지 않는다.
 */
export type ChannelCatalogBasicsUpsertInput =
  Omit<ChannelCatalogIdentityUpsertInput, 'unobservedOptionFields'>;

export type ChannelCatalogDetailIdentityOption = {
  externalOptionId: string;
  vendorItemId?: string | null;
  sellerProductItemId?: string | null;
  externalVendorSku?: string | null;
  barcode?: string | null;
  modelNumber?: string | null;
  attributes?: unknown;
  documentIds: string[];
  raw?: Record<string, unknown>;
};

export type ChannelCatalogDetailIdentityProduct = {
  externalProductId: string;
  documents: Array<{ id: string; kind: string; value?: unknown }>;
  raw?: Record<string, unknown>;
  options: ChannelCatalogDetailIdentityOption[];
};

export type ChannelCatalogIdentityUpsertResult = {
  mappingIdentityChanged: boolean;
  changes: {
    createdProductCount: number;
    updatedProductCount: number;
    createdSkuCount: number;
    updatedSkuCount: number;
  };
  externalProductIds: string[];
  externalOptionIds: string[];
  identityRemaps: Array<{
    listingId: string;
    oldExternalOptionId: string;
    newExternalOptionId: string;
  }>;
  listingIds: Map<string, string>;
  persistedListings: PersistedChannelCatalogListing[];
};

export type PersistedChannelCatalogListing = {
  id: string;
  externalProductId: string;
  masterProductId: string | null;
  options: Array<{
    id: string;
    externalOptionId: string;
  }>;
};
