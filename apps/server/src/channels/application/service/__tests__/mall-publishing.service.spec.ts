import { describe, expect, it } from 'vitest';
import type { ChannelSkuAvailabilityItem } from '@kiditem/shared/channel-sku-availability';
import type { MallListingProfile } from '../../../domain/mall/mall-listing-profile';
import type { ChannelSkuAvailabilityPort } from '../../port/in/channel-sku-availability.port';
import type {
  MallAccountRow,
  MallListingAccountRow,
  MallMatrixProductRow,
  MallPublishingRepositoryPort,
  PreflightProductRow,
} from '../../port/out/repository/mall-publishing.repository.port';
import { MallPublishingService } from '../mall-publishing.service';

const ORG = 'org-1';
const ASOF = new Date('2026-09-02T00:00:00.000Z');

function listingProfile(overrides: Partial<MallListingProfile> = {}): MallListingProfile {
  return {
    shipping: { chargeType: 'free' },
    returnPolicy: { returnCharge: 3000 },
    releaseAddress: { zipCode: '10000' },
    returnAddress: { zipCode: '10000' },
    asPhone: '02-000-0000',
    categoryCode: 'K-100',
    namePrefix: null,
    nameSuffix: null,
    ...overrides,
  };
}

function mallAccount(overrides: Partial<MallAccountRow> = {}): MallAccountRow {
  return {
    mallKey: 'kidsnote',
    channelAccountId: 'account-1',
    name: '키즈노트',
    hasCredentials: true,
    listingProfile: listingProfile(),
    ...overrides,
  };
}

function productRow(overrides: Partial<PreflightProductRow> = {}): PreflightProductRow {
  return {
    masterProductId: 'mp-1',
    code: 'KID-1',
    name: '유아 원목 블록 30P',
    imageCount: 4,
    salePrice: 24900,
    optionNames: ['기본'],
    kc: { status: 'exists', number: 'CB061R1234-1001' },
    ...overrides,
  };
}

function buildService(overrides: {
  mallAccounts?: MallAccountRow[];
  products?: PreflightProductRow[];
  listingAccounts?: MallListingAccountRow[];
  matrixProducts?: MallMatrixProductRow[];
  orderCounts?: { channelAccountId: string; orderCount: number }[];
  masterProductCount?: number;
  /** 품절 목록(`out_of_stock`) 한 페이지. */
  outOfStock?: ChannelSkuAvailabilityItem[];
  /** 상품(리스팅)의 모든 옵션. */
  listingOptions?: ChannelSkuAvailabilityItem[];
} = {}) {
  const repository: MallPublishingRepositoryPort = {
    listMallAccounts: async () => overrides.mallAccounts ?? [],
    listPreflightProducts: async () => ({
      rows: overrides.products ?? [productRow()],
      total: (overrides.products ?? [productRow()]).length,
    }),
    listAccountsWithListings: async () => overrides.listingAccounts ?? [],
    listMatrixProducts: async () => ({
      rows: overrides.matrixProducts ?? [],
      total: (overrides.matrixProducts ?? []).length,
    }),
    countOrdersByAccount: async () => overrides.orderCounts ?? [],
    countActiveMasterProducts: async () => overrides.masterProductCount ?? 0,
  };
  const availability = {
    list: async () => ({
      items: overrides.outOfStock ?? [],
      total: (overrides.outOfStock ?? []).length,
      page: 1,
      limit: 50,
      summary: { total: 0, inStock: 0, outOfStock: 0, unmatched: 0, needsReview: 0 },
    }),
    findByChannelSkuIds: async () => [],
    findByListingIds: async (_organizationId: string, ids: string[]) =>
      (overrides.listingOptions ?? []).filter((item) => ids.includes(item.product.id)),
  } as unknown as ChannelSkuAvailabilityPort;
  return new MallPublishingService(repository, availability);
}

describe('MallPublishingService.listTargets', () => {
  it('marks unverified malls unsupported even when an account exists', async () => {
    const service = buildService({
      mallAccounts: [mallAccount({ mallKey: '11st', channelAccountId: 'a1', name: '11번가' })],
    });
    const targets = await service.listTargets(ORG);
    const elevenSt = targets.find((target) => target.manifest.key === '11st');
    expect(elevenSt?.readiness).toBe('unsupported');
  });

  it('resolves a marketplace by its own channel row', async () => {
    const service = buildService({
      mallAccounts: [mallAccount({
        mallKey: 'coupang', channelAccountId: 'wing-1', name: 'Coupang Wing', listingProfile: null,
      })],
    });
    const coupang = (await service.listTargets(ORG))
      .find((target) => target.manifest.key === 'coupang');
    expect(coupang?.readiness).toBe('needs_profile');
    expect(coupang?.channelAccountId).toBe('wing-1');
    expect(coupang?.hasListingProfile).toBe(false);
  });

  it('becomes ready only once the account carries a listing profile', async () => {
    const service = buildService({ mallAccounts: [mallAccount()] });
    const kidsnote = (await service.listTargets(ORG))
      .find((target) => target.manifest.key === 'kidsnote');
    expect(kidsnote).toMatchObject({ readiness: 'ready', hasListingProfile: true, channelAccountId: 'account-1' });
  });

  /** 몰 계정은 쇼핑몰 계정 화면이 만든다. 등록 쪽은 없는 계정을 만들지 않고 없다고만 말한다. */
  it('⭐ reports a mall with no account row as needing an account', async () => {
    const service = buildService({ mallAccounts: [] });
    const kidsnote = (await service.listTargets(ORG))
      .find((target) => target.manifest.key === 'kidsnote');
    expect(kidsnote).toMatchObject({ readiness: 'needs_account', channelAccountId: null });
  });

  it('reports an account row without a stored login as needing an account', async () => {
    const service = buildService({ mallAccounts: [mallAccount({ hasCredentials: false })] });
    const kidsnote = (await service.listTargets(ORG))
      .find((target) => target.manifest.key === 'kidsnote');
    expect(kidsnote?.readiness).toBe('needs_account');
  });
});

describe('MallPublishingService.preflight', () => {
  it('passes a complete product on a mall with a complete listing profile', async () => {
    const service = buildService({ mallAccounts: [mallAccount()] });
    const response = await service.preflight(ORG, { mallKeys: ['kidsnote'], page: 1, limit: 25 }, ASOF);
    expect(response.products[0]).toMatchObject({ eligibleMallCount: 1, hasCertification: true });
    expect(response.products[0]?.results[0]?.violations).toEqual([]);
    expect(response.asOf).toBe(ASOF.toISOString());
  });

  it('blocks when the mall category is not resolvable from the listing profile', async () => {
    // 상품×몰 카테고리 매핑이 아직 없으므로 등록 기본값의 categoryCode 가 유일한 경로다.
    const service = buildService({
      mallAccounts: [mallAccount({ listingProfile: listingProfile({ categoryCode: null }) })],
    });
    const response = await service.preflight(ORG, { mallKeys: ['kidsnote'], page: 1, limit: 25 }, ASOF);
    expect(response.products[0]?.results[0]?.violations.map((violation) => violation.rule))
      .toContain('mall_category_mapped');
  });

  it('judges KC from the sourcing draft the operator filled in', async () => {
    const service = buildService({
      mallAccounts: [mallAccount()],
      products: [productRow({ kc: { status: 'unknown', number: null } })],
    });
    const response = await service.preflight(ORG, { mallKeys: ['kidsnote'], page: 1, limit: 25 }, ASOF);
    expect(response.products[0]?.hasCertification).toBe(false);
    expect(response.products[0]?.results[0]?.violations.map((violation) => violation.rule))
      .toContain('kc_certification');
  });

  it('blocks a mall that has no account row instead of creating one', async () => {
    const service = buildService({ mallAccounts: [] });
    const response = await service.preflight(ORG, { mallKeys: ['kidsnote'], page: 1, limit: 25 }, ASOF);
    const violation = response.products[0]?.results[0]?.violations
      .find((entry) => entry.rule === 'profile_selected');
    expect(violation?.message).toContain('계정이 없습니다');
  });

  it('defaults to every mall that has a confirmed send path', async () => {
    const service = buildService();
    const response = await service.preflight(ORG, { page: 1, limit: 25 }, ASOF);
    expect(response.mallKeys).not.toContain('11st');
    expect(response.mallKeys).not.toContain('coupang-direct');
    expect(response.mallKeys).toContain('kidsnote');
  });
});

function skuOption(
  listing: string,
  option: string,
  { stock, mapping = 'matched', channel = 'kidkids' }: {
    stock: number | null;
    mapping?: 'matched' | 'unmatched';
    channel?: string;
  },
): ChannelSkuAvailabilityItem {
  return {
    channelAccount: { id: '11111111-1111-4111-8111-111111111111', channel, name: channel },
    product: { id: listing, externalProductId: '13712531060', registeredName: '말랑이', displayName: '말랑이', status: 'active' },
    sku: {
      id: option,
      externalSkuId: `9448953${option.slice(-4)}`,
      sellerSku: null,
      optionName: null,
      barcode: null,
      modelNumber: null,
      salePrice: 2850,
      status: 'active',
      mappingStatus: mapping,
      sellableStock: mapping === 'matched' ? stock : null,
      updatedAt: '2026-09-18T00:00:00.000Z',
    },
    masterProductId: mapping === 'matched' ? '33333333-3333-4333-8333-333333333333' : null,
    recipeStatus: mapping,
    components: [],
    warnings: [],
  };
}

/**
 * 상품 단위로 보내는 몰(몰 관리자의 상품 줄을 멈춘다)은 옵션 일부만 품절인 상품을 보내지 않는다 — 재고 있는
 * 옵션까지 멈춘다. 옵션 단위로 보내는 몰(쿠팡 윙 = 옵션 재고 0)은 품절 옵션만 바뀌므로 막지 않는다.
 */
describe('MallPublishingService.previewAvailability', () => {
  const single = '44444444-4444-4444-8444-444444444441';
  const partial = '44444444-4444-4444-8444-444444444442';
  const unknown = '44444444-4444-4444-8444-444444444443';
  const allOut = '44444444-4444-4444-8444-444444444444';

  it('⭐ a product-level mall gets a product only when every option is out of stock', async () => {
    const outOfStock = [
      skuOption(single, '55555555-5555-4555-8555-555555555501', { stock: 0 }),
      skuOption(partial, '55555555-5555-4555-8555-555555555502', { stock: 0 }),
      skuOption(unknown, '55555555-5555-4555-8555-555555555503', { stock: 0 }),
      skuOption(allOut, '55555555-5555-4555-8555-555555555504', { stock: 0 }),
      skuOption(allOut, '55555555-5555-4555-8555-555555555505', { stock: 0 }),
    ];
    const listingOptions = [
      ...outOfStock,
      skuOption(partial, '55555555-5555-4555-8555-555555555512', { stock: 7 }),
      skuOption(unknown, '55555555-5555-4555-8555-555555555513', { stock: null, mapping: 'unmatched' }),
    ];
    const preview = await buildService({ outOfStock, listingOptions }).previewAvailability(ORG, 100);
    const byListing = (listing: string) => preview.candidates.filter((candidate) =>
      outOfStock.some((item) => item.product.id === listing && item.sku.id === candidate.channelListingOptionId));

    expect(byListing(single).map((candidate) => candidate.sendable)).toEqual([true]);
    expect(byListing(allOut).map((candidate) => candidate.sendable)).toEqual([true, true]);
    const [held] = byListing(partial);
    expect(held?.sendable).toBe(false);
    expect(held?.blockedReason).toContain('다른 옵션 1개는 품절이 아니라');
    // 재고를 모르는 옵션(레시피 미확정)도 멈추면 안 되는 쪽으로 센다.
    expect(byListing(unknown)[0]?.sendable).toBe(false);
    expect(preview.sendableCount).toBe(3);
  });

  it('⭐ 쿠팡 윙은 옵션 재고를 0 으로 두므로 옵션 일부만 품절이어도 그 옵션을 보낸다 — 옵션코드를 싣는다', async () => {
    const outOfStock = [skuOption(partial, '55555555-5555-4555-8555-555555555502', { stock: 0, channel: 'coupang' })];
    const listingOptions = [
      ...outOfStock,
      skuOption(partial, '55555555-5555-4555-8555-555555555512', { stock: 7, channel: 'coupang' }),
    ];
    const preview = await buildService({ outOfStock, listingOptions }).previewAvailability(ORG, 100);
    expect(preview.candidates).toHaveLength(1);
    expect(preview.candidates[0]).toMatchObject({
      mallKey: 'coupang',
      sendable: true,
      mallProductCode: '13712531060',
      mallOptionCode: '94489535502',
    });
  });
});
