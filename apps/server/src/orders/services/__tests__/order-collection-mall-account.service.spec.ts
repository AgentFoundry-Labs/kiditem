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
    // ADR-0012: 몰 행은 channel · externalAccountId 모두 몰 키다.
    channel: key,
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
      '카카오 톡스토어',
      '토스쇼핑',
      '티쳐몰',
      'GS샵',
      '쿠팡직배송',
      '지마켓',
      '옥션',
      '11번가',
      '스마트스토어',
      '신세계(SSG)',
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
      '카카오 톡스토어',
      '원폴라리스',
    ]);
    expect(accounts[0]).toMatchObject({ key: 'gs-shop', sortOrder: 0 });
  });

  it('assigns display order from the submitted mall list', async () => {
    const prisma = makePrisma();
    const service = new OrderCollectionMallAccountService(prisma as never);
    prisma.channelAccount.findMany.mockResolvedValue([mallRow('kakao', {}), mallRow('onch', {})]);

    await service.reorder(ORGANIZATION_ID, ['kakao', 'onch']);

    expect(prisma.channelAccount.update).toHaveBeenCalledTimes(2);
    const updated = prisma.channelAccount.update.mock.calls.map(
      ([args]: [{ where: { id_organizationId: { id: string } }; data: { config: Record<string, { sortOrder: number }> } }]) => ({
        id: args.where.id_organizationId.id,
        sortOrder: args.data.config.orderCollection.sortOrder,
      }),
    );
    expect(updated).toEqual([
      { id: 'row-onch', sortOrder: 1 },
      { id: 'row-kakao', sortOrder: 0 },
    ]);
  });

  it('⭐ saves the display order without creating rows for malls that have no account (ADR-0012)', async () => {
    const prisma = makePrisma();
    const service = new OrderCollectionMallAccountService(prisma as never);
    // 계정이 있는 몰은 카카오 하나다. 화면은 보이는 몰 전부를 보낸다.
    prisma.channelAccount.findMany.mockResolvedValue([mallRow('kakao', { sortOrder: 5 })]);

    await service.reorder(ORGANIZATION_ID, ['kidkids', 'toss', 'kakao', 'coupang-direct']);

    expect(prisma.channelAccount.create).not.toHaveBeenCalled();
    expect(prisma.channelAccount.update).toHaveBeenCalledTimes(1);
    const [args] = prisma.channelAccount.update.mock.calls[0] as [
      { where: { id_organizationId: { id: string } }; data: { config: Record<string, { sortOrder: number | null }> } },
    ];
    expect(args.where.id_organizationId.id).toBe('row-kakao');
    expect(args.data.config.orderCollection.sortOrder).toBe(2);
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

  it('⭐ creates a missing mall row whose channel is the mall key (ADR-0012)', async () => {
    const prisma = makePrisma();
    const service = new OrderCollectionMallAccountService(prisma as never);
    prisma.channelAccount.findFirst.mockResolvedValue(null);
    prisma.channelAccount.create.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({
      ...data,
      updatedAt: new Date('2026-09-15T12:00:00.000Z'),
    }));

    await service.update(ORGANIZATION_ID, 'kidkids', { loginId: 'kid', password: 'pw', siteUrl: 'https://example.com' });

    expect(prisma.channelAccount.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: { organizationId: ORGANIZATION_ID, channel: 'kidkids', externalAccountId: 'kidkids' },
    }));
    expect(prisma.channelAccount.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ channel: 'kidkids', externalAccountId: 'kidkids', name: '키드키즈' }),
    });
  });

  it('⭐ stores the Coupang direct login on the Rocket row without renaming or pausing it', async () => {
    const prisma = makePrisma();
    const service = new OrderCollectionMallAccountService(prisma as never);
    prisma.channelAccount.findFirst.mockResolvedValue({
      id: 'rocket-account',
      channel: 'rocket',
      name: '로켓',
      status: 'active',
      config: { rocketSetting: true },
      updatedAt: new Date('2026-09-15T12:00:00.000Z'),
    });
    prisma.channelAccount.update.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({
      id: 'rocket-account',
      ...data,
      updatedAt: new Date('2026-09-15T12:01:00.000Z'),
    }));

    const account = await service.update(ORGANIZATION_ID, 'coupang-direct', {
      enabled: false,
      loginId: 'supplier-user',
      password: 'supplier-password',
      siteUrl: 'https://supplier.coupang.com',
    });

    expect(prisma.channelAccount.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: { organizationId: ORGANIZATION_ID, channel: 'rocket' },
    }));
    const { data } = prisma.channelAccount.update.mock.calls[0]![0] as { data: Record<string, unknown> };
    expect(Object.keys(data)).toEqual(['config']);
    expect(data.config).toMatchObject({ rocketSetting: true, orderCollection: { loginId: 'supplier-user', enabled: false } });
    expect(JSON.stringify(data.config)).not.toContain('supplier-password');
    expect(prisma.channelAccount.create).not.toHaveBeenCalled();
    expect(account).toMatchObject({ key: 'coupang-direct', configured: true, enabled: false });
  });

  it('refuses the Coupang direct login when the organization has no Rocket row', async () => {
    const prisma = makePrisma();
    const service = new OrderCollectionMallAccountService(prisma as never);
    prisma.channelAccount.findFirst.mockResolvedValue(null);

    await expect(service.update(ORGANIZATION_ID, 'coupang-direct', {
      loginId: 'supplier-user',
      password: 'supplier-password',
    })).rejects.toThrow(/rocket 채널 계정/);
    expect(prisma.channelAccount.create).not.toHaveBeenCalled();
  });

  it('⭐ lists the Rocket row as Coupang direct and ignores a mall-channel row with a foreign external id', async () => {
    const prisma = makePrisma();
    const service = new OrderCollectionMallAccountService(prisma as never);
    const updatedAt = new Date('2026-09-15T12:00:00.000Z');
    prisma.channelAccount.findMany.mockResolvedValue([
      { channel: 'rocket', externalAccountId: 'V001', config: { orderCollection: { loginId: 'rocket-login' } }, updatedAt },
      { channel: 'toss', externalAccountId: 'someone-else', config: { orderCollection: { loginId: 'wrong' } }, updatedAt },
      { channel: 'toss', externalAccountId: 'toss', config: { orderCollection: { loginId: 'toss-login' } }, updatedAt },
    ]);

    const accounts = await service.list(ORGANIZATION_ID);
    const byKey = Object.fromEntries(accounts.map((account) => [account.key, account]));

    expect(byKey['coupang-direct']?.loginId).toBe('rocket-login');
    expect(byKey.toss?.loginId).toBe('toss-login');
    expect(byKey.kidkids?.loginId).toBeNull();
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
