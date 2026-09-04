import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { ADVERTISING_OPERATIONS } from '../advertising.operations';

const operationOwnerWorkerModuleSource = readFileSync(
  path.resolve(__dirname, '../../../../operations/operation-owner-worker.module.ts'),
  'utf8',
);

describe('advertising browser operation definitions', () => {
  it('retains only the bounded competitor catalog operation while tracked Wing uses its source owner', () => {
    expect(ADVERTISING_OPERATIONS.map((definition) => definition.key)).toEqual([
      'advertising.collect_competitor_catalog',
    ]);
    expect(operationOwnerWorkerModuleSource).not.toContain(
      'AdvertisingTrackedWingProductsOperationHandler',
    );
  });

  it('registers the exact bounded competitor catalog operation contract', () => {
    const definition = ADVERTISING_OPERATIONS.find(
      (candidate) => candidate.key === 'advertising.collect_competitor_catalog',
    );
    expect(definition).toMatchObject({
      engineType: 'browser',
      ownerDomain: 'advertising',
      resourceClass: 'extension_coupang',
      maxAttempts: 3,
      executionTimeoutMs: 15 * 60_000,
      allowedTriggers: ['dashboard', 'domain_screen'],
      scheduleSupported: false,
    });
    expect(definition?.inputSchema.parse({
      target: 'seller_id',
      sellerId: ' A00219251 ',
    })).toEqual({ target: 'seller_id', sellerId: 'A00219251' });
  });
});
