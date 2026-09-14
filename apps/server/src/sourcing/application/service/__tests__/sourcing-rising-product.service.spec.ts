import { afterEach, describe, expect, it, vi } from 'vitest';
import { SourcingRisingProductService } from '../sourcing-rising-product.service';

describe('SourcingRisingProductService', () => {
  afterEach(() => {
    vi.useRealTimers();
  });


  it('keeps latest as a pure persisted read and exposes no latest-or-detect write path', async () => {
    const snapshots = {
      listRecent: vi.fn().mockResolvedValue([]),
      upsert: vi.fn(),
    };
    const momentum = {
      readSerpMomentum: vi.fn(),
      readWingSalesMomentum: vi.fn(),
    };
    const trends = { findNaverKeywordHistory: vi.fn() };
    const service = new SourcingRisingProductService(
      momentum as never,
      trends as never,
      snapshots as never,
    );

    await expect(service.getLatest('org-1')).resolves.toBeNull();

    expect(snapshots.listRecent).toHaveBeenCalledOnce();
    expect(snapshots.upsert).not.toHaveBeenCalled();
    expect(momentum.readSerpMomentum).not.toHaveBeenCalled();
    expect(momentum.readWingSalesMomentum).not.toHaveBeenCalled();
    expect(trends.findNaverKeywordHistory).not.toHaveBeenCalled();
  });

  it('starts the latest-read window on the KST business date across a month boundary', async () => {
    // 2026-03-01 00:30 KST, still 2026-02-28 in UTC.
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-02-28T15:30:00.000Z'));
    const snapshots = {
      listRecent: vi.fn().mockResolvedValue([]),
      upsert: vi.fn(),
    };
    const service = new SourcingRisingProductService(
      { readSerpMomentum: vi.fn(), readWingSalesMomentum: vi.fn() } as never,
      { findNaverKeywordHistory: vi.fn() } as never,
      snapshots as never,
    );

    await service.getLatest('org-1', 3);

    expect(snapshots.listRecent).toHaveBeenCalledWith(expect.objectContaining({
      fromBusinessDate: new Date('2026-02-27T00:00:00.000Z'),
      toBusinessDate: new Date('2026-03-01T00:00:00.000Z'),
    }));
  });

  it('round-trips persisted confidence and data gaps without recomputing them from a different model statistic', async () => {
    let persisted: Record<string, unknown> | null = null;
    const snapshots = {
      upsert: vi.fn(async (input) => {
        persisted = input.payload;
        return input;
      }),
      listRecent: vi.fn(async () => persisted ? [{
        businessDate: new Date('2026-08-08T00:00:00.000Z'),
        updatedAt: new Date('2026-08-08T01:00:00.000Z'),
        payload: persisted,
      }] : []),
    };
    const momentum = {
      readSerpMomentum: vi.fn(async () => []),
      readWingSalesMomentum: vi.fn(async () => []),
    };
    const trends = { findNaverKeywordHistory: vi.fn(async () => []) };
    const service = new SourcingRisingProductService(
      momentum as never,
      trends as never,
      snapshots as never,
    );

    const detected = await service.detect({ organizationId: 'org-1', windowDays: 7 });
    const restored = await service.getLatest('org-1', 7);

    expect(detected.dataGaps).toEqual([
      'coupang_serp_history_missing',
      'wing_sales_history_missing',
      'naver_trend_history_missing',
      'no_rising_candidates',
    ]);
    expect(restored).toMatchObject({
      confidence: detected.confidence,
      dataGaps: detected.dataGaps,
      windowDays: 7,
    });
  });
});
