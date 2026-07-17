import { describe, expect, it, vi } from 'vitest';
import type { ChannelCatalogProductProvisioningRepositoryPort } from '../port/out/repository/channel-catalog-product-provisioning.repository.port';
import { ChannelCatalogProductProvisioningService } from './channel-catalog-product-provisioning.service';

const transaction = { channelListing: {} };

describe('ChannelCatalogProductProvisioningService', () => {
  it('forwards the caller transaction, organization, user, links, and typed evidence unchanged', async () => {
    const result = {
      listings: [{
        channelListingId: 'listing-1',
        masterProductId: 'master-1',
        optionLinks: [{
          channelListingOptionId: 'option-1',
          productVariantId: 'variant-1',
        }],
      }],
      createdMasterProductCount: 0,
      reusedMasterProductCount: 1,
      createdVariantCount: 0,
    } as const;
    const repository = {
      provision: vi.fn().mockResolvedValue(result),
    } satisfies ChannelCatalogProductProvisioningRepositoryPort;
    const service = new ChannelCatalogProductProvisioningService(repository);
    const input = {
      transaction,
      organizationId: 'organization-1',
      userId: 'user-1',
      listings: [{
        channelListingId: 'listing-1',
        currentMasterProductId: 'master-1',
        name: '등록상품',
        category: '완구',
        brand: 'KidItem',
        options: [{
          channelListingOptionId: 'option-1',
          currentProductVariantId: 'variant-1',
          name: '파랑',
          sellerSku: 'SELLER-001',
          barcode: '001234567890',
        }],
      }],
    } as const;

    await expect(service.provision(input)).resolves.toBe(result);
    expect(repository.provision).toHaveBeenCalledWith(input);
  });
});
