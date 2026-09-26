import { Injectable, type OnApplicationBootstrap } from '@nestjs/common';
import {
  CapabilityResultEnvelopeSchema,
  CapabilityResultReceiptSchema,
  type CapabilityResultEnvelope,
  type CapabilityResultReceipt,
} from '@kiditem/shared/agent-interaction';
import { MUTATION_EFFECTS } from '../../../common/capability-definition';
import {
  canonicalizeOwnerInput,
  canonicalOwnerInputHash,
} from '../../../common/owner-idempotency-key';
import { AGENT_DEFINITIONS } from '../../domain/agent-definition.registry';
import { AgentOsError } from '../../domain/agent-os.errors';
import {
  deriveCapabilityApprovalState,
  hasCapabilityApprovalPolicyDrift,
  ownerInvocationKey,
} from '../../domain/capability/capability-invocation.policy';
import type { AgentCapabilityRegistry } from './agent-capability-registry.service';
import type {
  CapabilityInvocationRecord,
  CapabilityInvocationRepositoryPort,
} from '../port/out/capability-invocation.repository.port';

export const CAPABILITY_APPROVED_PENDING_BOOTSTRAP_LIMIT = 100;

export interface CapabilityMutationDispatcherPort {
  dispatch(invocation: CapabilityInvocationRecord): Promise<CapabilityInvocationRecord>;
}

/** An owner may use this only when it can prove no write committed. */
export class OwnerKnownFailureError extends Error {
  readonly knownNoCommit = true;

  constructor(message: string) {
    super(message);
    this.name = 'OwnerKnownFailureError';
  }
}

/** An owner outcome may have committed before the server lost the result. */
export class OwnerResultAmbiguousError extends AgentOsError {
  constructor(readonly invocationId: string) {
    super(
      'OWNER_RESULT_AMBIGUOUS',
      'Owner result is ambiguous; retry with the original requestKey.',
    );
    this.name = 'OwnerResultAmbiguousError';
  }
}

@Injectable()
export class CapabilityMutationDispatcher
  implements CapabilityMutationDispatcherPort, OnApplicationBootstrap
{
  private readonly inFlightByInvocationId = new Map<
    string,
    Promise<CapabilityInvocationRecord>
  >();
  private bootstrapSweep?: Promise<void>;

  constructor(
    private readonly repository: CapabilityInvocationRepositoryPort,
    private readonly capabilities: Pick<
      AgentCapabilityRegistry,
      'resolveDefinition' | 'resolveImplementation'
    >,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async dispatch(
    invocation: CapabilityInvocationRecord,
  ): Promise<CapabilityInvocationRecord> {
    const existing = this.inFlightByInvocationId.get(invocation.id);
    if (existing) return existing;

    const flight = this.dispatchPersisted(invocation);
    this.inFlightByInvocationId.set(invocation.id, flight);
    void flight.then(
      () => this.clearFlight(invocation.id, flight),
      () => this.clearFlight(invocation.id, flight),
    );
    return flight;
  }

  /** Nest waits for this one bounded recovery sweep before the API can listen. */
  onApplicationBootstrap(): Promise<void> {
    this.bootstrapSweep ??= this.runBootstrapSweep();
    return this.bootstrapSweep;
  }

  private async runBootstrapSweep(): Promise<void> {
    const approvedPending = await this.repository.listApprovedPending({
      limit: CAPABILITY_APPROVED_PENDING_BOOTSTRAP_LIMIT,
    });
    await Promise.allSettled(
      approvedPending.map((invocation) => this.dispatch(invocation)),
    );
  }

  private clearFlight(
    invocationId: string,
    flight: Promise<CapabilityInvocationRecord>,
  ): void {
    if (this.inFlightByInvocationId.get(invocationId) === flight) {
      this.inFlightByInvocationId.delete(invocationId);
    }
  }

  /**
   * Every field passed to an owner comes from the freshly persisted receipt,
   * not an approval request, replay payload, active turn, or provider retry.
   */
  private async dispatchPersisted(
    requested: CapabilityInvocationRecord,
  ): Promise<CapabilityInvocationRecord> {
    const invocation = await this.repository.findById({
      organizationId: requested.organizationId,
      invocationId: requested.id,
    });
    if (!invocation) {
      throw new AgentOsError('CAPABILITY_NOT_FOUND', 'Capability invocation was not found.');
    }
    if (invocation.status !== 'pending') return invocation;
    const approval = deriveCapabilityApprovalState(invocation, this.now());
    if (approval !== 'not_required' && approval !== 'approved') {
      return invocation;
    }
    if (
      approval === 'approved'
      && invocation.approvalInputHash !== invocation.inputHash
    ) {
      throw capabilityDrift();
    }

    const definition = this.capabilities.resolveDefinition(invocation.capabilityKey);
    if (!definition) {
      throw new AgentOsError('CAPABILITY_NOT_FOUND', 'Capability was not found.');
    }
    if (hasCapabilityApprovalPolicyDrift(approval, definition.approvalRisk)) {
      throw capabilityDrift();
    }
    if (!isMutation(definition.effects)) {
      throw capabilityDrift();
    }
    const agent = AGENT_DEFINITIONS.find(
      (candidate) => candidate.key === invocation.actingAgentKey,
    );
    if (!agent || !agent.assignedDomains.includes(definition.ownerDomain)) {
      throw new AgentOsError(
        'ACTING_AGENT_DOMAIN_MISMATCH',
        'The acting Agent is not assigned to the capability owner domain.',
      );
    }

    const input = persistedCanonicalInput(invocation, definition.inputSchema);
    const implementation = this.capabilities.resolveImplementation(invocation.capabilityKey);
    if (
      !implementation
      || implementation.capabilityKey !== invocation.capabilityKey
    ) {
      throw new AgentOsError('CAPABILITY_NOT_FOUND', 'Capability implementation was not found.');
    }

    try {
      const result = CapabilityResultEnvelopeSchema.parse(
        await implementation.invoke({
          context: {
            organizationId: invocation.organizationId,
            initiatingUserId: invocation.initiatingUserId,
            executionId: invocation.id,
            ownerIdempotencyKey: ownerInvocationKey(invocation.id),
            ownerInputHash: invocation.inputHash,
          },
          input,
        }),
      );
      definition.outputSchema.parse(result.output);
      return this.repository.recordSucceeded({
        organizationId: invocation.organizationId,
        invocationId: invocation.id,
        result: ownerResultReceipt(result),
        finishedAt: this.now(),
      });
    } catch (error) {
      if (isKnownNoCommitOwnerFailure(error)) {
        return this.repository.recordKnownFailure({
          organizationId: invocation.organizationId,
          invocationId: invocation.id,
          error: {
            code: 'OWNER_KNOWN_FAILURE',
            message: boundedMessage(
              error.message,
              'Owner reported a known failure before commit.',
            ),
          },
          finishedAt: this.now(),
        });
      }
      if (error instanceof AgentOsError) throw error;
      // The owner may have committed before a timeout, disconnect, or invalid
      // response. Preserve pending state for same-request replay or the next
      // bounded API-bootstrap sweep under the same owner key.
      throw new OwnerResultAmbiguousError(invocation.id);
    }
  }
}

function persistedCanonicalInput(
  invocation: CapabilityInvocationRecord,
  inputSchema: { parse(input: unknown): unknown },
): Record<string, unknown> {
  try {
    const parsed = inputSchema.parse(invocation.canonicalInput);
    const canonical = canonicalizeOwnerInput(parsed);
    if (!isRecord(canonical) || canonicalOwnerInputHash(canonical) !== invocation.inputHash) {
      throw new Error('capability_input_hash_drift');
    }
    return canonical;
  } catch {
    throw capabilityDrift();
  }
}

function isMutation(effects: readonly string[]): boolean {
  return effects.some((effect) => MUTATION_EFFECTS.has(effect as never));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function capabilityDrift(): AgentOsError {
  return new AgentOsError(
    'CAPABILITY_POLICY_DRIFT',
    'Capability contract changed after this request was admitted.',
  );
}

function isKnownNoCommitOwnerFailure(
  error: unknown,
): error is Error & { readonly knownNoCommit: true } {
  return (
    error instanceof OwnerKnownFailureError
    || (error instanceof Error
      && (error as { readonly knownNoCommit?: unknown }).knownNoCommit === true)
  );
}

function ownerResultReceipt(result: CapabilityResultEnvelope): CapabilityResultReceipt {
  return CapabilityResultReceiptSchema.parse({
    summary: result.summary,
    resourceRefs: result.resourceRefs,
  });
}

function boundedMessage(value: string, fallback: string): string {
  const normalized = value.trim();
  return (normalized || fallback).slice(0, 1_000);
}
