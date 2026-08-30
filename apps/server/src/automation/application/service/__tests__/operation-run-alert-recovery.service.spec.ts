import { describe, expect, it, vi } from 'vitest';
import { OperationRunAlertRecoveryService } from '../operation-run-alert-recovery.service';

describe('OperationRunAlertRecoveryService', () => {
  it('reconciles every open canonical Operation alert after an event-loss restart', async () => {
    const open = [
      {
        id: 'alert-1',
        organizationId: '11111111-1111-4111-8111-111111111111',
        sourceType: 'operation_run',
        sourceId:
          'organizations/11111111-1111-4111-8111-111111111111/operations/22222222-2222-4222-8222-222222222222',
      },
      {
        id: 'alert-2',
        organizationId: '11111111-1111-4111-8111-111111111111',
        sourceType: 'operation_run',
        sourceId:
          'organizations/11111111-1111-4111-8111-111111111111/operations/33333333-3333-4333-8333-333333333333',
      },
    ];
    const repository = {
      listOpenBySourceType: vi
        .fn()
        .mockResolvedValueOnce(open)
        .mockResolvedValueOnce([]),
    };
    const alerts = { reconcileSource: vi.fn().mockResolvedValue(undefined) };
    const hooks = { register: vi.fn() };
    const recovery = new OperationRunAlertRecoveryService(
      repository as never,
      alerts as never,
      hooks as never,
    );

    recovery.onModuleInit();
    const hook = hooks.register.mock.calls[0]?.[0];
    expect(hook).toMatchObject({ key: 'operation-run-alerts', priority: 40 });
    await hook.run(new AbortController().signal);

    expect(alerts.reconcileSource).toHaveBeenCalledTimes(2);
    expect(alerts.reconcileSource).toHaveBeenNthCalledWith(1, open[0]);
    expect(alerts.reconcileSource).toHaveBeenNthCalledWith(2, open[1]);
  });

  it('preserves lifecycle aborts while scanning', async () => {
    const reason = new Error('server_stopping');
    const controller = new AbortController();
    const repository = {
      listOpenBySourceType: vi.fn().mockImplementation(async () => {
        controller.abort(reason);
        return [];
      }),
    };
    const recovery = new OperationRunAlertRecoveryService(
      repository as never,
      { reconcileSource: vi.fn() } as never,
      { register: vi.fn() } as never,
    );

    await expect(recovery.run(controller.signal)).rejects.toBe(reason);
  });
});
