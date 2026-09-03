import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { ADVERTISING_OPERATIONS } from '../advertising.operations';

const operationOwnerWorkerModuleSource = readFileSync(
  path.resolve(__dirname, '../../../../operations/operation-owner-worker.module.ts'),
  'utf8',
);

describe('advertising browser operation definitions', () => {
  it('does not register profitability collection as an Operation', () => {
    expect(
      ADVERTISING_OPERATIONS.some(
        (candidate) => candidate.key === 'advertising.refresh_profitability_spend',
      ),
    ).toBe(false);
    expect(operationOwnerWorkerModuleSource).not.toContain(
      'AdvertisingProfitabilityOperationHandler',
    );
  });

  it('registers the exact tracked-products Wing operation contract', () => {
    const definition = ADVERTISING_OPERATIONS.find(
      (candidate) => candidate.key === 'advertising.refresh_tracked_wing_products',
    );
    expect(definition).toMatchObject({
      engineType: 'browser',
      ownerDomain: 'advertising',
      resourceClass: 'extension_coupang',
      maxAttempts: 3,
      executionTimeoutMs: 15 * 60_000,
    });
    expect(definition?.inputSchema.parse({
      keywords: ['  Ａ   Pencil  '],
      maxPages: 2,
      purpose: 'tracked_metrics',
      trackedProductIds: ['wing-1'],
    })).toEqual({
      keywords: ['A Pencil'],
      maxPages: 2,
      purpose: 'tracked_metrics',
      trackedProductIds: ['wing-1'],
    });
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
