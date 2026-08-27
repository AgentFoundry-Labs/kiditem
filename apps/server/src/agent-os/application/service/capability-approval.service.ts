import { AgentOsError } from '../../domain/agent-os.errors';
import type { CapabilityMutationDispatcherPort } from './capability-mutation-dispatcher.service';
import type {
  CapabilityApprovalPort,
  DecideCapabilityApprovalInput,
} from '../port/in/capability/capability-invocation.port';
import type {
  CapabilityInvocationRecord,
  CapabilityInvocationRepositoryPort,
} from '../port/out/capability-invocation.repository.port';

/** Same-origin user confirmation that dispatches only an exactly approved receipt. */
export class CapabilityApprovalService implements CapabilityApprovalPort {
  constructor(
    private readonly repository: CapabilityInvocationRepositoryPort,
    private readonly dispatcher: CapabilityMutationDispatcherPort,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async decide(
    input: DecideCapabilityApprovalInput,
  ): Promise<CapabilityInvocationRecord> {
    if (!input.userId?.trim()) {
      throw new AgentOsError('CAPABILITY_NOT_FOUND', 'Authenticated user is required.');
    }
    const current = await this.repository.findById({
      organizationId: input.organizationId,
      invocationId: input.invocationId,
    });
    if (!current) {
      throw new AgentOsError('CAPABILITY_NOT_FOUND', 'Capability invocation was not found.');
    }
    if (current.approvalStatus === 'expired') {
      throw new AgentOsError('APPROVAL_EXPIRED', 'Capability approval expired.');
    }
    if (current.approvalStatus === 'rejected' && input.decision === 'approved') {
      throw new AgentOsError('APPROVAL_REJECTED', 'Capability approval was rejected.');
    }
    const decision = await this.repository.decideApproval({
      organizationId: input.organizationId,
      invocationId: input.invocationId,
      userId: input.userId,
      inputHash: current.inputHash,
      decision: input.decision,
      reason: normalizeReason(input.reason),
      decidedAt: this.now(),
    });
    return input.decision === 'approved' && decision.transitioned
      ? this.dispatcher.dispatch(decision.invocation)
      : decision.invocation;
  }
}

function normalizeReason(value: string | undefined): string | null {
  const normalized = value?.trim();
  return normalized ? normalized.slice(0, 1_000) : null;
}
