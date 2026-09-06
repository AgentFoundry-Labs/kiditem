import { describe, expect, it } from 'vitest';
import {
  buildCoupangCatalogProgress,
  resolveCoupangCatalogError,
} from './coupang-catalog-progress';
import type { CoupangCatalogCollectionRun } from '@kiditem/shared/coupang-catalog-snapshot';

describe('Coupang catalog progress', () => {
  it('shows private staged progress without claiming canonical publication', () => {
    const run = collectionRun({
      discoveredProducts: 1_228,
      hydratedProducts: 80,
    });

    expect(buildCoupangCatalogProgress(
      run,
      Date.parse('2026-07-14T01:00:00.000Z'),
    )).toMatchObject({
      discoveredLabel: '목록 발견 1,228 / 1,228',
      hydratedLabel: '상세 수집 80 / 1,228',
      publishedLabel: '전체 수집 후 한 번에 반영',
      publicationDetailsLabel: '수집 중에는 기존 상품 데이터 유지',
      rateLabel: '수집 1.3개/분',
      etaLabel: '상세 수집 예상 14시간 21분',
      percent: 7,
    });
  });

  it('avoids invalid rates and ETAs before detail collection starts', () => {
    const progress = buildCoupangCatalogProgress(collectionRun(), 0);

    expect(progress.percent).toBe(0);
    expect(progress.rateLabel).toBeNull();
    expect(progress.etaLabel).toBeNull();
  });

  it('reserves completion for the committed owner result, not collected details or phase', () => {
    const run = collectionRun({
      discoveredProducts: 10,
      hydratedProducts: 10,
      phase: 'ready_to_finalize',
    });
    expect(buildCoupangCatalogProgress(run, Date.parse('2026-07-14T00:30:00Z')))
      .toMatchObject({ percent: 99, publishedLabel: '전체 수집 후 한 번에 반영', etaLabel: null });
    expect(buildCoupangCatalogProgress({ ...run, phase: 'finished' }, 0).percent).toBe(99);
  });

  it('reports completed publication without a negative ETA', () => {
    const progress = buildCoupangCatalogProgress(collectionRun({
      state: 'COMPLETE',
      phase: 'finished',
      discoveredProducts: 10,
      hydratedProducts: 10,
      publishedProducts: 10,
      publishedOptionCount: 20,
      publishedMediaCount: 30,
    }), Date.parse('2026-07-14T00:30:00.000Z'));

    expect(progress.percent).toBe(100);
    expect(progress.etaLabel).toBeNull();
    expect(progress.publishedLabel).toBe('DB 반영 10 / 10');
    expect(progress.publicationDetailsLabel).toBe('옵션 20개 · 이미지 30개 반영');
    expect(progress.rateLabel).toBeNull();
  });

  it('does not project a continuing collection rate or ETA for a failed owner', () => {
    expect(buildCoupangCatalogProgress(collectionRun({
      state: 'FAILED', discoveredProducts: 100, hydratedProducts: 40,
    }), Date.parse('2026-07-14T00:30:00Z'))).toMatchObject({
      rateLabel: null, etaLabel: null, percent: 40,
      publicationDetailsLabel: '수집 중에는 기존 상품 데이터 유지',
    });
  });

  it('shows the current owner error even when stale browser activity remains', () => {
    expect(resolveCoupangCatalogError({
      browserActive: true,
      extensionError: null,
      startError: null,
      serverError: 'active user tab is collection-protected',
    })).toBe('active user tab is collection-protected');

    expect(resolveCoupangCatalogError({
      browserActive: false,
      extensionError: null,
      startError: null,
      serverError: 'active user tab is collection-protected',
    })).toBe('active user tab is collection-protected');
  });
});

function collectionRun(
  overrides: Partial<{
    state: CoupangCatalogCollectionRun['state'];
    phase: CoupangCatalogCollectionRun['phase'];
    discoveredProducts: number;
    hydratedProducts: number;
    publishedProducts: number;
    publishedOptionCount: number;
    publishedMediaCount: number;
  }> = {},
): CoupangCatalogCollectionRun {
  return {
    attemptId: '00000000-0000-4000-8000-000000000001',
    channelAccountId: '00000000-0000-4000-8000-000000000002',
    idempotencyKey: '00000000-0000-4000-8000-000000000003',
    state: overrides.state ?? 'RUNNING',
    expiresAt: '2026-07-15T00:00:00.000Z',
    plan: {
      channelAccountId: '00000000-0000-4000-8000-000000000002',
      collectorVersion: 'wing-inventory-v1', vendorId: 'A001',
      listUrl: 'https://wing.coupang.com/list', detailUrl: 'https://wing.coupang.com/detail',
      publicationRevision: '0',
    },
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
      firstPublishedAt: (overrides.publishedProducts ?? 0) > 0
        ? '2026-07-14T00:50:00.000Z'
        : null,
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
