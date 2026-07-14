import { describe, expect, it } from 'vitest';
import {
  ThumbnailGenerationItemSchema,
  ThumbnailTrackingRecordSchema,
} from './thumbnails';
import * as thumbnailContracts from './thumbnails';

const WORKSPACE_ID = '11111111-1111-4111-8111-111111111111';
const LISTING_ID = '22222222-2222-4222-8222-222222222222';

describe('thumbnail identity contracts', () => {
  it('does not export the retired product-bound list contract', () => {
    expect(thumbnailContracts).not.toHaveProperty('ThumbnailListItemSchema');
    expect(thumbnailContracts).not.toHaveProperty('ThumbnailSummarySchema');
  });

  it('uses ContentWorkspace as the generation identity', () => {
    const parsed = ThumbnailGenerationItemSchema.parse({
      id: 'generation-1',
      contentWorkspaceId: WORKSPACE_ID,
      sourceCandidateId: null,
      originalUrl: 'https://cdn.example.com/original.jpg',
      candidates: [],
      selectedUrl: null,
      status: 'pending',
      phase: null,
      grade: '',
      score: 0,
      method: 'generate',
      editAnalysis: null,
      createdAt: '2026-07-14T00:00:00.000Z',
      contentWorkspace: {
        id: WORKSPACE_ID,
        name: 'Workspace product',
        imageUrl: 'https://cdn.example.com/original.jpg',
        coupangProductId: null,
        category: 'toys',
      },
    });

    expect(parsed.contentWorkspaceId).toBe(WORKSPACE_ID);
    expect(parsed.contentWorkspace.id).toBe(WORKSPACE_ID);
    expect(parsed).not.toHaveProperty('productId');
    expect(parsed).not.toHaveProperty('masterId');
    expect(parsed).not.toHaveProperty('product');
  });

  it('uses ChannelListing as the tracking identity', () => {
    const parsed = ThumbnailTrackingRecordSchema.parse({
      id: 'tracking-1',
      channelListingId: LISTING_ID,
      productName: 'Channel product',
      generationId: 'generation-1',
      originalGrade: 'B',
      originalScore: 70,
      appliedAt: '2026-07-14T00:00:00.000Z',
      daysElapsed: 0,
      status: 'tracking',
      ctrBefore: null,
      ctrAfter: null,
      ctrChange: null,
      reviewsBefore: null,
      reviewsAfter: null,
      salesBefore: null,
      salesAfter: null,
    });

    expect(parsed.channelListingId).toBe(LISTING_ID);
    expect(parsed).not.toHaveProperty('productId');
  });
});
