import { describe, expect, it, vi } from 'vitest';
import { ChannelAccountPersistenceAdapter } from './channel-account.persistence.adapter';
import { ChannelsProductMappingGenerationAdapter } from "../products/product-mapping-generation.adapter";
import { ProductMappingGenerationRepositoryAdapter } from "../../../../products/adapter/out/persistence/product-mapping-generation.repository.adapter";

describe('ChannelAccountPersistenceAdapter listActive', () => {
  it('lists active channel accounts inside the current organization', async () => {
    const prisma = {
      channelAccount: {
        findMany: vi.fn().mockResolvedValue([]),
      },
    };
    const service = new ChannelAccountPersistenceAdapter(prisma as never, new ChannelsProductMappingGenerationAdapter(new ProductMappingGenerationRepositoryAdapter()));

    await service.listActive('org-1');

    expect(prisma.channelAccount.findMany).toHaveBeenCalledWith({
      where: { organizationId: 'org-1', status: { in: ['active', 'configured'] } },
      orderBy: [{ channel: 'asc' }, { isPrimary: 'desc' }, { name: 'asc' }],
      select: {
        id: true,
        channel: true,
        name: true,
        externalAccountId: true,
        vendorId: true,
        sellerId: true,
        isPrimary: true,
      },
    });
  });
});
