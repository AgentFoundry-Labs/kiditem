import { AgentOsBoundaryError } from '../agent-os.errors';

export function isApprovalExpired(expiresAt: Date, now: Date): boolean {
  return expiresAt <= now;
}

export function assertApprovalDecision(current: string, next: 'approved' | 'rejected'): void {
  if (current !== 'pending' || !['approved', 'rejected'].includes(next)) {
    throw new AgentOsBoundaryError('AGENT_APPROVAL_DECISION_INVALID');
  }
}
