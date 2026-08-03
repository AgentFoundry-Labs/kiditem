import { describe, expect, it, vi } from 'vitest';
import { CHANNELS_OPERATIONS } from '../../../../domain/operation/channels.operations';
import { CoupangRocketPurchaseOrderOperationHandler } from '../coupang-rocket-purchase-order.operation-handler';

describe('CoupangRocketPurchaseOrderOperationHandler', () => {
  it('registers the schedulable Rocket browser operation', async () => {
    const registry = { register: vi.fn() };
    const handler = new CoupangRocketPurchaseOrderOperationHandler(registry as never);

    handler.onModuleInit();

    await expect(handler.execute({} as never)).resolves.toEqual({
      kind: 'waiting_runtime',
    });
    expect(registry.register).toHaveBeenCalledWith(CHANNELS_OPERATIONS[0], handler);
    expect(CHANNELS_OPERATIONS[0]).toMatchObject({
      key: 'channels.collect_coupang_rocket_purchase_orders',
      ownerDomain: 'channels',
      engineType: 'browser',
      scheduleSupported: true,
    });
  });
});
