import { describe, expect, it } from 'vitest';
import { ChannelCatalogProductProvisioningRepositoryAdapter } from './channel-catalog-product-provisioning.repository.adapter';

describe('ChannelCatalogProductProvisioningRepositoryAdapter', () => {
  it('rejects a root Prisma client instead of accepting it as a transaction', async () => {
    const repository = new ChannelCatalogProductProvisioningRepositoryAdapter();
    const rootClientShape = {
      channelListing: {},
      masterProduct: {},
      $queryRaw: () => undefined,
      $transaction: () => undefined,
      $connect: () => undefined,
      $disconnect: () => undefined,
    };

    await expect(repository.provision({
      transaction: rootClientShape,
      organizationId: 'organization-1',
      userId: 'user-1',
      listings: [],
    })).rejects.toThrow('requires a Prisma transaction');
  });
});
