import { describe, expect, it, vi } from 'vitest';
import { ChannelAccountRepositoryAdapter } from '../../../adapter/out/repository/channel-account.repository.adapter';

describe('ChannelAccountQueryService', () => {
  it('lists active channel accounts inside the current organization', async () => {
    const prisma = {
      channelAccount: {
        findMany: vi.fn().mockResolvedValue([]),
      },
    };
    const service = new ChannelAccountRepositoryAdapter(prisma as never);

    await service.listActive('org-1');

    expect(prisma.channelAccount.findMany).toHaveBeenCalledWith({
      where: { organizationId: 'org-1', status: 'active' },
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
