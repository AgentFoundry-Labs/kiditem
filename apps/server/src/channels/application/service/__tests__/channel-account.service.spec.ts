import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ChannelAccountRepositoryAdapter } from '../../../adapter/out/repository/channel-account.repository.adapter';

const ORGANIZATION_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const KEY = Buffer.alloc(32, 7).toString('base64');

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
  beforeEach(() => {
    process.env.CHANNEL_CREDENTIALS_ENCRYPTION_KEY = KEY;
  });

  it('stores Coupang credentials encrypted and never exposes the secret in settings', async () => {
    const prisma = makePrisma();
    const tx = makeTx();
    const service = new ChannelAccountRepositoryAdapter(prisma as never);
    let stored: Record<string, unknown> | null = null;

    prisma.$transaction.mockImplementation(async (cb: (txArg: typeof tx) => Promise<void>) =>
      cb(tx),
    );
    tx.channelAccount.findFirst.mockResolvedValue(null);
    tx.channelAccount.create.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => {
      stored = {
        ...data,
        id: 'account-1',
        updatedAt: new Date('2026-05-01T00:00:00.000Z'),
      };
      return { id: 'account-1' };
    });
    tx.channelAccount.updateMany.mockResolvedValue({ count: 0 });
    prisma.channelAccount.findFirst.mockImplementation(async () => stored);

    const settings = await service.upsertCoupangSettings(ORGANIZATION_ID, {
      vendorId: 'A00000001',
      accessKey: 'access-key-1234',
      secretKey: 'secret-key-5678',
    });

    expect(settings).toEqual(
      expect.objectContaining({
        configured: true,
        vendorId: 'A00000001',
        accessKeyMasked: 'acce********1234',
        hasAccessKey: true,
        hasSecretKey: true,
      }),
    );
    expect(stored?.config).toEqual(
      expect.objectContaining({
        coupangCredentials: expect.objectContaining({
          accessKey: expect.objectContaining({ algorithm: 'aes-256-gcm' }),
          secretKey: expect.objectContaining({ algorithm: 'aes-256-gcm' }),
        }),
      }),
    );
    expect(JSON.stringify(stored?.config)).not.toContain('secret-key-5678');

    const credentials = await service.resolveCoupangCredentials(ORGANIZATION_ID);
    expect(credentials).toEqual({
      vendorId: 'A00000001',
      accessKey: 'access-key-1234',
      secretKey: 'secret-key-5678',
    });
  });

  it('preserves the existing Secret Key when an update leaves it blank', async () => {
    const prisma = makePrisma();
    const tx = makeTx();
    const service = new ChannelAccountRepositoryAdapter(prisma as never);
    let stored: Record<string, unknown> | null = null;

    prisma.$transaction.mockImplementation(async (cb: (txArg: typeof tx) => Promise<void>) =>
      cb(tx),
    );
    tx.channelAccount.findFirst.mockResolvedValue(null);
    tx.channelAccount.create.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => {
      stored = {
        ...data,
        id: 'account-1',
        updatedAt: new Date('2026-05-01T00:00:00.000Z'),
      };
      return { id: 'account-1' };
    });
    tx.channelAccount.updateMany.mockImplementation(
      async ({ where, data }: { where?: { id?: string }; data: Record<string, unknown> }) => {
        if (where?.id === 'account-1') {
          stored = {
            ...stored,
            ...data,
            updatedAt: new Date('2026-05-02T00:00:00.000Z'),
          };
          return { count: 1 };
        }
        return { count: 0 };
      },
    );
    prisma.channelAccount.findFirst.mockImplementation(async () => stored);

    await service.upsertCoupangSettings(ORGANIZATION_ID, {
      vendorId: 'A00000001',
      accessKey: 'old-access',
      secretKey: 'old-secret',
    });
    tx.channelAccount.findFirst.mockResolvedValue(stored);

    await service.upsertCoupangSettings(ORGANIZATION_ID, {
      vendorId: 'A00000001',
      accessKey: 'new-access',
    });

    const credentials = await service.resolveCoupangCredentials(ORGANIZATION_ID);
    expect(credentials.accessKey).toBe('new-access');
    expect(credentials.secretKey).toBe('old-secret');
  });

  it('requires a Secret Key on first setup', async () => {
    const prisma = makePrisma();
    const tx = makeTx();
    const service = new ChannelAccountRepositoryAdapter(prisma as never);

    prisma.$transaction.mockImplementation(async (cb: (txArg: typeof tx) => Promise<void>) =>
      cb(tx),
    );
    tx.channelAccount.findFirst.mockResolvedValue(null);

    await expect(
      service.upsertCoupangSettings(ORGANIZATION_ID, {
        vendorId: 'A00000001',
        accessKey: 'access-key',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(tx.channelAccount.create).not.toHaveBeenCalled();
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
      accessKey: 'store-b-access',
      secretKey: 'store-b-secret',
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

  it('does not reuse another store credentials when a new store omits credentials', async () => {
    const prisma = makePrisma();
    const tx = makeTx();
    const service = new ChannelAccountRepositoryAdapter(prisma as never);

    prisma.$transaction.mockImplementation(async (cb: (txArg: typeof tx) => Promise<void>) =>
      cb(tx),
    );
    tx.channelAccount.findFirst.mockResolvedValueOnce(null);

    await expect(service.upsertCoupangSettings(ORGANIZATION_ID, {
      vendorId: 'B00000002',
    })).rejects.toBeInstanceOf(BadRequestException);

    expect(tx.channelAccount.create).not.toHaveBeenCalled();
    expect(tx.channelAccount.updateMany).not.toHaveBeenCalled();
  });

  it('rotates credentials for the same store without rewriting its identity columns', async () => {
    const prisma = makePrisma();
    const tx = makeTx();
    const service = new ChannelAccountRepositoryAdapter(prisma as never);
    const existing = {
      id: 'account-a',
      name: 'Store A',
      externalAccountId: 'A00000001',
      vendorId: 'A00000001',
      config: {},
    };

    prisma.$transaction.mockImplementation(async (cb: (txArg: typeof tx) => Promise<void>) =>
      cb(tx),
    );
    tx.channelAccount.findFirst.mockResolvedValueOnce(existing);
    tx.channelAccount.updateMany.mockResolvedValue({ count: 1 });
    prisma.channelAccount.findFirst.mockResolvedValue({
      ...existing,
      status: 'active',
      isPrimary: true,
      updatedAt: new Date('2026-07-13T00:00:00.000Z'),
    });

    await service.upsertCoupangSettings(ORGANIZATION_ID, {
      vendorId: 'A00000001',
      accessKey: 'rotated-access',
      secretKey: 'rotated-secret',
    });

    expect(tx.channelAccount.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ id: 'account-a' }),
      data: expect.not.objectContaining({
        externalAccountId: expect.anything(),
        vendorId: expect.anything(),
      }),
    }));
    expect(tx.channelAccount.create).not.toHaveBeenCalled();
  });
});
