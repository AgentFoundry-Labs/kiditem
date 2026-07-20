import { describe, expect, it, vi } from 'vitest';
import {
  assertProtectedApiDestination,
  assertProtectedSupabaseDestination,
  assertReadyCounts,
  assertRebuildImportPrerequisites,
  assertLocalRebuildGuard,
  assertReplayBundle,
  assertSharedDatabaseIdentity,
  assertSharedRebuildGuard,
  buildCoupangReplayBundle,
  buildSharedBootstrapPlan,
  buildBootstrapPreflightManifest,
  assertBootstrapPreflightManifest,
  computeReplayFactDigest,
  readReplayFactCounts,
  readReplayFactDigest,
} from '../authoritative-inventory-rebuild';

const organizationId = '00000000-0000-4000-8000-000000000001';
const userId = '00000000-0000-4000-8000-000000000002';
const coupangAccountId = '00000000-0000-4000-8000-000000000003';

describe('authoritative inventory shared rebuild guard', () => {
  it('requires GitHub Actions, the selected environment, and the exact environment token', () => {
    expect(() => assertSharedRebuildGuard({
      target: 'staging',
      githubEnvironment: 'staging',
      confirmation: 'RESET_STAGING_DATA',
      expectedConfirmation: 'RESET_STAGING_DATA',
      githubActions: 'true',
      deploymentTarget: 'staging',
    })).not.toThrow();

    for (const unsafe of [
      { githubActions: 'false' },
      { githubEnvironment: 'production' },
      { confirmation: 'RESET_PRODUCTION_DATA' },
      { confirmation: 'reset_staging_data' },
    ]) {
      expect(() => assertSharedRebuildGuard({
        target: 'staging',
        githubEnvironment: 'staging',
        confirmation: 'RESET_STAGING_DATA',
        expectedConfirmation: 'RESET_STAGING_DATA',
        githubActions: 'true',
        deploymentTarget: 'staging',
        ...unsafe,
      })).toThrow(/refusing shared database rebuild/i);
    }

    expect(() => assertSharedRebuildGuard({
      target: 'staging',
      deploymentTarget: 'production',
      githubEnvironment: 'staging',
      confirmation: 'RESET_STAGING_DATA',
      expectedConfirmation: 'RESET_STAGING_DATA',
      githubActions: 'true',
    })).toThrow(/refusing shared database rebuild/i);
  });
});

describe('authoritative inventory actual database identity', () => {
  it('rejects a staging workflow wired to a production-like database URL', async () => {
    const prisma = {
      organization: { findFirst: async () => ({ id: organizationId, slug: 'kiditem-staging' }) },
      channelAccount: {
        findFirst: async () => ({
          id: coupangAccountId,
          channel: 'coupang',
          externalAccountId: 'wing-account',
        }),
      },
    };

    await expect(assertSharedDatabaseIdentity(prisma, {
      target: 'staging',
      databaseUrl: 'postgresql://postgres.production-ref:secret@aws-0.ap-northeast-2.pooler.supabase.com:6543/postgres',
      expectedDatabaseHost: 'aws-0.ap-northeast-2.pooler.supabase.com',
      expectedSupabaseProjectRef: 'staging-ref',
      organizationId,
      organizationSlug: 'kiditem-staging',
      channelAccountId: coupangAccountId,
      channelAccountExternalId: 'wing-account',
    })).rejects.toThrow(/project fingerprint/i);

    await expect(assertSharedDatabaseIdentity(prisma, {
      target: 'staging',
      databaseUrl: 'postgresql://postgres.staging-ref:secret@aws-0.ap-northeast-2.pooler.supabase.com:6543/postgres',
      expectedDatabaseHost: 'aws-0.ap-northeast-2.pooler.supabase.com',
      expectedSupabaseProjectRef: 'staging-ref',
      organizationId,
      organizationSlug: 'kiditem-staging',
      channelAccountId: coupangAccountId,
      channelAccountExternalId: 'wing-account',
    })).resolves.toMatchObject({ target: 'staging', organizationId, channelAccountId: coupangAccountId });
  });
});

describe('authoritative inventory credential destinations', () => {
  it('requires exact HTTPS API and Supabase project destinations before sending credentials', () => {
    expect(() => assertProtectedApiDestination(
      'https://staging.merchon.org',
      'https://staging.merchon.org',
    )).not.toThrow();
    expect(() => assertProtectedApiDestination(
      'http://staging.merchon.org',
      'https://staging.merchon.org',
    )).toThrow(/HTTPS/i);
    expect(() => assertProtectedApiDestination(
      'https://evil.example.test',
      'https://staging.merchon.org',
    )).toThrow(/expected protected API origin/i);

    expect(() => assertProtectedSupabaseDestination(
      'https://staging-ref.supabase.co',
      'staging-ref',
    )).not.toThrow();
    expect(() => assertProtectedSupabaseDestination(
      'https://production-ref.supabase.co',
      'staging-ref',
    )).toThrow(/Supabase project/i);

    for (const unsafeUrl of [
      'https://staging-ref.supabase.co:444/',
      'https://staging-ref.supabase.co/auth/v1',
      'https://operator@staging-ref.supabase.co/',
      'https://staging-ref.supabase.co/?redirect=evil',
      'https://staging-ref.supabase.co/#credential',
    ]) {
      expect(() => assertProtectedSupabaseDestination(unsafeUrl, 'staging-ref'))
        .toThrow(/Supabase project/i);
    }
    expect(() => assertProtectedSupabaseDestination(
      'https://staging-ref.supabase.co/',
      'staging-ref',
    )).not.toThrow();
  });
});

describe('authoritative rebuild import prerequisites', () => {
  const sellpia = {
    id: '00000000-0000-4000-8000-000000000031',
    status: 'completed',
    fileHash: 'a'.repeat(64),
    rowCount: 10,
    importedAt: new Date('2026-07-17T01:00:00Z'),
  };
  const wing = {
    id: '00000000-0000-4000-8000-000000000032',
    status: 'completed',
    fileHash: 'b'.repeat(64),
    rowCount: 20,
    importedAt: new Date('2026-07-17T02:00:00Z'),
  };
  const expected = {
    sellpiaFileHash: 'a'.repeat(64),
    sellpiaRowCount: 10,
    wingFileHash: 'b'.repeat(64),
    wingRowCount: 20,
  };

  it('binds one exact Sellpia then Wing completed run', () => {
    expect(assertRebuildImportPrerequisites({ sellpiaRuns: [sellpia], wingRuns: [wing], expected }))
      .toEqual({ sellpiaRunId: sellpia.id, wingRunId: wing.id });
  });

  it.each([
    { sellpiaRuns: [], wingRuns: [wing] },
    { sellpiaRuns: [sellpia], wingRuns: [{ ...wing, importedAt: new Date('2026-07-17T00:00:00Z') }] },
    { sellpiaRuns: [sellpia], wingRuns: [{ ...wing, fileHash: 'c'.repeat(64) }] },
    { sellpiaRuns: [{ ...sellpia, rowCount: 11 }], wingRuns: [wing] },
  ])('rejects missing, reversed, wrong-file, or wrong-count imports', (input) => {
    expect(() => assertRebuildImportPrerequisites({ ...input, expected }))
      .toThrow(/import|hash|count|order/i);
  });
});

describe('authoritative inventory local replay guard', () => {
  it('requires a loopback database and the exact local reset token', () => {
    expect(() => assertLocalRebuildGuard({
      databaseUrl: 'postgresql://kiditem:kiditem@localhost:5433/kiditem',
      confirmation: 'RESET_LOCAL_DATA',
      expectedConfirmation: 'RESET_LOCAL_DATA',
    })).not.toThrow();
    expect(() => assertLocalRebuildGuard({
      databaseUrl: 'postgresql://kiditem:kiditem@db.example.com:5432/kiditem',
      confirmation: 'RESET_LOCAL_DATA',
      expectedConfirmation: 'RESET_LOCAL_DATA',
    })).toThrow(/local development database/i);
    expect(() => assertLocalRebuildGuard({
      databaseUrl: 'postgresql://kiditem:kiditem@localhost:5433/kiditem',
      confirmation: 'reset_local_data',
      expectedConfirmation: 'RESET_LOCAL_DATA',
    })).toThrow(/local rebuild/i);
  });
});

describe('authoritative inventory shared rebuild baseline', () => {
  it('contains only the minimum organization, user, membership, and account rows', () => {
    expect(buildSharedBootstrapPlan({
      organizationId,
      organizationName: 'KidItem Staging',
      organizationSlug: 'kiditem-staging',
      userId,
      userEmail: 'operator@example.test',
      userName: 'Operator',
      coupangAccountId,
      coupangExternalAccountId: 'wing-account',
      coupangAccountName: 'Coupang Wing',
    })).toEqual({
      organization: {
        id: organizationId,
        name: 'KidItem Staging',
        slug: 'kiditem-staging',
        isActive: true,
      },
      user: {
        id: userId,
        email: 'operator@example.test',
        name: 'Operator',
        role: 'admin',
        type: 'human',
        isActive: true,
      },
      membership: {
        organizationId,
        userId,
        role: 'admin',
        status: 'active',
      },
      channelAccounts: [{
        id: coupangAccountId,
        organizationId,
        channel: 'coupang',
        name: 'Coupang Wing',
        externalAccountId: 'wing-account',
        status: 'active',
        isPrimary: true,
        config: null,
      }],
    });
  });

  it('binds the protected baseline to target, run, SHA, and full plan hash', () => {
    const plan = buildSharedBootstrapPlan({
      organizationId,
      organizationName: 'KidItem Staging',
      organizationSlug: 'kiditem-staging',
      userId,
      userEmail: 'operator@example.test',
      userName: 'Operator',
      coupangAccountId,
      coupangExternalAccountId: 'wing-account',
      coupangAccountName: 'Coupang Wing',
    });
    const manifest = buildBootstrapPreflightManifest({
      target: 'staging',
      originRunId: '12345',
      deployedSha: '0123456789abcdef0123456789abcdef01234567',
      plan,
      sourceManifest: {
        sellpiaFileHash: 'a'.repeat(64),
        sellpiaRowCount: 10,
        wingFileHash: 'b'.repeat(64),
        wingRowCount: 20,
      },
    });
    expect(manifest).toMatchObject({
      target: 'staging',
      originRunId: '12345',
      organizationId,
      userId,
      channelAccountIds: [coupangAccountId],
    });
    expect(manifest.planSha256).toMatch(/^[0-9a-f]{64}$/);
    expect(() => assertBootstrapPreflightManifest(manifest, {
      target: 'staging',
      originRunId: '12345',
      deployedSha: '0123456789abcdef0123456789abcdef01234567',
      plan,
      sourceManifest: {
        sellpiaFileHash: 'a'.repeat(64),
        sellpiaRowCount: 10,
        wingFileHash: 'b'.repeat(64),
        wingRowCount: 20,
      },
    })).not.toThrow();
    expect(() => assertBootstrapPreflightManifest(
      { ...manifest, planSha256: '0'.repeat(64) },
      {
        target: 'staging',
        originRunId: '12345',
        deployedSha: '0123456789abcdef0123456789abcdef01234567',
        plan,
        sourceManifest: {
          sellpiaFileHash: 'a'.repeat(64),
          sellpiaRowCount: 10,
          wingFileHash: 'b'.repeat(64),
          wingRowCount: 20,
        },
      },
    )).toThrow(/preflight/i);
    expect(() => assertBootstrapPreflightManifest(manifest, {
      target: 'staging',
      originRunId: '12345',
      deployedSha: '0123456789abcdef0123456789abcdef01234567',
      plan,
      sourceManifest: {
        sellpiaFileHash: 'a'.repeat(64),
        sellpiaRowCount: 10,
        wingFileHash: 'c'.repeat(64),
        wingRowCount: 20,
      },
    })).toThrow(/preflight/i);
  });
});

describe('authoritative inventory Coupang replay bundle', () => {
  it('round-trips campaign authority and observation evidence without upgrading legacy scope', () => {
    const runs = [
      {
        id: '00000000-0000-4000-8000-000000000021',
        metaJson: {
          requestedCampaignReportScope: 'single_campaign_authoritative',
          dashboardOnOff: 'ON',
          dashboardStatus: '운영중',
          campaignName: 'ON detail',
        },
        normalizedJson: {
          pageType: 'product',
          campaignIdentity: 'campaign:one',
          campaignName: 'ON detail',
          onOff: 'ON',
          externalOptionId: 'item-1',
          spend: 1,
          _observedMetrics: {
            adSpend: true,
            adRevenue: true,
            impressions: true,
            clicks: true,
            conversions: true,
            orders: true,
          },
        },
      },
      {
        id: '00000000-0000-4000-8000-000000000022',
        metaJson: {
          requestedCampaignReportScope: 'single_campaign_authoritative',
          dashboardOnOff: 'ON',
          campaignName: 'ON empty',
        },
        normalizedJson: {
          pageType: 'campaign',
          campaignIdentity: 'campaign:two',
          campaignName: 'ON empty',
          onOff: 'ON',
          _campaignOnly: true,
        },
      },
      {
        id: '00000000-0000-4000-8000-000000000023',
        metaJson: {
          requestedCampaignReportScope: 'single_campaign_metadata_raw',
          dashboardOnOff: 'OFF',
          dashboardStatus: '일시정지',
          campaignName: 'OFF metadata',
        },
        normalizedJson: {
          pageType: 'campaign',
          campaignIdentity: 'campaign:three',
          campaignName: 'OFF metadata',
          onOff: 'OFF',
          _campaignOnly: true,
        },
      },
      {
        id: '00000000-0000-4000-8000-000000000024',
        metaJson: {
          requestedCampaignReportScope: 'legacy_raw_only',
          campaignName: 'Legacy',
        },
        normalizedJson: {
          pageType: 'campaign',
          campaignName: 'Legacy',
        },
      },
    ];
    const bundle = buildCoupangReplayBundle({
      target: 'staging',
      originRunId: '12345',
      deployedSha: '0123456789abcdef0123456789abcdef01234567',
      organizationId,
      channelAccountId: coupangAccountId,
      channelAccountExternalId: 'wing-account',
      runs: runs.map((run) => ({
        id: run.id,
        source: 'advertising',
        pageType: 'campaign',
        businessDate: new Date('2026-07-17T00:00:00Z'),
        periodStart: new Date('2026-07-17T00:00:00Z'),
        periodEnd: new Date('2026-07-17T00:00:00Z'),
        period: '1d',
        targetUrl: null,
        metaJson: run.metaJson,
        snapshots: [{ rawJson: run.normalizedJson, normalizedJson: run.normalizedJson }],
      })),
      factCounts: {
        scrapeRuns: 4,
        rawSnapshots: 4,
        listingDailyFacts: 0,
        optionDailyFacts: 0,
        adTargetFacts: 1,
        accountKpiFacts: 0,
      },
      factDigestSha256: 'e'.repeat(64),
    });

    expect(bundle.schemaVersion).toBe('kiditem.authoritative-inventory-rebuild.v2');
    expect(bundle.payloads[0]?.body).toMatchObject({
      campaignReportScope: 'single_campaign_authoritative',
      dashboardOnOff: 'ON',
      dashboardStatus: '운영중',
      normalizedRows: [{
        campaignIdentity: 'campaign:one',
        _observedMetrics: { adSpend: true, adRevenue: true },
      }],
    });
    expect(bundle.payloads[1]?.body.normalizedRows).toMatchObject([
      { campaignIdentity: 'campaign:two', _campaignOnly: true },
    ]);
    expect(bundle.payloads[2]?.body).toMatchObject({
      campaignReportScope: 'single_campaign_metadata_raw',
      dashboardOnOff: 'OFF',
      dashboardStatus: '일시정지',
    });
    expect(bundle.payloads[3]?.body).not.toHaveProperty('campaignReportScope');
    expect(() => assertReplayBundle(bundle)).not.toThrow();
  });

  it('scopes every exported count and digest query to the configured Coupang account', async () => {
    const otherAccountId = '00000000-0000-4000-8000-000000000099';
    const countModels = {
      channelScrapeRun: { count: vi.fn().mockResolvedValue(0) },
      channelScrapeSnapshot: { count: vi.fn().mockResolvedValue(0) },
      channelListingDailySnapshot: { count: vi.fn().mockResolvedValue(0) },
      channelListingOptionDailySnapshot: { count: vi.fn().mockResolvedValue(0) },
      channelAdTargetDailySnapshot: { count: vi.fn().mockResolvedValue(0) },
      channelAccountDailyKpiSnapshot: { count: vi.fn().mockResolvedValue(0) },
    };

    await readReplayFactCounts(countModels as never, organizationId, coupangAccountId);

    expect(countModels.channelScrapeRun.count).toHaveBeenCalledWith({
      where: { organizationId, channel: 'coupang', channelAccountId: coupangAccountId },
    });
    expect(countModels.channelScrapeSnapshot.count).toHaveBeenCalledWith({
      where: {
        organizationId,
        channel: 'coupang',
        scrapeRun: { is: { channelAccountId: coupangAccountId } },
      },
    });
    expect(countModels.channelListingDailySnapshot.count).toHaveBeenCalledWith({
      where: {
        organizationId,
        channel: 'coupang',
        listing: { is: { channelAccountId: coupangAccountId } },
      },
    });
    expect(countModels.channelListingOptionDailySnapshot.count).toHaveBeenCalledWith({
      where: {
        organizationId,
        channel: 'coupang',
        listing: { is: { channelAccountId: coupangAccountId } },
      },
    });
    expect(countModels.channelAdTargetDailySnapshot.count).toHaveBeenCalledWith({
      where: {
        organizationId,
        channel: 'coupang',
        OR: [
          {
            rawSnapshot: {
              is: { scrapeRun: { is: { channelAccountId: coupangAccountId } } },
            },
          },
          {
            rawSnapshotId: null,
            listing: { is: { channelAccountId: coupangAccountId } },
          },
        ],
      },
    });
    expect(countModels.channelAccountDailyKpiSnapshot.count).toHaveBeenCalledWith({
      where: { organizationId, channel: 'coupang', channelAccountId: coupangAccountId },
    });

    const digestModels = {
      channelListingDailySnapshot: { findMany: vi.fn().mockResolvedValue([]) },
      channelListingOptionDailySnapshot: { findMany: vi.fn().mockResolvedValue([]) },
      channelAdTargetDailySnapshot: { findMany: vi.fn().mockResolvedValue([]) },
      channelAccountDailyKpiSnapshot: { findMany: vi.fn().mockResolvedValue([]) },
    };
    await readReplayFactDigest(digestModels as never, organizationId, coupangAccountId);

    for (const query of [
      digestModels.channelListingDailySnapshot.findMany,
      digestModels.channelListingOptionDailySnapshot.findMany,
      digestModels.channelAdTargetDailySnapshot.findMany,
      digestModels.channelAccountDailyKpiSnapshot.findMany,
    ]) {
      const serializedWhere = JSON.stringify(query.mock.calls[0]?.[0]?.where);
      expect(serializedWhere).toContain(coupangAccountId);
      expect(serializedWhere).not.toContain(otherAccountId);
    }
    expect(digestModels.channelAccountDailyKpiSnapshot.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { organizationId, channel: 'coupang', channelAccountId: coupangAccountId },
      }),
    );
  });

  it('reconstructs only replayable scrape payloads and derives acceptance counts', () => {
    const bundle = buildCoupangReplayBundle({
      target: 'staging',
      originRunId: '12345',
      deployedSha: '0123456789abcdef0123456789abcdef01234567',
      organizationId,
      channelAccountId: coupangAccountId,
      channelAccountExternalId: 'wing-account',
      runs: [{
        id: '00000000-0000-4000-8000-000000000011',
        source: 'wing',
        pageType: 'itemwinner',
        businessDate: new Date('2026-07-10T00:00:00.000Z'),
        periodStart: null,
        periodEnd: null,
        period: null,
        targetUrl: 'https://wing.example.test/products',
        metaJson: { kpis: { '아이템위너 상품': '12' }, credentials: 'must-not-copy' },
        snapshots: [{
          rawJson: {
            externalId: 'listing-1',
            vendorItemId: 'option-1',
            password: 'raw-password',
            productName: '반짝 슈가 말랑이',
            isWinner: true,
            myPrice: 9000,
            winnerPrice: 9100,
            customerEmail: 'buyer@example.test',
          },
          normalizedJson: null,
        }],
      }],
      factCounts: {
        scrapeRuns: 1,
        rawSnapshots: 1,
        listingDailyFacts: 1,
        optionDailyFacts: 1,
        adTargetFacts: 0,
        accountKpiFacts: 1,
      },
      factDigestSha256: 'a'.repeat(64),
      createdAt: '2026-07-13T00:00:00.000Z',
    });

    expect(bundle).toMatchObject({
      schemaVersion: 'kiditem.authoritative-inventory-rebuild.v2',
      target: 'staging',
      originRunId: '12345',
      deployedSha: '0123456789abcdef0123456789abcdef01234567',
      organizationId,
      channelAccountId: coupangAccountId,
      expectedReplayCounts: {
        scrapeRuns: 1,
        rawSnapshots: 1,
        listingDailyFacts: 1,
        optionDailyFacts: 1,
        adTargetFacts: 0,
        accountKpiFacts: 1,
      },
      payloads: [{
        sourceRunId: '00000000-0000-4000-8000-000000000011',
        body: {
          type: 'raw_scrape',
          source: 'wing',
          data: [{
            externalId: 'listing-1',
            vendorItemId: 'option-1',
            productName: '반짝 슈가 말랑이',
            isWinner: true,
            myPrice: 9000,
            winnerPrice: 9100,
          }],
          kpis: { '아이템위너 상품': '12' },
        },
      }],
    });
    const serialized = JSON.stringify(bundle);
    expect(serialized).not.toMatch(/must-not-copy|raw-password|raw-token|session-cookie|buyer@example\.test/i);
    expect(serialized).not.toMatch(/password|secret|credential|customerEmail|review/i);
    expect(bundle.payloadSha256).toMatch(/^[0-9a-f]{64}$/);
    expect(() => assertReplayBundle(bundle)).not.toThrow();
  });

  it('preserves approved order aggregates and rejects unknown or PII-bearing artifact fields', () => {
    const bundle = buildCoupangReplayBundle({
      target: 'production',
      originRunId: '9988',
      deployedSha: 'fedcba9876543210fedcba9876543210fedcba98',
      organizationId,
      channelAccountId: coupangAccountId,
      channelAccountExternalId: 'wing-account',
      runs: [{
        id: '00000000-0000-4000-8000-000000000012',
        source: 'wing',
        pageType: 'traffic',
        businessDate: new Date('2026-07-11T00:00:00.000Z'),
        periodStart: new Date('2026-07-01T00:00:00.000Z'),
        periodEnd: new Date('2026-07-11T00:00:00.000Z'),
        period: '11',
        targetUrl: 'https://wing.coupang.com/tenants/business-insight/sales-analysis?token=secret',
        metaJson: {
          summary: { visitors: 50, orders: 7, revenue: 70000 },
          adSummary: { adOrders: 3, trafficOrders: 7, adSpend: 2000, adGmv: 10000 },
        },
        snapshots: [{
          rawJson: {
            vendorItemId: 'option-1',
            productId: 'listing-1',
            productName: '상품 A',
            visitors: 50,
            views: 70,
            cartAdds: 12,
            orders: 7,
            salesQty: 8,
            revenue: 70000,
            buyerNote: '문 앞에 두세요',
          },
          normalizedJson: null,
        }],
      }],
      factCounts: {
        scrapeRuns: 1,
        rawSnapshots: 1,
        listingDailyFacts: 1,
        optionDailyFacts: 0,
        adTargetFacts: 0,
        accountKpiFacts: 1,
      },
      factDigestSha256: 'b'.repeat(64),
      createdAt: '2026-07-13T00:00:00.000Z',
    });

    expect(bundle.payloads[0]?.body).toMatchObject({
      summary: { visitors: 50, orders: 7, revenue: 70000 },
      adSummary: { adOrders: 3, trafficOrders: 7, adSpend: 2000, adGmv: 10000 },
      data: [{ orders: 7, revenue: 70000 }],
    });
    expect(JSON.stringify(bundle)).not.toContain('문 앞에 두세요');
    expect(() => assertReplayBundle({
      ...bundle,
      payloads: [{
        ...bundle.payloads[0]!,
        body: { ...bundle.payloads[0]!.body, unknown: 1 },
      }],
    })).toThrow(/unknown replay payload key/i);
    expect(() => assertReplayBundle({
      ...bundle,
      payloads: [{
        ...bundle.payloads[0]!,
        body: {
          ...bundle.payloads[0]!.body,
          data: [{ vendorItemId: 'option-1', productName: 'buyer@example.test' }],
        },
      }],
    })).toThrow(/PII/i);
    expect(() => assertReplayBundle({
      ...bundle,
      payloads: [{
        ...bundle.payloads[0]!,
        body: {
          ...bundle.payloads[0]!.body,
          adSummary: { ...bundle.payloads[0]!.body.adSummary as object, unapproved: 1 },
        },
      }],
    })).toThrow(/unknown replay adSummary key/i);
    expect(() => assertReplayBundle({ ...bundle, payloadSha256: '0'.repeat(64) }))
      .toThrow(/payload hash/i);
    expect(() => assertReplayBundle({ ...bundle, expectedFactDigestSha256: 'not-a-digest' }))
      .toThrow(/fact digest/i);
  });

  it('rejects non-scalar row fields including the exact nested reviewer payload', () => {
    const bundle = buildCoupangReplayBundle({
      target: 'staging',
      originRunId: '12345',
      deployedSha: '0123456789abcdef0123456789abcdef01234567',
      organizationId,
      channelAccountId: coupangAccountId,
      channelAccountExternalId: 'wing-account',
      runs: [{
        id: '00000000-0000-4000-8000-000000000013',
        source: 'wing',
        pageType: 'itemwinner',
        businessDate: new Date('2026-07-12T00:00:00.000Z'),
        periodStart: null,
        periodEnd: null,
        period: null,
        targetUrl: null,
        metaJson: {},
        snapshots: [{
          rawJson: {
            vendorItemId: 'option-1',
            productName: '유효 상품명',
          },
          normalizedJson: null,
        }],
      }],
      factCounts: {
        scrapeRuns: 1,
        rawSnapshots: 1,
        listingDailyFacts: 1,
        optionDailyFacts: 0,
        adTargetFacts: 0,
        accountKpiFacts: 1,
      },
      factDigestSha256: 'c'.repeat(64),
    });
    const unsafe = {
      ...bundle,
      payloads: [{
        ...bundle.payloads[0]!,
        body: {
          ...bundle.payloads[0]!.body,
          data: [{
            vendorItemId: 'option-1',
            productName: {
              이름: '홍길동',
              unknownField: '+1 415 555 1234',
              home: '1600 Pennsylvania Ave NW',
            },
          }],
        },
      }],
    };

    expect(() => assertReplayBundle(unsafe)).toThrow(/productName.*scalar/i);
  });

  it.each([
    '+1 415 555 1234',
    '1600 Pennsylvania Ave NW',
    'buyer@example.test',
    '서울특별시 강남구 테헤란로 123',
  ])('rejects PII-shaped productName value %s', (productName) => {
    const bundle = buildCoupangReplayBundle({
      target: 'staging',
      originRunId: '12345',
      deployedSha: '0123456789abcdef0123456789abcdef01234567',
      organizationId,
      channelAccountId: coupangAccountId,
      channelAccountExternalId: 'wing-account',
      runs: [{
        id: '00000000-0000-4000-8000-000000000014',
        source: 'wing',
        pageType: 'itemwinner',
        businessDate: new Date('2026-07-12T00:00:00.000Z'),
        periodStart: null,
        periodEnd: null,
        period: null,
        targetUrl: null,
        metaJson: {},
        snapshots: [{
          rawJson: { vendorItemId: 'option-1', productName: '유효 상품명' },
          normalizedJson: null,
        }],
      }],
      factCounts: {
        scrapeRuns: 1,
        rawSnapshots: 1,
        listingDailyFacts: 1,
        optionDailyFacts: 0,
        adTargetFacts: 0,
        accountKpiFacts: 1,
      },
      factDigestSha256: 'd'.repeat(64),
    });
    const unsafe = {
      ...bundle,
      payloads: [{
        ...bundle.payloads[0]!,
        body: {
          ...bundle.payloads[0]!.body,
          data: [{ vendorItemId: 'option-1', productName }],
        },
      }],
    };

    expect(() => assertReplayBundle(unsafe)).toThrow(/PII/i);
  });

  it('changes the daily-fact digest when an approved aggregate changes', () => {
    const baseline = {
      listingDailyFacts: [{
        externalId: 'listing-1',
        businessDate: new Date('2026-07-11T00:00:00.000Z'),
        trafficOrders: 7,
        adOrders: 3,
      }],
      optionDailyFacts: [],
      adTargetFacts: [],
      accountKpiFacts: [],
    };

    const first = computeReplayFactDigest(baseline);
    const changed = computeReplayFactDigest({
      ...baseline,
      listingDailyFacts: [{ ...baseline.listingDailyFacts[0], trafficOrders: 8 }],
    });

    expect(first).toMatch(/^[0-9a-f]{64}$/);
    expect(changed).not.toBe(first);
  });
});

describe('authoritative inventory rebuild readiness', () => {
  it('fails closed until both authenticated imports and all configured counts exist', () => {
    const expected = {
      activeMasters: 1964,
      listings: 1225,
      channelSkus: 2241,
    };
    const actual = {
      completedSellpiaImports: 1,
      completedWingImports: 1,
      activeMasters: 1964,
      listings: 1225,
      channelSkus: 2241,
    };

    expect(() => assertReadyCounts(actual, expected)).not.toThrow();
    expect(() => assertReadyCounts({ ...actual, completedSellpiaImports: 0 }, expected))
      .toThrow(/Sellpia/i);
    expect(() => assertReadyCounts({ ...actual, completedWingImports: 0 }, expected))
      .toThrow(/Wing/i);
    expect(() => assertReadyCounts({ ...actual, channelSkus: 2240 }, expected))
      .toThrow(/channel SKUs/i);
  });
});
