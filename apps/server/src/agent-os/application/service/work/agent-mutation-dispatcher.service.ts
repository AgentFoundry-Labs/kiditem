import type { AgentResultEnvelope } from '@kiditem/shared/agent-interaction';
import type { MutationWorkSnapshot } from '../../port/out/work/agent-work-persistence.types';
import type { AgentWorkMutationPort } from '../../port/out/work/agent-work-mutation.port';
import { AgentCapabilityRegistry } from '../agent-capability-registry.service';
import { capabilityContractFingerprint } from './agent-capability-invocation.service';

const DEFAULT_LEASE_MS = 60_000;

export interface AgentMutationRuntimeIdentity {
  applicationVersion: string;
  gitSha: string;
}

/**
 * The worker's sole durable mutation consumer. It never admits attempts: a
 * claimed Invocation is replayed with its frozen input and owner key.
 */
export class AgentMutationDispatcherService {
  constructor(
    private readonly work: AgentWorkMutationPort,
    private readonly capabilities: Pick<AgentCapabilityRegistry, 'resolveDefinition' | 'resolveImplementation'>,
    private readonly runtime: AgentMutationRuntimeIdentity,
    private readonly now: () => Date = () => new Date(),
    private readonly leaseMs = DEFAULT_LEASE_MS,
  ) {}

  async dispatchOne(workerId: string): Promise<boolean> {
    const claimedAt = this.now();
    const work = await this.work.claimMutation({
      workerId,
      claimedAt,
      leaseExpiresAt: new Date(claimedAt.getTime() + this.leaseMs),
    });
    if (!work) return false;

    if (work.authorizationExpiresAt <= claimedAt) {
      await this.fail(work, {
        code: 'authorization_expired',
        message: 'Capability authorization expired.',
      }, claimedAt);
      return true;
    }

    const invalid = this.validate(work);
    if (invalid) {
      await this.fail(work, invalid, claimedAt);
      return true;
    }

    const implementation = this.capabilities.resolveImplementation(work.capabilityKey);
    if (!implementation || implementation.capabilityKey !== work.capabilityKey) {
      await this.fail(work, {
        code: 'stale_capability_version',
        message: 'Capability version is no longer current.',
      }, claimedAt);
      return true;
    }

    try {
      const result = await implementation.invoke({
        context: {
          organizationId: work.organizationId,
          initiatingUserId: work.initiatingUserId,
          sessionId: work.sessionId,
          taskId: work.taskId,
          attemptId: work.attemptId,
          agentVersionId: work.agentVersionId,
          ownerIdempotencyKey: work.ownerIdempotencyKey,
          applicationVersion: work.applicationVersion,
          authorizingGitSha: work.authorizingGitSha,
          runtimeType: work.runtimeType,
        },
        input: work.canonicalInput as Record<string, unknown>,
      });
      await this.work.finalizeMutation({
        organizationId: work.organizationId,
        invocationId: work.invocationId,
        leaseOwner: work.leaseOwner,
        outcome: 'succeeded',
        result: concise(result),
        finishedAt: this.now(),
      });
    } catch (error) {
      await this.fail(work, errorCode(error), this.now());
    }
    return true;
  }

  private validate(work: MutationWorkSnapshot): { code: string; message: string } | null {
    const definition = this.capabilities.resolveDefinition(work.capabilityKey);
    if (!definition ||
      work.authorizingGitSha !== this.runtime.gitSha ||
      work.applicationVersion !== this.runtime.applicationVersion ||
      work.capabilityContractFingerprint !== capabilityContractFingerprint(definition) ||
      definition.ownerDomain !== work.ownerDomain) {
      return { code: 'stale_capability_version', message: 'Capability version is no longer current.' };
    }
    return null;
  }

  private fail(work: MutationWorkSnapshot, error: { code: string; message: string }, finishedAt: Date): Promise<unknown> {
    return this.work.finalizeMutation({
      organizationId: work.organizationId,
      invocationId: work.invocationId,
      leaseOwner: work.leaseOwner,
      outcome: 'failed',
      error,
      finishedAt,
    });
  }
}

function concise(result: AgentResultEnvelope): AgentResultEnvelope {
  return {
    outcome: result.outcome,
    summary: result.summary.slice(0, 1_000),
    resourceRefs: result.resourceRefs.slice(0, 50),
    operationRefs: result.operationRefs.slice(0, 50),
    output: result.output,
  };
}

function errorCode(error: unknown): { code: string; message: string } {
  if (error && typeof error === 'object' && 'code' in error &&
    (error as { code?: unknown }).code === 'stale_resource') {
    return { code: 'stale_resource', message: 'Capability resource is no longer current.' };
  }
  return {
    code: 'capability_execution_failed',
    message: error instanceof Error ? error.message.slice(0, 1_000) : 'Capability execution failed.',
  };
}
