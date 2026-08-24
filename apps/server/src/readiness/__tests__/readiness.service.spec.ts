import { afterEach, describe, expect, it, vi } from 'vitest';
import { ReadinessService } from '../readiness.service';

const ORGANIZATION_ID = '00000000-0000-0000-0000-0000000c0001';
const ACTIVE_COUPANG_ACCOUNT_ID = '00000000-0000-4000-8000-0000000c0002';

describe('ReadinessService', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('resolves all six published AgentVersions with their explicit model and deduplicates runtime/model probes', async () => {
    const originalEnv = process.env;
    process.env = {
      ...originalEnv,
      KIDITEM_APPLICATION_VERSION: '3.4.5',
      KIDITEM_GIT_SHA: 'abc123',
      AGENT_OPERATOR_MODEL: 'claude-operator',
      AGENT_SOURCING_MODEL: 'gpt-sourcing',
      AGENT_MERCHANDISING_MODEL: 'claude-shared',
      AGENT_SUPPLY_MODEL: 'claude-shared',
      AGENT_CHANNEL_OPERATIONS_MODEL: 'claude-channel',
      AGENT_ADVERTISING_MODEL: 'claude-advertising',
      OPENAI_API_KEY: 'must-never-be-passed',
    };
    const assertRuntime = vi.fn(async () => undefined);
    const prisma = {
      agentVersion: {
        findMany: vi.fn(async () => [
          { agentDefinitionKey: 'operator', runtimeType: 'claude_cli' },
          { agentDefinitionKey: 'sourcing', runtimeType: 'codex_cli' },
          { agentDefinitionKey: 'merchandising', runtimeType: 'claude_cli' },
          { agentDefinitionKey: 'supply', runtimeType: 'claude_cli' },
          { agentDefinitionKey: 'channel_operations', runtimeType: 'claude_cli' },
          { agentDefinitionKey: 'advertising', runtimeType: 'claude_cli' },
        ]),
      },
    };

    try {
      const result = await new ReadinessService(prisma as never, { assertRuntime } as never).getAgentAttemptRuntimeReadiness();
      expect(result).toEqual({
        status: 'ready',
        runner: null,
        agents: [
          { agentDefinitionKey: 'operator', runtimeType: 'claude_cli', model: 'claude-operator', status: 'ready' },
          { agentDefinitionKey: 'sourcing', runtimeType: 'codex_cli', model: 'gpt-sourcing', status: 'ready' },
          { agentDefinitionKey: 'merchandising', runtimeType: 'claude_cli', model: 'claude-shared', status: 'ready' },
          { agentDefinitionKey: 'supply', runtimeType: 'claude_cli', model: 'claude-shared', status: 'ready' },
          { agentDefinitionKey: 'channel_operations', runtimeType: 'claude_cli', model: 'claude-channel', status: 'ready' },
          { agentDefinitionKey: 'advertising', runtimeType: 'claude_cli', model: 'claude-advertising', status: 'ready' },
        ],
      });
      expect(assertRuntime).toHaveBeenCalledTimes(5);
      expect(assertRuntime).toHaveBeenCalledWith('claude_cli', 'claude-shared', '3.4.5:abc123');
      expect(JSON.stringify(assertRuntime.mock.calls)).not.toContain('must-never-be-passed');
    } finally {
      process.env = originalEnv;
    }
  });

  it('starts one synthetic canary per unverified active runtime/model pair and reports only bounded probing facts', async () => {
    const originalEnv = process.env;
    process.env = {
      ...originalEnv,
      KIDITEM_APPLICATION_VERSION: '3.4.5',
      KIDITEM_GIT_SHA: 'abc123',
      AGENT_OPERATOR_MODEL: 'claude-shared',
      AGENT_MERCHANDISING_MODEL: 'claude-shared',
      AGENT_SOURCING_MODEL: 'gpt-sourcing',
    };
    const readiness = {
      assertRuntime: vi.fn(async () => { throw new Error('runner_not_ready'); }),
      beginCanary: vi.fn(({ runtime, model, deployIdentity }) => ({ canaryId: `${runtime}:${model}:${deployIdentity}` })),
      snapshot: vi.fn(() => null),
    };
    const prisma = {
      agentVersion: {
        findMany: vi.fn(async () => [
          { agentDefinitionKey: 'operator', runtimeType: 'claude_cli' },
          { agentDefinitionKey: 'merchandising', runtimeType: 'claude_cli' },
          { agentDefinitionKey: 'sourcing', runtimeType: 'codex_cli' },
        ]),
      },
    };

    try {
      await expect(new ReadinessService(prisma as never, readiness as never).getAgentAttemptRuntimeReadiness())
        .resolves.toEqual({
          status: 'probing',
          runner: null,
          agents: [
            { agentDefinitionKey: 'operator', runtimeType: 'claude_cli', model: 'claude-shared', status: 'probing' },
            { agentDefinitionKey: 'merchandising', runtimeType: 'claude_cli', model: 'claude-shared', status: 'probing' },
            { agentDefinitionKey: 'sourcing', runtimeType: 'codex_cli', model: 'gpt-sourcing', status: 'probing' },
          ],
        });
      expect(readiness.beginCanary).toHaveBeenCalledTimes(2);
      expect(readiness.beginCanary).toHaveBeenCalledWith({
        runtime: 'claude_cli', model: 'claude-shared', deployIdentity: '3.4.5:abc123',
      });
      expect(JSON.stringify(readiness.beginCanary.mock.calls)).not.toMatch(/token|path|credential/i);
    } finally {
      process.env = originalEnv;
    }
  });

  it('rejects a published AgentVersion with no dedicated runtime model', async () => {
    const originalEnv = process.env;
    process.env = { ...originalEnv, KIDITEM_APPLICATION_VERSION: '3.4.5', KIDITEM_GIT_SHA: 'abc123' };
    delete process.env.AGENT_SOURCING_MODEL;
    const prisma = { agentVersion: { findMany: vi.fn(async () => [{ agentDefinitionKey: 'sourcing', runtimeType: 'codex_cli' }]) } };
    try {
      await expect(new ReadinessService(prisma as never, { assertRuntime: vi.fn() } as never).getAgentAttemptRuntimeReadiness()).rejects.toThrow('missing_runtime_model:sourcing');
    } finally {
      process.env = originalEnv;
    }
  });

  it('includes the KST reference date when querying @db.Date business dates', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-05-02T01:00:00.000Z'));

    const expectedDates = [
      '2026-04-18',
      '2026-04-19',
      '2026-04-20',
      '2026-04-21',
      '2026-04-22',
      '2026-04-23',
      '2026-04-24',
      '2026-04-25',
      '2026-04-26',
      '2026-04-27',
      '2026-04-28',
      '2026-04-29',
      '2026-04-30',
      '2026-05-01',
    ];
    const row = (businessDate: string) => ({
      businessDate: new Date(`${businessDate}T00:00:00.000Z`),
      lastObservedAt: new Date('2026-05-02T01:00:00.000Z'),
    });

    const prisma = {
      channelAccount: {
        findFirst: vi.fn(async () => ({ id: ACTIVE_COUPANG_ACCOUNT_ID })),
      },
      channelAccountDailyKpiSnapshot: {
        findMany: vi.fn(async () =>
          expectedDates.filter((d) => d !== '2026-04-18').map(row),
        ),
      },
      coupangWingSalesRankDailySnapshot: {
        findFirst: vi.fn(async () => ({
          businessDate: new Date('2026-05-01T00:00:00.000Z'),
          capturedAt: new Date('2026-05-02T01:00:00.000Z'),
        })),
        findMany: vi.fn(async () => [
          { vendorItemId: 'vendor-item-1' },
          { vendorItemId: 'vendor-item-2' },
        ]),
        count: vi.fn(async () => 4934),
      },
      channelListingOption: {
        findMany: vi.fn(async () => [
          { externalOptionId: 'vendor-item-1' },
          { externalOptionId: 'vendor-item-2' },
        ]),
      },
      channelListing: {
        count: vi.fn(async () => 1752),
      },
      sourceImportRun: {
        findFirst: vi.fn(async () => ({
          importedAt: new Date('2026-05-02T01:00:00.000Z'),
        })),
      },
      // 일별 매출(wing_sales) readiness 는 셀피아 판매현황 기준. 전 일자 present → ok.
      sellpiaSalesDailySnapshot: {
        findMany: vi.fn(async () =>
          expectedDates.map((businessDate) => ({
            businessDate: new Date(`${businessDate}T00:00:00.000Z`),
            capturedAt: new Date('2026-05-02T01:00:00.000Z'),
          })),
        ),
      },
    };

    const service = new ReadinessService(prisma as never);
    const status = await service.getStatus(ORGANIZATION_ID);

    const adsQuery = prisma.channelAccountDailyKpiSnapshot.findMany.mock.calls[0][0];
    const sellpiaQuery = prisma.sellpiaSalesDailySnapshot.findMany.mock.calls[0][0];
    expect(adsQuery.where.businessDate).toEqual({
      gte: new Date('2026-04-18T00:00:00.000Z'),
      lte: new Date('2026-05-01T00:00:00.000Z'),
    });
    expect(adsQuery.where.channelAccountId).toBe(ACTIVE_COUPANG_ACCOUNT_ID);
    expect(sellpiaQuery.where.sellerId).toBe('__kiditem_sellpia_sales_coverage__');
    expect(prisma.channelListing.count).toHaveBeenCalledWith({
      where: {
        organizationId: ORGANIZATION_ID,
        channelAccountId: ACTIVE_COUPANG_ACCOUNT_ID,
        isActive: true,
      },
    });
    expect(prisma.sourceImportRun.findFirst).toHaveBeenCalledWith({
      where: {
        organizationId: ORGANIZATION_ID,
        channelAccountId: ACTIVE_COUPANG_ACCOUNT_ID,
        sourceType: 'coupang_wing_catalog',
        status: 'completed',
        importedAt: { not: null },
      },
      orderBy: { importedAt: 'desc' },
      select: { importedAt: true },
    });

    const wingSales = status.checks.find((check) => check.key === 'wing_sales');
    const coupangAds = status.checks.find((check) => check.key === 'coupang_ads');
    const coupangProducts = status.checks.find(
      (check) => check.key === 'coupang_products',
    );
    const wingRank = status.checks.find((check) => check.key === 'wing_kpi');
    expect(wingSales?.status).toBe('ok');
    expect(coupangAds?.status).toBe('stale');
    expect(coupangAds?.missingDates).toEqual(['2026-04-18']);
    expect(coupangProducts).toMatchObject({
      status: 'ok',
      count: 1752,
      lastSyncedAt: '2026-05-02T01:00:00.000Z',
    });
    expect(wingRank).toMatchObject({
      label: 'Wing 판매순위',
      status: 'ok',
      count: 4934,
    });
    expect(status.checks.some((check) => check.key === 'rocket_sales')).toBe(false);
  });

  it('requires today Sellpia coverage on the first day of a KST month', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-01T01:00:00.000Z'));

    const priorDates = Array.from({ length: 14 }, (_, index) => {
      const date = new Date('2026-06-17T00:00:00.000Z');
      date.setUTCDate(date.getUTCDate() + index);
      return date.toISOString().slice(0, 10);
    });
    const row = (businessDate: string) => ({
      businessDate: new Date(`${businessDate}T00:00:00.000Z`),
      capturedAt: new Date('2026-07-01T01:00:00.000Z'),
    });
    const prisma = {
      channelAccount: {
        findFirst: vi.fn(async () => ({ id: ACTIVE_COUPANG_ACCOUNT_ID })),
      },
      channelAccountDailyKpiSnapshot: {
        findMany: vi.fn(async () => []),
      },
      coupangWingSalesRankDailySnapshot: {
        findFirst: vi.fn(async () => null),
        findMany: vi.fn(async () => []),
        count: vi.fn(async () => 0),
      },
      channelListingOption: { findMany: vi.fn(async () => []) },
      channelListing: {
        count: vi.fn(async () => 0),
      },
      sourceImportRun: { findFirst: vi.fn(async () => null) },
      sellpiaSalesDailySnapshot: {
        // 전월 말까지는 모두 있지만 7월 1일 coverage는 아직 없다.
        findMany: vi.fn(async () => priorDates.map(row)),
      },
    };

    const status = await new ReadinessService(prisma as never).getStatus(
      ORGANIZATION_ID,
    );
    const sellpiaQuery =
      prisma.sellpiaSalesDailySnapshot.findMany.mock.calls[0][0];
    const wingSales = status.checks.find((check) => check.key === 'wing_sales');

    expect(sellpiaQuery.where.businessDate).toEqual({
      gte: new Date('2026-06-17T00:00:00.000Z'),
      lte: new Date('2026-07-01T00:00:00.000Z'),
    });
    expect(wingSales).toMatchObject({
      status: 'missing',
      referenceDate: '2026-06-30',
      expectedDates: [...priorDates, '2026-07-01'],
      missingDates: ['2026-07-01'],
    });
  });

  it('keeps a partial Wing sales-rank batch stale until every active vendor item is covered', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-18T01:00:00.000Z'));

    const latestBusinessDate = new Date('2026-07-18T00:00:00.000Z');
    const prisma = {
      channelAccount: {
        findFirst: vi.fn(async () => ({ id: ACTIVE_COUPANG_ACCOUNT_ID })),
      },
      channelAccountDailyKpiSnapshot: { findMany: vi.fn(async () => []) },
      coupangWingSalesRankDailySnapshot: {
        findFirst: vi.fn(async () => ({
          businessDate: latestBusinessDate,
          capturedAt: new Date('2026-07-18T00:30:00.000Z'),
        })),
        findMany: vi.fn(async () => [{ vendorItemId: 'vendor-item-1' }]),
        count: vi.fn(async () => 1),
      },
      channelListingOption: {
        findMany: vi.fn(async () => [
          { externalOptionId: 'vendor-item-1' },
          { externalOptionId: 'vendor-item-2' },
        ]),
      },
      channelListing: {
        count: vi.fn(async () => 2),
      },
      sourceImportRun: {
        findFirst: vi.fn(async () => ({
          importedAt: new Date('2026-07-18T00:30:00.000Z'),
        })),
      },
      sellpiaSalesDailySnapshot: { findMany: vi.fn(async () => []) },
    };

    const status = await new ReadinessService(prisma as never).getStatus(
      ORGANIZATION_ID,
    );
    const wingRank = status.checks.find((check) => check.key === 'wing_kpi');

    expect(wingRank).toMatchObject({
      status: 'stale',
      count: 1,
      detail: expect.stringContaining('1/2상품'),
    });
    expect(
      prisma.coupangWingSalesRankDailySnapshot.findMany,
    ).toHaveBeenCalledWith({
      where: {
        organizationId: ORGANIZATION_ID,
        businessDate: latestBusinessDate,
        vendorItemId: { in: ['vendor-item-1', 'vendor-item-2'] },
      },
      select: { vendorItemId: true },
      distinct: ['vendorItemId'],
    });
  });

  it('does not let facts from inactive Coupang accounts mark ads or Wing ready', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-18T01:00:00.000Z'));

    const prisma = {
      channelAccount: { findFirst: vi.fn(async () => null) },
      // These mocks represent stale rows that still exist in the database.
      // They must not be queried when there is no active account.
      channelAccountDailyKpiSnapshot: {
        findMany: vi.fn(async () => [
          {
            businessDate: new Date('2026-07-17T00:00:00.000Z'),
            lastObservedAt: new Date('2026-07-18T00:00:00.000Z'),
          },
        ]),
      },
      channelListingOption: {
        findMany: vi.fn(async () => [{ externalOptionId: 'inactive-vendor' }]),
      },
      coupangWingSalesRankDailySnapshot: {
        findFirst: vi.fn(async () => ({
          businessDate: new Date('2026-07-17T00:00:00.000Z'),
          capturedAt: new Date('2026-07-18T00:00:00.000Z'),
        })),
        findMany: vi.fn(async () => [{ vendorItemId: 'inactive-vendor' }]),
        count: vi.fn(async () => 1),
      },
      channelListing: {
        count: vi.fn(async () => 0),
      },
      sourceImportRun: { findFirst: vi.fn(async () => null) },
      sellpiaSalesDailySnapshot: { findMany: vi.fn(async () => []) },
    };

    const status = await new ReadinessService(prisma as never).getStatus(
      ORGANIZATION_ID,
    );

    expect(prisma.channelAccountDailyKpiSnapshot.findMany).not.toHaveBeenCalled();
    expect(prisma.channelListingOption.findMany).not.toHaveBeenCalled();
    expect(prisma.channelListing.count).not.toHaveBeenCalled();
    expect(prisma.sourceImportRun.findFirst).not.toHaveBeenCalled();
    expect(
      prisma.coupangWingSalesRankDailySnapshot.findFirst,
    ).not.toHaveBeenCalled();
    expect(status.checks.find((check) => check.key === 'coupang_ads')).toMatchObject({
      status: 'missing',
      count: 0,
    });
    expect(status.checks.find((check) => check.key === 'wing_kpi')).toMatchObject({
      status: 'missing',
      count: 0,
    });
    expect(
      status.checks.find((check) => check.key === 'coupang_products'),
    ).toMatchObject({
      status: 'missing',
      count: 0,
      lastSyncedAt: null,
    });
  });

  it('keeps at least 14 ad days and expands coverage to the current month start', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-18T01:00:00.000Z'));

    const prisma = {
      channelAccount: {
        findFirst: vi.fn(async () => ({ id: ACTIVE_COUPANG_ACCOUNT_ID })),
      },
      channelAccountDailyKpiSnapshot: { findMany: vi.fn(async () => []) },
      coupangWingSalesRankDailySnapshot: {
        findFirst: vi.fn(async () => null),
        findMany: vi.fn(async () => []),
        count: vi.fn(async () => 0),
      },
      channelListingOption: { findMany: vi.fn(async () => []) },
      channelListing: {
        count: vi.fn(async () => 0),
      },
      sourceImportRun: { findFirst: vi.fn(async () => null) },
      sellpiaSalesDailySnapshot: { findMany: vi.fn(async () => []) },
    };

    const status = await new ReadinessService(prisma as never).getStatus(
      ORGANIZATION_ID,
    );
    const adsQuery =
      prisma.channelAccountDailyKpiSnapshot.findMany.mock.calls[0][0];
    const sellpiaQuery =
      prisma.sellpiaSalesDailySnapshot.findMany.mock.calls[0][0];
    const ads = status.checks.find((check) => check.key === 'coupang_ads');
    const sales = status.checks.find((check) => check.key === 'wing_sales');

    expect(adsQuery.where.businessDate).toEqual({
      gte: new Date('2026-07-01T00:00:00.000Z'),
      lte: new Date('2026-07-17T00:00:00.000Z'),
    });
    expect(sellpiaQuery.where.businessDate).toEqual({
      gte: new Date('2026-07-01T00:00:00.000Z'),
      lte: new Date('2026-07-17T00:00:00.000Z'),
    });
    expect(ads?.expectedDates).toHaveLength(17);
    expect(ads?.expectedDates?.[0]).toBe('2026-07-01');
    expect(sales?.expectedDates?.[0]).toBe('2026-07-01');
  });
});
