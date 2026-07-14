import { describe, expect, it } from 'vitest';
import {
  PRODUCT_PREPARATION_SUBMISSION_LEASE_MS,
  blocksCandidateTerminalTransition,
  canDiscardProviderIdentity,
  canStartProviderCreate,
  hasLiveSubmissionLease,
  resolveProviderOutcome,
} from './product-preparation-state';

describe('ProductPreparation provider state policy', () => {
  it.each([
    ['not_attempted', true],
    ['definitive_failure', true],
    ['uncertain', false],
    ['succeeded', false],
  ] as const)('allows provider create only from %s = %s', (outcome, expected) => {
    expect(canStartProviderCreate(outcome)).toBe(expected);
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

  it('uses the fixed lease duration and treats the exact expiry boundary as stale', () => {
    const now = new Date('2026-07-13T00:10:00.000Z');
    const exactBoundary = new Date(now.getTime() - PRODUCT_PREPARATION_SUBMISSION_LEASE_MS);
    const stillLive = new Date(exactBoundary.getTime() + 1);

    expect(hasLiveSubmissionLease({
      token: '11111111-1111-4111-8111-111111111111',
      claimedAt: stillLive,
      now,
    })).toBe(true);
    expect(hasLiveSubmissionLease({
      token: '11111111-1111-4111-8111-111111111111',
      claimedAt: exactBoundary,
      now,
    })).toBe(false);
    expect(hasLiveSubmissionLease({ token: null, claimedAt: stillLive, now })).toBe(false);
  });
});
