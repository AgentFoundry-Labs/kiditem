import { describe, expect, it } from 'vitest';
import {
  THUMBNAIL_CONFIRMABLE_STATUSES,
  THUMBNAIL_REPORTABLE_STATUSES,
  thumbnailConfirmationTransition,
  thumbnailProductName,
  acceptsThumbnailReport,
  resolveThumbnailAccount,
  thumbnailReportTransition,
  thumbnailUpdateIdempotencyKey,
} from './thumbnail-update';

describe('resolveThumbnailAccount', () => {
  it('uses the listing account when the workspace or product has a listing', () => {
    expect(resolveThumbnailAccount({ listingAccountId: 'a1', activeAccountIds: ['a2', 'a3'] }))
      .toEqual({ ok: true, channelAccountId: 'a1' });
  });
  it('falls back to the single active account that supports representative images', () => {
    expect(resolveThumbnailAccount({ listingAccountId: null, activeAccountIds: ['a2', 'a2'] }))
      .toEqual({ ok: true, channelAccountId: 'a2' });
  });
  it('refuses to guess among several listings of the product', () => {
    expect(resolveThumbnailAccount({ listingAccountId: null, productListingCount: 2, activeAccountIds: ['a2'] }))
      .toEqual({ ok: false, reason: 'ambiguous_listing' });
  });
  it('refuses when there is no or more than one supporting account', () => {
    expect(resolveThumbnailAccount({ listingAccountId: null, activeAccountIds: [] }))
      .toEqual({ ok: false, reason: 'no_account' });
    expect(resolveThumbnailAccount({ listingAccountId: null, activeAccountIds: ['a2', 'a3'] }))
      .toEqual({ ok: false, reason: 'ambiguous_account' });
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
  it('never records an upload as success: it waits for the operator to confirm the save in Wing', () => {
    expect(thumbnailReportTransition({ outcome: 'uploaded_pending_save' })).toEqual({
      status: 'reconciling',
      providerOutcome: 'uncertain',
      errorCode: 'thumbnail_awaiting_confirmation',
      errorMessage: 'Wing 수정 화면에 올렸습니다 — Wing에서 저장한 뒤 반영됨으로 표시하세요',
    });
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
  it('publishes the reportable states as the one list the store filters by', () => {
    expect([...THUMBNAIL_REPORTABLE_STATUSES].sort()).toEqual(['executing', 'reconciling']);
    for (const status of THUMBNAIL_REPORTABLE_STATUSES) expect(acceptsThumbnailReport(status)).toBe(true);
  });
});

describe('thumbnailConfirmationTransition', () => {
  it('is the only way to success and applies only to an upload waiting for the operator', () => {
    expect(thumbnailConfirmationTransition()).toEqual({ status: 'succeeded', providerOutcome: 'succeeded', errorCode: null, errorMessage: null });
    expect(THUMBNAIL_CONFIRMABLE_STATUSES).toEqual(['reconciling']);
  });
});

describe('thumbnailProductName', () => {
  it('uses the decoded Coupang listing name, else the workspace name', () => {
    expect(thumbnailProductName(encodeURIComponent(encodeURIComponent('곰돌이 우산')), '작업공간')).toBe('곰돌이 우산');
    expect(thumbnailProductName('  쿠팡 이름 ', '작업공간')).toBe('쿠팡 이름');
    expect(thumbnailProductName(null, ' 작업공간 ')).toBe('작업공간');
    expect(thumbnailProductName('   ', '작업공간')).toBe('작업공간');
    expect(thumbnailProductName('%E0%A4%A', '작업공간')).toBe('%E0%A4%A');
  });
  it('is empty when neither name exists', () => {
    expect(thumbnailProductName(null, '  ')).toBe('');
    expect(thumbnailProductName('', null)).toBe('');
  });
});
