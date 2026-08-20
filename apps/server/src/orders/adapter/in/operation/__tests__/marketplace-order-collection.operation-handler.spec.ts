import { describe, expect, it, vi } from 'vitest';
import type { OperationHandlerContext } from '../../../../../common/operation-definition';
import { ORDERS_OPERATIONS } from '../../../../domain/operation/orders.operations';
import { MarketplaceOrderCollectionOperationHandler } from '../marketplace-order-collection.operation-handler';

const context: OperationHandlerContext = {
  runId: 'run-1',
  organizationId: 'org-1',
  operationKey: 'orders.collect_all_marketplace_orders',
  triggerSource: 'schedule',
  input: {},
  requestedByUserId: null,
  scheduleId: null,
  parentRunId: null,
  attemptToken: 'attempt-1',
  signal: new AbortController().signal,
  checkpoint: vi.fn().mockResolvedValue(undefined),
};

describe('MarketplaceOrderCollectionOperationHandler', () => {
  it('registers the schedulable all-marketplace browser operation', async () => {
    const registry = { register: vi.fn() };
    const handler = new MarketplaceOrderCollectionOperationHandler(registry as never);

    handler.onModuleInit();

    await expect(handler.execute(context)).resolves.toEqual({
      kind: 'waiting_runtime',
    });
    expect(registry.register).toHaveBeenCalledWith(ORDERS_OPERATIONS[0], handler);
    expect(ORDERS_OPERATIONS[0]).toMatchObject({
      key: 'orders.collect_all_marketplace_orders',
      ownerDomain: 'orders',
      engineType: 'browser',
      scheduleSupported: true,
    });
  });
});
