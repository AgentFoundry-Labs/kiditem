import { BadRequestException } from '@nestjs/common';
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
    channelAccount: {
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
    },
  };
}

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
});
