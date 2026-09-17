import { describe, expect, it } from 'vitest';
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
    list: async () => ({ items: [], total: 0, page: 1, limit: 50 }),
    findByChannelSkuIds: async () => [],
    findByListingIds: async () => [],
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

  /**
   * 마켓 판매자 시스템은 몰 등록 마법사에 서지 않는다(KID-250). 계정 행이 있어도 몰 카드가
   * 생기지 않아야, 고를 수 없는 몰을 고르게 되는 화면이 되지 않는다.
   */
  it('⭐ 마켓 판매자 시스템은 몰 카드가 되지 않는다', async () => {
    const service = buildService({
      mallAccounts: [mallAccount({
        mallKey: 'coupang', channelAccountId: 'wing-1', name: 'Coupang Wing', listingProfile: null,
      })],
    });
    const targets = await service.listTargets(ORG);
    expect(targets.map((target) => target.manifest.key)).not.toContain('coupang');
    expect(targets.map((target) => target.manifest.key)).not.toContain('rocket');
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
