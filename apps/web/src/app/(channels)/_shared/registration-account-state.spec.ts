import { describe, expect, it } from 'vitest';
import type { RegistrationAccountState } from '@kiditem/shared/sales-product';
import {
  canPrepareRegistration,
  isLiveRegistrationState,
  productRegistrationSummary,
  registrationBadges,
  registrationStateLabel,
  registrationStateTone,
} from './registration-account-state';
import { MALL_STOP_TONE } from './mall-presentation';

function account(overrides: Partial<RegistrationAccountState> = {}): RegistrationAccountState {
  return {
    channelAccountId: '00000000-0000-4000-8000-000000000001',
    channel: 'mall-a',
    channelAccountName: '몰 A',
    registrationTargetId: '00000000-0000-4000-8000-0000000000a1',
    channelListingId: null,
    externalListingId: null,
    listingState: null,
    listingRawStatus: null,
    listingActive: false,
    state: 'unregistered',
    soldOut: false,
    changedSinceRegistration: false,
    selectedThumbnailAssetId: null,
    selectedDetailPageRevisionId: null,
    lastExecution: null,
    ...overrides,
  };
}

describe('registration account state labels', () => {
  it('names every account state in the operator vocabulary', () => {
    expect(registrationStateLabel('unregistered')).toBe('미등록');
    expect(registrationStateLabel('preparing')).toBe('준비 중');
    expect(registrationStateLabel('submitting')).toBe('전송 중');
    expect(registrationStateLabel('confirming')).toBe('확인 대기');
    expect(registrationStateLabel('registered')).toBe('등록됨');
    expect(registrationStateLabel('failed')).toBe('실패');
  });

  it('tones live states as progress, registered as success and failed as danger', () => {
    expect(registrationStateTone('unregistered')).toBe('neutral');
    expect(registrationStateTone('preparing')).toBe('progress');
    expect(registrationStateTone('submitting')).toBe('progress');
    expect(registrationStateTone('confirming')).toBe('progress');
    expect(registrationStateTone('registered')).toBe('success');
    expect(registrationStateTone('failed')).toBe('danger');
  });

  it('treats only preparing, submitting and confirming as live', () => {
    expect(['preparing', 'submitting', 'confirming'].every((state) => isLiveRegistrationState(state as never))).toBe(true);
    expect(['unregistered', 'registered', 'failed'].some((state) => isLiveRegistrationState(state as never))).toBe(false);
  });

  it('opens registration preparation only for an unregistered or failed account', () => {
    expect(canPrepareRegistration('unregistered')).toBe(true);
    expect(canPrepareRegistration('failed')).toBe(true);
    expect(canPrepareRegistration('registered')).toBe(false);
    expect(canPrepareRegistration('submitting')).toBe(false);
  });
});

describe('registrationBadges', () => {
  it('shows the state alone for an account without overlays', () => {
    expect(registrationBadges(account({ state: 'submitting' }))).toEqual([
      { key: 'state', label: '전송 중', tone: 'progress' },
    ]);
  });

  it('adds sold-out (red, like every sold-out cell) and needs-re-send after the state of a registered account', () => {
    expect(registrationBadges(account({
      state: 'registered', listingState: 'published', listingRawStatus: '승인완료', listingActive: true, soldOut: true, changedSinceRegistration: true,
    }))).toEqual([
      { key: 'state', label: '등록됨', tone: 'success' },
      { key: 'soldOut', label: '품절', tone: 'danger', className: MALL_STOP_TONE.sold_out },
      { key: 'changed', label: '변경됨 · 재전송 필요', tone: 'warning' },
    ]);
  });

  it('greens 등록됨 only for a published listing or a fence-confirmed success the mall has not returned yet', () => {
    expect(registrationBadges(account({ state: 'registered', listingState: 'published', listingActive: true }))[0])
      .toEqual({ key: 'state', label: '등록됨', tone: 'success' });
    expect(registrationBadges(account({ state: 'registered', listingState: null })))
      .toEqual([{ key: 'state', label: '등록됨', tone: 'success' }]);
  });

  it('keeps the mall listing pill beside 등록됨 when the mall has not published it — 미승인 · 반려 · 판매중지 · 검수중', () => {
    const registered = (listingState: RegistrationAccountState['listingState'], listingRawStatus: string | null) =>
      registrationBadges(account({ state: 'registered', listingState, listingRawStatus, listingActive: true }));
    expect(registered('reviewing', '승인대기')).toEqual([
      { key: 'state', label: '등록됨', tone: 'neutral' },
      { key: 'listing', label: '미승인', tone: 'progress', className: MALL_STOP_TONE.pending },
    ]);
    expect(registered('error', '승인반려')[1]).toEqual({ key: 'listing', label: '승인반려', tone: 'danger', className: MALL_STOP_TONE.blocked });
    expect(registered('paused', '판매중지')[1]).toEqual({ key: 'listing', label: '판매중지', tone: 'danger', className: MALL_STOP_TONE.sold_out });
    expect(registered('reviewing', null)[1]).toMatchObject({ key: 'listing', label: '검수중' });
    expect(registered('unknown', 'observed')[1]).toMatchObject({ key: 'listing', label: '확인필요' });
  });

  it('reads a taken-down listing as 등록됨 · 내림', () => {
    expect(registrationBadges(account({ state: 'registered', listingState: 'paused', listingRawStatus: '판매중지', listingActive: false })))
      .toEqual([{ key: 'state', label: '등록됨 · 내림', tone: 'neutral' }]);
  });
});

describe('productRegistrationSummary', () => {
  it('reads an empty account list as unregistered', () => {
    expect(productRegistrationSummary([])).toMatchObject({ state: 'unregistered', label: '미등록', tone: 'neutral' });
  });

  it('counts registered malls and names changed and sold-out ones', () => {
    const summary = productRegistrationSummary([
      account({ state: 'registered', changedSinceRegistration: true }),
      account({ state: 'registered' }),
      account({ state: 'registered', soldOut: true }),
      account({ state: 'unregistered' }),
    ]);
    expect(summary).toMatchObject({
      state: 'registered',
      label: '3몰 등록 · 1 품절 · 1 변경됨',
      registeredCount: 3,
      tone: 'warning',
    });
  });

  it('leads with a live execution over registered malls', () => {
    expect(productRegistrationSummary([
      account({ state: 'registered' }),
      account({ state: 'confirming' }),
    ])).toMatchObject({ state: 'confirming', label: '확인 대기 · 1몰 등록', tone: 'progress' });
  });

  it('shows a failure when nothing is registered', () => {
    expect(productRegistrationSummary([account({ state: 'failed' })])).toMatchObject({
      state: 'failed',
      label: '실패',
      tone: 'danger',
    });
  });
});
