import { describe, expect, it } from 'vitest';
import type { ChannelSkuAvailabilityPort } from '../../port/in/channel-sku-availability.port';
import type {
  CoupangNoticeSourceRow,
  ExistingNoticeRow,
  MallAccountAnchorRow,
  MallListingAccountRow,
  MallMatrixProductRow,
  NoticeUpsertInput,
  MallProfileRow,
  MallPublishingRepositoryPort,
  PreflightProductRow,
} from '../../port/out/repository/mall-publishing.repository.port';
import { MallPublishingService } from '../mall-publishing.service';

const ORG = 'org-1';
const ASOF = new Date('2026-09-02T00:00:00.000Z');

function profile(overrides: Partial<MallProfileRow> = {}): MallProfileRow {
  return {
    id: 'profile-1',
    channelAccountId: 'account-1',
    mallKey: 'kidsnote',
    name: '기본 프로필',
    isDefault: true,
    isActive: true,
    asPhone: '02-000-0000',
    categoryCode: 'K-100',
    namePrefix: null,
    nameSuffix: null,
    shippingJson: { chargeType: 'free' },
    returnJson: { returnCharge: 3000 },
    addressJson: { release: { zipCode: '10000' }, return: { zipCode: '10000' } },
    updatedAt: new Date('2026-09-01T00:00:00.000Z'),
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
    noticeCategory: '어린이제품',
    noticeAttributes: {
      제조자: '한국완구', 제조국: '대한민국', 사용연령: '36개월 이상',
      크기: '30x20', 색상: '원목', KC인증필유무: 'Y', AS책임자: '02-000-0000',
    },
    certification: { certType: 'safety_confirm', validTo: new Date('2027-01-31') },
    ...overrides,
  };
}

function buildHarness(overrides: {
  anchors?: MallAccountAnchorRow[];
  profiles?: MallProfileRow[];
  products?: PreflightProductRow[];
  noticeSources?: CoupangNoticeSourceRow[];
  existingNotices?: ExistingNoticeRow[];
  listingAccounts?: MallListingAccountRow[];
  matrixProducts?: MallMatrixProductRow[];
  orderCounts?: { channelAccountId: string; orderCount: number }[];
  masterProductCount?: number;
} = {}) {
  const written: NoticeUpsertInput[] = [];
  const repository: MallPublishingRepositoryPort = {
    listMallAccountAnchors: async () => overrides.anchors ?? [],
    ensureMallAccountAnchor: async ({ mallKey, mallName }) => ({
      id: 'account-1', mallKey, name: mallName, externalAccountId: mallKey,
    }),
    listProfiles: async () => overrides.profiles ?? [],
    findProfile: async () => null,
    createProfile: async () => profile(),
    updateProfile: async () => profile(),
    softDeleteProfile: async () => undefined,
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
    listCoupangNoticeSources: async () => overrides.noticeSources ?? [],
    listExistingDefaultNotices: async () => overrides.existingNotices ?? [],
    upsertBackfilledNotices: async (_organizationId, inputs) => {
      written.push(...inputs);
      return { created: inputs.length, updated: 0 };
    },
  };
  const availability = {
    list: async () => ({ items: [], total: 0, page: 1, limit: 50 }),
    findByChannelSkuIds: async () => [],
    findByListingIds: async () => [],
  } as unknown as ChannelSkuAvailabilityPort;
  return { service: new MallPublishingService(repository, availability), written };
}

function buildService(overrides: Parameters<typeof buildHarness>[0] = {}) {
  return buildHarness(overrides).service;
}

describe('MallPublishingService.listTargets', () => {
  it('marks unverified malls unsupported even when an account exists', async () => {
    const service = buildService({
      anchors: [{
        mallKey: '11st', channelAccountId: 'a1', name: '11번가',
        hasCredentials: true, source: 'order_collection',
      }],
    });
    const targets = await service.listTargets(ORG);
    const elevenSt = targets.find((target) => target.manifest.key === '11st');
    expect(elevenSt?.readiness).toBe('unsupported');
  });

  it('resolves a marketplace anchored on its own channel, not order_collection', async () => {
    // 쿠팡 계정은 channel='coupang' 로 존재한다. order_collection 만 보면
    // 자격증명이 있는데도 "계정 정보 필요"로 나온다.
    const service = buildService({
      anchors: [{
        mallKey: 'coupang', channelAccountId: 'wing-1', name: 'Coupang Wing',
        hasCredentials: true, source: 'channel',
      }],
    });
    const coupang = (await service.listTargets(ORG))
      .find((target) => target.manifest.key === 'coupang');
    expect(coupang?.readiness).toBe('needs_profile');
    expect(coupang?.channelAccountId).toBe('wing-1');
  });

  it('becomes ready only once a profile exists', async () => {
    const service = buildService({
      anchors: [{
        mallKey: 'kidsnote', channelAccountId: 'account-1', name: '키즈노트',
        hasCredentials: true, source: 'order_collection',
      }],
      profiles: [profile()],
    });
    const kidsnote = (await service.listTargets(ORG))
      .find((target) => target.manifest.key === 'kidsnote');
    expect(kidsnote).toMatchObject({ readiness: 'ready', profileCount: 1, defaultProfileId: 'profile-1' });
  });

  it('reports a mall with no stored credentials as needing an account', async () => {
    const service = buildService({ anchors: [] });
    const kidsnote = (await service.listTargets(ORG))
      .find((target) => target.manifest.key === 'kidsnote');
    expect(kidsnote?.readiness).toBe('needs_account');
  });
});

describe('MallPublishingService.preflight', () => {
  it('passes a complete product on a mall with a complete default profile', async () => {
    const service = buildService({ profiles: [profile()] });
    const response = await service.preflight(ORG, { mallKeys: ['kidsnote'], page: 1, limit: 25 }, ASOF);
    expect(response.products[0]).toMatchObject({ eligibleMallCount: 1 });
    expect(response.products[0]?.results[0]?.violations).toEqual([]);
  });

  it('blocks when the mall category is not resolvable from the profile', async () => {
    // 상품×몰 카테고리 매핑이 아직 없으므로 프로필의 categoryCode 가 유일한 경로다.
    const service = buildService({ profiles: [profile({ categoryCode: null })] });
    const response = await service.preflight(ORG, { mallKeys: ['kidsnote'], page: 1, limit: 25 }, ASOF);
    expect(response.products[0]?.results[0]?.violations.map((violation) => violation.rule))
      .toContain('mall_category_mapped');
  });

  it('defaults to every mall that has a confirmed send path', async () => {
    const service = buildService();
    const response = await service.preflight(ORG, { page: 1, limit: 25 }, ASOF);
    expect(response.mallKeys).not.toContain('11st');
    expect(response.mallKeys).not.toContain('coupang-direct');
    expect(response.mallKeys).toContain('kidsnote');
  });

  it('reports missing notice fields as one violation naming them', async () => {
    const service = buildService({
      profiles: [profile()],
      products: [productRow({ noticeAttributes: { 제조자: '한국완구' } })],
    });
    const response = await service.preflight(ORG, { mallKeys: ['kidsnote'], page: 1, limit: 25 }, ASOF);
    const violation = response.products[0]?.results[0]?.violations
      .find((entry) => entry.rule === 'notice_attributes');
    expect(violation?.message).toContain('사용연령');
    expect(response.products[0]?.hasNotice).toBe(false);
  });
});

describe('MallPublishingService.backfillNoticesFromCoupang', () => {
  const TOY: CoupangNoticeSourceRow = {
    masterProductId: 'mp-1',
    externalId: 'EXT-1',
    productName: '유아 원목 블록',
    category: '[77386] 완구/취미>스포츠/야외완구',
    manufacturer: '한국완구',
    brand: 'KY',
    modelNumber: null,
    searchOptions: [
      { type: '[11932]최소 연령\n(기본 단위 : 개월)', value: '3세' },
      { type: '[11037]색상계열', value: '블루계열' },
    ],
  };

  it('writes nothing on a dry run but still reports what it would fill', async () => {
    const harness = buildHarness({ noticeSources: [TOY] });
    const result = await harness.service.backfillNoticesFromCoupang(ORG, { dryRun: true });
    expect(harness.written).toEqual([]);
    expect(result).toMatchObject({
      dryRun: true,
      sourceListings: 1,
      candidateProducts: 1,
      created: 0,
      fieldFillCounts: { 제조자: 1, 사용연령: 1, 색상: 1 },
    });
  });

  it('never invents a KC certification', async () => {
    const result = await buildService({ noticeSources: [TOY] })
      .backfillNoticesFromCoupang(ORG, { dryRun: false });
    expect(result.certificationsCreated).toBe(0);
    expect(result.stillMissingCounts).toMatchObject({ 제조국: 1, KC인증필유무: 1, AS책임자: 1 });
  });

  it('leaves an operator-entered notice untouched', async () => {
    const harness = buildHarness({
      noticeSources: [TOY],
      existingNotices: [{ masterProductId: 'mp-1', source: 'manual' }],
    });
    const result = await harness.service.backfillNoticesFromCoupang(ORG, { dryRun: false });
    expect(harness.written).toEqual([]);
    expect(result).toMatchObject({ candidateProducts: 0, skippedManual: 1 });
  });

  it('refreshes a row it wrote earlier', async () => {
    const harness = buildHarness({
      noticeSources: [TOY],
      existingNotices: [{ masterProductId: 'mp-1', source: 'coupang_backfill' }],
    });
    await harness.service.backfillNoticesFromCoupang(ORG, { dryRun: false });
    expect(harness.written).toHaveLength(1);
  });

  it('keeps the richest listing when one product has several', async () => {
    const harness = buildHarness({
      noticeSources: [
        { ...TOY, externalId: 'EXT-thin', searchOptions: [] },
        { ...TOY, externalId: 'EXT-rich' },
      ],
    });
    await harness.service.backfillNoticesFromCoupang(ORG, { dryRun: false });
    expect(harness.written).toHaveLength(1);
    expect(harness.written[0]?.attributes).toMatchObject({ 사용연령: '3세', 색상: '블루계열' });
  });

  it('counts products whose notice category could not be decided from the path', async () => {
    const result = await buildService({
      noticeSources: [{ ...TOY, category: '[64681] 생활용품>생활잡화>기타생활용품' }],
    }).backfillNoticesFromCoupang(ORG, { dryRun: true });
    expect(result.categoryUnconfident).toBe(1);
  });
});
