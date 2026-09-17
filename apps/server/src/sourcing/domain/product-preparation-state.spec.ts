import { describe, expect, it } from 'vitest';
import {
  blocksCandidateTerminalTransition,
  canDiscardProviderIdentity,
  resolveProviderOutcome,
} from './product-preparation-state';

describe('ProductPreparation provider state policy', () => {
  /**
   * 생성 가능 판정은 이 파일 밖으로 나가지 않는다 — 폐기 가능 여부로만 관찰한다.
   * 등록 실행의 리스·재시도는 Channels 울타리가 소유한다(ADR-0014).
   */
  it.each([
    ['not_attempted', true],
    ['definitive_failure', true],
    ['uncertain', false],
    ['succeeded', false],
  ] as const)('discards a clean identity only from %s = %s', (outcome, expected) => {
    expect(canDiscardProviderIdentity({
      outcome,
      providerSubmissionId: null,
      registrationResult: null,
    })).toBe(expected);
  });

  it('maps legacy frozen identities conservatively while keeping untouched drafts retryable', () => {
    expect(resolveProviderOutcome({
      providerOutcome: null,
      status: 'draft',
      submissionKey: null,
      providerSubmissionId: null,
      registrationResult: null,
    })).toBe('not_attempted');
    expect(resolveProviderOutcome({
      providerOutcome: null,
      status: 'failed',
      submissionKey: 'frozen-key',
      providerSubmissionId: null,
      registrationResult: null,
    })).toBe('uncertain');
    expect(resolveProviderOutcome({
      providerOutcome: null,
      status: 'failed',
      submissionKey: 'frozen-key',
      providerSubmissionId: 'provider-1',
      registrationResult: null,
    })).toBe('succeeded');
  });

  it('never lets unknown future outcome strings enable create or identity discard', () => {
    expect(resolveProviderOutcome({
      providerOutcome: 'future_outcome',
      status: 'failed',
      submissionKey: 'frozen-key',
      providerSubmissionId: null,
      registrationResult: null,
    })).toBe('uncertain');
    expect(resolveProviderOutcome({
      providerOutcome: 'future_outcome',
      status: 'draft',
      submissionKey: null,
      providerSubmissionId: null,
      registrationResult: null,
    })).toBe('uncertain');
    expect(canDiscardProviderIdentity({
      outcome: 'uncertain',
      providerSubmissionId: null,
      registrationResult: null,
    })).toBe(false);
  });

  it('permits discard only after a proven non-create and without recorded success identity', () => {
    expect(canDiscardProviderIdentity({
      outcome: 'definitive_failure',
      providerSubmissionId: null,
      registrationResult: null,
    })).toBe(true);
    expect(canDiscardProviderIdentity({
      outcome: 'definitive_failure',
      providerSubmissionId: 'provider-1',
      registrationResult: null,
    })).toBe(false);
  });

  it.each([
    [{ status: 'draft', outcome: 'not_attempted', submissionKey: null }, true],
    [{ status: 'submitting', outcome: 'not_attempted', submissionKey: 'key' }, true],
    [{ status: 'failed', outcome: 'uncertain', submissionKey: 'key' }, true],
    [{ status: 'failed', outcome: 'succeeded', submissionKey: 'key' }, true],
    [{ status: 'failed', outcome: 'definitive_failure', submissionKey: 'key' }, false],
    [{ status: 'registered', outcome: 'succeeded', submissionKey: 'key' }, false],
  ] as const)('applies the candidate terminal blocker policy %#', (state, expected) => {
    expect(blocksCandidateTerminalTransition({
      ...state,
      providerSubmissionId: null,
      registrationResult: null,
    })).toBe(expected);
  });
});
