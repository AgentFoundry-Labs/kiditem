import { beforeEach, describe, expect, it, vi } from 'vitest';
import { OrderCollectionMallAccountService } from '../order-collection-mall-account.service';

const ORGANIZATION_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const KEY = Buffer.alloc(32, 9).toString('base64');

function makePrisma() {
  return {
    channelAccount: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
  };
}

describe('OrderCollectionMallAccountService', () => {
  beforeEach(() => {
    process.env.CHANNEL_CREDENTIALS_ENCRYPTION_KEY = KEY;
  });

  it('lists the managed order malls with credential status only', async () => {
    const prisma = makePrisma();
    const service = new OrderCollectionMallAccountService(prisma as never);
    prisma.channelAccount.findMany.mockResolvedValue([]);

    const accounts = await service.list(ORGANIZATION_ID);

    expect(accounts.map((account) => account.name)).toEqual([
      '원폴라리스',
      '아이스크림몰',
      '키드키즈',
      '키즈노트',
      '해법몰',
      '온채널',
      '꼬망세',
      '아트공구',
      '테크빌교육',
      '베네피아물',
    ]);
    expect(accounts[0]).toMatchObject({
      configured: false,
      loginId: null,
      hasPassword: false,
    });
  });

  it('stores mall login password encrypted and never returns it', async () => {
    const prisma = makePrisma();
    const service = new OrderCollectionMallAccountService(prisma as never);
    let stored: Record<string, unknown> | null = null;

    prisma.channelAccount.findFirst.mockResolvedValue(null);
    prisma.channelAccount.create.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => {
      stored = {
        ...data,
        updatedAt: new Date('2026-06-23T10:00:00.000Z'),
      };
      return stored;
    });

    const account = await service.update(ORGANIZATION_ID, 'icecream-mall', {
      enabled: true,
      loginId: 'icecream-user',
      password: 'icecream-password',
      siteUrl: 'https://example.com/login',
      memo: 'main',
    });

    expect(account).toMatchObject({
      key: 'icecream-mall',
      name: '아이스크림몰',
      configured: true,
      loginId: 'icecream-user',
      hasPassword: true,
      siteUrl: 'https://example.com/login',
      memo: 'main',
    });
    expect(JSON.stringify(stored?.config)).not.toContain('icecream-password');
    expect(JSON.stringify(account)).not.toContain('icecream-password');
  });
});
