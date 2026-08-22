import { describe, expect, it, vi } from 'vitest';
import { RulesService } from '../services/rules.service';

const OPERATION = {
  id: '11111111-1111-1111-1111-111111111111',
  organizationId: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  operationKey: 'rules.evaluate',
  status: 'queued',
};

function makeService() {
  const prisma = {
    activityEvent: { createMany: vi.fn().mockResolvedValue({ count: 1 }) },
    alert: { createManyAndReturn: vi.fn().mockResolvedValue([]) },
    masterProduct: { updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
    $transaction: vi.fn().mockResolvedValue([]),
  };
  const operations = {
    start: vi.fn().mockResolvedValue(OPERATION),
    get: vi.fn().mockResolvedValue(OPERATION),
  };
  const judgment = { submit: vi.fn() };
  const events = { emit: vi.fn() };
  const alerts = {
    start: vi.fn().mockResolvedValue({}),
    succeed: vi.fn().mockResolvedValue({}),
    fail: vi.fn().mockResolvedValue({}),
  };
  return {
    service: new RulesService(
      prisma as never,
      operations as never,
      judgment as never,
      events as never,
      alerts as never,
    ),
    prisma,
    operations,
    judgment,
    events,
    alerts,
  };
}

describe('RulesService evaluation flow', () => {
  it('starts the Rules-owned deterministic operation with an actor-scoped idempotency key', async () => {
    const { service, operations, alerts } = makeService();

    await expect(service.evaluateAll(OPERATION.organizationId, 'user-1')).resolves.toEqual({
      operationId: OPERATION.id,
      status: 'queued',
    });

    expect(operations.start).toHaveBeenCalledWith({
      organizationId: OPERATION.organizationId,
      operationKey: 'rules.evaluate',
      triggerSource: 'dashboard',
      input: {},
      requestedByUserId: 'user-1',
      idempotencyKey: `rules.evaluation.manual:${OPERATION.organizationId}:user-1`,
    });
    expect(alerts.start).toHaveBeenCalledWith(expect.objectContaining({
      operationKey: `rules.evaluation:${OPERATION.id}`,
      sourceType: 'operation_run',
      sourceId: OPERATION.id,
      actorUserId: 'user-1',
    }));
  });

  it('applies a result only to a Rules operation in the same organization', async () => {
    const { service, operations, prisma, alerts } = makeService();
    const products = [{
      masterId: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
      healthScore: 24,
      violations: [{
        ruleName: 'margin', field: 'margin', severity: 'critical', category: 'profitability',
        message: 'Low margin', actionType: 'review', value: -5,
      }],
    }];

    await expect(service.apply({
      organizationId: OPERATION.organizationId,
      operationId: OPERATION.id,
      products,
    })).resolves.toEqual({ productCount: 1, violationCount: 1, criticalCount: 1 });

    expect(operations.get).toHaveBeenCalledWith(OPERATION.organizationId, OPERATION.id);
    expect(prisma.masterProduct.updateMany).toHaveBeenCalledWith({
      where: { id: products[0].masterId, organizationId: OPERATION.organizationId },
      data: expect.objectContaining({ healthScore: 24 }),
    });
    expect(alerts.succeed).toHaveBeenCalledWith(
      OPERATION.organizationId,
      `rules.evaluation:${OPERATION.id}`,
      expect.objectContaining({ metadata: { productCount: 1, violationCount: 1, criticalCount: 1 } }),
    );
  });

  it('rejects a result target that is not the Rules evaluation operation', async () => {
    const { service, operations, prisma } = makeService();
    operations.get.mockResolvedValue({ ...OPERATION, operationKey: 'products.recalculate' });

    await expect(service.apply({
      organizationId: OPERATION.organizationId,
      operationId: OPERATION.id,
      products: [],
    })).rejects.toThrow('Rules evaluation operation not found');

    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('fails the owner operation feedback and propagates result-write failures for retry', async () => {
    const { service, prisma, alerts } = makeService();
    prisma.$transaction.mockRejectedValue(new Error('write failed'));

    await expect(service.apply({
      organizationId: OPERATION.organizationId,
      operationId: OPERATION.id,
      products: [{ masterId: 'p1', healthScore: 1, violations: [] }],
    })).rejects.toThrow('write failed');

    expect(alerts.fail).toHaveBeenCalledWith(
      OPERATION.organizationId,
      `rules.evaluation:${OPERATION.id}`,
      { message: 'write failed' },
    );
  });

  it('uses the same owner-Operation idempotency key for an exact retry', async () => {
    const { service, operations } = makeService();

    await service.evaluateAll(OPERATION.organizationId, 'user-1');
    await service.evaluateAll(OPERATION.organizationId, 'user-1');

    expect(operations.start).toHaveBeenCalledTimes(2);
    expect(operations.start.mock.calls.map(([command]) => command.idempotencyKey)).toEqual([
      `rules.evaluation.manual:${OPERATION.organizationId}:user-1`,
      `rules.evaluation.manual:${OPERATION.organizationId}:user-1`,
    ]);
  });

  it('keeps a large critical-alert result to one panel summary emit', async () => {
    const { service, prisma, events } = makeService();
    const inserted = Array.from({ length: 51 }, (_, index) => ({
      id: `11111111-1111-1111-1111-${String(index).padStart(12, '0')}`,
      organizationId: OPERATION.organizationId,
      targetType: 'product', targetId: `product-${index}`, kind: 'signal', status: 'open',
      type: 'rule_violation', severity: 'critical', title: `Violation ${index}`, message: null,
      operationKey: null, sourceType: null, sourceId: null, actorUserId: null, href: null,
      progress: null, metadata: {}, isRead: false, readAt: null, actionTaskId: null,
      startedAt: null, finishedAt: null, createdAt: new Date(), updatedAt: new Date(),
    }));
    prisma.alert.createManyAndReturn.mockResolvedValue(inserted);

    await service.apply({
      organizationId: OPERATION.organizationId,
      operationId: OPERATION.id,
      products: Array.from({ length: 51 }, (_, index) => ({
        masterId: `product-${index}`, healthScore: 1,
        violations: [{
          ruleName: 'margin', field: 'margin', severity: 'critical', category: 'profitability',
          message: `Violation ${index}`, actionType: null, value: -1,
        }],
      })),
    });

    expect(events.emit).toHaveBeenCalledTimes(1);
    expect(events.emit.mock.calls[0][1].item).toEqual(expect.objectContaining({
      type: 'batch_summary', title: '51건의 새 알림',
    }));
  });

  it('submits threshold judgment through the owner-local port and returns canonical resources', async () => {
    const { service, judgment, alerts } = makeService();
    const submission = {
      session: 'organizations/org/agentSessions/session',
      task: 'organizations/org/agentSessions/session/tasks/task',
      execution: 'organizations/org/agentSessions/session/executions/execution',
      operation: 'organizations/org/operations/operation',
    };
    judgment.submit.mockResolvedValue(submission);

    await expect(service.suggestThresholds('org', 'user')).resolves.toEqual({
      ...submission,
      status: 'pending',
    });
    expect(judgment.submit).toHaveBeenCalledWith({
      organizationId: 'org',
      actorUserId: 'user',
      objective: 'Suggest business-rule thresholds using the organization data.',
      idempotencyKey: 'rules.suggest.manual:org:user',
    });
    expect(alerts.start).toHaveBeenCalledWith(expect.objectContaining({
      sourceType: 'operation_run', sourceId: submission.operation,
    }));
  });
});
