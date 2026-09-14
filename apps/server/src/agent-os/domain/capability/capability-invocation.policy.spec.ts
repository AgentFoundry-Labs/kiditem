import { describe, expect, it } from 'vitest';
import {
  CAPABILITY_APPROVAL_WINDOW_MS,
  deriveCapabilityApprovalState,
  hasCapabilityApprovalPolicyDrift,
  ownerInvocationKey,
  requiresUserApproval,
  type CapabilityApprovalFacts,
} from './capability-invocation.policy';

const REQUESTED_AT = new Date('2026-09-14T00:00:00.000Z');
const EXPIRES_AT = new Date('2026-09-14T00:30:00.000Z');
const BEFORE_EXPIRY = new Date('2026-09-14T00:29:59.999Z');
const AFTER_EXPIRY = new Date('2026-09-14T00:30:00.001Z');
const NO_APPROVAL_REQUEST = {
  approvalInputHash: null,
  approvalRequestedAt: null,
  approvalExpiresAt: null,
};

describe('capability invocation policy', () => {
  it('requires an explicit user decision only for medium and high risk mutations', () => {
    expect(requiresUserApproval('none')).toBe(false);
    expect(requiresUserApproval('low')).toBe(false);
    expect(requiresUserApproval('medium')).toBe(true);
    expect(requiresUserApproval('high')).toBe(true);
  });

  it('derives not_required only when approval was never requested or decided', () => {
    for (const status of ['pending', 'succeeded', 'failed'] as const) {
      expect(deriveCapabilityApprovalState(
        facts({ ...NO_APPROVAL_REQUEST, status }),
        AFTER_EXPIRY,
      )).toBe('not_required');
    }
  });

  it('keeps an undecided request pending only before its expiry', () => {
    expect(deriveCapabilityApprovalState(facts(), BEFORE_EXPIRY)).toBe('pending');
    expect(deriveCapabilityApprovalState(facts(), EXPIRES_AT)).toBe('expired');
    expect(deriveCapabilityApprovalState(facts(), AFTER_EXPIRY)).toBe('expired');
  });

  it('keeps an undecided request expired once its invocation finished, whatever the clock', () => {
    expect(deriveCapabilityApprovalState(facts({ status: 'failed' }), BEFORE_EXPIRY)).toBe('expired');
    expect(deriveCapabilityApprovalState(facts({ status: 'succeeded' }), BEFORE_EXPIRY)).toBe('expired');
  });

  it('fails an undecided request without an expiry closed', () => {
    expect(deriveCapabilityApprovalState(facts({ approvalExpiresAt: null }), BEFORE_EXPIRY)).toBe('expired');
    expect(deriveCapabilityApprovalState(
      facts({ ...NO_APPROVAL_REQUEST, approvalRequestedAt: REQUESTED_AT }),
      BEFORE_EXPIRY,
    )).toBe('expired');
  });

  it('lets a recorded decision stand regardless of time, status, or admission facts', () => {
    for (const approvalDecision of ['approved', 'rejected'] as const) {
      expect(deriveCapabilityApprovalState(facts({ approvalDecision }), BEFORE_EXPIRY))
        .toBe(approvalDecision);
      expect(deriveCapabilityApprovalState(facts({ approvalDecision, status: 'failed' }), AFTER_EXPIRY))
        .toBe(approvalDecision);
      expect(deriveCapabilityApprovalState(
        facts({ ...NO_APPROVAL_REQUEST, approvalDecision }),
        AFTER_EXPIRY,
      )).toBe(approvalDecision);
    }
  });

  it('reports drift when the admitted approval requirement differs from the current definition', () => {
    expect(hasCapabilityApprovalPolicyDrift('not_required', 'none')).toBe(false);
    expect(hasCapabilityApprovalPolicyDrift('not_required', 'low')).toBe(false);
    expect(hasCapabilityApprovalPolicyDrift('not_required', 'medium')).toBe(true);
    for (const state of ['pending', 'expired', 'approved', 'rejected'] as const) {
      expect(hasCapabilityApprovalPolicyDrift(state, 'high')).toBe(false);
      expect(hasCapabilityApprovalPolicyDrift(state, 'low')).toBe(true);
    }
  });

  it('derives the opaque owner key solely from the invocation id', () => {
    expect(ownerInvocationKey('00000000-0000-4000-8000-000000000001')).toBe(
      'capability-invocation:00000000-0000-4000-8000-000000000001',
    );
  });

  it('keeps the approval window code-owned and fixed at thirty minutes', () => {
    expect(CAPABILITY_APPROVAL_WINDOW_MS).toBe(30 * 60 * 1_000);
  });
});

function facts(overrides: Partial<CapabilityApprovalFacts> = {}): CapabilityApprovalFacts {
  return {
    status: 'pending',
    approvalInputHash: 'a'.repeat(64),
    approvalRequestedAt: REQUESTED_AT,
    approvalExpiresAt: EXPIRES_AT,
    approvalDecision: null,
    ...overrides,
  };
}
