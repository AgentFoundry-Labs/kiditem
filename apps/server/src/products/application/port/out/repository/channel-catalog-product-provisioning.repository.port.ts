import type {
  ChannelCatalogProductProvisioningInput,
  ChannelCatalogProductProvisioningResult,
} from '../../in/channel-catalog-product-provisioning.port';

export interface ChannelCatalogProductProvisioningRepositoryPort {
  provision(
    input: ChannelCatalogProductProvisioningInput,
  ): Promise<ChannelCatalogProductProvisioningResult>;
}

export const CHANNEL_CATALOG_PRODUCT_PROVISIONING_REPOSITORY_PORT = Symbol(
  'CHANNEL_CATALOG_PRODUCT_PROVISIONING_REPOSITORY_PORT',
);
