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

    await expect(service.evaluateAll(OPERATION.organizationId, 'user-1', 'request-1')).resolves.toEqual({
      operationId: OPERATION.id,
      status: 'queued',
    });

    expect(operations.start).toHaveBeenCalledWith({
      organizationId: OPERATION.organizationId,
      operationKey: 'rules.evaluate',
      triggerSource: 'dashboard',
      input: {},
      requestedByUserId: 'user-1',
      idempotencyKey: 'rules.evaluation.manual:user-1:request-1',
    });
    expect(alerts.start).toHaveBeenCalledWith(expect.objectContaining({
      operationKey: `rules.evaluation:${OPERATION.id}`,
      sourceType: 'operation_run',
      sourceId: `organizations/${OPERATION.organizationId}/operations/${OPERATION.id}`,
      actorUserId: 'user-1',
    }));
  });

  it('uses the same owner-Operation idempotency key for an exact retry', async () => {
    const { service, operations } = makeService();

    await service.evaluateAll(OPERATION.organizationId, 'user-1', 'request-retry');
    await service.evaluateAll(OPERATION.organizationId, 'user-1', 'request-retry');

    expect(operations.start).toHaveBeenCalledTimes(2);
    expect(operations.start.mock.calls.map(([command]) => command.idempotencyKey)).toEqual([
      'rules.evaluation.manual:user-1:request-retry',
      'rules.evaluation.manual:user-1:request-retry',
    ]);
  });

  it('starts new work for a distinct manual action key', async () => {
    const { service, operations } = makeService();

    await service.evaluateAll(OPERATION.organizationId, 'user-1', 'request-a');
    await service.evaluateAll(OPERATION.organizationId, 'user-1', 'request-b');

    expect(operations.start.mock.calls.map(([command]) => command.idempotencyKey)).toEqual([
      'rules.evaluation.manual:user-1:request-a',
      'rules.evaluation.manual:user-1:request-b',
    ]);
  });

});
