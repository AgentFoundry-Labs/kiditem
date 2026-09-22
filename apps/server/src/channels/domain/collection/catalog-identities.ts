export type ChannelCatalogIdentityOption = {
  externalOptionId: string;
  optionName: string | null;
  /** 원천이 읽지 않는 칸은 `unobservedOptionFields` 에 적고 값을 생략한다. */
  salePrice?: number | null;
  sellerSku?: string | null;
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
 * 판매가도 싣지 않는다.
 */
export type ChannelCatalogUnobservedOptionField = 'sellerSku' | 'salePrice';

export type ChannelCatalogIdentityUpsertInput = {
  organizationId: string;
  channelAccountId: string;
  products: ChannelCatalogIdentityProduct[];
  lastImportRunId: string | null;
  rawSource: string;
  /**
   * 이 원천이 읽지 않는 옵션 칸. 여기 적힌 칸은 저장된 관측값을 그대로 둔다. 적지 않은 칸은
   * 이 원천이 관측한 값으로 덮으며, `null` 은 "비어 있는 것을 보았다"는 뜻이다.
   *
   * 원천마다 몰이 목록에 내주는 칸이 다르므로 호출부가 매번 밝힌다. 모두 읽는 원천은 `[]`.
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
