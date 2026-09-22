import { describe, expect, it } from 'vitest';
import { deriveThumbnailTrackingStatus } from '../thumbnail-tracking-status';

const MARKED_AT = new Date('2026-09-14T00:00:00.000Z');

describe('deriveThumbnailTrackingStatus', () => {
  it.each([
    { name: 'no mark and no CTR', markedInconclusiveAt: null, ctrBefore: null, ctrAfter: null, status: 'tracking' },
    { name: 'no mark and only the CTR before', markedInconclusiveAt: null, ctrBefore: 1.2, ctrAfter: null, status: 'tracking' },
    { name: 'no mark and only the CTR after', markedInconclusiveAt: null, ctrBefore: null, ctrAfter: 2.4, status: 'tracking' },
    { name: 'no mark and both CTRs', markedInconclusiveAt: null, ctrBefore: 1.2, ctrAfter: 2.4, status: 'measured' },
    { name: 'no mark and two measured zero CTRs', markedInconclusiveAt: null, ctrBefore: 0, ctrAfter: 0, status: 'measured' },
    { name: 'a mark and no CTR', markedInconclusiveAt: MARKED_AT, ctrBefore: null, ctrAfter: null, status: 'inconclusive' },
    { name: 'a mark and one CTR', markedInconclusiveAt: MARKED_AT, ctrBefore: 1.2, ctrAfter: null, status: 'inconclusive' },
    { name: 'a mark and both CTRs', markedInconclusiveAt: MARKED_AT, ctrBefore: 1.2, ctrAfter: 2.4, status: 'inconclusive' },
  ] as const)('derives $status from $name', ({ name: _name, status, ...facts }) => {
    expect(deriveThumbnailTrackingStatus(facts)).toBe(status);
  });
});
