import { describe, expect, it, vi } from 'vitest';
import { OperationRunOperationAlertBridge } from '../operation-run-operation-alert.bridge';

describe('OperationRunOperationAlertBridge', () => {
  it.each([
    ['succeeded', 'succeeded'],
    ['failed', 'failed'],
    ['cancelled', 'cancelled'],
  ] as const)('closes canonical Operation feedback after %s', async (status, expected) => {
    const alerts = { closeBySource: vi.fn().mockResolvedValue({}) };
    const bridge = new OperationRunOperationAlertBridge(alerts as never);

    await bridge.onOperationRunFinalized({
      organizationId: '11111111-1111-4111-8111-111111111111',
      runId: '22222222-2222-4222-8222-222222222222',
      status,
      errorCode: status === 'failed' ? 'operation_failed' : null,
      errorMessage: status === 'failed' ? 'Operation failed' : null,
    });

    expect(alerts.closeBySource).toHaveBeenCalledWith(
      '11111111-1111-4111-8111-111111111111',
      'operation_run',
      'organizations/11111111-1111-4111-8111-111111111111/operations/22222222-2222-4222-8222-222222222222',
      expected,
      status === 'failed'
        ? { message: 'Operation failed', metadata: { errorCode: 'operation_failed' } }
        : { metadata: {} },
    );
  });
});
