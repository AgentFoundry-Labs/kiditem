import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CoupangMomentumPort } from '../../port/out/cross-domain/coupang-momentum.port';
import type {
  SourcingWorkspaceSnapshotRepositoryPort,
  SourcingWorkspaceSnapshotRow,
} from '../../port/out/repository/sourcing-workspace-snapshot.repository.port';
import type {
  NaverKeywordSnapshotRow,
  TrendCollectionRepositoryPort,
} from '../../port/out/repository/trend-collection.repository.port';
import { SourcingRisingProductService } from '../sourcing-rising-product.service';

const ORGANIZATION_ID = '00000000-0000-4000-8000-000000000001';

function serpDay(businessDate: string, rank: number, reviewCount: number) {
  return {
    keyword: '아기 물티슈',
    businessDate,
    capturedAt: `${businessDate}T02:00:00.000Z`,
    itemCount: 1,
    items: [
      {
        rank,
        page: 1,
        positionInPage: rank,
        isAd: false,
        productId: 'P1',
        itemId: 'I1',
        vendorItemId: 'V1',
        name: '아기 물티슈 리필 대용량',
        priceKrw: 9900,
        reviewCount,
        ratingScore: 4.8,
        link: 'https://www.coupang.com/vp/products/1',
      },
    ],
  };
}

function naverRow(): NaverKeywordSnapshotRow {
  return {
    keyword: '아기 물티슈',
    businessDate: new Date('2026-07-16T00:00:00.000Z'),
    monthlyTotalSearchCount: 42000,
    monthlyPcSearchCount: 12000,
    monthlyMobileSearchCount: 30000,
    competitionIndex: '중간',
    averageAdRank: 3,
    trendRatio: 88,
    trendDelta: 22,
    capturedAt: new Date('2026-07-16T02:00:00.000Z'),
  };
}

function momentumPort(): CoupangMomentumPort {
  return {
    readSerpMomentum: vi.fn().mockResolvedValue([
      serpDay('2026-07-16', 12, 95),
      serpDay('2026-07-14', 30, 40),
    ]),
    readWingSalesMomentum: vi.fn().mockResolvedValue([]),
  };
}

function trendRepository(): TrendCollectionRepositoryPort {
  return {
    findNaverKeywordHistory: vi.fn().mockResolvedValue([naverRow()]),
  } as unknown as TrendCollectionRepositoryPort;
}

function snapshotRepository(): SourcingWorkspaceSnapshotRepositoryPort {
  return {
    find: vi.fn().mockResolvedValue(null),
    listRecent: vi.fn().mockResolvedValue([]),
    upsert: vi.fn().mockImplementation(async (input) => ({
      id: 'snap-1',
      organizationId: input.organizationId,
      scope: input.scope,
      businessDate: input.businessDate,
      payload: input.payload,
      createdAt: new Date(),
      updatedAt: new Date(),
    })),
  };
}

describe('SourcingRisingProductService', () => {
  let momentum: CoupangMomentumPort;
  let trends: TrendCollectionRepositoryPort;
  let snapshots: SourcingWorkspaceSnapshotRepositoryPort;
  let service: SourcingRisingProductService;

  beforeEach(() => {
    momentum = momentumPort();
    trends = trendRepository();
    snapshots = snapshotRepository();
    service = new SourcingRisingProductService(momentum, trends, snapshots);
  });

  it('reads Coupang momentum + Naver trend, scores rising products, and persists the snapshot', async () => {
    const result = await service.detect({ organizationId: ORGANIZATION_ID, windowDays: 14 });

    expect(momentum.readSerpMomentum).toHaveBeenCalledWith(ORGANIZATION_ID, 14);
    expect(momentum.readWingSalesMomentum).toHaveBeenCalledWith(ORGANIZATION_ID, 14);
    expect(trends.findNaverKeywordHistory).toHaveBeenCalledWith({
      organizationId: ORGANIZATION_ID,
      days: 14,
    });

    expect(result.windowDays).toBe(14);
    expect(result.model.candidates.length).toBeGreaterThan(0);
    const top = result.model.candidates[0];
    expect(top.vendorItemId).toBe('V1');
    expect(top.signals.rankClimb).toBe(18);
    expect(top.signals.trendDelta).toBe(22);
    expect(result.dataGaps).toContain('wing_sales_history_missing');

    expect(snapshots.upsert).toHaveBeenCalledTimes(1);
    expect(snapshots.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: ORGANIZATION_ID,
        scope: 'coupang_rising_products',
      }),
    );
  });

  it('skips persistence when persist is false', async () => {
    await service.detect({ organizationId: ORGANIZATION_ID, persist: false });
    expect(snapshots.upsert).not.toHaveBeenCalled();
  });

  it('reads the latest persisted snapshot without recomputing', async () => {
    const detection = await service.detect({ organizationId: ORGANIZATION_ID, persist: false });
    const persistedRow: SourcingWorkspaceSnapshotRow = {
      id: 'snap-1',
      organizationId: ORGANIZATION_ID,
      scope: 'coupang_rising_products',
      businessDate: new Date('2026-07-16T00:00:00.000Z'),
      payload: {
        version: 1,
        result: detection.model as unknown as Record<string, unknown>,
        meta: { generatedAt: '2026-07-16T03:00:00.000Z', windowDays: 14 },
      },
      createdAt: new Date('2026-07-16T03:00:00.000Z'),
      updatedAt: new Date('2026-07-16T03:00:00.000Z'),
    };
    (snapshots.listRecent as ReturnType<typeof vi.fn>).mockResolvedValueOnce([persistedRow]);

    const latest = await service.getLatest(ORGANIZATION_ID);
    expect(latest).not.toBeNull();
    expect(latest!.generatedAt).toBe('2026-07-16T03:00:00.000Z');
    expect(latest!.model.candidates[0].vendorItemId).toBe('V1');
    expect(snapshots.listRecent).toHaveBeenCalledWith(
      expect.objectContaining({ scope: 'coupang_rising_products', limit: 1 }),
    );
  });
});
