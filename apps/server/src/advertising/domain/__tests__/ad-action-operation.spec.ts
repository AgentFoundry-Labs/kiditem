import { describe, expect, it } from 'vitest';
import { isOpenAdAction } from '../ad-action-operation';
import { isManualAdActionType } from '../manual-ad-action-types';

describe('isManualAdActionType', () => {
  it('names keyword pauses, bid changes and daily budget changes, and nothing else (KID-138 decision A)', () => {
    expect(
      ['pause_keyword', 'change_bid', 'change_daily_budget', 'create_campaign', 'pause_campaign', 'PAUSE_KEYWORD', '']
        .filter(isManualAdActionType),
    ).toEqual(['pause_keyword', 'change_bid', 'change_daily_budget']);
  });
});

describe('isOpenAdAction', () => {
  it('keeps a proposal awaiting review, an approved manual action, and an approved registration whose run is queued or running open', () => {
    const cases: Array<[string, string, Parameters<typeof isOpenAdAction>[1], boolean]> = [
      ['pending_review', 'change_bid', 'not_prepared', true],
      ['pending_review', 'create_campaign', 'not_prepared', true],
      ['approved', 'pause_keyword', 'not_prepared', true],
      ['rejected', 'pause_keyword', 'not_prepared', false],
      ['approved', 'create_campaign', 'queued', true],
      ['approved', 'create_campaign', 'running', true],
      ['approved', 'create_campaign', 'done', false],
      ['approved', 'create_campaign', 'uncertain', false],
      ['approved', 'create_campaign', 'failed', false],
      ['approved', 'create_campaign', 'not_prepared', false],
      ['rejected', 'create_campaign', 'cancelled', false],
    ];
    for (const [approvalStatus, actionType, executeStatus, open] of cases) {
      expect(isOpenAdAction({ approvalStatus, actionType }, executeStatus), `${approvalStatus} ${actionType} ${executeStatus}`).toBe(open);
    }
  });
});
