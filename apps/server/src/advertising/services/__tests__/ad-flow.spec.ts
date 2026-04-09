import { describe, it, expect, vi } from 'vitest';
import { AdSyncService } from '../ad-sync.service';
import { AdStrategyService as AdvertisingAdStrategyService } from '../ad-strategy.service';
import { AdStrategyService as AgentAdStrategyService } from '../../../agent-registry/domains/ad-strategy/ad-strategy.service';
import { AgentResultReadyEvent } from '../../../agent-registry/events/agent-events';

/**
 * ad-flow.spec.ts — Ad data collection → strategy → actions flow test.
 * Covers AdSyncService (extension sync), advertising AdStrategyService (rules/plan),
 * and agent-registry AdStrategyService (agent run + onResultReady post-processing).
 */

// ── Shared mock factory ──

function makePrisma() {
  return {
    company: { findFirst: vi.fn() },
    product: { findMany: vi.fn().mockResolvedValue([]), findFirst: vi.fn(), groupBy: vi.fn().mockResolvedValue([]) },
    adSnapshot: {
      findFirst: vi.fn(),
      create: vi.fn().mockResolvedValue({ id: 'snap-1' }),
      update: vi.fn().mockResolvedValue({ id: 'snap-1' }),
      count: vi.fn().mockResolvedValue(0),
      findMany: vi.fn().mockResolvedValue([]),
    },
    trafficStats: {
      upsert: vi.fn().mockResolvedValue({}),
    },
    itemWinner: {
      create: vi.fn().mockResolvedValue({}),
      groupBy: vi.fn().mockResolvedValue([]),
    },
    activityEvent: {
      create: vi.fn().mockResolvedValue({}),
    },
    agentTask: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn().mockResolvedValue([]),
    },
    heartbeatRun: {
      findFirst: vi.fn().mockResolvedValue(null),
    },
    ad: {
      groupBy: vi.fn().mockResolvedValue([]),
      findMany: vi.fn().mockResolvedValue([]),
      aggregate: vi.fn().mockResolvedValue({ _sum: { spend: 0, revenue: 0 } }),
    },
    profitLoss: {
      findMany: vi.fn().mockResolvedValue([]),
    },
    systemSetting: {
      findMany: vi.fn().mockResolvedValue([]),
      findFirst: vi.fn().mockResolvedValue(null),
      createMany: vi.fn().mockResolvedValue({ count: 0 }),
      upsert: vi.fn().mockResolvedValue({}),
    },
    alert: {
      findMany: vi.fn().mockResolvedValue([]),
      createMany: vi.fn().mockResolvedValue({ count: 0 }),
    },
    $transaction: vi.fn().mockResolvedValue([]),
  };
}

function makeAdConfigService() {
  return {
    getConfig: vi.fn().mockResolvedValue({
      roas: { thresholds: { excellent: 300, warning: 200, poor: 100 } },
      adRate: { thresholds: { warning: 15, critical: 20 } },
      budget: { allocation: { A: 60, B: 30, C: 10 } },
      roasTargetByGrade: { A: 300, B: 400, C: 500 },
      adRateTargetByGrade: { A: 12, B: 8, C: 5 },
      tier: { dailyBudget: { '1차': 150000 } },
      benchmark: {
        roas: { avg: 350, good: 500, excellent: 700, poor: 200 },
        ctr: { avg: 0.3, good: 0.5, excellent: 1.0, poor: 0.15 },
        cvr: { avg: 8, good: 12, excellent: 15, poor: 5 },
        cpc: { avg: 250, good: 150, excellent: 100, poor: 500 },
        adRate: { avg: 15, good: 10, excellent: 5, poor: 25 },
        acos: { avg: 25, good: 15, excellent: 10, poor: 40 },
      },
      gradeStrategy: {
        A: { title: '핵심 상품', subtitle: '공격 확장', pills: [], budgetTarget: 60, roasTarget: 300, adRateTarget: 12 },
        B: { title: '성장 후보', subtitle: '최적화', pills: [], budgetTarget: 30, roasTarget: 400, adRateTarget: 8 },
        C: { title: '정리 대상', subtitle: '손절', pills: [], budgetTarget: 10, roasTarget: 500, adRateTarget: 5 },
      },
    }),
  };
}

function makeAgentRegistry() {
  return {
    findByType: vi.fn(),
    run: vi.fn(),
  };
}

// ── AdSyncService tests ──

describe('AdSyncService — extension data sync', () => {
  describe('sync: ad_campaign type', () => {
    it('creates AdSnapshot for campaign-level KPI totals', async () => {
      const prisma = makePrisma();
      prisma.company.findFirst.mockResolvedValue({ id: 'c-1' });
      prisma.product.findMany.mockResolvedValue([]);
      prisma.adSnapshot.findFirst.mockResolvedValue(null); // no existing snapshot

      const service = new AdSyncService(prisma as any);

      const result = await service.sync({
        type: 'ad_campaign',
        campaignName: '핵심 캠페인',
        period: '7d',
        kpis: {
          '전체 집행 광고비': { value: '150,000' },
          '광고 전환 매출': { value: '500,000' },
          '노출수': { value: '10,000' },
          '클릭수': { value: '300' },
        },
        normalizedRows: [],
        timestamp: '2026-04-09T00:00:00.000Z',
      });

      expect(result.success).toBe(true);
      expect((result as any).type).toBe('ad_campaign');
      // AdSnapshot create called for total KPI
      expect(prisma.adSnapshot.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            level: 'campaign',
            campaignName: '핵심 캠페인',
            adSpend: 150000,
            adRevenue: 500000,
          }),
        }),
      );
    });

    it('updates existing AdSnapshot when found (upsert pattern)', async () => {
      const prisma = makePrisma();
      prisma.company.findFirst.mockResolvedValue({ id: 'c-1' });
      prisma.product.findMany.mockResolvedValue([]);
      // Existing snapshot found
      prisma.adSnapshot.findFirst.mockResolvedValue({ id: 'snap-existing' });

      const service = new AdSyncService(prisma as any);

      const result = await service.sync({
        type: 'ad_campaign',
        campaignName: '_전체',
        period: '7d',
        kpis: {
          '전체 집행 광고비': { value: '200,000' },
          '광고 전환 매출': { value: '600,000' },
        },
        normalizedRows: [],
      });

      expect(result.success).toBe(true);
      expect(prisma.adSnapshot.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'snap-existing' },
          data: expect.objectContaining({ adSpend: 200000 }),
        }),
      );
    });

    it('creates campaign-level snapshot for individual campaign rows', async () => {
      const prisma = makePrisma();
      prisma.company.findFirst.mockResolvedValue({ id: 'c-1' });
      prisma.product.findMany.mockResolvedValue([]);
      prisma.adSnapshot.findFirst.mockResolvedValue(null);
      prisma.product.findFirst.mockResolvedValue(null);

      const service = new AdSyncService(prisma as any);

      const result = await service.sync({
        type: 'ad_campaign',
        campaignName: '_전체',
        period: '7d',
        kpis: {},
        normalizedRows: [
          {
            pageType: 'campaign',
            campaignName: '매출최적화 캠페인',
            spend: '50,000',
            revenue: '200,000',
            clicks: '150',
            impressions: '5,000',
            conversions: '8',
          },
        ],
      });

      expect(result.success).toBe(true);
      expect((result as any).campaignSnapshotCount).toBe(1);
    });
  });

  describe('sync: traffic type', () => {
    it('upserts TrafficStats for matched products', async () => {
      const prisma = makePrisma();
      prisma.company.findFirst.mockResolvedValue({ id: 'c-1' });
      // productMap: coupangProductId → productId
      prisma.product.findMany.mockResolvedValue([
        { id: 'product-1', coupangProductId: 'coupang-123' },
      ]);
      prisma.$transaction.mockResolvedValue([{}]);

      const service = new AdSyncService(prisma as any);

      const result = await service.sync({
        type: 'traffic',
        period: '14',
        data: [
          {
            productId: 'coupang-123',
            visitors: 1000,
            views: 2000,
            cartAdds: 100,
            orders: 50,
            salesQty: 55,
            revenue: 500000,
          },
        ],
      });

      expect(result.success).toBe(true);
      expect((result as any).type).toBe('traffic');
      expect((result as any).upserted).toBe(1);
    });

    it('skips traffic rows without matching product', async () => {
      const prisma = makePrisma();
      prisma.company.findFirst.mockResolvedValue({ id: 'c-1' });
      prisma.product.findMany.mockResolvedValue([]); // no products in productMap

      const service = new AdSyncService(prisma as any);

      const result = await service.sync({
        type: 'traffic',
        period: '14',
        data: [
          { productId: 'unknown-product', visitors: 100, views: 200 },
        ],
      });

      expect(result.success).toBe(true);
      expect((result as any).upserted).toBe(0);
      expect((result as any).skipped).toBe(1);
    });
  });

  describe('sync: unknown type', () => {
    it('returns success:false for unknown type', async () => {
      const prisma = makePrisma();
      prisma.company.findFirst.mockResolvedValue({ id: 'c-1' });
      prisma.product.findMany.mockResolvedValue([]);

      const service = new AdSyncService(prisma as any);

      const result = await service.sync({ type: 'unknown_type' } as any);

      expect(result.success).toBe(false);
      expect((result as any).error).toContain('unknown_type');
    });
  });
});

// ── Advertising AdStrategyService tests ──

describe('AdvertisingAdStrategyService — strategy rules and plan', () => {
  describe('getRules', () => {
    it('returns empty recommendations when no products match conditions', async () => {
      const prisma = makePrisma();
      prisma.company.findFirst.mockResolvedValue({ id: 'c-1' });
      prisma.ad.groupBy.mockResolvedValue([]);
      prisma.product.findMany.mockResolvedValue([]);
      prisma.alert.findMany.mockResolvedValue([]);

      const adConfig = makeAdConfigService();
      const service = new AdvertisingAdStrategyService(prisma as any, adConfig as any);

      const result = await service.getRules();

      expect(result).toHaveProperty('summary');
      expect(result).toHaveProperty('recommendations');
      expect(result.recommendations).toEqual([]);
    });

    it('generates urgent recommendations for stock=0 with active ads', async () => {
      const prisma = makePrisma();
      prisma.company.findFirst.mockResolvedValue({ id: 'c-1' });
      prisma.ad.groupBy.mockResolvedValue([
        { productId: 'p1', _sum: { spend: 50000, revenue: 0, clicks: 100, impressions: 10000, conversions: 0 } },
      ]);
      prisma.product.findMany.mockResolvedValue([
        {
          id: 'p1',
          name: '테스트 상품',
          abcGrade: 'A',
          adTier: '1차',
          sellPrice: 10000,
          costPrice: 5000,
          inventory: { currentStock: 0 },
          trafficStats: [],
        },
      ]);
      prisma.alert.findMany.mockResolvedValue([]);
      prisma.alert.createMany.mockResolvedValue({ count: 1 });

      const adConfig = makeAdConfigService();
      const service = new AdvertisingAdStrategyService(prisma as any, adConfig as any);

      const result = await service.getRules();

      const urgentRecs = result.recommendations.filter((r: any) => r.priority === 'urgent');
      expect(urgentRecs.length).toBeGreaterThan(0);
      expect(result.summary.urgent).toBeGreaterThan(0);
    });

    it('returns ABC tier thresholds in summary structure', async () => {
      const prisma = makePrisma();
      prisma.company.findFirst.mockResolvedValue({ id: 'c-1' });
      prisma.ad.groupBy.mockResolvedValue([]);
      prisma.product.findMany.mockResolvedValue([]);
      prisma.alert.findMany.mockResolvedValue([]);

      const adConfig = makeAdConfigService();
      const service = new AdvertisingAdStrategyService(prisma as any, adConfig as any);

      const result = await service.getRules();

      expect(result.summary).toMatchObject({
        total: expect.any(Number),
        urgent: expect.any(Number),
        high: expect.any(Number),
        medium: expect.any(Number),
        low: expect.any(Number),
      });
    });
  });

  describe('getWeeklyPlan', () => {
    it('returns empty plan structure when no agent result and no products', async () => {
      const prisma = makePrisma();
      prisma.company.findFirst.mockResolvedValue({ id: 'c-1' });
      prisma.heartbeatRun.findFirst.mockResolvedValue(null); // no agent result
      prisma.ad.groupBy.mockResolvedValue([]);
      prisma.product.findMany.mockResolvedValue([]);
      prisma.ad.findMany.mockResolvedValue([]);
      prisma.profitLoss.findMany.mockResolvedValue([]);

      const adConfig = makeAdConfigService();
      const service = new AdvertisingAdStrategyService(prisma as any, adConfig as any);

      const result = await service.getWeeklyPlan();

      expect(result).toHaveProperty('budgetAllocation');
      expect(result).toHaveProperty('actions');
      expect(result).toHaveProperty('adIssues');
      expect(result).toHaveProperty('tierAnalysis');
      expect(result).toHaveProperty('top20');
    });

    it('returns generatedAt from latest agent run result', async () => {
      const prisma = makePrisma();
      const generatedAt = new Date('2026-04-09T12:00:00.000Z');
      prisma.company.findFirst.mockResolvedValue({ id: 'c-1' });
      prisma.heartbeatRun.findFirst.mockResolvedValue({
        resultJson: {
          plan: { keyMetrics: { totalAdSpend: 1000000 } },
          cards: [],
        },
        finishedAt: generatedAt,
      });
      prisma.ad.groupBy.mockResolvedValue([]);
      prisma.product.findMany.mockResolvedValue([]);
      prisma.ad.findMany.mockResolvedValue([]);
      prisma.profitLoss.findMany.mockResolvedValue([]);

      const adConfig = makeAdConfigService();
      const service = new AdvertisingAdStrategyService(prisma as any, adConfig as any);

      const result = await service.getWeeklyPlan();

      expect(result.generatedAt).toEqual(generatedAt);
    });
  });
});

// ── Agent-registry AdStrategyService tests ──

describe('AgentAdStrategyService — agent run and result handling', () => {
  function makeAgentService() {
    const prisma = makePrisma();
    const registry = makeAgentRegistry();
    return {
      service: new AgentAdStrategyService(prisma as any, registry as any),
      prisma,
      registry,
    };
  }

  describe('run', () => {
    it('resolves ad_strategy definition and delegates to agentRegistry.run', async () => {
      const { service, registry } = makeAgentService();
      registry.findByType.mockResolvedValue({ id: 'def-ad', type: 'ad_strategy' });
      registry.run.mockResolvedValue({ ok: true, taskId: 'task-1', agentType: 'ad_strategy' });

      const result = await service.run({ companyId: 'c-1', dryRun: false });

      expect(registry.findByType).toHaveBeenCalledWith('ad_strategy');
      expect(registry.run).toHaveBeenCalledWith('def-ad', {
        companyId: 'c-1',
        dryRun: false,
      });
      expect(result.ok).toBe(true);
      expect(result.taskId).toBe('task-1');
    });

    it('passes dryRun=true to registry.run', async () => {
      const { service, registry } = makeAgentService();
      registry.findByType.mockResolvedValue({ id: 'def-ad' });
      registry.run.mockResolvedValue({ ok: true, taskId: 'task-dry', dryRun: true });

      const result = await service.run({ companyId: 'c-1', dryRun: true });

      expect(registry.run).toHaveBeenCalledWith('def-ad', {
        companyId: 'c-1',
        dryRun: true,
      });
      expect(result.taskId).toBe('task-dry');
    });
  });

  describe('onResultReady — post-processing', () => {
    it('creates activity event with action count summary for ad_strategy results', async () => {
      const { service, prisma } = makeAgentService();
      prisma.activityEvent.create.mockResolvedValue({});

      const event = new AgentResultReadyEvent(
        'ad_strategy', 'agent-ad', 'run-1',
        {
          actions: [
            { action: 'stop_ad', product_id: 'p1' },
            { action: 'stop_ad', product_id: 'p2' },
            { action: 'increase_budget', product_id: 'p3' },
          ],
          summary: { total: 3 },
        },
        'c-1',
      );

      await service.onResultReady(event);

      expect(prisma.activityEvent.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          companyId: 'c-1',
          eventType: 'ad_strategy',
          source: 'agent:claude_cli',
          title: '광고 전략 실행: 3건 (중단 2)',
        }),
      });
    });

    it('handles empty actions array with zero stop count', async () => {
      const { service, prisma } = makeAgentService();
      prisma.activityEvent.create.mockResolvedValue({});

      const event = new AgentResultReadyEvent(
        'ad_strategy', 'agent-ad', 'run-2',
        { actions: [] },
        'c-1',
      );

      await service.onResultReady(event);

      expect(prisma.activityEvent.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          title: '광고 전략 실행: 0건 (중단 0)',
        }),
      });
    });

    it('ignores events from non-ad_strategy agent types', async () => {
      const { service, prisma } = makeAgentService();

      const event = new AgentResultReadyEvent(
        'rules_evaluation', 'agent-rules', 'run-3', {}, 'c-1',
      );

      await service.onResultReady(event);

      expect(prisma.activityEvent.create).not.toHaveBeenCalled();
    });

    it('does not throw when activityEvent.create fails (error recovery)', async () => {
      const { service, prisma } = makeAgentService();
      prisma.activityEvent.create.mockRejectedValue(new Error('DB error'));

      const event = new AgentResultReadyEvent(
        'ad_strategy', 'agent-ad', 'run-4',
        { actions: [{ action: 'stop_ad', product_id: 'p1' }] },
        'c-1',
      );

      // Should not throw
      await expect(service.onResultReady(event)).resolves.not.toThrow();
    });

    it('stores full resultJson as activity event data', async () => {
      const { service, prisma } = makeAgentService();
      prisma.activityEvent.create.mockResolvedValue({});

      const resultJson = {
        actions: [{ action: 'stop_ad', product_id: 'p1', reason: 'ROAS too low' }],
        summary: { total: 1, stopped: 1 },
      };

      const event = new AgentResultReadyEvent(
        'ad_strategy', 'agent-ad', 'run-5',
        resultJson,
        'c-1',
      );

      await service.onResultReady(event);

      expect(prisma.activityEvent.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          data: expect.objectContaining({
            actions: expect.arrayContaining([
              expect.objectContaining({ action: 'stop_ad' }),
            ]),
          }),
        }),
      });
    });
  });
});
