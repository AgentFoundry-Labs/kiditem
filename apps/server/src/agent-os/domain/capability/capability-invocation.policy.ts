import type {
  CapabilityInvocationApprovalStatus,
  CapabilityInvocationStatus,
} from '@kiditem/shared/agent-interaction';
import type { CapabilityApprovalRisk } from '../../../common/capability-definition';

/** Approval is a code-owned confirmation window, never a worker schedule. */
export const CAPABILITY_APPROVAL_WINDOW_MS = 30 * 60 * 1_000;

export const CAPABILITY_INVOCATION_ERROR_CODES = [
  'CAPABILITY_NOT_FOUND',
  'CAPABILITY_INPUT_INVALID',
  'REQUEST_KEY_REQUIRED',
  'ACTING_AGENT_REQUIRED',
  'ACTING_AGENT_DOMAIN_MISMATCH',
  'REQUEST_KEY_CONFLICT',
  'APPROVAL_REQUIRED',
  'APPROVAL_REJECTED',
  'APPROVAL_EXPIRED',
  'OWNER_RESULT_AMBIGUOUS',
  'OWNER_KNOWN_FAILURE',
] as const;

export type CapabilityInvocationErrorCode =
  (typeof CAPABILITY_INVOCATION_ERROR_CODES)[number];

/** The user's decision is the only stored approval outcome; every state is derived. */
export const CAPABILITY_APPROVAL_DECISIONS = ['approved', 'rejected'] as const;

export type CapabilityApprovalDecision =
  (typeof CAPABILITY_APPROVAL_DECISIONS)[number];

/** The persisted facts an approval state is derived from. */
export interface CapabilityApprovalFacts {
  status: CapabilityInvocationStatus;
  approvalInputHash: string | null;
  approvalRequestedAt: Date | null;
  approvalExpiresAt: Date | null;
  approvalDecision: CapabilityApprovalDecision | null;
}

export function requiresUserApproval(
  approvalRisk: CapabilityApprovalRisk,
): boolean {
  return approvalRisk === 'medium' || approvalRisk === 'high';
}

/**
 * The one approval rule. Admission facts (input hash, request and expiry times)
 * record that approval was requested, the decision records the user's outcome,
 * and time closes an undecided request:
 *
 * | decision            | admission facts | status              | at                 | state         |
 * |---------------------|-----------------|---------------------|--------------------|---------------|
 * | approved / rejected | any             | any                 | any                | that decision |
 * | none                | none            | any                 | any                | not_required  |
 * | none                | some            | pending             | before expiry      | pending       |
 * | none                | some            | pending             | expiry passed/none | expired       |
 * | none                | some            | succeeded or failed | any                | expired       |
 *
 * Only the expiry sweep finishes an undecided invocation, so its `failed`
 * status keeps the approval expired for every reader, whatever its clock.
 */
export function deriveCapabilityApprovalState(
  facts: CapabilityApprovalFacts,
  at: Date,
): CapabilityInvocationApprovalStatus {
  if (facts.approvalDecision !== null) return facts.approvalDecision;
  if (
    facts.approvalInputHash === null
    && facts.approvalRequestedAt === null
    && facts.approvalExpiresAt === null
  ) {
    return 'not_required';
  }
  return facts.status === 'pending'
    && facts.approvalExpiresAt !== null
    && at.getTime() < facts.approvalExpiresAt.getTime()
    ? 'pending'
    : 'expired';
}

/** Admission facts remain authoritative even when the current definition changes. */
export function hasCapabilityApprovalPolicyDrift(
  approvalState: CapabilityInvocationApprovalStatus,
  approvalRisk: CapabilityApprovalRisk,
): boolean {
  return (approvalState !== 'not_required') !== requiresUserApproval(approvalRisk);
}

/** The only owner key for one admitted mutation. It is intentionally opaque. */
export function ownerInvocationKey(invocationId: string): string {
  return `capability-invocation:${invocationId}`;
}
