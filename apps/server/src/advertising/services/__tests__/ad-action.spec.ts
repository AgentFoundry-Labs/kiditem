import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NotFoundException } from '@nestjs/common';
import { AdActionService } from '../ad-action.service';

/**
 * H3 — `generateActions` reads the latest `ChannelAdTargetDailySnapshot`
 * per `targetKey` via `$queryRaw DISTINCT ON (target_key)`. Threshold rules
 * are unchanged; only the input row shape moves from `AdSnapshot` to
 * target-daily columns. Tests stub `prisma.$queryRaw` with the rich shape
 * `LatestTargetRow` consumed by the rule engine.
 */
describe('AdActionService', () => {
  let service: AdActionService;
  let prisma: any;

  const companyA = 'company-a';
  const companyB = 'company-b';

  beforeEach(() => {
    prisma = {
      adAction: {
        findMany: vi.fn().mockResolvedValue([]),
        findFirst: vi.fn(),
        count: vi.fn().mockResolvedValue(0),
        create: vi.fn(),
        update: vi.fn(),
        updateMany: vi.fn(),
      },
      channelScrapeRun: {
        findFirst: vi.fn().mockResolvedValue(null),
      },
      executionTask: {
        findMany: vi.fn().mockResolvedValue([]),
        createMany: vi.fn(),
        updateMany: vi.fn(),
      },
      // First $queryRaw call returns latest target rows; second returns
      // option-daily stockQty rows (used by Rule 1).
      $queryRaw: vi.fn().mockResolvedValue([]),
      $transaction: vi.fn((arg: any) => {
        if (typeof arg === 'function') return arg(prisma);
        return Promise.all(arg);
      }),
    };
    service = new AdActionService(prisma);
  });

  function baseTargetRow(overrides: Partial<any> = {}) {
    return {
      id: 'TGT-1',
      targetType: 'campaign',
      targetKey: 'campaign:CMP-1',
      listingId: 'L1',
      listingOptionId: 'LO1',
      externalId: 'EXT-1',
      campaignId: 'CMP-1',
      campaignName: 'C1',
      keyword: null,
      status: 'active',
      currentBid: null,
      dailyBudget: 10000,
      spend: 5000,
      revenue: 10000,
      impressions: 100,
      clicks: 10,
      conversions: 2,
      abcGrade: 'B',
      optionAvailableStock: 100,
      optionCostPrice: 3000,
      optionSellPrice: 10000,
      optionCommissionRate: 0.1,
      productName: '상품1',
      ...overrides,
    };
  }

  // Wire the two $queryRaw calls in order: target rows then option-daily stocks.
  function stubGenerate(
    targetRows: any[],
    optionStocks: { listingOptionId: string; stockQty: number | null }[] = [],
  ) {
    // First call (latest target rows) — second call (option daily stocks) is
    // skipped if no listingOptionIds. Order matches the service call order.
    prisma.$queryRaw
      .mockReset()
      .mockResolvedValueOnce(targetRows)
      .mockResolvedValueOnce(optionStocks);
  }

  describe('generateActions — 5 rules (input now from ChannelAdTargetDailySnapshot)', () => {
    it('Rule 1: stock=0 campaign + dailyBudget > 0 → change_daily_budget urgent, proposedValue=3000', async () => {
      const row = baseTargetRow({ optionAvailableStock: 0 });
      stubGenerate([row]);
      prisma.adAction.create.mockImplementation(({ data }: any) => ({ id: 'a1', ...data }));

      const result = await service.generateActions(companyA);

      expect(result.generated).toBe(1);
      expect(prisma.adAction.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            companyId: companyA,
            listingId: 'L1',
            adTargetDailyId: 'TGT-1',
            actionType: 'change_daily_budget',
            targetType: 'campaign',
            priority: 'urgent',
            currentValue: 10000,
            proposedValue: 3000,
          }),
        }),
      );
      // legacy snapshotId left unwritten (column kept until H4).
      const callArg = prisma.adAction.create.mock.calls[0][0];
      expect(callArg.data).not.toHaveProperty('snapshotId');
    });

    it('Rule 1: skip when target row has no listingOptionId', async () => {
      const row = baseTargetRow({ listingOptionId: null });
      stubGenerate([row]);

      const result = await service.generateActions(companyA);

      expect(result.generated).toBe(0);
      expect(prisma.adAction.create).not.toHaveBeenCalled();
    });

    it('Rule 1: also fires when channel-observed daily stockQty=0 (live stock != 0)', async () => {
      const row = baseTargetRow({ optionAvailableStock: 5 });
      stubGenerate([row], [{ listingOptionId: 'LO1', stockQty: 0 }]);
      prisma.adAction.create.mockImplementation(({ data }: any) => ({ id: 'a1', ...data }));

      const result = await service.generateActions(companyA);

      expect(result.generated).toBe(1);
      expect(prisma.adAction.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ actionType: 'change_daily_budget', priority: 'urgent' }),
        }),
      );
    });

    it('Rule 2: keyword zero-conversion + spend>=5000 → pause_keyword', async () => {
      const row = baseTargetRow({
        targetType: 'keyword',
        keyword: 'K1',
        conversions: 0,
        spend: 8000,
        revenue: 0,
      });
      stubGenerate([row]);
      prisma.adAction.create.mockImplementation(({ data }: any) => ({ id: 'a1', ...data }));

      const result = await service.generateActions(companyA);

      expect(result.generated).toBe(1);
      expect(prisma.adAction.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            actionType: 'pause_keyword',
            targetType: 'keyword',
            priority: 'urgent',
            currentValue: null,
            proposedValue: null,
          }),
        }),
      );
    });

    it('Rule 2: keyword roas∈(0,100) → pause_keyword (grade=A → priority=high)', async () => {
      const row = baseTargetRow({
        targetType: 'keyword',
        keyword: 'K1',
        conversions: 1,
        spend: 2000,
        revenue: 1000, // ROAS = 50
        abcGrade: 'A',
      });
      stubGenerate([row]);
      prisma.adAction.create.mockImplementation(({ data }: any) => ({ id: 'a1', ...data }));

      await service.generateActions(companyA);

      expect(prisma.adAction.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            actionType: 'pause_keyword',
            priority: 'high',
          }),
        }),
      );
    });

    it('Rule 3: keyword roas∈[100,200) → change_bid (nextBid=round(current*0.85))', async () => {
      const row = baseTargetRow({
        targetType: 'keyword',
        keyword: 'K1',
        conversions: 5,
        spend: 10000,
        revenue: 15000, // ROAS = 150
        currentBid: 1000,
      });
      stubGenerate([row]);
      prisma.adAction.create.mockImplementation(({ data }: any) => ({ id: 'a1', ...data }));

      await service.generateActions(companyA);

      expect(prisma.adAction.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            actionType: 'change_bid',
            targetType: 'keyword',
            currentValue: 1000,
            proposedValue: 850,
          }),
        }),
      );
    });

    it('Rule 4: campaign grade=A + roas>=480 → change_daily_budget 확대 (nextBudget=round(current*1.2))', async () => {
      const row = baseTargetRow({
        dailyBudget: 10000,
        spend: 1000,
        revenue: 5000, // ROAS = 500
        abcGrade: 'A',
      });
      stubGenerate([row]);
      prisma.adAction.create.mockImplementation(({ data }: any) => ({ id: 'a1', ...data }));

      await service.generateActions(companyA);

      expect(prisma.adAction.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            actionType: 'change_daily_budget',
            targetType: 'campaign',
            priority: 'high',
            currentValue: 10000,
            proposedValue: 12000,
          }),
        }),
      );
    });

    it('Rule 5: campaign grade=C + dailyBudget>3000 → change_daily_budget 축소 (nextBudget=max(3000, round(current*0.5)))', async () => {
      const row = baseTargetRow({
        dailyBudget: 20000,
        spend: 10000,
        revenue: 8000, // ROAS = 80
        abcGrade: 'C',
      });
      stubGenerate([row]);
      prisma.adAction.create.mockImplementation(({ data }: any) => ({ id: 'a1', ...data }));

      await service.generateActions(companyA);

      expect(prisma.adAction.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            actionType: 'change_daily_budget',
            targetType: 'campaign',
            priority: 'high',
            currentValue: 20000,
            proposedValue: 10000,
          }),
        }),
      );
    });

    it('Rule 5 floor: when (current*0.5) < 3000, uses 3000 as floor', async () => {
      const row = baseTargetRow({
        dailyBudget: 5000,
        spend: 100,
        revenue: 50, // ROAS = 50
        abcGrade: 'B',
      });
      stubGenerate([row]);
      prisma.adAction.create.mockImplementation(({ data }: any) => ({ id: 'a1', ...data }));

      await service.generateActions(companyA);

      expect(prisma.adAction.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            actionType: 'change_daily_budget',
            currentValue: 5000,
            proposedValue: 3000,
          }),
        }),
      );
    });

    it('empty state — no target-daily rows returns generated=0 and explicit reason', async () => {
      stubGenerate([]);

      const result = await service.generateActions(companyA);

      expect(result.generated).toBe(0);
      expect(result.reason).toContain('일별 fact');
      expect(prisma.adAction.create).not.toHaveBeenCalled();
    });

    it('targetType filter — query covers campaign / keyword / product', async () => {
      stubGenerate([]);
      await service.generateActions(companyA);
      // First $queryRaw is the latest-target query — Prisma.sql tagged template
      // gets one argument (the SQL object). Just assert it was called.
      expect(prisma.$queryRaw).toHaveBeenCalled();
    });
  });

  describe('lifecycle methods — ADR-0006 + IDOR', () => {
    it('approveActions scopes by companyId — no cross-tenant approval', async () => {
      prisma.adAction.updateMany.mockResolvedValue({ count: 0 });
      prisma.adAction.findMany.mockResolvedValue([]);
      prisma.executionTask.findMany.mockResolvedValue([]);

      await service.approveActions(['id1', 'id2'], companyA);

      expect(prisma.adAction.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: { in: ['id1', 'id2'] }, companyId: companyA },
          data: expect.objectContaining({ approvalStatus: 'approved' }),
        }),
      );
    });

    it('markRunning throws NotFoundException when id crosses tenant', async () => {
      prisma.adAction.findFirst.mockResolvedValue(null);

      await expect(service.markRunning('other-tenant-id', undefined, companyA)).rejects.toThrow(NotFoundException);
      expect(prisma.adAction.update).not.toHaveBeenCalled();
    });

    it('markRunning updates executeStatus when id belongs to company', async () => {
      prisma.adAction.findFirst.mockResolvedValue({ id: 'a1', companyId: companyA });

      await service.markRunning('a1', { snapshot: 'before' }, companyA);

      expect(prisma.adAction.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'a1' },
          data: expect.objectContaining({
            executeStatus: 'running',
            beforeJson: { snapshot: 'before' },
            errorMessage: null,
          }),
        }),
      );
    });

    it('markDone updates executeStatus + executedAt + afterJson', async () => {
      prisma.adAction.findFirst.mockResolvedValue({ id: 'a1', companyId: companyA });

      await service.markDone('a1', { result: 'ok' }, companyA);

      expect(prisma.adAction.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'a1' },
          data: expect.objectContaining({
            executeStatus: 'done',
            afterJson: { result: 'ok' },
          }),
        }),
      );
      const call = prisma.adAction.update.mock.calls[0][0];
      expect(call.data.executedAt).toBeInstanceOf(Date);
    });

    it('markFailed throws NotFoundException for cross-tenant id', async () => {
      prisma.adAction.findFirst.mockResolvedValue(null);

      await expect(service.markFailed('other-tenant-id', '에러', undefined, companyA)).rejects.toThrow(NotFoundException);
    });

    it('resetFailed moves failed → queued scoped by companyId', async () => {
      prisma.adAction.findMany.mockResolvedValue([{ id: 'a1' }, { id: 'a2' }]);
      prisma.adAction.updateMany.mockResolvedValue({ count: 2 });
      prisma.executionTask.createMany.mockResolvedValue({ count: 2 });

      await service.resetFailed(companyB);

      expect(prisma.adAction.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            companyId: companyB,
            executeStatus: 'failed',
            approvalStatus: 'approved',
          }),
        }),
      );
      expect(prisma.adAction.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: { in: ['a1', 'a2'] }, companyId: companyB },
          data: expect.objectContaining({ executeStatus: 'queued' }),
        }),
      );
      expect(prisma.executionTask.createMany).toHaveBeenCalledWith({
        data: [
          { actionId: 'a1', status: 'queued' },
          { actionId: 'a2', status: 'queued' },
        ],
      });
    });
  });

  describe('getActions — companyId scope (H3)', () => {
    it('scopes all queries by companyId + summary metadata sourced from ChannelScrapeRun (not AdSnapshot)', async () => {
      prisma.adAction.findMany.mockResolvedValue([]);
      prisma.adAction.count.mockResolvedValue(0);
      prisma.channelScrapeRun.findFirst.mockResolvedValue({
        finishedAt: new Date('2026-04-27T00:00:00Z'),
        startedAt: new Date('2026-04-27T00:00:00Z'),
        pageType: 'campaign',
      });

      const result = await service.getActions({ limit: 10 }, companyA);

      expect(prisma.adAction.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { companyId: companyA },
          include: expect.objectContaining({
            listing: expect.any(Object),
            adTargetDaily: expect.any(Object),
          }),
        }),
      );
      expect(prisma.channelScrapeRun.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({ where: { companyId: companyA } }),
      );
      expect(result.summary.latestSnapshotPageType).toBe('campaign');
    });
  });
});
