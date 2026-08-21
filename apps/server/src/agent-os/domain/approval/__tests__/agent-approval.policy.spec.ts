import { describe, expect, it } from 'vitest';
import { assertApprovalDecision, isApprovalExpired } from '../agent-approval.policy';

describe('agent approval policy', () => {
  it('rejects expired decisions and invalid state changes', () => {
    expect(isApprovalExpired(new Date('2020-01-01T00:00:00.000Z'), new Date('2020-01-02T00:00:00.000Z'))).toBe(true);
    expect(() => assertApprovalDecision('pending', 'approved')).not.toThrow();
    expect(() => assertApprovalDecision('approved', 'rejected')).toThrow(
      'AGENT_APPROVAL_DECISION_INVALID',
    );
  });
});
