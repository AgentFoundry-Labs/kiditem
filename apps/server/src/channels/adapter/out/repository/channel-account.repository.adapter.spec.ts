import { describe, expect, it, vi } from 'vitest';
import { ChannelAccountRepositoryAdapter } from './channel-account.repository.adapter';

describe('ChannelAccountRepositoryAdapter account identity', () => {
  it('reads the primary Wing account identity without resolving Open API credentials', async () => {
    const prisma = {
      channelAccount: {
        findFirst: vi.fn().mockResolvedValue({
          id: 'account-2',
          vendorId: 'vendor-2',
          externalAccountId: 'legacy-vendor-2',
          status: 'active',
          updatedAt: new Date('2026-09-07T00:00:00.000Z'),
        }),
      },
    };
    const repository = new ChannelAccountRepositoryAdapter(prisma as never);

    await expect(repository.getCoupangSettings('org-1')).resolves.toEqual({
      configured: true,
      vendorId: 'vendor-2',
      status: 'active',
      updatedAt: new Date('2026-09-07T00:00:00.000Z'),
    });
    expect(prisma.channelAccount.findFirst).toHaveBeenCalledWith({
      where: {
        organizationId: 'org-1',
        channel: 'coupang',
        isPrimary: true,
      },
      orderBy: { updatedAt: 'desc' },
    });
  });
});
