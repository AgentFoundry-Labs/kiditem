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

export type ChannelCatalogIdentityUpsertInput = {
  organizationId: string;
  channelAccountId: string;
  products: ChannelCatalogIdentityProduct[];
  lastImportRunId: string | null;
  rawSource: string;
};

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
