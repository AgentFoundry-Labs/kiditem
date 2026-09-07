import { beforeEach, describe, expect, it, vi } from 'vitest';
import { encryptCredential } from '../../../channels/domain/channel-credential-crypto';
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
    // reorder 는 준비된 쓰기 배열을 한 트랜잭션으로 넘긴다.
    $transaction: vi.fn(async (operations: unknown[]) => operations),
  };
}

function mallRow(key: string, orderConfig: Record<string, unknown>) {
  return {
    id: `row-${key}`,
    externalAccountId: key,
    config: { orderCollection: orderConfig },
    updatedAt: new Date('2026-08-30T00:00:00.000Z'),
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
      '도매꾹',
      '롯데ON',
      '보리보리',
      '올웨이즈',
      '웅진클래스몰',
      '카카오',
      '토스',
      '티쳐몰',
      'GS샵',
      '쿠팡직배송',
      '지마켓',
      '옥션',
      '11번가',
      '스마트스토어',
      '신세계',
      '떠리몰',
      '윤선생',
    ]);
    expect(accounts[0]).toMatchObject({
      configured: false,
      loginId: null,
      hasPassword: false,
    });
  });

  it('orders malls by the saved display order and keeps the rest in catalog order', async () => {
    const prisma = makePrisma();
    const service = new OrderCollectionMallAccountService(prisma as never);
    prisma.channelAccount.findMany.mockResolvedValue([
      mallRow('gs-shop', { sortOrder: 0 }),
      mallRow('kakao', { sortOrder: 1 }),
    ]);

    const accounts = await service.list(ORGANIZATION_ID);

    expect(accounts.slice(0, 3).map((account) => account.name)).toEqual([
      'GS샵',
      '카카오',
      '원폴라리스',
    ]);
    expect(accounts[0]).toMatchObject({ key: 'gs-shop', sortOrder: 0 });
  });

  it('assigns display order from the submitted mall list', async () => {
    const prisma = makePrisma();
    const service = new OrderCollectionMallAccountService(prisma as never);
    prisma.channelAccount.findMany.mockResolvedValue([]);

    await service.reorder(ORGANIZATION_ID, ['kakao', 'onch']);

    expect(prisma.channelAccount.create).toHaveBeenCalledTimes(2);
    const created = prisma.channelAccount.create.mock.calls.map(
      ([args]: [{ data: { externalAccountId: string; config: Record<string, { sortOrder: number }> } }]) => ({
        key: args.data.externalAccountId,
        sortOrder: args.data.config.orderCollection.sortOrder,
      }),
    );
    expect(created).toEqual([
      { key: 'onch', sortOrder: 1 },
      { key: 'kakao', sortOrder: 0 },
    ]);
  });

  it('clears the display order of malls that are left out', async () => {
    const prisma = makePrisma();
    const service = new OrderCollectionMallAccountService(prisma as never);
    prisma.channelAccount.findMany.mockResolvedValue([mallRow('kakao', { sortOrder: 3 })]);

    await service.reorder(ORGANIZATION_ID, []);

    expect(prisma.channelAccount.update).toHaveBeenCalledTimes(1);
    const [args] = prisma.channelAccount.update.mock.calls[0] as [
      { data: { config: Record<string, { sortOrder: number | null }> } },
    ];
    expect(args.data.config.orderCollection.sortOrder).toBeNull();
  });

  it('rejects an invalid or duplicated mall order', async () => {
    const prisma = makePrisma();
    const service = new OrderCollectionMallAccountService(prisma as never);
    prisma.channelAccount.findMany.mockResolvedValue([]);

    await expect(service.reorder(ORGANIZATION_ID, 'kakao')).rejects.toThrow('배열');
    await expect(service.reorder(ORGANIZATION_ID, ['nope'])).rejects.toThrow('지원하지 않는');
    await expect(service.reorder(ORGANIZATION_ID, ['kakao', 'kakao'])).rejects.toThrow('두 번');
  });

  it('keeps the saved display order when the mall account is edited', async () => {
    const prisma = makePrisma();
    const service = new OrderCollectionMallAccountService(prisma as never);
    prisma.channelAccount.findFirst.mockResolvedValue(mallRow('kakao', { sortOrder: 4 }));
    prisma.channelAccount.update.mockResolvedValue(mallRow('kakao', { sortOrder: 4 }));

    await service.update(ORGANIZATION_ID, 'kakao', {
      loginId: 'operator',
      siteUrl: 'https://example.test',
      enabled: true,
    });

    const [args] = prisma.channelAccount.update.mock.calls[0] as [
      { data: { config: Record<string, { sortOrder: number | null }> } },
    ];
    expect(args.data.config.orderCollection.sortOrder).toBe(4);
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

  it('stores both Cafe24 IDs on the single art09 account', async () => {
    const prisma = makePrisma();
    const service = new OrderCollectionMallAccountService(prisma as never);
    let stored: Record<string, unknown> | null = null;

    prisma.channelAccount.findFirst.mockResolvedValue(null);
    prisma.channelAccount.create.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => {
      stored = {
        ...data,
        updatedAt: new Date('2026-07-27T06:30:00.000Z'),
      };
      return stored;
    });

    const account = await service.update(ORGANIZATION_ID, 'art09', {
      enabled: true,
      loginId: 'shop-id',
      supplierLoginId: 'supplier-id',
      password: 'art09-password',
      siteUrl: 'https://example.cafe24.com',
    });

    expect(account).toMatchObject({
      key: 'art09',
      name: '아트공구',
      configured: true,
      loginId: 'shop-id',
      supplierLoginId: 'supplier-id',
    });
    expect(JSON.stringify(stored?.config)).toContain('supplier-id');
    expect(JSON.stringify(stored?.config)).not.toContain('art09-password');
  });

  it('reveals a saved mall password only through the password lookup', async () => {
    const prisma = makePrisma();
    const service = new OrderCollectionMallAccountService(prisma as never);
    prisma.channelAccount.findFirst.mockResolvedValue({
      config: {
        orderCollection: {
          password: encryptCredential('kidkids-password'),
        },
      },
    });

    const result = await service.getPassword(ORGANIZATION_ID, 'kidkids');

    expect(result).toEqual({
      key: 'kidkids',
      password: 'kidkids-password',
    });
  });
});
