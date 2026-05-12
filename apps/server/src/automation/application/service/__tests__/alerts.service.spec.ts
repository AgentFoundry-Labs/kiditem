import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NotFoundException, ConflictException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AlertsService, type PromoteAlertInput } from '../alerts.service';
import { AlertsRepositoryAdapter } from '../../../adapter/out/repository/alerts.repository.adapter';
import { PANEL_EVENTS } from '../../../adapter/out/panel-event/panel-events';

const ORGANIZATION_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const ALERT_ID = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const TASK_ID = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
const USER_ID = 'dddddddd-dddd-dddd-dddd-dddddddddddd';

const BASE_ALERT = {
  id: ALERT_ID,
  organizationId: ORGANIZATION_ID,
  targetType: null,
  targetId: null,
  kind: 'signal',
  status: 'open',
  type: 'strategy_change',
  severity: 'critical',
  title: 'Test alert',
  message: 'Something is wrong',
  operationKey: null,
  sourceType: null,
  sourceId: null,
  actorUserId: null,
  href: null,
  progress: null,
  metadata: {},
  isRead: false,
  readAt: null,
  actionTaskId: null,
  startedAt: null,
  finishedAt: null,
  createdAt: new Date('2026-04-16T00:00:00Z'),
  updatedAt: new Date('2026-04-16T00:00:00Z'),
};

const BASE_TASK = {
  id: TASK_ID,
  organizationId: ORGANIZATION_ID,
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
      findFirst: vi.fn().mockResolvedValue(null),
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
  const repository = new AlertsRepositoryAdapter(prisma as any);
  const service = new AlertsService(repository, eventEmitter as any);
  return { service, prisma, eventEmitter, repository };
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
    // Covers: actionTask create + alert update + panel emit + IDOR organization scope
    // + Task 32 unassigned initial state (assigneeUserId=null despite USER_ID passed)
    it('creates actionTask + updates alert + emits panel event (IDOR scope + unassigned)', async () => {
      const { service, prisma, eventEmitter } = makeService();
      const tx = mockTransaction(prisma);

      tx.alert.findFirst = vi.fn().mockResolvedValue(BASE_ALERT);
      tx.actionTask.create = vi.fn().mockResolvedValue(BASE_TASK);
      tx.alert.updateMany = vi.fn().mockResolvedValue({ count: 1 });

      const result = await service.promote(ALERT_ID, ORGANIZATION_ID, {}, USER_ID);

      // findFirst + updateMany 둘 다 organizationId 포함 (IDOR 방어)
      expect(tx.alert.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ organizationId: ORGANIZATION_ID }) }),
      );
      expect(tx.actionTask.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            organizationId: ORGANIZATION_ID,
            taskKey: `promoted:${ALERT_ID}`,
            priority: 'urgent', // critical → urgent
            role: 'ad',         // strategy_change → ad
            status: 'pending',
            assigneeUserId: null, // Task 32: unassigned regardless of USER_ID
          }),
        }),
      );
      expect(tx.alert.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            id: ALERT_ID,
            organizationId: ORGANIZATION_ID,
            actionTaskId: null,
          }),
          data: { actionTaskId: TASK_ID },
        }),
      );
      expect(eventEmitter.emit).toHaveBeenCalledWith(
        PANEL_EVENTS.UPSERT,
        expect.objectContaining({ organizationId: ORGANIZATION_ID }),
      );
      expect(result.task).toEqual(BASE_TASK);
      expect(result.updatedAlert.actionTaskId).toBe(TASK_ID);
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

      await expect(service.promote(ALERT_ID, ORGANIZATION_ID, {}, USER_ID)).rejects.toThrow(
        ConflictException,
      );
      expect(eventEmitter.emit).not.toHaveBeenCalled();
    });
  });

  describe('alert not found', () => {
    it('throws NotFoundException when alert does not exist for organizationId', async () => {
      const { service, prisma } = makeService();
      const tx = mockTransaction(prisma);

      tx.alert.findFirst = vi.fn().mockResolvedValue(null);

      await expect(service.promote(ALERT_ID, ORGANIZATION_ID, {}, USER_ID)).rejects.toThrow(
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

      await expect(service.promote(ALERT_ID, ORGANIZATION_ID, {}, USER_ID)).rejects.toThrow(
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

      await expect(service.promote(ALERT_ID, ORGANIZATION_ID, {}, USER_ID)).rejects.toThrow(p2003);
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

      await expect(service.promote(ALERT_ID, ORGANIZATION_ID, {}, USER_ID)).rejects.toThrow(
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
      const result = await service.promote(ALERT_ID, ORGANIZATION_ID, {}, USER_ID);
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

      await service.promote(ALERT_ID, ORGANIZATION_ID, {}, USER_ID);

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

        await service.promote(ALERT_ID, ORGANIZATION_ID, {}, USER_ID);

        expect(tx.actionTask.create).toHaveBeenCalledWith(
          expect.objectContaining({
            data: expect.objectContaining({ priority: expectedPriority }),
          }),
        );
      });
    }
  });

  describe('PromoteAlertInput overrides', () => {
    it.each([
      ['priorityOverride', { priorityOverride: 'medium' } as PromoteAlertInput, 'priority', 'medium'],
      ['roleOverride', { roleOverride: 'inventory' } as PromoteAlertInput, 'role', 'inventory'],
    ])('uses %s from input instead of severity/type mapping', async (_label, input, field, expected) => {
      const { service, prisma } = makeService();
      const tx = mockTransaction(prisma);

      tx.alert.findFirst = vi.fn().mockResolvedValue({ ...BASE_ALERT, severity: 'critical' });
      tx.actionTask.create = vi.fn().mockResolvedValue(BASE_TASK);
      tx.alert.updateMany = vi.fn().mockResolvedValue({ count: 1 });

      await service.promote(ALERT_ID, ORGANIZATION_ID, input, USER_ID);

      expect(tx.actionTask.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ [field]: expected }),
        }),
      );
    });
  });
});

describe('AlertsService.markAsRead', () => {
  it('updates and re-reads the alert in tenant scope', async () => {
    const { service, prisma } = makeService();
    prisma.alert.updateMany.mockResolvedValue({ count: 1 });
    prisma.alert.findFirst.mockResolvedValue({ ...BASE_ALERT, isRead: true });

    const result = await service.markAsRead(ALERT_ID, ORGANIZATION_ID);

    expect(prisma.alert.updateMany).toHaveBeenCalledWith({
      where: { id: ALERT_ID, organizationId: ORGANIZATION_ID },
      data: { isRead: true, readAt: expect.any(Date) },
    });
    expect(prisma.alert.findFirst).toHaveBeenCalledWith({
      where: { id: ALERT_ID, organizationId: ORGANIZATION_ID },
    });
    expect(result).toEqual({ ...BASE_ALERT, isRead: true });
  });

  it('rejects a cross-organization alert id without a bare update', async () => {
    const { service, prisma } = makeService();
    prisma.alert.findUnique.mockResolvedValue({ ...BASE_ALERT, organizationId: 'other-organization' });
    prisma.alert.updateMany.mockResolvedValue({ count: 0 });

    await expect(service.markAsRead(ALERT_ID, ORGANIZATION_ID)).rejects.toThrow(NotFoundException);
    expect(prisma.alert.updateMany).toHaveBeenCalledWith({
      where: { id: ALERT_ID, organizationId: ORGANIZATION_ID },
      data: { isRead: true, readAt: expect.any(Date) },
    });
    expect(prisma.alert.update).not.toHaveBeenCalled();
  });
});

describe('AlertsService.dismiss', () => {
  describe('happy path', () => {
    it('calls updateMany with isRead=true and emits DISMISS event', async () => {
      const { service, prisma, eventEmitter } = makeService();
      prisma.alert.updateMany.mockResolvedValue({ count: 1 });

      await service.dismiss(ALERT_ID, ORGANIZATION_ID);

      expect(prisma.alert.updateMany).toHaveBeenCalledWith({
        where: { id: ALERT_ID, organizationId: ORGANIZATION_ID },
        data: { isRead: true, readAt: expect.any(Date) },
      });
      expect(eventEmitter.emit).toHaveBeenCalledWith(
        PANEL_EVENTS.DISMISS,
        { itemId: ALERT_ID, organizationId: ORGANIZATION_ID },
      );
    });
  });

  describe('not found', () => {
    it('throws NotFoundException when count=0', async () => {
      const { service, prisma, eventEmitter } = makeService();
      prisma.alert.updateMany.mockResolvedValue({ count: 0 });

      await expect(service.dismiss(ALERT_ID, ORGANIZATION_ID)).rejects.toThrow(NotFoundException);
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
      await expect(service.dismiss(ALERT_ID, ORGANIZATION_ID)).resolves.toBeUndefined();
    });
  });

  // organization scope (IDOR) 는 happy path 의 updateMany assertion 에서 organizationId 포함
  // 확인 → 중복 제거
});
