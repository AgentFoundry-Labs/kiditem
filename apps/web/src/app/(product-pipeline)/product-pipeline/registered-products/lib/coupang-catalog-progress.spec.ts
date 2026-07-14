import { describe, expect, it } from 'vitest';
import type { CoupangCatalogCollectionRun } from '@kiditem/shared/coupang-catalog-snapshot';
import {
  buildCoupangCatalogProgress,
  shouldInvalidatePublishedListings,
} from './coupang-catalog-progress';

describe('Coupang catalog progress', () => {
  it('distinguishes discovered, stored-detail, and DB-published progress', () => {
    const run = collectionRun({
      discoveredProducts: 1_228,
      hydratedProducts: 80,
      publishedProducts: 60,
      publishedOptionCount: 68,
      publishedMediaCount: 120,
    });

    expect(buildCoupangCatalogProgress(
      run,
      Date.parse('2026-07-14T01:00:00.000Z'),
    )).toMatchObject({
      discoveredLabel: '목록 발견 1,228 / 1,228',
      hydratedLabel: '상세 수집 80 / 1,228',
      publishedLabel: 'DB 반영 60 / 1,228',
      publicationDetailsLabel: '옵션 68개 · 이미지 120개 반영',
      rateLabel: expect.stringContaining('개/분'),
      etaLabel: expect.stringContaining('완료 예상'),
    });
  });

  it('avoids invalid rates and ETAs before publication starts', () => {
    const progress = buildCoupangCatalogProgress(collectionRun(), 0);

    expect(progress.percent).toBe(0);
    expect(progress.rateLabel).toBeNull();
    expect(progress.etaLabel).toBeNull();
  });

  it('reports completed publication without a negative ETA', () => {
    const progress = buildCoupangCatalogProgress(collectionRun({
      status: 'completed',
      phase: 'finished',
      discoveredProducts: 10,
      hydratedProducts: 10,
      publishedProducts: 10,
    }), Date.parse('2026-07-14T00:30:00.000Z'));

    expect(progress.percent).toBe(100);
    expect(progress.etaLabel).toBeNull();
  });

  it('invalidates listing queries only when an observed run publishes more cards', () => {
    expect(shouldInvalidatePublishedListings(40, 60)).toBe(true);
    expect(shouldInvalidatePublishedListings(60, 60)).toBe(false);
    expect(shouldInvalidatePublishedListings(60, 40)).toBe(false);
    expect(shouldInvalidatePublishedListings(null, 60)).toBe(false);
  });
});

function collectionRun(
  overrides: Partial<{
    status: CoupangCatalogCollectionRun['status'];
    phase: CoupangCatalogCollectionRun['phase'];
    discoveredProducts: number;
    hydratedProducts: number;
    publishedProducts: number;
    publishedOptionCount: number;
    publishedMediaCount: number;
  }> = {},
): CoupangCatalogCollectionRun {
  return {
    id: '00000000-0000-4000-8000-000000000001',
    channelAccountId: '00000000-0000-4000-8000-000000000002',
    clientRunKey: '00000000-0000-4000-8000-000000000003',
    status: overrides.status ?? 'running',
    phase: overrides.phase ?? 'hydration',
    collectorVersion: 'wing-inventory-v1',
    manifest: {
      totalItems: overrides.discoveredProducts ?? 0,
      pageSize: 50,
      expectedPages: 1,
      firstPageFingerprint: 'a'.repeat(64),
    },
    progress: {
      discoveryPagesStored: 1,
      discoveredProducts: overrides.discoveredProducts ?? 0,
      hydratedProducts: overrides.hydratedProducts ?? 0,
      optionCount: 0,
      mediaCount: 0,
      storedChunks: 1,
      publishedProducts: overrides.publishedProducts ?? 0,
      publishedOptionCount: overrides.publishedOptionCount ?? 0,
      publishedMediaCount: overrides.publishedMediaCount ?? 0,
      publishedChunks: 0,
      firstPublishedAt: null,
      lastPublishedAt: null,
    },
    missing: { discoverySequences: [], productIds: [] },
    snapshotHash: null,
    error: null,
    publication: null,
    createdAt: '2026-07-14T00:00:00.000Z',
    updatedAt: '2026-07-14T00:00:00.000Z',
    finishedAt: null,
  };
}
