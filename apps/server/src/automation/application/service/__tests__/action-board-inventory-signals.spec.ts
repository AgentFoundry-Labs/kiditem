import { describe, expect, it, vi } from 'vitest';
import type { ActionBoardRepositoryPort } from '../../port/out/repository/action-board.repository.port';
import { ActionBoardService } from '../action-board.service';

function makeTask(taskKey: string) {
  const now = new Date('2026-07-12T00:00:00.000Z');
  return {
    id: `task-${taskKey}`,
    organizationId: '11111111-1111-4111-8111-111111111111',
    taskKey,
    type: 'human',
    label: taskKey,
    detail: null,
    where: null,
    href: null,
    priority: 'high',
    status: 'pending',
    role: 'inventory',
    apiCall: null,
    result: null,
    notes: [],
    activityLog: [],
    date: now,
    createdAt: now,
    updatedAt: now,
    assigneeUserId: null,
  };
}

describe('ActionBoardService inventory signals', () => {
  it('seeds only read-only zero-stock and mapping-attention tasks on restored screens', async () => {
    const repository = {
      fetchPerListingMetrics: vi.fn().mockResolvedValue([]),
      countOutOfStockMasterProducts: vi.fn().mockResolvedValue(5),
      countMappingAttentionChannelSkus: vi.fn().mockResolvedValue(2),
      countLowCtrThumbnails: vi.fn().mockResolvedValue(0),
      findAGradeReviewCounts: vi.fn().mockResolvedValue([]),
      upsertActionTaskSeed: vi.fn().mockResolvedValue(undefined),
      findActionTasksForDay: vi.fn().mockResolvedValue([
        makeTask('h-zero-stock'),
        makeTask('h-mapping-attention'),
      ]),
    } as unknown as ActionBoardRepositoryPort;

    await new ActionBoardService(repository).getTasks(
      '11111111-1111-4111-8111-111111111111',
    );

    expect(repository.countOutOfStockMasterProducts).toHaveBeenCalledOnce();
    expect(repository.countMappingAttentionChannelSkus).toHaveBeenCalledOnce();
    const inventorySeeds = repository.upsertActionTaskSeed.mock.calls
      .map(([seed]) => seed)
      .filter((seed) => seed.role === 'inventory');
    expect(inventorySeeds).toEqual(expect.arrayContaining([
      expect.objectContaining({
        taskKey: 'h-zero-stock',
        href: '/stock-ops?tab=sellpia-zero',
        apiCall: null,
      }),
      expect.objectContaining({
        taskKey: 'h-mapping-attention',
        href: '/product-hub/matching?status=needs_review',
        apiCall: null,
      }),
    ]));
    expect(inventorySeeds.map((seed) => seed.taskKey)).not.toEqual(
      expect.arrayContaining(['h-reorder', 'analyze-stock']),
    );
  });
});
