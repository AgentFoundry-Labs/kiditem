export type ChannelCatalogProvisioningOption = Readonly<{
  channelListingOptionId: string;
  currentProductVariantId: string | null;
  name: string;
  sellerSku: string | null;
  barcode: string | null;
}>;

export type ChannelCatalogProvisioningListing = Readonly<{
  channelListingId: string;
  currentMasterProductId: string | null;
  name: string;
  category: string | null;
  brand: string | null;
  options: readonly ChannelCatalogProvisioningOption[];
}>;

export type ChannelCatalogProductProvisioningResult = Readonly<{
  listings: readonly Readonly<{
    channelListingId: string;
    masterProductId: string;
    optionLinks: readonly Readonly<{
      channelListingOptionId: string;
      productVariantId: string | null;
    }>[];
  }>[];
  createdMasterProductCount: number;
  reusedMasterProductCount: number;
  createdVariantCount: number;
}>;

export type ChannelCatalogProductProvisioningInput = Readonly<{
  transaction: unknown;
  organizationId: string;
  userId: string;
  listings: readonly ChannelCatalogProvisioningListing[];
}>;

export interface ChannelCatalogProductProvisioningPort {
  provision(
    input: ChannelCatalogProductProvisioningInput,
  ): Promise<ChannelCatalogProductProvisioningResult>;
}

export const CHANNEL_CATALOG_PRODUCT_PROVISIONING_PORT = Symbol(
  'CHANNEL_CATALOG_PRODUCT_PROVISIONING_PORT',
);
