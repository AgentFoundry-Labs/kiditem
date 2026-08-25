import {
  CapabilityResultEnvelopeSchema,
  type CapabilityResultEnvelope,
} from '@kiditem/shared/agent-interaction';
import {
  MUTATION_EFFECTS,
  type CapabilityApprovalRisk,
} from '../../../common/capability-definition';
import {
  canonicalizeOwnerInput,
  canonicalOwnerInputHash,
} from '../../../common/owner-idempotency-key';
import type { SourcingCapabilityAdmissionPort } from '../../../sourcing/application/port/in/capability/sourcing-capability-admission.port';
import { AGENT_DEFINITIONS } from '../../domain/agent-definition.registry';
import { AgentOsError } from '../../domain/agent-os.errors';
import {
  ownerInvocationKey,
  requiresUserApproval,
  CAPABILITY_APPROVAL_WINDOW_MS,
} from '../../domain/capability/capability-invocation.policy';
import type { AgentCapabilityRegistry } from './agent-capability-registry.service';
import type {
  CapabilityInvocationPort,
  CapabilityInvocationResult,
  GetCapabilityInvocationInput,
  InvokeCapabilityInput,
} from '../port/in/capability/capability-invocation.port';
import type {
  CapabilityInvocationRecord,
  CapabilityInvocationRepositoryPort,
} from '../port/out/capability-invocation.repository.port';

/** An owner may use this only when it can prove no write committed. */
export class OwnerKnownFailureError extends Error {
  readonly knownNoCommit = true;

  constructor(message: string) {
    super(message);
    this.name = 'OwnerKnownFailureError';
  }
}

/**
 * The invocation was admitted, but an owner call may have committed before a
 * timeout or invalid response. The caller must retry with the original key.
 */
export class OwnerResultAmbiguousError extends AgentOsError {
  constructor(readonly invocationId: string) {
    super(
      'OWNER_RESULT_AMBIGUOUS',
      'Owner result is ambiguous; retry with the original requestKey.',
    );
    this.name = 'OwnerResultAmbiguousError';
  }
}

/**
 * Authenticated receipt projection. Approval risk belongs to the current
 * code-owned capability definition, never to the durable Invocation row.
 */
export type CapabilityInvocationReceipt = Pick<CapabilityInvocationRecord,
  | 'id'
  | 'capabilityKey'
  | 'actingAgentKey'
  | 'canonicalInput'
  | 'status'
  | 'approvalStatus'
  | 'approvalExpiresAt'
> & {
  approvalRisk: CapabilityApprovalRisk;
};

/**
 * Request-driven capability admission. Invocations are replay receipts, never
 * a queue: every execution is caused by this explicit method call.
 */
export class CapabilityInvocationService implements CapabilityInvocationPort {
  constructor(
    private readonly repository: CapabilityInvocationRepositoryPort,
    private readonly capabilities: Pick<
      AgentCapabilityRegistry,
      'resolveDefinition' | 'resolveImplementation'
    >,
    private readonly now: () => Date = () => new Date(),
    private readonly sourcingAdmission?: Pick<SourcingCapabilityAdmissionPort, 'admit'>,
  ) {}

  async get(input: GetCapabilityInvocationInput): Promise<CapabilityInvocationRecord> {
    const invocation = await this.repository.findById({
      organizationId: input.organizationId,
      invocationId: input.invocationId,
    });
    if (!invocation) {
      throw new AgentOsError('CAPABILITY_NOT_FOUND', 'Capability invocation was not found.');
    }
    return invocation;
  }

  async getReceipt(input: GetCapabilityInvocationInput): Promise<CapabilityInvocationReceipt> {
    const invocation = await this.get(input);
    const definition = this.capabilities.resolveDefinition(invocation.capabilityKey);
    if (!definition) {
      throw new AgentOsError('CAPABILITY_NOT_FOUND', 'Capability invocation was not found.');
    }
    return {
      id: invocation.id,
      capabilityKey: invocation.capabilityKey,
      actingAgentKey: invocation.actingAgentKey,
      canonicalInput: invocation.canonicalInput,
      status: invocation.status,
      approvalStatus: invocation.approvalStatus,
      approvalExpiresAt: invocation.approvalExpiresAt,
      approvalRisk: definition.approvalRisk,
    };
  }

  async invoke(input: InvokeCapabilityInput): Promise<CapabilityInvocationResult> {
    const definition = this.capabilities.resolveDefinition(input.capabilityKey);
    if (!definition) {
      throw new AgentOsError('CAPABILITY_NOT_FOUND', 'Capability was not found.');
    }

    let parsedInput: Record<string, unknown>;
    try {
      parsedInput = definition.inputSchema.parse(input.input);
    } catch {
      throw new AgentOsError('CAPABILITY_INPUT_INVALID', 'Capability input is invalid.');
    }

    if (!isMutation(definition.effects)) {
      return this.executeRead({ input, definition, parsedInput });
    }

    if (!input.requestKey?.trim()) {
      throw new AgentOsError('REQUEST_KEY_REQUIRED', 'Mutation requestKey is required.');
    }
    if (!input.actingAgentKey?.trim()) {
      throw new AgentOsError('ACTING_AGENT_REQUIRED', 'Mutation actingAgentKey is required.');
    }
    const agent = AGENT_DEFINITIONS.find((candidate) => candidate.key === input.actingAgentKey);
    if (!agent || !agent.assignedDomains.includes(definition.ownerDomain)) {
      throw new AgentOsError(
        'ACTING_AGENT_DOMAIN_MISMATCH',
        'The acting Agent is not assigned to the capability owner domain.',
      );
    }

    let canonicalInput: Record<string, unknown>;
    try {
      canonicalInput = canonicalizeOwnerInput(parsedInput) as Record<string, unknown>;
    } catch {
      throw new AgentOsError('CAPABILITY_INPUT_INVALID', 'Capability input is not canonical JSON.');
    }

    if (this.sourcingAdmission) {
      try {
        const admitted = await this.sourcingAdmission.admit({
          capabilityKey: definition.key,
          organizationId: input.organizationId,
          initiatingUserId: input.initiatingUserId,
          executionId: input.executionId,
          input: canonicalInput,
        });
        canonicalInput = admitted.canonicalInput as Record<string, unknown>;
      } catch (error) {
        if (error instanceof AgentOsError) throw error;
        throw new AgentOsError('CAPABILITY_INPUT_INVALID', 'Capability input was not admitted.');
      }
    }

    const inputHash = canonicalOwnerInputHash(canonicalInput);
    const at = this.now();
    const approvalRequired = requiresUserApproval(definition.approvalRisk);
    const admission = await this.repository.admit({
      organizationId: input.organizationId,
      initiatingUserId: input.initiatingUserId,
      capabilityKey: definition.key,
      actingAgentKey: input.actingAgentKey,
      requestKey: input.requestKey,
      canonicalInput,
      inputHash,
      approval: {
        required: approvalRequired,
        requestedAt: at,
        expiresAt: approvalRequired
          ? new Date(at.getTime() + CAPABILITY_APPROVAL_WINDOW_MS)
          : null,
      },
    });
    if (admission.kind === 'conflict') {
      throw new AgentOsError('REQUEST_KEY_CONFLICT', 'requestKey was already used with different input.');
    }

    const invocation = admission.invocation;
    if (invocation.status === 'succeeded') {
      return completedFromRecord(invocation);
    }
    if (invocation.status === 'failed') {
      throw terminalInvocationError(invocation);
    }

    if (approvalRequired) {
      if (invocation.approvalStatus === 'pending') {
        if (!invocation.approvalExpiresAt) {
          throw new AgentOsError('APPROVAL_REQUIRED', 'Capability approval is required.');
        }
        return {
          kind: 'input_required',
          invocationId: invocation.id,
          status: 'pending',
          approvalStatus: 'pending',
          approvalExpiresAt: invocation.approvalExpiresAt,
        };
      }
      if (invocation.approvalStatus === 'rejected') {
        throw new AgentOsError('APPROVAL_REJECTED', 'Capability approval was rejected.');
      }
      if (invocation.approvalStatus === 'expired') {
        throw new AgentOsError('APPROVAL_EXPIRED', 'Capability approval expired.');
      }
      if (invocation.approvalStatus !== 'approved') {
        throw new AgentOsError('APPROVAL_REQUIRED', 'Capability approval is required.');
      }
    }

    return this.executeMutation({
      input,
      definition,
      canonicalInput,
      inputHash,
      invocation,
    });
  }

  private async executeRead(input: {
    input: InvokeCapabilityInput;
    definition: NonNullable<ReturnType<AgentCapabilityRegistry['resolveDefinition']>>;
    parsedInput: Record<string, unknown>;
  }): Promise<CapabilityInvocationResult> {
    const implementation = this.capabilities.resolveImplementation(input.definition.key);
    if (!implementation || implementation.capabilityKey !== input.definition.key) {
      throw new AgentOsError('CAPABILITY_NOT_FOUND', 'Capability implementation was not found.');
    }
    try {
      const result = CapabilityResultEnvelopeSchema.parse(
        await implementation.invoke({
          context: {
            organizationId: input.input.organizationId,
            initiatingUserId: input.input.initiatingUserId,
            executionId: input.input.executionId,
          },
          input: input.parsedInput,
        }),
      );
      const output = input.definition.outputSchema.parse(result.output);
      return { kind: 'completed', result: { ...result, output } };
    } catch (error) {
      if (error instanceof AgentOsError) throw error;
      throw new AgentOsError('OWNER_RESULT_AMBIGUOUS', 'Read capability returned an invalid result.');
    }
  }

  private async executeMutation(input: {
    input: InvokeCapabilityInput;
    definition: NonNullable<ReturnType<AgentCapabilityRegistry['resolveDefinition']>>;
    canonicalInput: Record<string, unknown>;
    inputHash: string;
    invocation: CapabilityInvocationRecord;
  }): Promise<CapabilityInvocationResult> {
    const implementation = this.capabilities.resolveImplementation(input.definition.key);
    if (!implementation || implementation.capabilityKey !== input.definition.key) {
      throw new AgentOsError('CAPABILITY_NOT_FOUND', 'Capability implementation was not found.');
    }

    try {
      const result = CapabilityResultEnvelopeSchema.parse(
        await implementation.invoke({
          context: {
            organizationId: input.input.organizationId,
            initiatingUserId: input.input.initiatingUserId,
            executionId: input.input.executionId,
            ownerIdempotencyKey: ownerInvocationKey(input.invocation.id),
            ownerInputHash: input.inputHash,
          },
          input: input.canonicalInput,
        }),
      );
      const output = input.definition.outputSchema.parse(result.output);
      const persisted = await this.repository.recordSucceeded({
        organizationId: input.input.organizationId,
        invocationId: input.invocation.id,
        result: { ...result, output },
        finishedAt: this.now(),
      });
      return terminalOrCompleted(persisted);
    } catch (error) {
      if (isKnownNoCommitOwnerFailure(error)) {
        const persisted = await this.repository.recordKnownFailure({
          organizationId: input.input.organizationId,
          invocationId: input.invocation.id,
          error: {
            code: 'OWNER_KNOWN_FAILURE',
            message: boundedMessage(error.message, 'Owner reported a known failure before commit.'),
          },
          finishedAt: this.now(),
        });
        return terminalOrCompleted(persisted);
      }
      if (error instanceof AgentOsError) throw error;
      // A timeout, provider disconnect, output parse failure, or any unknown
      // exception may follow an owner commit. Keep the Invocation pending.
      throw new OwnerResultAmbiguousError(input.invocation.id);
    }
  }
}

function isKnownNoCommitOwnerFailure(
  error: unknown,
): error is Error & { readonly knownNoCommit: true } {
  return (
    error instanceof OwnerKnownFailureError ||
    (error instanceof Error &&
      (error as { readonly knownNoCommit?: unknown }).knownNoCommit === true)
  );
}

function isMutation(effects: readonly string[]): boolean {
  return effects.some((effect) => MUTATION_EFFECTS.has(effect as never));
}

function completedFromRecord(
  invocation: CapabilityInvocationRecord,
): CapabilityInvocationResult {
  const parsed = CapabilityResultEnvelopeSchema.safeParse(invocation.result);
  if (!parsed.success) {
    throw new OwnerResultAmbiguousError(invocation.id);
  }
  return {
    kind: 'completed',
    invocationId: invocation.id,
    status: invocation.status,
    result: parsed.data,
  };
}

function terminalOrCompleted(
  invocation: CapabilityInvocationRecord,
): CapabilityInvocationResult {
  if (invocation.status === 'succeeded') return completedFromRecord(invocation);
  if (invocation.status === 'failed') throw terminalInvocationError(invocation);
  throw new OwnerResultAmbiguousError(invocation.id);
}

function terminalInvocationError(invocation: CapabilityInvocationRecord): AgentOsError {
  if (invocation.approvalStatus === 'rejected') {
    return new AgentOsError('APPROVAL_REJECTED', 'Capability approval was rejected.');
  }
  if (invocation.approvalStatus === 'expired') {
    return new AgentOsError('APPROVAL_EXPIRED', 'Capability approval expired.');
  }
  return new AgentOsError(
    invocation.error?.code ?? 'OWNER_KNOWN_FAILURE',
    invocation.error?.message ?? 'Capability invocation failed.',
  );
}

function boundedMessage(value: string, fallback: string): string {
  const normalized = value.trim();
  return (normalized || fallback).slice(0, 1_000);
}
