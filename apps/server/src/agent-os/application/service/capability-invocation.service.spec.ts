import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import {
  canonicalizeOwnerInput,
  canonicalOwnerInputHash,
} from '../../../common/owner-idempotency-key';
import { SourcingScrapeSnapshotAdmissionGuard } from '../../../sourcing/adapter/in/agent/sourcing-scrape-snapshot-admission.guard';
import { SOURCING_CAPABILITIES } from '../../../sourcing/domain/capability/sourcing.capabilities';
import { AgentOsError } from '../../domain/agent-os.errors';
import {
  CapabilityInvocationService,
  OwnerResultAmbiguousError,
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
  resultSummary: '후보를 생성했습니다.',
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
  it('projects only a nullable bounded result envelope through the organization-fenced receipt', async () => {
    const result = receiptFrom(completedResult());
    const repository = {
      findById: vi.fn()
        .mockResolvedValueOnce(invocation({ input: { alpha: 'candidate', nested: { a: 1, b: 2 } }, status: 'succeeded', result }))
        .mockResolvedValueOnce(invocation({ input: { alpha: 'candidate', nested: { a: 1, b: 2 } }, status: 'pending' })),
    };
    const owner = { capabilityKey: mutationDefinition.key, invoke: vi.fn() };
    const service = new CapabilityInvocationService(repository as never, registry(mutationDefinition, owner) as never);

    const receipt = await service.getReceipt({ organizationId: ORGANIZATION_ID, invocationId: INVOCATION_ID });
    expect(receipt).toEqual({
      capabilityKey: mutationDefinition.key,
      status: 'succeeded',
      approvalStatus: 'not_required',
      approvalExpiresAt: null,
      result: {
        summary: result.summary,
        resourceRefs: result.resourceRefs,
      },
    });
    expect(repository.findById).toHaveBeenCalledWith({
      organizationId: ORGANIZATION_ID,
      invocationId: INVOCATION_ID,
    });
    expect(receipt).not.toHaveProperty('id');
    expect(receipt).not.toHaveProperty('canonicalInput');
    expect(receipt).not.toHaveProperty('requestKey');
    expect(receipt).not.toHaveProperty('inputHash');
    expect(receipt).not.toHaveProperty('approvalInputHash');
    expect(receipt).not.toHaveProperty('approvalDecidedByUserId');
    expect(receipt.result).not.toHaveProperty('output');

    await expect(service.getReceipt({ organizationId: ORGANIZATION_ID, invocationId: INVOCATION_ID }))
      .resolves.toEqual({
        capabilityKey: mutationDefinition.key,
        status: 'pending',
        approvalStatus: 'not_required',
        approvalExpiresAt: null,
        result: null,
      });
  });

  it('canonically admits a mutation once, passes the exact opaque owner key, and replays the persisted result', async () => {
    const input = { nested: { b: 2, a: 1 }, alpha: 'candidate' };
    const ownerResult = completedResult();
    const result = receiptFrom(ownerResult);
    const pending = invocation({ input, status: 'pending' });
    const succeeded = invocation({ input, status: 'succeeded', result });
    const repository = {
      findById: vi.fn().mockResolvedValue(pending),
      admit: vi.fn()
        .mockResolvedValueOnce({ kind: 'created', invocation: pending })
        .mockResolvedValueOnce({ kind: 'replay', invocation: succeeded }),
      recordSucceeded: vi.fn().mockResolvedValue(succeeded),
      recordKnownFailure: vi.fn(),
    };
    const owner = { capabilityKey: mutationDefinition.key, invoke: vi.fn().mockResolvedValue(ownerResult) };
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
        executionId: INVOCATION_ID,
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

  it('rejects a replay before owner execution when the admitted approval policy was downgraded', async () => {
    const input = { alpha: 'candidate', nested: { a: 1, b: 2 } };
    const inputHash = canonicalOwnerInputHash(input);
    const pending = {
      ...invocation({ input, status: 'pending' }),
      approvalInputHash: inputHash,
      approvalRequestedAt: new Date('2026-08-25T00:00:00.000Z'),
      approvalExpiresAt: new Date('2026-08-25T00:30:00.000Z'),
    };
    const repository = {
      admit: vi.fn().mockResolvedValue({ kind: 'replay', invocation: pending }),
      recordSucceeded: vi.fn(),
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
      code: 'CAPABILITY_POLICY_DRIFT',
    } satisfies Partial<AgentOsError>);
    expect(owner.invoke).not.toHaveBeenCalled();
    expect(repository.recordSucceeded).not.toHaveBeenCalled();
  });

  it('routes an approved pending replay through the shared dispatcher instead of a live execution', async () => {
    const input = { alpha: 'candidate', nested: { a: 1, b: 2 } };
    const inputHash = canonicalOwnerInputHash(input);
    const definition = { ...mutationDefinition, approvalRisk: 'medium' as const };
    const approved = {
      ...invocation({ input, status: 'pending' }),
      approvalInputHash: inputHash,
      approvalRequestedAt: new Date('2026-08-25T00:00:00.000Z'),
      approvalExpiresAt: new Date('2026-08-25T00:30:00.000Z'),
      approvalDecision: 'approved' as const,
      approvalDecidedByUserId: USER_ID,
      approvalDecidedAt: new Date('2026-08-25T00:01:00.000Z'),
    };
    const succeeded = {
      ...approved,
      status: 'succeeded' as const,
      result: receiptFrom(completedResult()),
      finishedAt: new Date('2026-08-25T00:01:01.000Z'),
    };
    const repository = {
      admit: vi.fn().mockResolvedValue({ kind: 'replay', invocation: approved }),
      recordSucceeded: vi.fn().mockResolvedValue(succeeded),
      recordKnownFailure: vi.fn(),
    };
    const owner = {
      capabilityKey: definition.key,
      invoke: vi.fn().mockResolvedValue(completedResult()),
    };
    const dispatcher = { dispatch: vi.fn().mockResolvedValue(succeeded) };
    const service = new CapabilityInvocationService(
      repository as never,
      registry(definition, owner) as never,
      undefined,
      undefined,
      dispatcher as never,
    );

    await expect(service.invoke(mutationRequest(input))).resolves.toMatchObject({
      kind: 'completed',
      invocationId: INVOCATION_ID,
      status: 'succeeded',
      result: receiptFrom(completedResult()),
    });
    expect(dispatcher.dispatch).toHaveBeenCalledWith(approved);
    expect(owner.invoke).not.toHaveBeenCalled();
  });

  it('persists and replays only receipt fields for a mutation owner result', async () => {
    const input = { alpha: 'candidate', nested: { a: 1, b: 2 } };
    const definition = {
      ...mutationDefinition,
      outputSchema: z.object({
        candidateId: z.string().uuid(),
        screenshotPath: z.string(),
      }).strict(),
    };
    const fullOwnerResult = {
      ...completedResult(),
      output: {
        candidateId: '00000000-0000-4000-8000-000000000004',
        screenshotPath: '/tmp/host-only/wing-capture.png',
      },
    };
    const receipt = receiptFrom(fullOwnerResult);
    const pending = invocation({ input, status: 'pending' });
    const succeeded = invocation({ input, status: 'succeeded', result: receipt });
    const repository = {
      findById: vi.fn().mockResolvedValue(pending),
      admit: vi.fn().mockResolvedValue({ kind: 'created', invocation: pending }),
      recordSucceeded: vi.fn().mockResolvedValue(succeeded),
      recordKnownFailure: vi.fn(),
    };
    const owner = {
      capabilityKey: definition.key,
      invoke: vi.fn().mockResolvedValue(fullOwnerResult),
    };
    const service = new CapabilityInvocationService(
      repository as never,
      registry(definition, owner) as never,
    );

    await expect(service.invoke(mutationRequest(input))).resolves.toMatchObject({
      kind: 'completed',
      result: receipt,
    });
    expect(repository.recordSucceeded).toHaveBeenCalledWith(expect.objectContaining({
      invocationId: INVOCATION_ID,
      result: receipt,
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
      findById: vi.fn().mockResolvedValue(pending),
      admit: vi.fn().mockResolvedValue({ kind: 'created', invocation: pending }),
      recordKnownFailure: vi.fn().mockResolvedValue(failed),
      recordSucceeded: vi.fn(),
    };
    const owner = { capabilityKey: mutationDefinition.key, invoke: vi.fn() };
    const service = new CapabilityInvocationService(repository as never, registry(mutationDefinition, owner) as never);

    owner.invoke.mockRejectedValueOnce(new Error('timeout after submit'));
    await expect(service.invoke(mutationRequest(input))).rejects.toMatchObject({
      code: 'OWNER_RESULT_AMBIGUOUS',
      invocationId: INVOCATION_ID,
    } satisfies Partial<OwnerResultAmbiguousError>);
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

  it('persists a known owner failure with its safe public message', async () => {
    const input = { alpha: 'candidate', nested: { a: 1, b: 2 } };
    const providerDiagnostic = 'provider echo: secretKey=secret-key';
    const ownerSafeFailure = 'Provider rejected before commit.';
    const pending = invocation({ input, status: 'pending' });
    const failed = {
      ...invocation({ input, status: 'failed' }),
      error: {
        code: 'OWNER_KNOWN_FAILURE',
        message: ownerSafeFailure,
      },
    };
    const repository = {
      findById: vi.fn().mockResolvedValue(pending),
      admit: vi.fn().mockResolvedValue({ kind: 'created', invocation: pending }),
      recordKnownFailure: vi.fn().mockResolvedValue(failed),
      recordSucceeded: vi.fn(),
    };
    const owner = {
      capabilityKey: mutationDefinition.key,
      invoke: vi.fn().mockRejectedValue(Object.assign(
        new OwnerKnownFailureError(ownerSafeFailure),
        { cause: new Error(providerDiagnostic) },
      )),
    };
    const service = new CapabilityInvocationService(
      repository as never,
      registry(mutationDefinition, owner) as never,
    );

    await expect(service.invoke(mutationRequest(input))).rejects.toMatchObject({
      code: 'OWNER_KNOWN_FAILURE',
      message: ownerSafeFailure,
    } satisfies Partial<AgentOsError>);
    expect(repository.recordKnownFailure).toHaveBeenCalledWith(expect.objectContaining({
      invocationId: INVOCATION_ID,
      error: {
        code: 'OWNER_KNOWN_FAILURE',
        message: ownerSafeFailure,
      },
    }));
    expect(JSON.stringify(repository.recordKnownFailure.mock.calls)).not.toContain(
      providerDiagnostic,
    );
  });

  it('does not let an owner repurpose non-owner invocation error codes', async () => {
    const input = { alpha: 'candidate', nested: { a: 1, b: 2 } };
    const pending = invocation({ input, status: 'pending' });
    const failed = {
      ...invocation({ input, status: 'failed' }),
      error: {
        code: 'OWNER_KNOWN_FAILURE',
        message: 'Owner reported a known failure before commit.',
      },
    };
    const repository = {
      findById: vi.fn().mockResolvedValue(pending),
      admit: vi.fn().mockResolvedValue({ kind: 'created', invocation: pending }),
      recordKnownFailure: vi.fn().mockResolvedValue(failed),
      recordSucceeded: vi.fn(),
    };
    const owner = {
      capabilityKey: mutationDefinition.key,
      invoke: vi.fn().mockRejectedValue(Object.assign(
        new Error('Provider rejected before commit.'),
        { knownNoCommit: true as const, code: 'REQUEST_KEY_CONFLICT' },
      )),
    };
    const service = new CapabilityInvocationService(
      repository as never,
      registry(mutationDefinition, owner) as never,
    );

    await expect(service.invoke(mutationRequest(input))).rejects.toMatchObject({
      code: 'OWNER_KNOWN_FAILURE',
    } satisfies Partial<AgentOsError>);
    expect(repository.recordKnownFailure).toHaveBeenCalledWith(expect.objectContaining({
      error: expect.objectContaining({ code: 'OWNER_KNOWN_FAILURE' }),
    }));
  });

  it('replays an approved durable sourcing ingest after a crash loses its expired scrape receipt', async () => {
    let now = 1_000;
    const input = { snapshot: sourcingSnapshot() };
    const guard = new SourcingScrapeSnapshotAdmissionGuard({
      now: () => new Date(now),
      ttlMs: 100,
    });
    const admitScrapeReceipt = vi.spyOn(guard, 'admit');
    guard.recordScrapeSnapshot({
      organizationId: ORGANIZATION_ID,
      initiatingUserId: USER_ID,
      executionId: 'execution-before-crash',
      snapshot: input.snapshot,
    });
    now += 101;

    const definition = SOURCING_CAPABILITIES.find(
      (candidate) => candidate.key === 'sourcing.ingestCandidate',
    );
    if (!definition) throw new Error('sourcing_ingest_definition_missing');
    const pending = {
      ...invocation({ input, status: 'pending' }),
      capabilityKey: definition.key,
      requestKey: 'retry-after-owner-commit',
      canonicalInput: canonicalizeOwnerInput(input),
      inputHash: canonicalOwnerInputHash(input),
      approvalInputHash: canonicalOwnerInputHash(input),
      approvalRequestedAt: new Date(now - 100),
      approvalExpiresAt: new Date(now + 1_000),
      approvalDecision: 'approved' as const,
      approvalDecidedByUserId: USER_ID,
      approvalDecidedAt: new Date(now - 1),
    };
    const ownerResult = { ...completedResult(), output: { candidateId: '00000000-0000-4000-8000-000000000004', salesProductId: null } };
    const result = receiptFrom(ownerResult);
    const succeeded = {
      ...pending,
      status: 'succeeded' as const,
      result,
      finishedAt: new Date(now),
    };
    const repository = {
      findById: vi.fn().mockResolvedValue(pending),
      findByRequestKey: vi.fn().mockResolvedValue(pending),
      admit: vi.fn().mockResolvedValue({ kind: 'replay', invocation: pending }),
      recordSucceeded: vi.fn().mockResolvedValue(succeeded),
      recordKnownFailure: vi.fn(),
    };
    const owner = {
      capabilityKey: definition.key,
      invoke: vi.fn().mockResolvedValue(ownerResult),
    };
    const service = new CapabilityInvocationService(
      repository as never,
      registry(definition, owner) as never,
      () => new Date(now),
      guard,
    );

    await expect(service.invoke({
      organizationId: ORGANIZATION_ID,
      initiatingUserId: USER_ID,
      executionId: 'execution-after-crash',
      capabilityKey: definition.key,
      requestKey: pending.requestKey,
      actingAgentKey: 'sourcing',
      input,
    })).resolves.toMatchObject({
      kind: 'completed',
      invocationId: INVOCATION_ID,
      result,
    });

    expect(repository.findByRequestKey).toHaveBeenCalledWith({
      organizationId: ORGANIZATION_ID,
      requestKey: pending.requestKey,
    });
    expect(admitScrapeReceipt).not.toHaveBeenCalled();
    expect(repository.admit).toHaveBeenCalledWith(expect.objectContaining({
      capabilityKey: definition.key,
      actingAgentKey: 'sourcing',
      canonicalInput: input,
    }));
    expect(owner.invoke).toHaveBeenCalledWith(expect.objectContaining({
      context: expect.objectContaining({
        ownerIdempotencyKey: `capability-invocation:${INVOCATION_ID}`,
      }),
    }));
  });

  it('conflicts a changed sourcing ingest before considering expired scrape evidence', async () => {
    const input = { snapshot: sourcingSnapshot() };
    const changedInput = {
      snapshot: { ...input.snapshot, title: 'Changed after the crash' },
    };
    const definition = SOURCING_CAPABILITIES.find(
      (candidate) => candidate.key === 'sourcing.ingestCandidate',
    );
    if (!definition) throw new Error('sourcing_ingest_definition_missing');
    const pending = {
      ...invocation({ input, status: 'pending' }),
      capabilityKey: definition.key,
      requestKey: 'retry-with-changed-input',
      canonicalInput: canonicalizeOwnerInput(input),
      inputHash: canonicalOwnerInputHash(input),
    };
    const repository = {
      findByRequestKey: vi.fn().mockResolvedValue(pending),
      admit: vi.fn(),
      recordSucceeded: vi.fn(),
      recordKnownFailure: vi.fn(),
    };
    const owner = { capabilityKey: definition.key, invoke: vi.fn() };
    const service = new CapabilityInvocationService(
      repository as never,
      registry(definition, owner) as never,
      undefined,
      new SourcingScrapeSnapshotAdmissionGuard(),
    );

    await expect(service.invoke({
      organizationId: ORGANIZATION_ID,
      initiatingUserId: USER_ID,
      executionId: 'execution-after-crash',
      capabilityKey: definition.key,
      requestKey: pending.requestKey,
      actingAgentKey: 'sourcing',
      input: changedInput,
    })).rejects.toMatchObject({
      code: 'REQUEST_KEY_CONFLICT',
    } satisfies Partial<AgentOsError>);
    expect(repository.admit).not.toHaveBeenCalled();
    expect(owner.invoke).not.toHaveBeenCalled();
  });

  it('does not resume a durable sourcing ingest across initiating users', async () => {
    const input = { snapshot: sourcingSnapshot() };
    const definition = SOURCING_CAPABILITIES.find(
      (candidate) => candidate.key === 'sourcing.ingestCandidate',
    );
    if (!definition) throw new Error('sourcing_ingest_definition_missing');
    const pending = {
      ...invocation({ input, status: 'pending' }),
      capabilityKey: definition.key,
      requestKey: 'retry-from-another-user',
      canonicalInput: canonicalizeOwnerInput(input),
      inputHash: canonicalOwnerInputHash(input),
    };
    const replay = {
      ...pending,
      status: 'succeeded' as const,
      result: receiptFrom(completedResult()),
      finishedAt: new Date('2026-08-25T00:00:00.000Z'),
    };
    const repository = {
      findByRequestKey: vi.fn().mockResolvedValue(pending),
      admit: vi.fn().mockResolvedValue({ kind: 'replay', invocation: replay }),
      recordSucceeded: vi.fn(),
      recordKnownFailure: vi.fn(),
    };
    const owner = { capabilityKey: definition.key, invoke: vi.fn() };
    const service = new CapabilityInvocationService(
      repository as never,
      registry(definition, owner) as never,
      undefined,
      new SourcingScrapeSnapshotAdmissionGuard(),
    );

    await expect(service.invoke({
      organizationId: ORGANIZATION_ID,
      initiatingUserId: '00000000-0000-4000-8000-000000000009',
      executionId: 'execution-after-crash',
      capabilityKey: definition.key,
      requestKey: pending.requestKey,
      actingAgentKey: 'sourcing',
      input,
    })).rejects.toMatchObject({
      code: 'REQUEST_KEY_CONFLICT',
    } satisfies Partial<AgentOsError>);
    expect(repository.admit).not.toHaveBeenCalled();
    expect(owner.invoke).not.toHaveBeenCalled();
  });

  it('reads a lapsed undecided approval as expired before the sweep fails it', async () => {
    const input = { alpha: 'candidate', nested: { a: 1, b: 2 } };
    const inputHash = canonicalOwnerInputHash(input);
    const definition = { ...mutationDefinition, approvalRisk: 'medium' as const };
    const lapsed = {
      ...invocation({ input, status: 'pending' }),
      approvalInputHash: inputHash,
      approvalRequestedAt: new Date('2026-08-25T00:00:00.000Z'),
      approvalExpiresAt: new Date('2026-08-25T00:30:00.000Z'),
    };
    const repository = {
      findById: vi.fn().mockResolvedValue(lapsed),
      admit: vi.fn().mockResolvedValue({ kind: 'replay', invocation: lapsed }),
      recordSucceeded: vi.fn(),
      recordKnownFailure: vi.fn(),
    };
    const owner = { capabilityKey: definition.key, invoke: vi.fn() };
    const dispatcher = { dispatch: vi.fn() };
    const service = new CapabilityInvocationService(
      repository as never,
      registry(definition, owner) as never,
      () => new Date('2026-08-25T00:30:00.000Z'),
      undefined,
      dispatcher as never,
    );

    await expect(service.getReceipt({ organizationId: ORGANIZATION_ID, invocationId: INVOCATION_ID }))
      .resolves.toMatchObject({ status: 'pending', approvalStatus: 'expired' });
    await expect(service.get({ organizationId: ORGANIZATION_ID, invocationId: INVOCATION_ID }))
      .resolves.toMatchObject({ approvalDecision: null, approvalStatus: 'expired' });
    await expect(service.invoke(mutationRequest(input))).rejects.toMatchObject({
      code: 'APPROVAL_EXPIRED',
    } satisfies Partial<AgentOsError>);
    expect(dispatcher.dispatch).not.toHaveBeenCalled();
    expect(owner.invoke).not.toHaveBeenCalled();
  });

  it('returns the conditional finalization winner instead of inventing a second outcome', async () => {
    const input = { alpha: 'candidate', nested: { a: 1, b: 2 } };
    const rejected = {
      ...invocation({ input, status: 'failed' }),
      approvalDecision: 'rejected' as const,
      error: {
        code: 'APPROVAL_REJECTED',
        message: 'User rejected the exact capability invocation.',
      },
    };
    const repository = {
      findById: vi.fn().mockResolvedValue(invocation({ input, status: 'pending' })),
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
    approvalInputHash: null,
    approvalRequestedAt: null,
    approvalExpiresAt: null,
    approvalDecision: null,
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
    output: { candidateId: '00000000-0000-4000-8000-000000000004' },
  };
}

function receiptFrom(result: ReturnType<typeof completedResult>) {
  return {
    summary: result.summary,
    resourceRefs: result.resourceRefs,
  };
}

function sourcingSnapshot() {
  return {
    sourceUrl: 'https://detail.1688.com/offer/1.html',
    platform: '1688' as const,
    title: 'Toy',
    price: 1,
    currency: 'CNY',
    variantKeyNormalized: '',
    images: [],
    contentHash: 'a'.repeat(64),
  };
}

function registry(definition: object, owner: object) {
  return {
    resolveDefinition: vi.fn((key: string) => key === (definition as { key: string }).key ? definition : null),
    resolveImplementation: vi.fn((key: string) => key === (owner as { capabilityKey: string }).capabilityKey ? owner : null),
  };
}
