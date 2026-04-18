import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NotFoundException } from '@nestjs/common';
import { AdActionService } from '../ad-action.service';

describe('AdActionService', () => {
  let service: AdActionService;
  let prisma: any;

  const companyA = 'company-a';
  const companyB = 'company-b';

  beforeEach(() => {
    prisma = {
      adAction: {
        findMany: vi.fn(),
        findFirst: vi.fn(),
        count: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
        updateMany: vi.fn(),
      },
      adSnapshot: {
        findFirst: vi.fn(),
        findMany: vi.fn(),
      },
      executionTask: {
        findMany: vi.fn(),
        createMany: vi.fn(),
        updateMany: vi.fn(),
      },
      $transaction: vi.fn((arg: any) => {
        if (typeof arg === 'function') return arg(prisma);
        return Promise.all(arg);
      }),
    };
    service = new AdActionService(prisma);
  });

  function baseSnapshot(overrides: Partial<any> = {}) {
    return {
      id: 's1',
      listingId: 'L1',
      pageType: 'campaign',
      externalId: 'EXT-1',
      campaignName: 'C1',
      keyword: null,
      productName: 'P1',
      status: 'active',
      currentBid: null,
      dailyBudget: 10000,
      impressions: 100,
      clicks: 10,
      conversions: 2,
      spend: 5000,
      revenue: 10000,
      roas: 200,
      ctr: 0.1,
      listing: {
        id: 'L1',
        externalId: 'EXT-1',
        channelName: 'Coupang',
        master: { id: 'M1', code: 'MC-001', name: '상품1', abcGrade: 'B', adTier: 'T2' },
      },
      option: {
        id: 'O1',
        sku: 'SKU-1',
        optionName: 'Opt1',
        availableStock: 100,
        costPrice: 3000,
        sellPrice: 10000,
        commissionRate: 0.1,
      },
      capturedAt: new Date(),
      ...overrides,
    };
  }

  describe('generateActions — 5 rules', () => {
    it('Rule 1: stock=0 campaign + dailyBudget > 0 → change_daily_budget urgent, proposedValue=3000', async () => {
      const snap = baseSnapshot({
        option: { ...baseSnapshot().option, availableStock: 0 },
      });
      prisma.adSnapshot.findMany.mockResolvedValue([snap]);
      prisma.adAction.findMany.mockResolvedValue([]);
      prisma.adAction.create.mockImplementation(({ data }: any) => ({ id: 'a1', ...data }));

      const result = await service.generateActions(companyA);

      expect(result.generated).toBe(1);
      expect(prisma.adAction.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            companyId: companyA,
            listingId: 'L1',
            actionType: 'change_daily_budget',
            targetType: 'campaign',
            priority: 'urgent',
            currentValue: 10000,
            proposedValue: 3000,
          }),
        }),
      );
    });

    it('Rule 1: skip when snapshot.option is null', async () => {
      const snap = baseSnapshot({ option: null });
      prisma.adSnapshot.findMany.mockResolvedValue([snap]);
      prisma.adAction.findMany.mockResolvedValue([]);

      const result = await service.generateActions(companyA);

      expect(result.generated).toBe(0);
      expect(prisma.adAction.create).not.toHaveBeenCalled();
    });

    it('Rule 2: keyword zero-conversion + spend>=5000 → pause_keyword', async () => {
      const snap = baseSnapshot({
        pageType: 'keyword',
        keyword: 'K1',
        conversions: 0,
        spend: 8000,
        roas: 0,
      });
      prisma.adSnapshot.findMany.mockResolvedValue([snap]);
      prisma.adAction.findMany.mockResolvedValue([]);
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
      const snap = baseSnapshot({
        pageType: 'keyword',
        keyword: 'K1',
        conversions: 1,
        spend: 2000,
        roas: 50,
        listing: {
          ...baseSnapshot().listing,
          master: { ...baseSnapshot().listing!.master, abcGrade: 'A' },
        },
      });
      prisma.adSnapshot.findMany.mockResolvedValue([snap]);
      prisma.adAction.findMany.mockResolvedValue([]);
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
      const snap = baseSnapshot({
        pageType: 'keyword',
        keyword: 'K1',
        conversions: 5,
        spend: 10000,
        revenue: 15000,
        roas: 150,
        currentBid: 1000,
      });
      prisma.adSnapshot.findMany.mockResolvedValue([snap]);
      prisma.adAction.findMany.mockResolvedValue([]);
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
      const snap = baseSnapshot({
        dailyBudget: 10000,
        roas: 500,
        listing: {
          ...baseSnapshot().listing,
          master: { ...baseSnapshot().listing!.master, abcGrade: 'A' },
        },
      });
      prisma.adSnapshot.findMany.mockResolvedValue([snap]);
      prisma.adAction.findMany.mockResolvedValue([]);
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
      const snap = baseSnapshot({
        dailyBudget: 20000,
        roas: 80,
        listing: {
          ...baseSnapshot().listing,
          master: { ...baseSnapshot().listing!.master, abcGrade: 'C' },
        },
      });
      prisma.adSnapshot.findMany.mockResolvedValue([snap]);
      prisma.adAction.findMany.mockResolvedValue([]);
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
      const snap = baseSnapshot({
        dailyBudget: 5000,
        roas: 50,
      });
      prisma.adSnapshot.findMany.mockResolvedValue([snap]);
      prisma.adAction.findMany.mockResolvedValue([]);
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

    it('filters out snapshots with null listingId (companyId scope)', async () => {
      prisma.adSnapshot.findMany.mockResolvedValue([]);
      prisma.adAction.findMany.mockResolvedValue([]);

      await service.generateActions(companyA);

      expect(prisma.adSnapshot.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            companyId: companyA,
            listingId: { not: null },
          }),
        }),
      );
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

  describe('getActions — companyId scope', () => {
    it('scopes all queries by companyId + hydrates listing + snapshot', async () => {
      prisma.adAction.findMany.mockResolvedValue([]);
      prisma.adAction.count.mockResolvedValue(0);
      prisma.adSnapshot.findFirst.mockResolvedValue(null);

      await service.getActions({ limit: 10 }, companyA);

      expect(prisma.adAction.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { companyId: companyA },
          include: expect.objectContaining({
            listing: expect.any(Object),
            snapshot: expect.any(Object),
          }),
        }),
      );
      expect(prisma.adSnapshot.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { companyId: companyA },
        }),
      );
    });
  });
});
