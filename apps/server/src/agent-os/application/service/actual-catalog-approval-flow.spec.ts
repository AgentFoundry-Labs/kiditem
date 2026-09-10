import { describe, expect, it, vi } from 'vitest';
import { canonicalOwnerInputHash } from '../../../common/owner-idempotency-key';
import type { CapabilityDefinition } from '../../../common/capability-definition';
import { PRODUCTS_CAPABILITIES } from '../../../products/domain/capability/products.capabilities';
import { SOURCING_CAPABILITIES } from '../../../sourcing/domain/capability/sourcing.capabilities';
import { CapabilityApprovalService } from './capability-approval.service';
import { CapabilityInvocationService } from './capability-invocation.service';
import { CapabilityMutationDispatcher } from './capability-mutation-dispatcher.service';
import type {
  AdmitCapabilityInvocation,
  CapabilityInvocationRecord,
  DecideInvocationApproval,
  InvocationFence,
  RecordInvocationFailure,
  RecordInvocationSucceeded,
} from '../port/out/capability-invocation.repository.port';

const ORGANIZATION_ID = '00000000-0000-4000-8000-000000000001';
const USER_ID = '00000000-0000-4000-8000-000000000002';
const CANDIDATE_ID = '00000000-0000-4000-8000-000000000003';
const NOW = new Date('2026-08-28T00:00:00.000Z');

const scenarios: readonly ApprovalScenario[] = [
  {
    definition: requiredDefinition(SOURCING_CAPABILITIES, 'sourcing.ingestCandidate'),
    actingAgentKey: 'sourcing',
    input: {
      snapshot: {
        sourceUrl: 'https://detail.1688.com/offer/712345678901.html',
        platform: '1688',
        title: 'Toy',
        price: 1,
        currency: 'CNY',
        variantKeyNormalized: 'default',
        images: [],
        contentHash: 'a'.repeat(64),
      },
    },
    output: { candidateId: CANDIDATE_ID },
  },
  {
    definition: requiredDefinition(
      PRODUCTS_CAPABILITIES,
      'products.create_listing_generation_package',
    ),
    actingAgentKey: 'merchandising',
    input: { candidateId: CANDIDATE_ID },
    output: {
      candidateId: CANDIDATE_ID,
      detailGenerationId: CANDIDATE_ID,
      thumbnailGenerationId: CANDIDATE_ID,
      contentWorkspaceId: CANDIDATE_ID,
      href: `/product-pipeline/collected-products/${CANDIDATE_ID}`,
    },
  },
];

describe('actual catalog approval-before-write flows', () => {
  for (const scenario of scenarios) {
    it(`${scenario.definition.key} stays pending and a rejection writes nothing`, async () => {
      const runtime = approvalRuntime(scenario);

      const pending = await runtime.invocations.invoke(runtime.request);

      expect(pending).toMatchObject({
        kind: 'input_required',
        status: 'pending',
        approvalStatus: 'pending',
      });
      expect(runtime.owner.invoke).not.toHaveBeenCalled();

      const invocationId = pendingInvocationId(pending);
      await expect(runtime.approvals.decide({
        organizationId: ORGANIZATION_ID,
        userId: USER_ID,
        invocationId,
        decision: 'rejected',
      })).resolves.toMatchObject({
        status: 'failed',
        approvalStatus: 'rejected',
        error: { code: 'APPROVAL_REJECTED' },
      });

      expect(runtime.owner.invoke).not.toHaveBeenCalled();
    });

    it(`${scenario.definition.key} dispatches one approved exact receipt`, async () => {
      const runtime = approvalRuntime(scenario);

      const pending = await runtime.invocations.invoke(runtime.request);
      expect(pending).toMatchObject({ kind: 'input_required' });
      const invocationId = pendingInvocationId(pending);

      await expect(runtime.approvals.decide({
        organizationId: ORGANIZATION_ID,
        userId: USER_ID,
        invocationId,
        decision: 'approved',
      })).resolves.toMatchObject({
        status: 'succeeded',
        approvalStatus: 'approved',
      });
      await runtime.approvals.decide({
        organizationId: ORGANIZATION_ID,
        userId: USER_ID,
        invocationId,
        decision: 'approved',
      });

      expect(runtime.owner.invoke).toHaveBeenCalledTimes(1);
      expect(runtime.owner.invoke).toHaveBeenCalledWith({
        context: {
          organizationId: ORGANIZATION_ID,
          initiatingUserId: USER_ID,
          executionId: invocationId,
          ownerIdempotencyKey: `capability-invocation:${invocationId}`,
          ownerInputHash: canonicalOwnerInputHash(scenario.input),
        },
        input: scenario.input,
      });
    });
  }
});

interface ApprovalScenario {
  definition: CapabilityDefinition;
  actingAgentKey: 'sourcing' | 'merchandising';
  input: Record<string, unknown>;
  output: Record<string, unknown>;
}

function approvalRuntime(scenario: ApprovalScenario) {
  const repository = new InMemoryInvocationRepository();
  const owner = {
    capabilityKey: scenario.definition.key,
    invoke: vi.fn(async () => ({
      summary: scenario.definition.resultSummary,
      resourceRefs: [],
      output: scenario.output,
    })),
  };
  const capabilities = {
    resolveDefinition: (key: string) =>
      key === scenario.definition.key ? scenario.definition : null,
    resolveImplementation: (key: string) =>
      key === scenario.definition.key ? owner : null,
  };
  const dispatcher = new CapabilityMutationDispatcher(
    repository as never,
    capabilities as never,
    () => NOW,
  );
  const invocations = new CapabilityInvocationService(
    repository as never,
    capabilities as never,
    () => NOW,
    undefined,
    dispatcher,
  );

  return {
    owner,
    invocations,
    approvals: new CapabilityApprovalService(repository as never, dispatcher, () => NOW),
    request: {
      organizationId: ORGANIZATION_ID,
      initiatingUserId: USER_ID,
      executionId: 'active-turn-execution',
      capabilityKey: scenario.definition.key,
      requestKey: `approval-flow:${scenario.definition.key}`,
      actingAgentKey: scenario.actingAgentKey,
      input: scenario.input,
    },
  };
}

class InMemoryInvocationRepository {
  private readonly records = new Map<string, CapabilityInvocationRecord>();

  async admit(input: AdmitCapabilityInvocation) {
    const existing = [...this.records.values()].find(
      (record) =>
        record.organizationId === input.organizationId
        && record.requestKey === input.requestKey,
    );
    if (existing) {
      return existing.inputHash === input.inputHash
        ? { kind: 'replay' as const, invocation: existing }
        : { kind: 'conflict' as const, invocation: existing };
    }
    const id = `00000000-0000-4000-8000-${String(this.records.size + 5).padStart(12, '0')}`;
    const record: CapabilityInvocationRecord = {
      id,
      organizationId: input.organizationId,
      initiatingUserId: input.initiatingUserId,
      capabilityKey: input.capabilityKey,
      actingAgentKey: input.actingAgentKey,
      requestKey: input.requestKey,
      canonicalInput: input.canonicalInput,
      inputHash: input.inputHash,
      status: 'pending',
      approvalStatus: input.approval.required ? 'pending' : 'not_required',
      approvalInputHash: input.approval.required ? input.inputHash : null,
      approvalRequestedAt: input.approval.required ? input.approval.requestedAt : null,
      approvalExpiresAt: input.approval.expiresAt,
      approvalDecidedByUserId: null,
      approvalDecisionReason: null,
      approvalDecidedAt: null,
      result: null,
      error: null,
      createdAt: NOW,
      updatedAt: NOW,
      finishedAt: null,
    };
    this.records.set(id, record);
    return { kind: 'created' as const, invocation: record };
  }

  async findById(input: InvocationFence): Promise<CapabilityInvocationRecord | null> {
    const record = this.records.get(input.invocationId);
    return record?.organizationId === input.organizationId ? record : null;
  }

  async findByRequestKey(input: {
    organizationId: string;
    requestKey: string;
  }): Promise<CapabilityInvocationRecord | null> {
    return [...this.records.values()].find(
      (record) =>
        record.organizationId === input.organizationId
        && record.requestKey === input.requestKey,
    ) ?? null;
  }

  async listApprovedPending(): Promise<CapabilityInvocationRecord[]> {
    return [...this.records.values()].filter(
      (record) => record.status === 'pending' && record.approvalStatus === 'approved',
    );
  }

  async decideApproval(input: DecideInvocationApproval) {
    const current = await this.required(input);
    if (current.approvalInputHash !== input.inputHash) {
      throw new Error('approval_input_hash_mismatch');
    }
    if (current.approvalStatus === input.decision) {
      return { invocation: current, transitioned: false };
    }
    if (current.approvalStatus !== 'pending') {
      throw new Error('approval_decision_immutable');
    }
    const rejected = input.decision === 'rejected';
    const updated: CapabilityInvocationRecord = {
      ...current,
      status: rejected ? 'failed' : 'pending',
      approvalStatus: input.decision,
      approvalDecidedByUserId: input.userId,
      approvalDecisionReason: input.reason,
      approvalDecidedAt: input.decidedAt,
      error: rejected
        ? { code: 'APPROVAL_REJECTED', message: 'User rejected the exact capability invocation.' }
        : null,
      finishedAt: rejected ? input.decidedAt : null,
      updatedAt: input.decidedAt,
    };
    this.records.set(updated.id, updated);
    return { invocation: updated, transitioned: true };
  }

  async recordSucceeded(input: RecordInvocationSucceeded): Promise<CapabilityInvocationRecord> {
    const current = await this.required(input);
    const updated: CapabilityInvocationRecord = {
      ...current,
      status: 'succeeded',
      result: input.result,
      error: null,
      finishedAt: input.finishedAt,
      updatedAt: input.finishedAt,
    };
    this.records.set(updated.id, updated);
    return updated;
  }

  async recordKnownFailure(input: RecordInvocationFailure): Promise<CapabilityInvocationRecord> {
    const current = await this.required(input);
    const updated: CapabilityInvocationRecord = {
      ...current,
      status: 'failed',
      error: input.error,
      finishedAt: input.finishedAt,
      updatedAt: input.finishedAt,
    };
    this.records.set(updated.id, updated);
    return updated;
  }

  private async required(input: InvocationFence): Promise<CapabilityInvocationRecord> {
    const record = await this.findById(input);
    if (!record) throw new Error('capability_invocation_not_found');
    return record;
  }
}

function requiredDefinition(
  definitions: readonly CapabilityDefinition[],
  key: string,
): CapabilityDefinition {
  const definition = definitions.find((candidate) => candidate.key === key);
  if (!definition) throw new Error(`missing capability definition: ${key}`);
  return definition;
}

function pendingInvocationId(
  result: Awaited<ReturnType<CapabilityInvocationService['invoke']>>,
): string {
  if (result.kind !== 'input_required') throw new Error('approval_pending_result_required');
  return result.invocationId;
}
