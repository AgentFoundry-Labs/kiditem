import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { canonicalOwnerInputHash } from '../../../common/owner-idempotency-key';
import { AgentOsError } from '../../domain/agent-os.errors';
import {
  CapabilityInvocationService,
  OwnerKnownFailureError,
} from './capability-invocation.service';

const ORGANIZATION_ID = '00000000-0000-4000-8000-000000000001';
const USER_ID = '00000000-0000-4000-8000-000000000002';
const INVOCATION_ID = '00000000-0000-4000-8000-000000000003';

const mutationDefinition = {
  key: 'sourcing.createCandidate',
  ownerDomain: 'sourcing',
  ownerInputPort: 'sourcing.createCandidate',
  description: 'Test-only mutation.',
  inputSchema: z.object({ alpha: z.string(), nested: z.object({ a: z.number(), b: z.number() }).strict() }).strict(),
  outputSchema: z.object({ candidateId: z.string().uuid() }).strict(),
  effects: ['db_write'] as const,
  approvalRisk: 'low' as const,
  idempotency: 'required' as const,
};

const readDefinition = {
  ...mutationDefinition,
  key: 'sourcing.inspect',
  ownerInputPort: 'sourcing.inspect',
  effects: ['read'] as const,
  approvalRisk: 'none' as const,
  idempotency: 'recommended' as const,
};

describe('CapabilityInvocationService', () => {
  it('canonically admits a mutation once, passes the exact opaque owner key, and replays the persisted result', async () => {
    const input = { nested: { b: 2, a: 1 }, alpha: 'candidate' };
    const result = completedResult();
    const pending = invocation({ input, status: 'pending' });
    const succeeded = invocation({ input, status: 'succeeded', result });
    const repository = {
      admit: vi.fn()
        .mockResolvedValueOnce({ kind: 'created', invocation: pending })
        .mockResolvedValueOnce({ kind: 'replay', invocation: succeeded }),
      recordSucceeded: vi.fn().mockResolvedValue(succeeded),
      recordKnownFailure: vi.fn(),
    };
    const owner = { capabilityKey: mutationDefinition.key, invoke: vi.fn().mockResolvedValue(result) };
    const service = new CapabilityInvocationService(
      repository as never,
      registry(mutationDefinition, owner) as never,
    );
    const request = mutationRequest(input);

    const first = await service.invoke(request);
    const replay = await service.invoke(request);

    expect(first).toMatchObject({ kind: 'completed', invocationId: INVOCATION_ID, result });
    expect(replay).toEqual(first);
    expect(repository.admit).toHaveBeenCalledTimes(2);
    expect(owner.invoke).toHaveBeenCalledTimes(1);
    expect(owner.invoke).toHaveBeenCalledWith(expect.objectContaining({
      context: expect.objectContaining({
        executionId: 'execution-1',
        ownerIdempotencyKey: `capability-invocation:${INVOCATION_ID}`,
      }),
      input: { alpha: 'candidate', nested: { a: 1, b: 2 } },
    }));
    expect(repository.admit).toHaveBeenNthCalledWith(1, expect.objectContaining({
      canonicalInput: { alpha: 'candidate', nested: { a: 1, b: 2 } },
      inputHash: canonicalOwnerInputHash(input),
    }));
    expect(repository.recordSucceeded).toHaveBeenCalledWith(expect.objectContaining({
      invocationId: INVOCATION_ID,
      result,
    }));
  });

  it('rejects request-key drift and missing request keys before owner execution', async () => {
    const repository = { admit: vi.fn().mockResolvedValue({ kind: 'conflict' }) };
    const owner = { capabilityKey: mutationDefinition.key, invoke: vi.fn() };
    const service = new CapabilityInvocationService(repository as never, registry(mutationDefinition, owner) as never);

    await expect(service.invoke({ ...mutationRequest({ alpha: 'candidate', nested: { a: 1, b: 2 } }), requestKey: undefined }))
      .rejects.toMatchObject({ code: 'REQUEST_KEY_REQUIRED' } satisfies Partial<AgentOsError>);
    await expect(service.invoke(mutationRequest({ alpha: 'changed', nested: { a: 1, b: 2 } })))
      .rejects.toMatchObject({ code: 'REQUEST_KEY_CONFLICT' } satisfies Partial<AgentOsError>);
    expect(repository.admit).toHaveBeenCalledTimes(1);
    expect(owner.invoke).not.toHaveBeenCalled();
  });

  it('requires a responsible acting Agent before repository admission', async () => {
    const repository = { admit: vi.fn() };
    const owner = { capabilityKey: mutationDefinition.key, invoke: vi.fn() };
    const service = new CapabilityInvocationService(repository as never, registry(mutationDefinition, owner) as never);

    await expect(service.invoke({ ...mutationRequest({ alpha: 'candidate', nested: { a: 1, b: 2 } }), actingAgentKey: undefined }))
      .rejects.toMatchObject({ code: 'ACTING_AGENT_REQUIRED' } satisfies Partial<AgentOsError>);
    await expect(service.invoke({ ...mutationRequest({ alpha: 'candidate', nested: { a: 1, b: 2 } }), actingAgentKey: 'supply' }))
      .rejects.toMatchObject({ code: 'ACTING_AGENT_DOMAIN_MISMATCH' } satisfies Partial<AgentOsError>);
    expect(repository.admit).not.toHaveBeenCalled();
    expect(owner.invoke).not.toHaveBeenCalled();
  });

  it('executes reads with strict input/output validation and creates no durable invocation', async () => {
    const repository = { admit: vi.fn(), recordSucceeded: vi.fn() };
    const result = completedResult();
    const owner = { capabilityKey: readDefinition.key, invoke: vi.fn().mockResolvedValue(result) };
    const service = new CapabilityInvocationService(repository as never, registry(readDefinition, owner) as never);

    await expect(service.invoke({
      organizationId: ORGANIZATION_ID,
      initiatingUserId: USER_ID,
      executionId: 'execution-1',
      capabilityKey: readDefinition.key,
      input: { alpha: 'candidate', nested: { a: 1, b: 2 } },
    })).resolves.toMatchObject({ kind: 'completed', result });
    expect(repository.admit).not.toHaveBeenCalled();
    expect(repository.recordSucceeded).not.toHaveBeenCalled();
  });

  it('keeps ambiguous owner outcomes pending but records an explicit known-no-commit failure', async () => {
    const input = { alpha: 'candidate', nested: { a: 1, b: 2 } };
    const pending = invocation({ input, status: 'pending' });
    const failed = invocation({ input, status: 'failed' });
    const repository = {
      admit: vi.fn().mockResolvedValue({ kind: 'created', invocation: pending }),
      recordKnownFailure: vi.fn().mockResolvedValue(failed),
      recordSucceeded: vi.fn(),
    };
    const owner = { capabilityKey: mutationDefinition.key, invoke: vi.fn() };
    const service = new CapabilityInvocationService(repository as never, registry(mutationDefinition, owner) as never);

    owner.invoke.mockRejectedValueOnce(new Error('timeout after submit'));
    await expect(service.invoke(mutationRequest(input))).rejects.toMatchObject({ code: 'OWNER_RESULT_AMBIGUOUS' } satisfies Partial<AgentOsError>);
    expect(repository.recordKnownFailure).not.toHaveBeenCalled();

    owner.invoke.mockRejectedValueOnce(new OwnerKnownFailureError('validation rejected before commit'));
    await expect(service.invoke(mutationRequest(input))).rejects.toMatchObject({ code: 'OWNER_KNOWN_FAILURE' } satisfies Partial<AgentOsError>);
    expect(repository.recordKnownFailure).toHaveBeenCalledWith(expect.objectContaining({
      invocationId: INVOCATION_ID,
      error: expect.objectContaining({ code: 'OWNER_KNOWN_FAILURE' }),
    }));

    owner.invoke.mockRejectedValueOnce(Object.assign(
      new Error('provider rejected before create'),
      { knownNoCommit: true as const },
    ));
    await expect(service.invoke(mutationRequest(input))).rejects.toMatchObject({
      code: 'OWNER_KNOWN_FAILURE',
    } satisfies Partial<AgentOsError>);
    expect(repository.recordKnownFailure).toHaveBeenCalledTimes(2);
  });

  it('returns the conditional finalization winner instead of inventing a second outcome', async () => {
    const input = { alpha: 'candidate', nested: { a: 1, b: 2 } };
    const rejected = {
      ...invocation({ input, status: 'failed' }),
      approvalStatus: 'rejected' as const,
      error: {
        code: 'APPROVAL_REJECTED',
        message: 'User rejected the exact capability invocation.',
      },
    };
    const repository = {
      admit: vi.fn().mockResolvedValue({
        kind: 'created',
        invocation: invocation({ input, status: 'pending' }),
      }),
      recordSucceeded: vi.fn().mockResolvedValue(rejected),
      recordKnownFailure: vi.fn(),
    };
    const owner = {
      capabilityKey: mutationDefinition.key,
      invoke: vi.fn().mockResolvedValue(completedResult()),
    };
    const service = new CapabilityInvocationService(
      repository as never,
      registry(mutationDefinition, owner) as never,
    );

    await expect(service.invoke(mutationRequest(input))).rejects.toMatchObject({
      code: 'APPROVAL_REJECTED',
    } satisfies Partial<AgentOsError>);
  });
});

function mutationRequest(input: unknown) {
  return {
    organizationId: ORGANIZATION_ID,
    initiatingUserId: USER_ID,
    executionId: 'execution-1',
    capabilityKey: mutationDefinition.key,
    requestKey: 'request-1',
    actingAgentKey: 'sourcing',
    input,
  };
}

function invocation(input: { input: unknown; status: 'pending' | 'succeeded' | 'failed'; result?: unknown }) {
  return {
    id: INVOCATION_ID,
    organizationId: ORGANIZATION_ID,
    initiatingUserId: USER_ID,
    capabilityKey: mutationDefinition.key,
    actingAgentKey: 'sourcing',
    requestKey: 'request-1',
    canonicalInput: { alpha: 'candidate', nested: { a: 1, b: 2 } },
    inputHash: canonicalOwnerInputHash(input.input),
    status: input.status,
    approvalStatus: 'not_required',
    approvalInputHash: null,
    approvalRequestedAt: null,
    approvalExpiresAt: null,
    approvalDecidedByUserId: null,
    approvalDecisionReason: null,
    approvalDecidedAt: null,
    result: input.result ?? null,
    error: null,
    createdAt: new Date('2026-08-25T00:00:00.000Z'),
    updatedAt: new Date('2026-08-25T00:00:00.000Z'),
    finishedAt: input.status === 'pending' ? null : new Date('2026-08-25T00:00:00.000Z'),
  };
}

function completedResult() {
  return {
    summary: 'Candidate created.',
    resourceRefs: [{ kind: 'sourcing_candidate', id: '00000000-0000-4000-8000-000000000004', version: null }],
    operationRefs: [],
    output: { candidateId: '00000000-0000-4000-8000-000000000004' },
  };
}

function registry(definition: object, owner: object) {
  return {
    resolveDefinition: vi.fn((key: string) => key === (definition as { key: string }).key ? definition : null),
    resolveImplementation: vi.fn((key: string) => key === (owner as { capabilityKey: string }).capabilityKey ? owner : null),
  };
}
