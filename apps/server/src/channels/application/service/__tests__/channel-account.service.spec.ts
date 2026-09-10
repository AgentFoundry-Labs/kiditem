import { ConflictException, NotFoundException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ChannelAccountRepositoryAdapter } from '../../../adapter/out/repository/channel-account.repository.adapter';

const ORGANIZATION_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
function makePrisma() {
  return {
    channelAccount: {
      findFirst: vi.fn(),
    },
    $transaction: vi.fn(),
  };
}

function makeTx() {
  return {
    $queryRaw: vi.fn(),
    channelAccount: {
      findFirst: vi.fn(),
      findMany: vi.fn().mockResolvedValue([]),
      create: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
    },
    masterProductAbcFormulaState: {
      upsert: vi.fn().mockResolvedValue({ mappingGeneration: 1n }),
    },
  };
}

describe('ChannelAccountService — Rocket account bootstrap', () => {
  it('creates the internal Rocket identity from the extension-detected primary Coupang vendor', async () => {
    const prisma = makePrisma();
    const tx = makeTx();
    const service = new ChannelAccountRepositoryAdapter(prisma as never);
    const rocketAccount = {
      id: '11111111-1111-4111-8111-111111111111',
      channel: 'rocket',
      name: '쿠팡 로켓',
      externalAccountId: 'A00057379',
      vendorId: 'A00057379',
      sellerId: null,
      isPrimary: false,
    };

    prisma.$transaction.mockImplementation(async (cb: (txArg: typeof tx) => Promise<unknown>) =>
      cb(tx),
    );
    tx.$queryRaw.mockResolvedValue([{ lock: '1' }]);
    tx.channelAccount.findFirst
      .mockResolvedValueOnce({
        externalAccountId: 'A00057379',
        vendorId: null,
      })
      .mockResolvedValueOnce(null);
    tx.channelAccount.create.mockResolvedValue(rocketAccount);

    await expect(service.ensureRocketAccount(ORGANIZATION_ID)).resolves.toEqual(rocketAccount);
    expect(tx.channelAccount.create).toHaveBeenCalledWith({
      data: {
        organizationId: ORGANIZATION_ID,
        channel: 'rocket',
        name: '쿠팡 로켓',
        externalAccountId: 'A00057379',
        vendorId: 'A00057379',
        status: 'active',
        isPrimary: false,
      },
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

  it('reuses the matching active Rocket identity without creating a duplicate', async () => {
    const prisma = makePrisma();
    const tx = makeTx();
    const service = new ChannelAccountRepositoryAdapter(prisma as never);
    const rocketAccount = {
      id: '11111111-1111-4111-8111-111111111111',
      channel: 'rocket',
      name: '기존 로켓',
      externalAccountId: 'A00057379',
      vendorId: 'A00057379',
      sellerId: null,
      status: 'active',
      isPrimary: false,
    };

    prisma.$transaction.mockImplementation(async (cb: (txArg: typeof tx) => Promise<unknown>) =>
      cb(tx),
    );
    tx.$queryRaw.mockResolvedValue([{ lock: '1' }]);
    tx.channelAccount.findFirst
      .mockResolvedValueOnce({
        externalAccountId: 'A00057379',
        vendorId: 'A00057379',
      })
      .mockResolvedValueOnce(rocketAccount);

    await expect(service.ensureRocketAccount(ORGANIZATION_ID)).resolves.toEqual({
      id: rocketAccount.id,
      channel: rocketAccount.channel,
      name: rocketAccount.name,
      externalAccountId: rocketAccount.externalAccountId,
      vendorId: rocketAccount.vendorId,
      sellerId: rocketAccount.sellerId,
      isPrimary: rocketAccount.isPrimary,
    });
    expect(tx.channelAccount.create).not.toHaveBeenCalled();
    expect(tx.channelAccount.update).not.toHaveBeenCalled();
  });

  it('fills a missing Rocket vendor column from the matching canonical external identity', async () => {
    const prisma = makePrisma();
    const tx = makeTx();
    const service = new ChannelAccountRepositoryAdapter(prisma as never);

    prisma.$transaction.mockImplementation(async (cb: (txArg: typeof tx) => Promise<unknown>) =>
      cb(tx),
    );
    tx.$queryRaw.mockResolvedValue([{ lock: '1' }]);
    tx.channelAccount.findFirst
      .mockResolvedValueOnce({ externalAccountId: 'A00057379', vendorId: null })
      .mockResolvedValueOnce({
        id: '11111111-1111-4111-8111-111111111111',
        channel: 'rocket',
        name: '기존 로켓',
        externalAccountId: 'A00057379',
        vendorId: null,
        sellerId: null,
        status: 'active',
        isPrimary: false,
      });
    tx.channelAccount.update.mockResolvedValue({
      id: '11111111-1111-4111-8111-111111111111',
      channel: 'rocket',
      name: '기존 로켓',
      externalAccountId: 'A00057379',
      vendorId: 'A00057379',
      sellerId: null,
      isPrimary: false,
    });

    await service.ensureRocketAccount(ORGANIZATION_ID);

    expect(tx.channelAccount.update).toHaveBeenCalledWith(expect.objectContaining({
      where: {
        id_organizationId: {
          id: '11111111-1111-4111-8111-111111111111',
          organizationId: ORGANIZATION_ID,
        },
      },
      data: { vendorId: 'A00057379' },
    }));
  });

  it('does not invent a Rocket identity without a detected primary Coupang vendor', async () => {
    const prisma = makePrisma();
    const tx = makeTx();
    const service = new ChannelAccountRepositoryAdapter(prisma as never);

    prisma.$transaction.mockImplementation(async (cb: (txArg: typeof tx) => Promise<unknown>) =>
      cb(tx),
    );
    tx.$queryRaw.mockResolvedValue([{ lock: '1' }]);
    tx.channelAccount.findFirst.mockResolvedValueOnce(null);

    await expect(service.ensureRocketAccount(ORGANIZATION_ID))
      .rejects.toBeInstanceOf(NotFoundException);
    expect(tx.channelAccount.create).not.toHaveBeenCalled();
  });

  it('rejects conflicting Coupang identities and never rewrites them', async () => {
    const prisma = makePrisma();
    const tx = makeTx();
    const service = new ChannelAccountRepositoryAdapter(prisma as never);

    prisma.$transaction.mockImplementation(async (cb: (txArg: typeof tx) => Promise<unknown>) =>
      cb(tx),
    );
    tx.$queryRaw.mockResolvedValue([{ lock: '1' }]);
    tx.channelAccount.findFirst.mockResolvedValueOnce({
      externalAccountId: 'A00057379',
      vendorId: 'B00099999',
    });

    await expect(service.ensureRocketAccount(ORGANIZATION_ID))
      .rejects.toBeInstanceOf(ConflictException);
    expect(tx.channelAccount.create).not.toHaveBeenCalled();
  });

  it('preserves an explicitly paused matching Rocket account', async () => {
    const prisma = makePrisma();
    const tx = makeTx();
    const service = new ChannelAccountRepositoryAdapter(prisma as never);

    prisma.$transaction.mockImplementation(async (cb: (txArg: typeof tx) => Promise<unknown>) =>
      cb(tx),
    );
    tx.$queryRaw.mockResolvedValue([{ lock: '1' }]);
    tx.channelAccount.findFirst
      .mockResolvedValueOnce({ externalAccountId: 'A00057379', vendorId: null })
      .mockResolvedValueOnce({
        id: '11111111-1111-4111-8111-111111111111',
        channel: 'rocket',
        name: '중지된 로켓',
        externalAccountId: 'A00057379',
        vendorId: 'A00057379',
        sellerId: null,
        status: 'paused',
        isPrimary: false,
      });

    await expect(service.ensureRocketAccount(ORGANIZATION_ID))
      .rejects.toBeInstanceOf(ConflictException);
    expect(tx.channelAccount.update).not.toHaveBeenCalled();
  });
});

describe('ChannelAccountService — Coupang account settings', () => {
  it('stores only the Wing vendor identity and does not require Open API credentials', async () => {
    const prisma = makePrisma();
    const tx = makeTx();
    const service = new ChannelAccountRepositoryAdapter(prisma as never);
    const stored = {
      id: 'account-1',
      organizationId: ORGANIZATION_ID,
      channel: 'coupang',
      name: '쿠팡 Wing',
      externalAccountId: 'A00000001',
      vendorId: 'A00000001',
      status: 'active',
      isPrimary: true,
      config: { browserSession: 'preserved' },
      updatedAt: new Date('2026-05-01T00:00:00.000Z'),
    };

    prisma.$transaction.mockImplementation(async (cb: (txArg: typeof tx) => Promise<void>) => cb(tx));
    tx.channelAccount.findFirst.mockResolvedValue(null);
    tx.channelAccount.create.mockResolvedValue({ id: stored.id });
    tx.channelAccount.updateMany.mockResolvedValue({ count: 0 });
    prisma.channelAccount.findFirst.mockResolvedValue(stored);

    await expect(service.upsertCoupangSettings(ORGANIZATION_ID, {
      vendorId: 'A00000001',
    })).resolves.toEqual({
      configured: true,
      vendorId: 'A00000001',
      status: 'active',
      updatedAt: stored.updatedAt,
    });
    expect(tx.channelAccount.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.not.objectContaining({ config: expect.anything() }),
    }));
  });

  it('creates and switches to a distinct account when the Coupang store identity changes', async () => {
    const prisma = makePrisma();
    const tx = makeTx();
    const service = new ChannelAccountRepositoryAdapter(prisma as never);
    const primary = {
      id: 'account-a',
      organizationId: ORGANIZATION_ID,
      channel: 'coupang',
      name: 'Store A',
      externalAccountId: 'A00000001',
      vendorId: 'A00000001',
      status: 'active',
      isPrimary: true,
      config: {},
    };
    const created = {
      id: 'account-b',
      organizationId: ORGANIZATION_ID,
      channel: 'coupang',
      name: '쿠팡 Wing',
      externalAccountId: 'B00000002',
      vendorId: 'B00000002',
      status: 'active',
      isPrimary: true,
      config: {},
      updatedAt: new Date('2026-07-13T00:00:00.000Z'),
    };

    prisma.$transaction.mockImplementation(async (cb: (txArg: typeof tx) => Promise<void>) =>
      cb(tx),
    );
    tx.channelAccount.findFirst.mockResolvedValueOnce(null);
    tx.channelAccount.create.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => {
      Object.assign(created, data);
      return { id: created.id };
    });
    tx.channelAccount.updateMany.mockResolvedValue({ count: 1 });
    prisma.channelAccount.findFirst.mockResolvedValue(created);

    await service.upsertCoupangSettings(ORGANIZATION_ID, {
      vendorId: 'B00000002',
    });

    expect(tx.channelAccount.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        externalAccountId: 'B00000002',
        vendorId: 'B00000002',
        isPrimary: true,
      }),
    }));
    expect(tx.channelAccount.updateMany).not.toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ id: 'account-a' }),
      data: expect.objectContaining({
        externalAccountId: 'B00000002',
      }),
    }));
    expect(tx.channelAccount.updateMany).toHaveBeenCalledWith({
      where: {
        organizationId: ORGANIZATION_ID,
        channel: 'coupang',
        id: { not: 'account-b' },
      },
      data: { isPrimary: false },
    });
  });

});
