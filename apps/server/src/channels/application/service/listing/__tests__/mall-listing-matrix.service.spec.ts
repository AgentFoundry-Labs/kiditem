import { describe, expect, it } from 'vitest';
import type { ChannelSkuAvailabilityPort } from '../../../port/in/channel-sku-availability.port';
import type {
  MallAccountRow,
  MallListingAccountRow,
  MallMatrixProductRow,
  MallPublishingRepositoryPort,
} from '../../../port/out/repository/mall-publishing.repository.port';
import { MallPublishingService } from '../../registration/mall-publishing.service';

/**
 * 매트릭스와 허브 요약.
 *
 * 여기서 지키는 것은 하나다 — **모르는 것을 안다고 말하지 않는다.** 리스팅을
 * 가져온 적 없는 몰의 빈 칸은 "몰에 없다"가 아니라 "우리가 모른다"이고, 그
 * 차이가 화면까지 전달돼야 한다.
 */

const ORG = 'org-1';

function account(overrides: Partial<MallListingAccountRow> = {}): MallListingAccountRow {
  return {
    channelAccountId: 'acc-coupang',
    channel: 'coupang',
    name: 'Coupang Wing',
    listingCount: 1230,
    productCount: 456,
    onSaleProductCount: 0,
    onSaleListingCount: 0,
    onSaleLinkedListingCount: 0,
    optionCount: 0,
    matchedOptionCount: 0,
    onSaleOptionCount: 0,
    onSaleMatchedOptionCount: 0,
    ...overrides,
  };
}

function mallAccount(overrides: Partial<MallAccountRow> = {}): MallAccountRow {
  return {
    mallKey: 'coupang',
    channelAccountId: 'acc-coupang',
    name: 'Coupang Wing',
    hasCredentials: true,
    listingProfile: null,
    ...overrides,
  };
}

function product(overrides: Partial<MallMatrixProductRow> = {}): MallMatrixProductRow {
  return {
    masterProductId: 'mp-1',
    code: 'INV-SELLPIA-1',
    sellpiaCode: 'INV-SELLPIA-1',
    name: '3000샤이닝반짝이풀펜',
    imageUrl: null,
    stock: 120,
    updatedAt: new Date('2026-09-01T00:00:00.000Z'),
    listings: [],
    ...overrides,
  };
}

let lastMatrixQuery: Record<string, unknown> | null = null;

function build(overrides: {
  listingAccounts?: MallListingAccountRow[];
  mallAccounts?: MallAccountRow[];
  matrixProducts?: MallMatrixProductRow[];
  orderCounts?: { channelAccountId: string; orderCount: number }[];
  masterProductCount?: number;
  soldOutItems?: unknown[];
} = {}) {
  const repository = {
    listMallAccounts: async () => overrides.mallAccounts ?? [],
    listPreflightProducts: async () => ({ rows: [], total: 0 }),
    listAccountsWithListings: async () => overrides.listingAccounts ?? [],
    listMatrixProducts: async (_org: string, query: Record<string, unknown>) => {
      lastMatrixQuery = query;
      return {
        rows: overrides.matrixProducts ?? [],
        total: (overrides.matrixProducts ?? []).length,
      };
    },
    countOrdersByAccount: async () => overrides.orderCounts ?? [],
    countVisibleMasterProducts: async () => overrides.masterProductCount ?? 0,
  } as unknown as MallPublishingRepositoryPort;

  const availability: ChannelSkuAvailabilityPort = {
    updateSafetyStock: async (_organizationId: string, channelListingOptionId: string, safetyStock: number) => ({ channelListingOptionId, safetyStock }),
    listSoldOutCandidates: async () => ({ candidates: [], total: 0 }),
    list: async () => ({
      items: overrides.soldOutItems ?? [],
      total: (overrides.soldOutItems ?? []).length,
      page: 1,
      limit: 25,
      summary: { total: 0, inStock: 0, outOfStock: 0, unmatched: 0, needsReview: 0 },
    }),
    findByListingIds: async () => [],
  } as unknown as ChannelSkuAvailabilityPort;

  return new MallPublishingService(repository, availability, { readForSalesProducts: async () => new Map() });
}

describe('listingMatrix — 열', () => {
  it('리스팅을 가진 계정만 기본 열이 된다', async () => {
    const service = build({
      listingAccounts: [account(), account({
        channelAccountId: 'acc-rocket', channel: 'rocket', name: 'Coupang Rocket',
        listingCount: 459, productCount: 327,
      })],
      mallAccounts: [mallAccount(), mallAccount({ mallKey: 'rocket', channelAccountId: 'acc-rocket' })],
    });

    const result = await service.listingMatrix(ORG, { page: 1, limit: 25 });

    // 레지스트리에 29개 채널이 있어도 열은 2개다.
    expect(result.columns).toHaveLength(2);
    expect(result.columns.map((column) => column.mallKey)).toEqual(['coupang', 'rocket']);
    expect(result.columns.every((column) => column.imported)).toBe(true);
  });

  it('리스팅이 많은 몰이 왼쪽에 온다', async () => {
    const service = build({
      listingAccounts: [
        account({ channelAccountId: 'acc-rocket', channel: 'rocket', listingCount: 459 }),
        account({ channelAccountId: 'acc-coupang', channel: 'coupang', listingCount: 1230 }),
      ],
      mallAccounts: [
        mallAccount({ mallKey: 'rocket', channelAccountId: 'acc-rocket' }),
        mallAccount({ mallKey: 'coupang', channelAccountId: 'acc-coupang' }),
      ],
    });

    const result = await service.listingMatrix(ORG, { page: 1, limit: 25 });
    expect(result.columns.map((column) => column.mallKey)).toEqual(['coupang', 'rocket']);
  });

  it('요청한 몰은 리스팅이 없어도 열로 세우고 imported=false 로 표시한다', async () => {
    const service = build({
      listingAccounts: [account()],
      mallAccounts: [mallAccount()],
    });

    const result = await service.listingMatrix(ORG, {
      page: 1, limit: 25, mallKeys: ['kidsnote'],
    });

    const kidsnote = result.columns.find((column) => column.mallKey === 'kidsnote');
    // 이 열의 빈 칸은 "몰에 없다"가 아니라 "우리가 모른다"다.
    expect(kidsnote?.imported).toBe(false);
    expect(kidsnote?.listingCount).toBe(0);
    expect(kidsnote?.channelAccountId).toBeNull();
  });

  it('연결된 몰은 요청하지 않아도 전부 열이 된다', async () => {
    // 25곳에 파는데 2곳만 보여주면 나머지에 뭘 안 올렸는지가 화면에서 사라진다.
    const service = build({
      listingAccounts: [account()],
      mallAccounts: [
        mallAccount(),
        mallAccount({ mallKey: 'kidsnote', channelAccountId: 'acc-kidsnote' }),
        mallAccount({ mallKey: 'lotte-on', channelAccountId: 'acc-lotteon' }),
        mallAccount({ mallKey: 'gmarket', channelAccountId: 'acc-gmarket' }),
      ],
    });

    const result = await service.listingMatrix(ORG, { page: 1, limit: 25 });
    expect(result.columns.length).toBeGreaterThanOrEqual(4);
    expect(result.columns[0]?.mallKey).toBe('coupang');
    expect(result.columns.map((column) => column.mallKey)).toEqual(
      expect.arrayContaining(['kidsnote', 'lotte-on', 'gmarket']),
    );
  });

  /**
   * 쿠팡 윙은 리스팅이 있어서 열이 되고, 로켓은 사입 채널이라 열이 되지 않는다. 마켓이
   * 몰 매니페스트를 떠난 뒤(KID-250)에도 **가져온 리스팅은 계속 보인다** — 다만 보낼 수
   * 있는 몰로 고를 수는 없다.
   */
  it('⭐ 리스팅이 있는 채널이 왼쪽이고, 등록 경로가 없는 마켓은 열을 만들지 않는다', async () => {
    const service = build({
      listingAccounts: [account()],
      mallAccounts: [
        mallAccount(),
        mallAccount({ mallKey: 'rocket', channelAccountId: 'acc-rocket' }),
        mallAccount({ mallKey: 'kidsnote', channelAccountId: 'acc-kidsnote' }),
      ],
    });

    const result = await service.listingMatrix(ORG, { page: 1, limit: 25 });
    const keys = result.columns.map((column) => column.mallKey);
    expect(keys[0]).toBe('coupang');
    expect(result.columns[0]?.hasAdapter).toBe(false);
    expect(keys).toContain('kidsnote');
    expect(keys).not.toContain('rocket');
  });

  it('매니페스트에 없는 몰키는 열을 만들지 않는다', async () => {
    const service = build({ listingAccounts: [], mallAccounts: [] });
    const result = await service.listingMatrix(ORG, {
      page: 1, limit: 25, mallKeys: ['존재하지않는몰'],
    });
    expect(result.columns).toHaveLength(0);
  });

  it('이미 열인 몰을 요청해도 중복되지 않는다', async () => {
    const service = build({ listingAccounts: [account()], mallAccounts: [mallAccount()] });
    const result = await service.listingMatrix(ORG, {
      page: 1, limit: 25, mallKeys: ['coupang'],
    });
    expect(result.columns).toHaveLength(1);
  });
});

describe('listingMatrix — 칸', () => {
  it('몰 원문 상태를 우리 어휘로 접고 원문도 함께 싣는다', async () => {
    const service = build({
      listingAccounts: [account()],
      mallAccounts: [mallAccount()],
      matrixProducts: [product({
        listings: [{
          storefrontProductId: null,
          salesProductId: null,
          channelAccountId: 'acc-coupang',
          status: '승인완료',
          externalId: '16290876620',
          category: '완구/취미>물총',
          updatedAt: new Date('2026-09-05T00:00:00.000Z'),
        }],
      })],
    });

    const result = await service.listingMatrix(ORG, { page: 1, limit: 25 });
    const cell = result.rows[0]?.cells[0];
    expect(cell?.state).toBe('published');
    expect(cell?.rawStatus).toBe('승인완료');
    expect(cell?.externalId).toBe('16290876620');
    expect(result.rows[0]?.publishedCount).toBe(1);
  });

  it('리스팅이 없는 몰 칸은 미등록이다', async () => {
    const service = build({
      listingAccounts: [account(), account({
        channelAccountId: 'acc-rocket', channel: 'rocket', listingCount: 1,
      })],
      mallAccounts: [mallAccount(), mallAccount({ mallKey: 'rocket', channelAccountId: 'acc-rocket' })],
      matrixProducts: [product({
        listings: [{
          storefrontProductId: null,
          salesProductId: null,
          channelAccountId: 'acc-coupang', status: '승인완료',
          externalId: 'x', category: null, updatedAt: new Date(),
        }],
      })],
    });

    const result = await service.listingMatrix(ORG, { page: 1, limit: 25 });
    const states = result.rows[0]?.cells.map((cell) => cell.state);
    expect(states).toEqual(['published', 'unregistered']);
    expect(result.rows[0]?.publishedCount).toBe(1);
  });

  it('카테고리를 리스팅에서 회수한다 — 마스터에는 저장돼 있지 않다', async () => {
    const service = build({
      listingAccounts: [account()],
      mallAccounts: [mallAccount()],
      matrixProducts: [product({
        listings: [{
          storefrontProductId: null,
          salesProductId: null,
          channelAccountId: 'acc-coupang', status: '활성',
          externalId: 'x', category: '문구/사무용품', updatedAt: new Date(),
        }],
      })],
    });
    const result = await service.listingMatrix(ORG, { page: 1, limit: 25 });
    expect(result.rows[0]?.category).toBe('문구/사무용품');
  });

  it('재고 연결이 없으면 null 이고 0 과 구별된다', async () => {
    const service = build({
      listingAccounts: [account()],
      mallAccounts: [mallAccount()],
      matrixProducts: [product({ stock: null }), product({ masterProductId: 'mp-2', stock: 0 })],
    });
    const result = await service.listingMatrix(ORG, { page: 1, limit: 25 });
    expect(result.rows[0]?.stock).toBeNull();
    expect(result.rows[1]?.stock).toBe(0);
  });

  it('페이지 정보를 그대로 돌려준다', async () => {
    const service = build({ listingAccounts: [account()], mallAccounts: [mallAccount()] });
    const result = await service.listingMatrix(ORG, { page: 3, limit: 10 });
    expect(result.page).toBe(3);
    expect(result.limit).toBe(10);
  });
});

describe('channelOverview', () => {
  it('연결 흔적이 없는 몰은 허브에 걸지 않는다', async () => {
    const service = build({
      mallAccounts: [mallAccount()],
      listingAccounts: [account()],
      masterProductCount: 2951,
    });

    const overview = await service.channelOverview(ORG);
    // 매니페스트 29개 중 흔적이 있는 것만.
    expect(overview.channels).toHaveLength(1);
    expect(overview.channels[0]?.mallKey).toBe('coupang');
    expect(overview.shop.productCount).toBe(2951);
    expect(overview.shop.connectedChannelCount).toBe(1);
  });

  it('자격증명만 있고 리스팅이 없는 몰도 건다', async () => {
    const service = build({
      mallAccounts: [mallAccount({ mallKey: 'kidsnote', channelAccountId: 'acc-kidsnote' })],
      listingAccounts: [],
    });
    const overview = await service.channelOverview(ORG);
    expect(overview.channels.map((channel) => channel.mallKey)).toEqual(['kidsnote']);
    expect(overview.channels[0]?.imported).toBe(false);
    expect(overview.channels[0]?.listingCount).toBe(0);
  });

  it('주문만 있는 몰도 건다 — 리스팅은 못 가져왔어도 거래는 있었다', async () => {
    const service = build({
      mallAccounts: [mallAccount({ mallKey: 'rocket', channelAccountId: 'acc-rocket', hasCredentials: false })],
      orderCounts: [{ channelAccountId: 'acc-rocket', orderCount: 113 }],
    });
    const overview = await service.channelOverview(ORG);
    expect(overview.channels[0]?.orderCount).toBe(113);
  });

  /**
   * 허브는 연결된 채널을 전부 센다 — 마켓도 계정 행이 있으면 줄이 선다. 다만 '보낼 수
   * 있는 몰' 은 몰 등록 매니페스트가 있는 채널만이라 쿠팡 윙 · 로켓은 0 이다.
   */
  it('⭐ 마켓도 연결된 채널로 세지만 보낼 수 있는 몰로는 세지 않는다', async () => {
    const service = build({
      mallAccounts: [
        mallAccount({ mallKey: 'coupang', channelAccountId: 'acc-coupang' }),
        mallAccount({ mallKey: 'rocket', channelAccountId: 'acc-rocket' }),
        mallAccount({ mallKey: 'kidsnote', channelAccountId: 'acc-kidsnote' }),
      ],
    });
    const overview = await service.channelOverview(ORG);
    expect(overview.channels.map((channel) => channel.mallKey))
      .toEqual(expect.arrayContaining(['coupang', 'rocket', 'kidsnote']));
    expect(overview.shop.connectedChannelCount).toBe(3);
    expect(overview.shop.publishableChannelCount).toBe(1);
  });
});

/**
 * 마켓 판매자 시스템은 몰 등록 매니페스트를 떠났다(KID-250). 허브 · 매트릭스 · 품절
 * 미리보기가 그 사실을 **같은 말로** 해야 한다 — 어느 한 곳이 '보낼 수 있다'고 하면
 * 사장님이 눌렀을 때 아무 일도 일어나지 않는다.
 */
describe('마켓 판매자 시스템 — 등록 경로 없음', () => {
  it('⭐ 허브에서 쿠팡 윙은 보낼 수 있는 몰이 아니다', async () => {
    const service = build({
      listingAccounts: [account()],
      mallAccounts: [mallAccount()],
    });
    const overview = await service.channelOverview(ORG);
    const coupang = overview.channels.find((channel) => channel.mallKey === 'coupang');
    expect(coupang?.canPublish).toBe(false);
    expect(coupang?.readiness).toBe('unsupported');
    // 그래도 줄은 선다 — 연결된 채널이고 리스팅이 있다.
    expect(coupang?.listingCount).toBe(1230);
  });

  it('⭐ 매트릭스 열은 남되 어댑터가 없다 — 가져온 리스팅은 계속 보인다', async () => {
    const service = build({ listingAccounts: [account()], mallAccounts: [mallAccount()] });
    const result = await service.listingMatrix(ORG, { page: 1, limit: 25 });
    expect(result.columns[0]).toMatchObject({ mallKey: 'coupang', hasAdapter: false, imported: true });
  });

  it('⭐ 품절 미리보기는 "매니페스트가 없습니다" 대신 그 채널의 성질을 말한다', async () => {
    const service = build({
      soldOutItems: [{
        channelAccount: { id: 'acc-coupang', channel: 'coupang', name: 'Coupang Wing' },
        product: { id: 'p1', externalProductId: 'x', registeredName: '반짝이풀펜', displayName: null, status: null },
        sku: {
          id: 's1', externalSkuId: 'sku-1', sellerSku: 'SKU-1', optionName: '단일',
          barcode: null, modelNumber: null, salePrice: 3000, status: null,
          mappingStatus: 'matched', sellableStock: 0, safetyStock: 0, updatedAt: new Date().toISOString(),
        },
        masterProductId: 'mp-1',
        recipeStatus: 'matched',
        components: [],
        warnings: [],
      }],
    });

    const preview = await service.previewAvailability(ORG, 25);
    const candidate = preview.candidates[0];
    expect(candidate?.mallKey).toBe('coupang');
    expect(candidate?.mallName).toBe('쿠팡 WING');
    expect(candidate?.sendable).toBe(false);
    expect(candidate?.blockedReason).toBe('쿠팡 WING은(는) 몰 상품등록·품절 송신 대상이 아닙니다.');
    expect(preview.sendableCount).toBe(0);
    expect(preview.blockedCount).toBe(1);
  });
});

describe('listingMatrix — 필터', () => {
  it('기본은 등록된 상품만이다 — 전체는 대부분 빈 행이다', async () => {
    // 라이브 실측: 활성 마스터 2,951건 중 리스팅이 있는 것은 408건뿐이다.
    const service = build({ listingAccounts: [account()], mallAccounts: [mallAccount()] });
    const result = await service.listingMatrix(ORG, { page: 1, limit: 25 });
    expect(result.filter).toBe('listed');
    expect(lastMatrixQuery?.listed).toBe(true);
  });

  it('미등록만 볼 수 있다', async () => {
    const service = build({ listingAccounts: [account()], mallAccounts: [mallAccount()] });
    const result = await service.listingMatrix(ORG, { page: 1, limit: 25, filter: 'unlisted' });
    expect(result.filter).toBe('unlisted');
    expect(lastMatrixQuery?.listed).toBe(false);
  });

  it('전체는 필터를 걸지 않는다', async () => {
    const service = build({ listingAccounts: [account()], mallAccounts: [mallAccount()] });
    const result = await service.listingMatrix(ORG, { page: 1, limit: 25, filter: 'all' });
    expect(result.filter).toBe('all');
    expect(lastMatrixQuery).not.toHaveProperty('listed');
  });

  it('열에 세운 계정만 필터 판정에 쓴다', async () => {
    const service = build({ listingAccounts: [account()], mallAccounts: [mallAccount()] });
    await service.listingMatrix(ORG, { page: 1, limit: 25 });
    expect(lastMatrixQuery?.channelAccountIds).toEqual(['acc-coupang']);
  });
});
