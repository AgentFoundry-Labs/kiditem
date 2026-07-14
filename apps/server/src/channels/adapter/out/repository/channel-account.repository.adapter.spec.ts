import { describe, expect, it, vi } from 'vitest';
import { ChannelAccountRepositoryAdapter } from './channel-account.repository.adapter';

describe('ChannelAccountRepositoryAdapter account-scoped credentials', () => {
  it('selects the requested active Coupang account instead of falling back to primary', async () => {
    const prisma = {
      channelAccount: {
        findFirst: vi.fn().mockResolvedValue({
          id: 'account-2',
          vendorId: null,
          externalAccountId: null,
          config: {},
        }),
      },
    };
    const repository = new ChannelAccountRepositoryAdapter(prisma as never);

    await expect(repository.resolveCoupangCredentials('org-1', 'account-2')).rejects.toThrow();
    expect(prisma.channelAccount.findFirst).toHaveBeenCalledWith({
      where: {
        id: 'account-2',
        organizationId: 'org-1',
        channel: 'coupang',
        status: 'active',
      },
      orderBy: { updatedAt: 'desc' },
    });
  });
});
