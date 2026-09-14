import {
  CapabilityResultReceiptSchema,
  CapabilityResultEnvelopeSchema,
  type CapabilityInvocationApprovalStatus,
  type CapabilityResultReceipt,
} from '@kiditem/shared/agent-interaction';
import {
  MUTATION_EFFECTS,
} from '../../../common/capability-definition';
import {
  canonicalizeOwnerInput,
  canonicalOwnerInputHash,
} from '../../../common/owner-idempotency-key';
import type { SourcingCapabilityAdmissionPort } from '../../../sourcing/application/port/in/capability/sourcing-capability-admission.port';
import { AGENT_DEFINITIONS } from '../../domain/agent-definition.registry';
import { AgentOsError } from '../../domain/agent-os.errors';
import {
  deriveCapabilityApprovalState,
  hasCapabilityApprovalPolicyDrift,
  requiresUserApproval,
  CAPABILITY_APPROVAL_WINDOW_MS,
} from '../../domain/capability/capability-invocation.policy';
import type { AgentCapabilityRegistry } from './agent-capability-registry.service';
import {
  CapabilityMutationDispatcher,
  type CapabilityMutationDispatcherPort,
  OwnerKnownFailureError,
  OwnerResultAmbiguousError,
} from './capability-mutation-dispatcher.service';
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

export { OwnerKnownFailureError, OwnerResultAmbiguousError } from './capability-mutation-dispatcher.service';

/** Allowlisted result fields for the authenticated Web receipt. */
export type CapabilityInvocationResultReceipt = CapabilityResultReceipt;

/**
 * Internal capability/MCP status read: the persisted record plus the approval
 * state derived with the server clock when it is read.
 */
export type CapabilityInvocationStatusView = CapabilityInvocationRecord & {
  approvalStatus: CapabilityInvocationApprovalStatus;
};

/**
 * Authenticated receipt projection. It deliberately excludes canonical input,
 * hashes, owner output, and opaque invocation identifiers.
 */
export type CapabilityInvocationReceipt = Pick<CapabilityInvocationStatusView,
  | 'capabilityKey'
  | 'status'
  | 'approvalStatus'
  | 'approvalExpiresAt'
> & {
  result: CapabilityInvocationResultReceipt | null;
};

/**
 * Request-driven capability admission and replay. A shared deterministic
 * dispatcher owns approved execution and one bounded API-bootstrap recovery;
 * Invocations never become a worker queue or provider-turn retry.
 */
export class CapabilityInvocationService implements CapabilityInvocationPort {
  private readonly dispatcher: CapabilityMutationDispatcherPort;

  constructor(
    private readonly repository: CapabilityInvocationRepositoryPort,
    private readonly capabilities: Pick<
      AgentCapabilityRegistry,
      'resolveDefinition' | 'resolveImplementation'
    >,
    private readonly now: () => Date = () => new Date(),
    private readonly sourcingAdmission?: Pick<SourcingCapabilityAdmissionPort, 'admit'>,
    dispatcher?: CapabilityMutationDispatcherPort,
  ) {
    this.dispatcher = dispatcher ?? new CapabilityMutationDispatcher(
      repository,
      capabilities,
      now,
    );
  }

  async get(input: GetCapabilityInvocationInput): Promise<CapabilityInvocationStatusView> {
    const invocation = await this.repository.findById({
      organizationId: input.organizationId,
      invocationId: input.invocationId,
    });
    if (!invocation) {
      throw new AgentOsError('CAPABILITY_NOT_FOUND', 'Capability invocation was not found.');
    }
    return {
      ...invocation,
      approvalStatus: deriveCapabilityApprovalState(invocation, this.now()),
    };
  }

  async getReceipt(input: GetCapabilityInvocationInput): Promise<CapabilityInvocationReceipt> {
    const invocation = await this.get(input);
    if (!this.capabilities.resolveDefinition(invocation.capabilityKey)) {
      throw new AgentOsError('CAPABILITY_NOT_FOUND', 'Capability invocation was not found.');
    }
    return {
      capabilityKey: invocation.capabilityKey,
      status: invocation.status,
      approvalStatus: invocation.approvalStatus,
      approvalExpiresAt: invocation.approvalExpiresAt,
      result: receiptResult(invocation.result),
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

    let inputHash = canonicalOwnerInputHash(canonicalInput);
    const requiresTransientSourcingReceipt =
      definition.key === 'sourcing.ingestCandidate';
    if (this.sourcingAdmission && requiresTransientSourcingReceipt) {
      const existing = await this.repository.findByRequestKey({
        organizationId: input.organizationId,
        requestKey: input.requestKey,
      });
      if (existing && !isSameMutationRequest(existing, {
        initiatingUserId: input.initiatingUserId,
        capabilityKey: definition.key,
        actingAgentKey: input.actingAgentKey,
        canonicalInput,
        inputHash,
      })) {
        throw new AgentOsError(
          'REQUEST_KEY_CONFLICT',
          'requestKey was already used with different input.',
        );
      }
      if (!existing) {
        try {
          const admitted = await this.sourcingAdmission.admit({
            capabilityKey: definition.key,
            organizationId: input.organizationId,
            initiatingUserId: input.initiatingUserId,
            executionId: input.executionId,
            input: canonicalInput,
          });
          canonicalInput = admitted.canonicalInput as Record<string, unknown>;
          inputHash = canonicalOwnerInputHash(canonicalInput);
        } catch (error) {
          if (error instanceof AgentOsError) throw error;
          throw new AgentOsError('CAPABILITY_INPUT_INVALID', 'Capability input was not admitted.');
        }
      }
    } else if (this.sourcingAdmission) {
      try {
        const admitted = await this.sourcingAdmission.admit({
          capabilityKey: definition.key,
          organizationId: input.organizationId,
          initiatingUserId: input.initiatingUserId,
          executionId: input.executionId,
          input: canonicalInput,
        });
        canonicalInput = admitted.canonicalInput as Record<string, unknown>;
        inputHash = canonicalOwnerInputHash(canonicalInput);
      } catch (error) {
        if (error instanceof AgentOsError) throw error;
        throw new AgentOsError('CAPABILITY_INPUT_INVALID', 'Capability input was not admitted.');
      }
    }

    const at = this.now();
    const currentApprovalRequired = requiresUserApproval(definition.approvalRisk);
    const admission = await this.repository.admit({
      organizationId: input.organizationId,
      initiatingUserId: input.initiatingUserId,
      capabilityKey: definition.key,
      actingAgentKey: input.actingAgentKey,
      requestKey: input.requestKey,
      canonicalInput,
      inputHash,
      approval: {
        required: currentApprovalRequired,
        requestedAt: at,
        expiresAt: currentApprovalRequired
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
      throw terminalInvocationError(invocation, this.now());
    }

    const approval = deriveCapabilityApprovalState(invocation, this.now());
    if (admission.kind === 'replay' && hasCapabilityApprovalPolicyDrift(
      approval,
      definition.approvalRisk,
    )) {
      throw new AgentOsError(
        'CAPABILITY_POLICY_DRIFT',
        'Capability approval policy changed after this request was admitted.',
      );
    }

    if (approval === 'pending') {
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
    if (approval === 'rejected') {
      throw new AgentOsError('APPROVAL_REJECTED', 'Capability approval was rejected.');
    }
    if (approval === 'expired') {
      throw new AgentOsError('APPROVAL_EXPIRED', 'Capability approval expired.');
    }

    return terminalOrCompleted(await this.dispatcher.dispatch(invocation), this.now());
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

}

function isMutation(effects: readonly string[]): boolean {
  return effects.some((effect) => MUTATION_EFFECTS.has(effect as never));
}

function isSameMutationRequest(
  invocation: CapabilityInvocationRecord,
  input: {
    initiatingUserId: string;
    capabilityKey: string;
    actingAgentKey: string;
    canonicalInput: Record<string, unknown>;
    inputHash: string;
  },
): boolean {
  return (
    invocation.initiatingUserId === input.initiatingUserId
    && invocation.capabilityKey === input.capabilityKey
    && invocation.actingAgentKey === input.actingAgentKey
    && invocation.inputHash === input.inputHash
    && JSON.stringify(invocation.canonicalInput) === JSON.stringify(input.canonicalInput)
  );
}

function completedFromRecord(
  invocation: CapabilityInvocationRecord,
): CapabilityInvocationResult {
  const parsed = CapabilityResultReceiptSchema.safeParse(invocation.result);
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

function receiptResult(
  result: CapabilityResultReceipt | null,
): CapabilityInvocationResultReceipt | null {
  return result;
}

function terminalOrCompleted(
  invocation: CapabilityInvocationRecord,
  at: Date,
): CapabilityInvocationResult {
  if (invocation.status === 'succeeded') return completedFromRecord(invocation);
  if (invocation.status === 'failed') throw terminalInvocationError(invocation, at);
  throw new OwnerResultAmbiguousError(invocation.id);
}

function terminalInvocationError(
  invocation: CapabilityInvocationRecord,
  at: Date,
): AgentOsError {
  const approval = deriveCapabilityApprovalState(invocation, at);
  if (approval === 'rejected') {
    return new AgentOsError('APPROVAL_REJECTED', 'Capability approval was rejected.');
  }
  if (approval === 'expired') {
    return new AgentOsError('APPROVAL_EXPIRED', 'Capability approval expired.');
  }
  return new AgentOsError(
    invocation.error?.code ?? 'OWNER_KNOWN_FAILURE',
    invocation.error?.message ?? 'Capability invocation failed.',
  );
}
