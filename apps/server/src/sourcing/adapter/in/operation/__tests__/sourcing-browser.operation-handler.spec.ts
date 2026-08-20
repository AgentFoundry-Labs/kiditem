import { describe, expect, it } from 'vitest';
import { OperationHandlerRegistryService } from '../../../../../operations/application/service/operation-handler-registry.service';
import { SOURCING_OPERATIONS } from '../../../../domain/operation/sourcing.operations';
import { SourcingBrowserOperationHandler } from '../sourcing-browser.operation-handler';

describe('SourcingBrowserOperationHandler', () => {
  it('registers exact sourcing browser operations and waits for the runtime', async () => {
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
    expect(registry.listDefinitions().map((item) => item.key)).toContain(
      'sourcing.collect_keyword_suggestions',
    );
    expect(registry.listDefinitions().map((item) => item.key)).toEqual(expect.arrayContaining([
      'sourcing.collect_1688_trends',
      'sourcing.collect_tiktok_cc_trends',
      'sourcing.collect_live_commerce_url',
    ]));
    expect(registry.listDefinitions().map((item) => item.key)).not.toContain(
      'sourcing.search_1688_keyword_batch',
    );
    await expect(handler.execute({} as never)).resolves.toEqual({
      kind: 'waiting_runtime',
    });
  });
});
