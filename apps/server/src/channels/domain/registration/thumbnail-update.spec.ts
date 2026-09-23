import { describe, expect, it } from 'vitest';
import {
  acceptsThumbnailReport,
  resolveThumbnailAccount,
  thumbnailReportTransition,
  thumbnailUpdateIdempotencyKey,
} from './thumbnail-update';

describe('resolveThumbnailAccount', () => {
  it('uses the listing account when the workspace or product has a Coupang listing', () => {
    expect(resolveThumbnailAccount({ listingAccountId: 'a1', activeCoupangAccountIds: ['a2', 'a3'] }))
      .toEqual({ ok: true, channelAccountId: 'a1' });
  });
  it('falls back to the single active Coupang account', () => {
    expect(resolveThumbnailAccount({ listingAccountId: null, activeCoupangAccountIds: ['a2', 'a2'] }))
      .toEqual({ ok: true, channelAccountId: 'a2' });
  });
  it('refuses when there is no or more than one Coupang account', () => {
    expect(resolveThumbnailAccount({ listingAccountId: null, activeCoupangAccountIds: [] }))
      .toEqual({ ok: false, reason: 'no_coupang_account' });
    expect(resolveThumbnailAccount({ listingAccountId: null, activeCoupangAccountIds: ['a2', 'a3'] }))
      .toEqual({ ok: false, reason: 'ambiguous_coupang_account' });
  });
});

describe('thumbnailUpdateIdempotencyKey', () => {
  it('replays an Agent invocation by its owner key and gives each screen press its own key', () => {
    expect(thumbnailUpdateIdempotencyKey({ generationId: 'g', ownerIdempotencyKey: 'capability-invocation:x', nonce: 'n1' }))
      .toBe('thumbnail_update:capability-invocation:x');
    expect(thumbnailUpdateIdempotencyKey({ generationId: 'g', ownerIdempotencyKey: null, nonce: 'n1' }))
      .not.toBe(thumbnailUpdateIdempotencyKey({ generationId: 'g', ownerIdempotencyKey: null, nonce: 'n2' }));
  });
});

describe('thumbnailReportTransition', () => {
  it('records success only when the mall accepted the image', () => {
    expect(thumbnailReportTransition({ outcome: 'succeeded' })).toMatchObject({ status: 'succeeded', providerOutcome: 'succeeded' });
  });
  it('keeps a rejection and an unknown outcome apart', () => {
    expect(thumbnailReportTransition({ outcome: 'definitive_failure', error: 'login' }))
      .toMatchObject({ status: 'failed', providerOutcome: 'definitive_failure', errorCode: 'thumbnail_rejected' });
    expect(thumbnailReportTransition({ outcome: 'uncertain', error: 'port closed' }))
      .toMatchObject({ status: 'reconciling', providerOutcome: 'uncertain', errorCode: 'thumbnail_outcome_unknown' });
  });
  it('accepts a report only while the execution is live', () => {
    expect(acceptsThumbnailReport('executing')).toBe(true);
    expect(acceptsThumbnailReport('reconciling')).toBe(true);
    expect(acceptsThumbnailReport('succeeded')).toBe(false);
    expect(acceptsThumbnailReport('failed')).toBe(false);
    expect(acceptsThumbnailReport('prepared')).toBe(false);
  });
});
