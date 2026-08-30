import { describe, expect, it, vi } from 'vitest';
import type { OperationHandlerContext } from '../../../../../common/operation-definition';
import { INVENTORY_OPERATIONS } from '../../../../domain/operation/inventory.operations';
import { CoupangShipmentSummaryOperationHandler } from '../coupang-shipment-summary.operation-handler';

const context: OperationHandlerContext = {
  runId: 'run-1',
  organizationId: 'org-1',
  operationKey: 'inventory.collect_coupang_shipment_summary',
  triggerSource: 'schedule',
  input: {},
  requestedByUserId: null,
  scheduleId: null,
  parentRunId: null,
  attemptToken: 'attempt-1',
  signal: new AbortController().signal,
  checkpoint: vi.fn().mockResolvedValue(undefined),
};

describe('CoupangShipmentSummaryOperationHandler', () => {
  it('registers the schedulable Coupang shipment query browser operation', async () => {
    const registry = { register: vi.fn() };
    const handler = new CoupangShipmentSummaryOperationHandler(registry as never);

    handler.onModuleInit();

    await expect(handler.execute(context)).resolves.toEqual({
      kind: 'waiting_runtime',
    });
    expect(registry.register).toHaveBeenCalledWith(INVENTORY_OPERATIONS[1], handler);
    expect(INVENTORY_OPERATIONS[1]).toMatchObject({
      key: 'inventory.collect_coupang_shipment_summary',
      ownerDomain: 'inventory',
      engineType: 'browser',
      scheduleSupported: true,
    });
  });
});
