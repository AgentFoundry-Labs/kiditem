import { describe, expect, it, vi } from 'vitest';
import { buildDashboardContext } from '../../domain/context';
import type { DashboardInventoryRepositoryPort } from '../port/out/repository/dashboard-inventory.repository.port';
import { DashboardInventoryService } from './dashboard-inventory.service';

describe('DashboardInventoryService', () => {
  it('reports factual Sellpia zero-stock and channel mapping-attention SKU counts', async () => {
    const repository = {
      countActiveProductsByGrade: vi.fn().mockResolvedValue([]),
      findUnreadAlerts: vi.fn().mockResolvedValue([]),
      countActiveProducts: vi.fn().mockResolvedValue(0),
      countChannelLinkedProducts: vi.fn().mockResolvedValue(0),
      fetchPerListingMetrics: vi.fn().mockResolvedValue([]),
      countOutOfStockInventorySkus: vi.fn().mockResolvedValue(7),
      countMappingAttentionChannelSkus: vi.fn().mockResolvedValue(3),
      findGradeHistory: vi.fn().mockResolvedValue([]),
      countLowCtrThumbnails: vi.fn().mockResolvedValue(0),
      findAGradeReviewCounts: vi.fn().mockResolvedValue([]),
    } as unknown as DashboardInventoryRepositoryPort;

    const result = await new DashboardInventoryService(repository).getSummary(
      buildDashboardContext(
        undefined,
        undefined,
        undefined,
        new Date('2026-07-12T00:00:00.000Z'),
      ),
      '11111111-1111-4111-8111-111111111111',
    );

    expect(result.warnings).toMatchObject({
      outOfStockSkus: 7,
      mappingAttentionSkus: 3,
    });
    expect(result.warnings).not.toHaveProperty('needReorder');
  });
});
