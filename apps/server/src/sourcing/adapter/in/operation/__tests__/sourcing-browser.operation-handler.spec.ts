import { describe, expect, it } from 'vitest';
import { OperationHandlerRegistryService } from '../../../../../operations/application/service/operation-handler-registry.service';
import { SOURCING_OPERATIONS } from '../../../../domain/operation/sourcing.operations';
import { SourcingBrowserOperationHandler } from '../sourcing-browser.operation-handler';

describe('SourcingBrowserOperationHandler', () => {
  it('registers only the exact Wing pilot and waits for the browser runtime', async () => {
    const registry = new OperationHandlerRegistryService();
    const handler = new SourcingBrowserOperationHandler(registry);
    handler.onModuleInit();

    const definition = SOURCING_OPERATIONS.find(
      (operation) => operation.key === 'sourcing.collect_wing_catalog_batch',
    );
    expect(definition).toMatchObject({
      engineType: 'browser',
      resourceClass: 'extension_coupang',
      maxAttempts: 3,
      executionTimeoutMs: 15 * 60_000,
      scheduleSupported: false,
    });
    expect(registry.listDefinitions().map((item) => item.key)).toContain(
      'sourcing.collect_wing_catalog_batch',
    );
    await expect(handler.execute({} as never)).resolves.toEqual({
      kind: 'waiting_runtime',
    });
  });
});
