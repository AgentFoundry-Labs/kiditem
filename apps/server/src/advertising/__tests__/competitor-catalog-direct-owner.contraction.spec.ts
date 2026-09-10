import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const advertisingRoot = resolve(__dirname, '..');
const serverRoot = resolve(advertisingRoot, '..');

describe('competitor catalog direct-owner contraction', () => {
  it('leaves no competitor catalog Operation producer or compatibility ingest route', () => {
    for (const relativePath of [
      'application/service/competitor-catalog-operation.service.ts',
      'adapter/in/operation/advertising-competitor-catalog.operation-handler.ts',
      'domain/operation/advertising.operations.ts',
    ]) {
      expect(existsSync(resolve(advertisingRoot, relativePath))).toBe(false);
    }

    const productionSources = [
      resolve(advertisingRoot, 'advertising.module.ts'),
      resolve(advertisingRoot, 'adapter/in/http/advertising-ingest.controller.ts'),
      resolve(serverRoot, '../../../packages/shared/src/sourcing/browser-operations.ts'),
    ].map((path) => readFileSync(path, 'utf8')).join('\n');

    expect(productionSources).not.toContain('advertising.collect_competitor_catalog');
    expect(productionSources).not.toContain('AdvertisingCompetitorCatalogInputSchema');
    expect(productionSources).not.toContain('configured_watchlist');
    expect(productionSources).not.toMatch(/browser-operations\/.+catalogs/);
  });
});
