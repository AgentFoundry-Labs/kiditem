import { describe, expect, it, vi } from 'vitest';
import { SourcingRisingProductService } from '../sourcing-rising-product.service';

describe('SourcingRisingProductService', () => {
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

    expect(restored).toMatchObject({
      confidence: detected.confidence,
      dataGaps: detected.dataGaps,
      windowDays: 7,
    });
  });
});
