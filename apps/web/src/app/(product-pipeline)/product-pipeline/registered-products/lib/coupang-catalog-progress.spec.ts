import { describe, expect, it } from 'vitest';
import { buildCoupangCatalogProgress } from './coupang-catalog-progress';
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

  it('uses basic-list wording for the basics stage while retaining detail wording elsewhere', () => {
    const basics = buildCoupangCatalogProgress(collectionRun({
      discoveredProducts: 1_228,
      hydratedProducts: 80,
    }), Date.parse('2026-07-14T01:00:00.000Z'), 'basics');

    expect(basics).toMatchObject({
      hydratedLabel: '기본 목록 수집 80 / 1,228',
      etaLabel: '기본 목록 수집 예상 14시간 21분',
    });
    expect(buildCoupangCatalogProgress(collectionRun({
      discoveredProducts: 1_228,
      hydratedProducts: 80,
    }), Date.parse('2026-07-14T01:00:00.000Z'), 'details')).toMatchObject({
      hydratedLabel: '상세 수집 80 / 1,228',
      etaLabel: '상세 수집 예상 14시간 21분',
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

  it('measures the details stage against its planned targets and publishes nothing before the terminal commit (KID-348)', () => {
    const run = collectionRun({
      state: 'FAILED',
      discoveredProducts: 10,
      hydratedProducts: 2,
      detailTargetProductIds: ['P1', 'P2', 'P3'],
    });
    expect(buildCoupangCatalogProgress(run, Date.parse('2026-07-14T00:30:00Z'), 'details')).toMatchObject({
      discoveredLabel: '목록 발견 10 / 10',
      hydratedLabel: '상세 수집 2 / 3',
      publishedLabel: '상세는 모두 받은 뒤 한 번에 반영',
      publicationDetailsLabel: '수집 중에는 기존 상품 데이터 유지',
      percent: 67,
    });
  });

  it('reports the details quality once the terminal commit applied the targets', () => {
    const progress = buildCoupangCatalogProgress(collectionRun({
      state: 'COMPLETE',
      phase: 'finished',
      discoveredProducts: 10,
      hydratedProducts: 3,
      publishedProducts: 3,
      publishedOptionCount: 4,
      publishedMediaCount: 5,
      detailTargetProductIds: ['P1', 'P2', 'P3'],
      quality: {
        detailTargets: 3,
        detailApplied: 2,
        detailUnchanged: 1,
        deletedProducts: 1,
        unconfirmedAbsentProductIds: ['P9'],
      },
    }), Date.parse('2026-07-14T00:30:00Z'), 'details');
    expect(progress).toMatchObject({
      percent: 100,
      publishedLabel: '상세 반영 2 · 변경 없음 1 / 3',
      publicationDetailsLabel: '옵션 4개 · 이미지 5개 반영 · 삭제 1개 · 삭제 미확인 1개',
    });
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
    detailTargetProductIds: string[];
    quality: CoupangCatalogCollectionRun['quality'];
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
      ...(overrides.detailTargetProductIds ? { detailTargetProductIds: overrides.detailTargetProductIds } : {}),
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
    ...(overrides.quality ? { quality: overrides.quality } : {}),
    createdAt: '2026-07-14T00:00:00.000Z',
    updatedAt: '2026-07-14T00:00:00.000Z',
    finishedAt: null,
  };
}
