import { describe, expect, it, vi } from 'vitest';
import { SellpiaInventoryOperationHandler } from '../sellpia-inventory.operation-handler';
import { INVENTORY_OPERATIONS } from '../../../../domain/operation/inventory.operations';

describe('SellpiaInventoryOperationHandler', () => {
  it('registers a browser operation and hands the run to the browser runtime', async () => {
    const registry = { register: vi.fn() };
    const freshness = { requestRefresh: vi.fn().mockResolvedValue({}) };
    const handler = new SellpiaInventoryOperationHandler(registry as never, freshness as never);

    handler.onModuleInit();
    await expect(handler.execute({
      runId: 'run-1',
      organizationId: 'org-1',
      operationKey: 'inventory.refresh_sellpia_snapshot',
      triggerSource: 'dashboard',
      input: { scope: 'full' },
      requestedByUserId: 'user-1',
      scheduleId: null,
      parentRunId: null,
      attemptToken: 'attempt-1',
    })).resolves.toEqual({ kind: 'waiting_runtime' });

    expect(INVENTORY_OPERATIONS[0]).toMatchObject({
      key: 'inventory.refresh_sellpia_snapshot',
      ownerDomain: 'inventory',
      engineType: 'browser',
      scheduleSupported: true,
    });
    expect(freshness.requestRefresh).toHaveBeenCalledWith({
      organizationId: 'org-1',
      userId: 'user-1',
      reason: 'manual_request',
      scope: 'full',
    });
  });

  it('defaults scheduled and legacy operation input to inventory-only scope', async () => {
    const registry = { register: vi.fn() };
    const freshness = { requestRefresh: vi.fn().mockResolvedValue({}) };
    const handler = new SellpiaInventoryOperationHandler(registry as never, freshness as never);

    await handler.execute({
      runId: 'run-2',
      organizationId: 'org-1',
      operationKey: 'inventory.refresh_sellpia_snapshot',
      triggerSource: 'domain_screen',
      input: {},
      requestedByUserId: 'user-1',
      scheduleId: null,
      parentRunId: null,
      attemptToken: 'attempt-2',
    });

    expect(freshness.requestRefresh).toHaveBeenCalledWith({
      organizationId: 'org-1',
      userId: 'user-1',
      reason: 'manual_request',
      scope: 'inventory',
    });
  });
});
