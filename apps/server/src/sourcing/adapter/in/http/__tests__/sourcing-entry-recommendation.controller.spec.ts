import { describe, expect, it, vi } from 'vitest';
import { SourcingEntryRecommendationController } from '../sourcing-entry-recommendation.controller';

const ORGANIZATION_ID = '11111111-1111-4111-8111-111111111111';

describe('SourcingEntryRecommendationController', () => {
  it('retains only the owner recommendation read surface', async () => {
    const recommendations = { getRecommendations: vi.fn().mockResolvedValue({ items: [] }) };
    const controller = new SourcingEntryRecommendationController(recommendations as never);

    await expect(controller.list({ limit: 10 }, ORGANIZATION_ID)).resolves.toEqual({ items: [] });

    expect(recommendations.getRecommendations).toHaveBeenCalledWith({
      organizationId: ORGANIZATION_ID,
      limit: 10,
    });
    expect('ask' in controller).toBe(false);
  });
});
