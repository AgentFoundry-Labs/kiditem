import { Inject, Injectable } from '@nestjs/common';
import type {
  ChannelCatalogProductProvisioningInput,
  ChannelCatalogProductProvisioningPort,
  ChannelCatalogProductProvisioningResult,
} from '../port/in/channel-catalog-product-provisioning.port';
import {
  CHANNEL_CATALOG_PRODUCT_PROVISIONING_REPOSITORY_PORT,
  type ChannelCatalogProductProvisioningRepositoryPort,
} from '../port/out/repository/channel-catalog-product-provisioning.repository.port';

@Injectable()
export class ChannelCatalogProductProvisioningService
implements ChannelCatalogProductProvisioningPort {
  constructor(
    @Inject(CHANNEL_CATALOG_PRODUCT_PROVISIONING_REPOSITORY_PORT)
    private readonly repository: ChannelCatalogProductProvisioningRepositoryPort,
  ) {}

  provision(
    input: ChannelCatalogProductProvisioningInput,
  ): Promise<ChannelCatalogProductProvisioningResult> {
    return this.repository.provision(input);
  }
}
