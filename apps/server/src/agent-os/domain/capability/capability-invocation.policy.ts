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

export function requiresUserApproval(
  approvalRisk: CapabilityApprovalRisk,
): boolean {
  return approvalRisk === 'medium' || approvalRisk === 'high';
}

/** The only owner key for one admitted mutation. It is intentionally opaque. */
export function ownerInvocationKey(invocationId: string): string {
  return `capability-invocation:${invocationId}`;
}
