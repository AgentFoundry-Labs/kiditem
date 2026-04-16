import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NotFoundException, ConflictException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AlertsService } from '../services/alerts.service';
import { PANEL_EVENTS } from '../../panel/events/panel-events';

const COMPANY_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const ALERT_ID = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const TASK_ID = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
const USER_ID = 'dddddddd-dddd-dddd-dddd-dddddddddddd';

const BASE_ALERT = {
  id: ALERT_ID,
  companyId: COMPANY_ID,
  productId: null,
  type: 'strategy_change',
  severity: 'critical',
  title: 'Test alert',
  message: 'Something is wrong',
  isRead: false,
  actionTaskId: null,
  createdAt: new Date('2026-04-16T00:00:00Z'),
};

const BASE_TASK = {
  id: TASK_ID,
  companyId: COMPANY_ID,
  taskKey: `promoted:${ALERT_ID}`,
  type: 'human',
  label: 'Test alert',
  detail: 'Something is wrong',
  priority: 'urgent',
  role: 'ad',
  status: 'pending',
  date: new Date('2026-04-15T15:00:00Z'),
  assigneeUserId: USER_ID,
  where: null,
  href: null,
  apiCall: null,
  notes: [],
  activityLog: [],
  result: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

function makePrisma() {
  return {
    alert: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
    },
    actionTask: {
      create: vi.fn(),
      delete: vi.fn(),
    },
    $transaction: vi.fn(),
  };
}

function makeEventEmitter() {
  return { emit: vi.fn() };
}

function makeService() {
  const prisma = makePrisma();
  const eventEmitter = makeEventEmitter();
  const service = new AlertsService(prisma as any, eventEmitter as any);
  return { service, prisma, eventEmitter };
}

// Helper: wire $transaction to run the callback with a tx mock
function mockTransaction(
  prisma: ReturnType<typeof makePrisma>,
  txOverrides: Partial<ReturnType<typeof makePrisma>> = {},
) {
  const tx = { ...prisma, ...txOverrides };
  prisma.$transaction.mockImplementation((cb: (tx: any) => Promise<any>) => cb(tx));
  return tx;
}

describe('AlertsService.promote', () => {
  describe('happy path', () => {
    it('creates actionTask + updates alert + emits panel event', async () => {
      const { service, prisma, eventEmitter } = makeService();
      const tx = mockTransaction(prisma);

      tx.alert.findFirst = vi.fn().mockResolvedValue(BASE_ALERT);
      tx.actionTask.create = vi.fn().mockResolvedValue(BASE_TASK);
      tx.alert.updateMany = vi.fn().mockResolvedValue({ count: 1 });

      const result = await service.promote(ALERT_ID, COMPANY_ID, {}, USER_ID);

      expect(tx.actionTask.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            companyId: COMPANY_ID,
            taskKey: `promoted:${ALERT_ID}`,
            priority: 'urgent', // critical → urgent
            role: 'ad',         // strategy_change → ad
            status: 'pending',
            assigneeUserId: null, // unassigned — Task 32 claim/unclaim sets this
          }),
        }),
      );
      expect(tx.alert.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            id: ALERT_ID,
            companyId: COMPANY_ID,
            actionTaskId: null,
          }),
          data: { actionTaskId: TASK_ID },
        }),
      );
      expect(eventEmitter.emit).toHaveBeenCalledWith(
        PANEL_EVENTS.UPSERT,
        expect.objectContaining({ companyId: COMPANY_ID }),
      );
      expect(result.task).toEqual(BASE_TASK);
      expect(result.updatedAlert.actionTaskId).toBe(TASK_ID);
    });
  });

  describe('unassigned initial state (Task 32 claim design)', () => {
    it('creates task with assigneeUserId=null regardless of who calls promote', async () => {
      const { service, prisma } = makeService();
      const tx = mockTransaction(prisma);

      tx.alert.findFirst = vi.fn().mockResolvedValue(BASE_ALERT);
      tx.actionTask.create = vi.fn().mockResolvedValue(BASE_TASK);
      tx.alert.updateMany = vi.fn().mockResolvedValue({ count: 1 });

      // currentUserId passed but must NOT be auto-assigned (Task 32 claim/unclaim sets this)
      await service.promote(ALERT_ID, COMPANY_ID, {}, USER_ID);

      expect(tx.actionTask.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ assigneeUserId: null }),
        }),
      );
    });
  });

  describe('already promoted', () => {
    it('throws ConflictException when alert.actionTaskId is set, no emit', async () => {
      const { service, prisma, eventEmitter } = makeService();
      const tx = mockTransaction(prisma);

      tx.alert.findFirst = vi.fn().mockResolvedValue({
        ...BASE_ALERT,
        actionTaskId: TASK_ID,
      });

      await expect(service.promote(ALERT_ID, COMPANY_ID, {}, USER_ID)).rejects.toThrow(
        ConflictException,
      );
      expect(eventEmitter.emit).not.toHaveBeenCalled();
    });
  });

  describe('alert not found', () => {
    it('throws NotFoundException when alert does not exist for companyId', async () => {
      const { service, prisma } = makeService();
      const tx = mockTransaction(prisma);

      tx.alert.findFirst = vi.fn().mockResolvedValue(null);

      await expect(service.promote(ALERT_ID, COMPANY_ID, {}, USER_ID)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('P2002 on actionTask.create', () => {
    it('translates Prisma P2002 to ConflictException with race message', async () => {
      const { service, prisma, eventEmitter } = makeService();
      const tx = mockTransaction(prisma);

      tx.alert.findFirst = vi.fn().mockResolvedValue(BASE_ALERT);
      const p2002 = new Prisma.PrismaClientKnownRequestError('Unique constraint', {
        code: 'P2002',
        clientVersion: '5.0.0',
      });
      tx.actionTask.create = vi.fn().mockRejectedValue(p2002);

      await expect(service.promote(ALERT_ID, COMPANY_ID, {}, USER_ID)).rejects.toThrow(
        new ConflictException('Already promoted (race)'),
      );
      expect(eventEmitter.emit).not.toHaveBeenCalled();
    });

    it('re-throws non-P2002 Prisma errors', async () => {
      const { service, prisma } = makeService();
      const tx = mockTransaction(prisma);

      tx.alert.findFirst = vi.fn().mockResolvedValue(BASE_ALERT);
      const p2003 = new Prisma.PrismaClientKnownRequestError('Foreign key violation', {
        code: 'P2003',
        clientVersion: '5.0.0',
      });
      tx.actionTask.create = vi.fn().mockRejectedValue(p2003);

      await expect(service.promote(ALERT_ID, COMPANY_ID, {}, USER_ID)).rejects.toThrow(p2003);
    });
  });

  describe('updateMany count=0 (extreme race)', () => {
    it('deletes task + throws ConflictException, no emit', async () => {
      const { service, prisma, eventEmitter } = makeService();
      const tx = mockTransaction(prisma);

      tx.alert.findFirst = vi.fn().mockResolvedValue(BASE_ALERT);
      tx.actionTask.create = vi.fn().mockResolvedValue(BASE_TASK);
      tx.alert.updateMany = vi.fn().mockResolvedValue({ count: 0 });
      tx.actionTask.delete = vi.fn().mockResolvedValue(BASE_TASK);

      await expect(service.promote(ALERT_ID, COMPANY_ID, {}, USER_ID)).rejects.toThrow(
        new ConflictException('Already promoted (race)'),
      );
      expect(tx.actionTask.delete).toHaveBeenCalledWith({ where: { id: TASK_ID } });
      expect(eventEmitter.emit).not.toHaveBeenCalled();
    });
  });

  describe('emit failure', () => {
    it('does not throw when panel emit fails — core path is unaffected', async () => {
      const { service, prisma, eventEmitter } = makeService();
      const tx = mockTransaction(prisma);

      tx.alert.findFirst = vi.fn().mockResolvedValue(BASE_ALERT);
      tx.actionTask.create = vi.fn().mockResolvedValue(BASE_TASK);
      tx.alert.updateMany = vi.fn().mockResolvedValue({ count: 1 });
      eventEmitter.emit.mockImplementation(() => {
        throw new Error('SSE bus down');
      });

      // Should resolve successfully despite emit throwing
      const result = await service.promote(ALERT_ID, COMPANY_ID, {}, USER_ID);
      expect(result.task).toEqual(BASE_TASK);
    });
  });

  describe('emit order — after transaction', () => {
    it('emit is called AFTER $transaction resolves', async () => {
      const { service, prisma, eventEmitter } = makeService();
      const callOrder: string[] = [];

      prisma.$transaction.mockImplementation(async (cb: (tx: any) => Promise<any>) => {
        const tx = {
          ...prisma,
          alert: { ...prisma.alert, findFirst: vi.fn().mockResolvedValue(BASE_ALERT), updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
          actionTask: { create: vi.fn().mockResolvedValue(BASE_TASK), delete: vi.fn() },
        };
        const result = await cb(tx);
        callOrder.push('$transaction_resolved');
        return result;
      });
      eventEmitter.emit.mockImplementation(() => {
        callOrder.push('emit_called');
      });

      await service.promote(ALERT_ID, COMPANY_ID, {}, USER_ID);

      expect(callOrder).toEqual(['$transaction_resolved', 'emit_called']);
    });
  });

  describe('severity → priority mapping', () => {
    const cases: [string, 'urgent' | 'high' | 'medium'][] = [
      ['critical', 'urgent'],
      ['error', 'high'],
      ['warning', 'medium'],
      ['info', 'medium'],
      ['unknown_severity', 'medium'], // fallback
    ];

    for (const [severity, expectedPriority] of cases) {
      it(`severity=${severity} → priority=${expectedPriority}`, async () => {
        const { service, prisma } = makeService();
        const tx = mockTransaction(prisma);

        tx.alert.findFirst = vi.fn().mockResolvedValue({ ...BASE_ALERT, severity });
        tx.actionTask.create = vi.fn().mockResolvedValue({ ...BASE_TASK, priority: expectedPriority });
        tx.alert.updateMany = vi.fn().mockResolvedValue({ count: 1 });

        await service.promote(ALERT_ID, COMPANY_ID, {}, USER_ID);

        expect(tx.actionTask.create).toHaveBeenCalledWith(
          expect.objectContaining({
            data: expect.objectContaining({ priority: expectedPriority }),
          }),
        );
      });
    }
  });

  describe('DTO overrides', () => {
    it('uses priorityOverride from dto instead of severity mapping', async () => {
      const { service, prisma } = makeService();
      const tx = mockTransaction(prisma);

      tx.alert.findFirst = vi.fn().mockResolvedValue({ ...BASE_ALERT, severity: 'critical' });
      tx.actionTask.create = vi.fn().mockResolvedValue(BASE_TASK);
      tx.alert.updateMany = vi.fn().mockResolvedValue({ count: 1 });

      await service.promote(ALERT_ID, COMPANY_ID, { priorityOverride: 'medium' }, USER_ID);

      expect(tx.actionTask.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ priority: 'medium' }),
        }),
      );
    });

    it('uses roleOverride from dto instead of type mapping', async () => {
      const { service, prisma } = makeService();
      const tx = mockTransaction(prisma);

      tx.alert.findFirst = vi.fn().mockResolvedValue(BASE_ALERT);
      tx.actionTask.create = vi.fn().mockResolvedValue(BASE_TASK);
      tx.alert.updateMany = vi.fn().mockResolvedValue({ count: 1 });

      await service.promote(ALERT_ID, COMPANY_ID, { roleOverride: 'inventory' }, USER_ID);

      expect(tx.actionTask.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ role: 'inventory' }),
        }),
      );
    });
  });

  describe('company scope (IDOR regression)', () => {
    it('findFirst and updateMany both include companyId', async () => {
      const { service, prisma } = makeService();
      const tx = mockTransaction(prisma);

      tx.alert.findFirst = vi.fn().mockResolvedValue(BASE_ALERT);
      tx.actionTask.create = vi.fn().mockResolvedValue(BASE_TASK);
      tx.alert.updateMany = vi.fn().mockResolvedValue({ count: 1 });

      await service.promote(ALERT_ID, COMPANY_ID, {}, USER_ID);

      // findFirst MUST have companyId
      expect(tx.alert.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ companyId: COMPANY_ID }) }),
      );

      // updateMany MUST have companyId
      expect(tx.alert.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ companyId: COMPANY_ID }) }),
      );
    });
  });
});

describe('AlertsService.dismiss', () => {
  describe('happy path', () => {
    it('calls updateMany with isRead=true and emits DISMISS event', async () => {
      const { service, prisma, eventEmitter } = makeService();
      prisma.alert.updateMany.mockResolvedValue({ count: 1 });

      await service.dismiss(ALERT_ID, COMPANY_ID);

      expect(prisma.alert.updateMany).toHaveBeenCalledWith({
        where: { id: ALERT_ID, companyId: COMPANY_ID },
        data: { isRead: true },
      });
      expect(eventEmitter.emit).toHaveBeenCalledWith(
        PANEL_EVENTS.DISMISS,
        { itemId: ALERT_ID, companyId: COMPANY_ID },
      );
    });
  });

  describe('not found', () => {
    it('throws NotFoundException when count=0', async () => {
      const { service, prisma, eventEmitter } = makeService();
      prisma.alert.updateMany.mockResolvedValue({ count: 0 });

      await expect(service.dismiss(ALERT_ID, COMPANY_ID)).rejects.toThrow(NotFoundException);
      expect(eventEmitter.emit).not.toHaveBeenCalled();
    });
  });

  describe('emit failure', () => {
    it('does not throw when DISMISS emit fails', async () => {
      const { service, prisma, eventEmitter } = makeService();
      prisma.alert.updateMany.mockResolvedValue({ count: 1 });
      eventEmitter.emit.mockImplementation(() => {
        throw new Error('SSE bus down');
      });

      // Should resolve without throwing
      await expect(service.dismiss(ALERT_ID, COMPANY_ID)).resolves.toBeUndefined();
    });
  });

  describe('company scope (IDOR regression)', () => {
    it('updateMany where clause includes companyId', async () => {
      const { service, prisma } = makeService();
      prisma.alert.updateMany.mockResolvedValue({ count: 1 });

      await service.dismiss(ALERT_ID, COMPANY_ID);

      expect(prisma.alert.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ companyId: COMPANY_ID }),
        }),
      );
    });
  });
});
