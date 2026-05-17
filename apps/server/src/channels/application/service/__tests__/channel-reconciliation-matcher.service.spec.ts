import { describe, expect, it, vi } from 'vitest';
import { ChannelReconciliationMatcherService } from '../channel-reconciliation-matcher.service';

describe('ChannelReconciliationMatcherService', () => {
  it('does not create an accountless listing when only legacyCode matches', async () => {
    const tx = {
      channelListing: {
        findMany: vi.fn().mockResolvedValue([]),
        create: vi.fn(),
      },
      productOption: {
        findMany: vi.fn().mockResolvedValue([{ id: 'option-1', masterId: 'master-1' }]),
      },
    };
    const service = new ChannelReconciliationMatcherService();

    const outcome = await service.evaluateRow(tx as never, 'org-1', '720445', null, 'LEG-1');

    expect(outcome.status).toBe('needs_review');
    expect(outcome.matchReason).toBe('none');
    expect(outcome.linkedListingId).toBeNull();
    expect(tx.channelListing.create).not.toHaveBeenCalled();
  });

  it('returns a conflict instead of arbitrarily linking duplicate active external ids', async () => {
    const tx = {
      channelListing: {
        findMany: vi.fn().mockResolvedValue([
          { id: 'listing-account-1', masterId: 'master-1', channelAccountId: 'account-1' },
          { id: 'listing-account-2', masterId: 'master-2', channelAccountId: 'account-2' },
        ]),
      },
      productOption: {
        findMany: vi.fn(),
      },
    };
    const service = new ChannelReconciliationMatcherService();

    const outcome = await service.evaluateRow(tx as never, 'org-1', '720445', null, null);

    expect(outcome.status).toBe('conflict');
    expect(outcome.matchReason).toBe('conflict');
    expect(outcome.linkedListingId).toBeNull();
    expect(outcome.conflictJson).toEqual({
      kind: 'duplicate_active_channel_listing_external_id',
      externalId: '720445',
      listingIds: ['listing-account-1', 'listing-account-2'],
      accountIds: ['account-1', 'account-2'],
    });
  });
});
