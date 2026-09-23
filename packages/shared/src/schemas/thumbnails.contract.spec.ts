import { describe, expect, it } from 'vitest';
import {
  ThumbnailJobListResponseSchema,
} from './thumbnails';
import * as thumbnailContracts from './thumbnails';

const WORKSPACE_ID = '11111111-1111-4111-8111-111111111111';

describe('thumbnail identity contracts', () => {
  it('does not export the retired product-bound list contract', () => {
    expect(thumbnailContracts).not.toHaveProperty('ThumbnailListItemSchema');
    expect(thumbnailContracts).not.toHaveProperty('ThumbnailSummarySchema');
  });

  it('lists jobs with their candidates as content assets, not generation items', () => {
    expect(thumbnailContracts).not.toHaveProperty('ThumbnailGenerationItemSchema');
    const parsed = ThumbnailJobListResponseSchema.parse({
      items: [{
        id: '33333333-3333-4333-8333-333333333333',
        contentWorkspaceId: WORKSPACE_ID,
        status: 'succeeded',
        method: 'generate',
        prompt: null,
        errorMessage: null,
        attemptCount: 1,
        createdAt: '2026-07-14T00:00:00.000Z',
        updatedAt: '2026-07-14T00:00:00.000Z',
      }],
      candidates: [{
        id: '44444444-4444-4444-8444-444444444444',
        contentWorkspaceId: WORKSPACE_ID,
        source: 'ai',
        role: 'thumbnail',
        url: 'https://cdn.example.com/a.png',
        label: null,
        sortOrder: 0,
        width: null,
        height: null,
        thumbnailGenerationId: '33333333-3333-4333-8333-333333333333',
        isCurrentThumbnail: false,
        createdAt: '2026-07-14T00:00:00.000Z',
      }],
      workspaces: [{ id: WORKSPACE_ID, salesProductId: null, name: 'Workspace product', imageUrl: null }],
      total: 1,
    });

    expect(parsed.candidates[0]?.thumbnailGenerationId).toBe(parsed.items[0]?.id);
    expect(parsed.items[0]).not.toHaveProperty('selectedUrl');
  });

  it('no longer publishes post-apply CTR tracking or workspace analysis contracts', () => {
    for (const retired of [
      'ThumbnailTrackingRecordSchema',
      'UpdateThumbnailTrackingMetricsSchema',
      'ThumbnailAnalysisResultSchema',
      'ThumbnailAnalysisSummarySchema',
    ]) {
      expect(thumbnailContracts).not.toHaveProperty(retired);
    }
  });
});
