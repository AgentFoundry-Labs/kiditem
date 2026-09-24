import { describe, expect, it } from 'vitest';
import { decideRegistrationAccountState, type RegistrationAccountInputs } from './registration-account-state';

const current = { targetVersion: 3, productVersion: 5, detailPageRevisionId: 'rev-1', thumbnailAssetId: 'asset-1' } as const;
const frozenSame = { targetVersion: 3, productVersion: 5, detailPageRevisionId: 'rev-1', representativeImageAssetId: 'asset-1' } as const;

function inputs(overrides: Partial<RegistrationAccountInputs>): RegistrationAccountInputs {
  return {
    hasTarget: true,
    listing: null,
    latestListingShaping: null,
    lastSucceededFrozen: null,
    latestAvailability: null,
    current,
    ...overrides,
  };
}

describe('registration account state', () => {
  it('살아 있는 등록성 실행이 리스팅보다 먼저다 — 준비 중 · 전송 중 · 확인 대기', () => {
    expect(decideRegistrationAccountState(inputs({ listing: { state: 'published', active: true, soldOut: false }, latestListingShaping: { kind: 'update', status: 'prepared', providerOutcome: 'not_attempted' } })).state).toBe('preparing');
    expect(decideRegistrationAccountState(inputs({ latestListingShaping: { kind: 'register', status: 'executing', providerOutcome: 'not_attempted' } })).state).toBe('submitting');
    expect(decideRegistrationAccountState(inputs({ latestListingShaping: { kind: 'register', status: 'executing', providerOutcome: 'succeeded' } })).state).toBe('confirming');
    expect(decideRegistrationAccountState(inputs({ latestListingShaping: { kind: 'register', status: 'reconciling', providerOutcome: 'uncertain' } })).state).toBe('confirming');
  });

  it('리스팅이 있으면 등록됨이다 — 옛 실행이 실패했거나 카탈로그로만 들어왔어도', () => {
    expect(decideRegistrationAccountState(inputs({ listing: { state: 'published', active: true, soldOut: false }, latestListingShaping: { kind: 'update', status: 'failed', providerOutcome: 'definitive_failure' } })).state).toBe('registered');
    expect(decideRegistrationAccountState(inputs({ hasTarget: false, listing: { state: 'unknown', active: true, soldOut: false } })).state).toBe('registered');
    // 내린 리스팅도 등록됨이다 — 화면이 listingActive 로 "내림"을 얹는다.
    expect(decideRegistrationAccountState(inputs({ listing: { state: 'paused', active: false, soldOut: false } })).state).toBe('registered');
  });

  it('리스팅이 없으면 마지막 등록성 실행이 말한다 — 실패 · 등록됨 · 미등록', () => {
    expect(decideRegistrationAccountState(inputs({ latestListingShaping: { kind: 'register', status: 'failed', providerOutcome: 'definitive_failure' } })).state).toBe('failed');
    expect(decideRegistrationAccountState(inputs({ latestListingShaping: { kind: 'register', status: 'succeeded', providerOutcome: 'succeeded' } })).state).toBe('registered');
    expect(decideRegistrationAccountState(inputs({ latestListingShaping: { kind: 'register', status: 'cancelled', providerOutcome: 'not_attempted' } })).state).toBe('unregistered');
    expect(decideRegistrationAccountState(inputs({})).state).toBe('unregistered');
  });

  it('품절은 몰이 보고한 리스팅 상태가 먼저고, 몰 상태를 모를 때만 마지막 성공한 가용성 실행이 말하며, 등록됨일 때만 얹힌다', () => {
    const published = { state: 'published' as const, active: true, soldOut: false };
    expect(decideRegistrationAccountState(inputs({ listing: { ...published, soldOut: true } })).soldOut).toBe(true);
    // 우리가 sold_out 을 보냈어도 그 뒤 몰이 판매중이라 보고하면 몰이 맞다.
    expect(decideRegistrationAccountState(inputs({ listing: published, latestAvailability: { kind: 'sold_out', status: 'succeeded' } })).soldOut).toBe(false);
    expect(decideRegistrationAccountState(inputs({ listing: { state: 'paused', active: true, soldOut: true }, latestAvailability: { kind: 'resume', status: 'succeeded' } })).soldOut).toBe(true);
    // 몰 상태를 모르면 마지막 성공한 가용성 실행.
    expect(decideRegistrationAccountState(inputs({ listing: { state: 'unknown', active: true, soldOut: false }, latestAvailability: { kind: 'sold_out', status: 'succeeded' } })).soldOut).toBe(true);
    expect(decideRegistrationAccountState(inputs({ listing: { state: 'unknown', active: true, soldOut: false }, latestAvailability: { kind: 'sold_out', status: 'failed' } })).soldOut).toBe(false);
    expect(decideRegistrationAccountState(inputs({ latestListingShaping: { kind: 'register', status: 'succeeded', providerOutcome: 'succeeded' }, latestAvailability: { kind: 'sold_out', status: 'succeeded' } })).soldOut).toBe(true);
    // 등록되지 않았으면 늘 false.
    expect(decideRegistrationAccountState(inputs({ latestAvailability: { kind: 'sold_out', status: 'succeeded' } })).soldOut).toBe(false);
  });

  it('재전송 필요는 등록됨일 때 얼린 값과 지금 값이 다르면 true 다', () => {
    const registered = { listing: { state: 'published' as const, active: true, soldOut: false } };
    expect(decideRegistrationAccountState(inputs({ ...registered, lastSucceededFrozen: frozenSame })).changedSinceRegistration).toBe(false);
    expect(decideRegistrationAccountState(inputs({ ...registered, lastSucceededFrozen: { ...frozenSame, productVersion: 4 } })).changedSinceRegistration).toBe(true);
    expect(decideRegistrationAccountState(inputs({ ...registered, lastSucceededFrozen: { ...frozenSame, targetVersion: 2 } })).changedSinceRegistration).toBe(true);
    expect(decideRegistrationAccountState(inputs({ ...registered, lastSucceededFrozen: { ...frozenSame, detailPageRevisionId: 'rev-0' } })).changedSinceRegistration).toBe(true);
    expect(decideRegistrationAccountState(inputs({ ...registered, lastSucceededFrozen: { ...frozenSame, representativeImageAssetId: 'asset-0' } })).changedSinceRegistration).toBe(true);
    // 얼린 값이 없던 항목(옛 실행 · update 는 상세를 얼리지 않음)은 비교하지 않는다.
    expect(decideRegistrationAccountState(inputs({ ...registered, lastSucceededFrozen: { ...frozenSame, detailPageRevisionId: null, representativeImageAssetId: null } })).changedSinceRegistration).toBe(false);
    // 등록되지 않았으면 늘 false.
    expect(decideRegistrationAccountState(inputs({ lastSucceededFrozen: { ...frozenSame, productVersion: 1 } })).changedSinceRegistration).toBe(false);
  });
});
