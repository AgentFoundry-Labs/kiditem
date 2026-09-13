import { Logger } from '@nestjs/common';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { canonicalOwnerInputHash } from '../../../common/owner-idempotency-key';
import { AgentOsError } from '../../domain/agent-os.errors';
import type { CapabilityInvocationRecord } from '../port/out/capability-invocation.repository.port';
import {
  CAPABILITY_APPROVED_PENDING_BOOTSTRAP_LIMIT,
  CapabilityMutationDispatcher,
  OwnerResultAmbiguousError,
} from './capability-mutation-dispatcher.service';

const ORGANIZATION_ID = '00000000-0000-4000-8000-000000000001';
const USER_ID = '00000000-0000-4000-8000-000000000002';
const INVOCATION_ID = '00000000-0000-4000-8000-000000000003';
const INPUT = { alpha: 'candidate', nested: { a: 1, b: 2 } };

const definition = {
  key: 'sourcing.createCandidate',
  ownerDomain: 'sourcing',
  ownerInputPort: 'sourcing.createCandidate',
  description: 'Test-only mutation.',
  resultSummary: 'Candidate created.',
  inputSchema: z.object({
    alpha: z.string(),
    nested: z.object({ a: z.number(), b: z.number() }).strict(),
  }).strict(),
  outputSchema: z.object({ candidateId: z.string().uuid() }).strict(),
  effects: ['db_write'] as const,
  approvalRisk: 'medium' as const,
  idempotency: 'required' as const,
};

describe('CapabilityMutationDispatcher', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('dispatches only persisted approved input with the stable invocation owner key', async () => {
    const approved = invocation();
    const completed = { ...approved, status: 'succeeded' as const, result: receipt() };
    const repository = repositoryFor(approved, completed);
    const owner = { capabilityKey: definition.key, invoke: vi.fn().mockResolvedValue(ownerResult()) };
    const dispatcher = new CapabilityMutationDispatcher(
      repository as never,
      registry(owner) as never,
    );

    const returned = await dispatcher.dispatch({
      ...approved,
      canonicalInput: { alpha: 'caller-controlled', nested: { a: 9, b: 9 } },
      inputHash: canonicalOwnerInputHash({ alpha: 'caller-controlled', nested: { a: 9, b: 9 } }),
    });

    expect(returned).toMatchObject({ status: 'succeeded', result: receipt() });
    expect(owner.invoke).toHaveBeenCalledTimes(1);
    expect(owner.invoke).toHaveBeenCalledWith({
      context: {
        organizationId: ORGANIZATION_ID,
        initiatingUserId: USER_ID,
        executionId: INVOCATION_ID,
        ownerIdempotencyKey: `capability-invocation:${INVOCATION_ID}`,
        ownerInputHash: canonicalOwnerInputHash(INPUT),
      },
      input: INPUT,
    });
    expect(repository.recordSucceeded).toHaveBeenCalledWith({
      organizationId: ORGANIZATION_ID,
      invocationId: INVOCATION_ID,
      result: receipt(),
      finishedAt: expect.any(Date),
    });
  });

  it('shares one owner call across concurrent replay and bootstrap dispatch', async () => {
    const approved = invocation();
    const completed = { ...approved, status: 'succeeded' as const, result: receipt() };
    const repository = repositoryFor(approved, completed);
    repository.listApprovedPending.mockResolvedValue([approved]);
    const ownerResultDeferred = deferred<ReturnType<typeof ownerResult>>();
    const owner = {
      capabilityKey: definition.key,
      invoke: vi.fn().mockReturnValue(ownerResultDeferred.promise),
    };
    const dispatcher = new CapabilityMutationDispatcher(
      repository as never,
      registry(owner) as never,
    );

    const approvalDispatch = dispatcher.dispatch(approved);
    await Promise.resolve();
    const bootstrapDispatch = dispatcher.onApplicationBootstrap();
    const replayDispatch = dispatcher.dispatch(approved);
    await Promise.resolve();
    await Promise.resolve();

    expect(owner.invoke).toHaveBeenCalledTimes(1);
    ownerResultDeferred.resolve(ownerResult());
    await Promise.all([approvalDispatch, bootstrapDispatch, replayDispatch]);
    expect(repository.listApprovedPending).toHaveBeenCalledWith({
      limit: CAPABILITY_APPROVED_PENDING_BOOTSTRAP_LIMIT,
    });
    expect(repository.recordSucceeded).toHaveBeenCalledTimes(1);
  });

  it('runs one bounded bootstrap sweep and never executes non-approved pending records', async () => {
    const approved = invocation();
    const completed = { ...approved, status: 'succeeded' as const, result: receipt() };
    const pending = { ...approved, id: '00000000-0000-4000-8000-000000000004', approvalStatus: 'pending' as const };
    const rejected = {
      ...approved,
      id: '00000000-0000-4000-8000-000000000005',
      status: 'failed' as const,
      approvalStatus: 'rejected' as const,
    };
    const repository = repositoryFor(approved, completed, new Map([
      [pending.id, pending],
      [rejected.id, rejected],
    ]));
    repository.listApprovedPending.mockResolvedValue([approved, pending, rejected]);
    const owner = { capabilityKey: definition.key, invoke: vi.fn().mockResolvedValue(ownerResult()) };
    const dispatcher = new CapabilityMutationDispatcher(
      repository as never,
      registry(owner) as never,
    );

    await dispatcher.onApplicationBootstrap();
    await dispatcher.onApplicationBootstrap();

    expect(repository.listApprovedPending).toHaveBeenCalledTimes(1);
    expect(repository.listApprovedPending).toHaveBeenCalledWith({
      limit: CAPABILITY_APPROVED_PENDING_BOOTSTRAP_LIMIT,
    });
    expect(owner.invoke).toHaveBeenCalledTimes(1);
    expect(owner.invoke).toHaveBeenCalledWith(expect.objectContaining({
      context: expect.objectContaining({ executionId: INVOCATION_ID }),
    }));
  });

  it('completes API bootstrap and records the failure when the sweep read rejects', async () => {
    const approved = invocation();
    const repository = repositoryFor(approved, approved);
    repository.listApprovedPending.mockRejectedValue(
      new Error('The table `public.capability_invocations` does not exist'),
    );
    const owner = { capabilityKey: definition.key, invoke: vi.fn() };
    const dispatcher = new CapabilityMutationDispatcher(
      repository as never,
      registry(owner) as never,
    );
    const loggedError = vi
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => undefined);

    await expect(dispatcher.onApplicationBootstrap()).resolves.toBeUndefined();
    await expect(dispatcher.onApplicationBootstrap()).resolves.toBeUndefined();

    expect(owner.invoke).not.toHaveBeenCalled();
    // The sweep is attempted once per process; a failed attempt is not re-armed.
    expect(repository.listApprovedPending).toHaveBeenCalledTimes(1);
    expect(loggedError).toHaveBeenCalledTimes(1);
    expect(loggedError).toHaveBeenCalledWith(
      expect.stringContaining('public.capability_invocations'),
      expect.any(String),
    );
  });

  it('still dispatches every approved receipt a successful sweep finds', async () => {
    const first = invocation();
    const second = invocation({ id: '00000000-0000-4000-8000-000000000006' });
    const completed = { ...first, status: 'succeeded' as const, result: receipt() };
    const repository = repositoryFor(first, completed, new Map([[second.id, second]]));
    repository.listApprovedPending.mockResolvedValue([first, second]);
    const owner = {
      capabilityKey: definition.key,
      invoke: vi.fn().mockResolvedValue(ownerResult()),
    };
    const dispatcher = new CapabilityMutationDispatcher(
      repository as never,
      registry(owner) as never,
    );

    await expect(dispatcher.onApplicationBootstrap()).resolves.toBeUndefined();

    expect(owner.invoke).toHaveBeenCalledTimes(2);
    expect(repository.recordSucceeded).toHaveBeenCalledTimes(2);
    expect(repository.recordSucceeded).toHaveBeenCalledWith(
      expect.objectContaining({ invocationId: first.id }),
    );
    expect(repository.recordSucceeded).toHaveBeenCalledWith(
      expect.objectContaining({ invocationId: second.id }),
    );
  });

  it('blocks schema, canonical-hash, and approval-hash drift before the owner call', async () => {
    const schemaDrift = invocation({
      canonicalInput: { alpha: 1, nested: { a: 1, b: 2 } },
      inputHash: canonicalOwnerInputHash({ alpha: 1, nested: { a: 1, b: 2 } }),
    });
    const hashDrift = invocation({ inputHash: 'b'.repeat(64) });
    const approvalHashDrift = invocation({ approvalInputHash: 'c'.repeat(64) });
    const owner = { capabilityKey: definition.key, invoke: vi.fn() };

    for (const invocationWithDrift of [schemaDrift, hashDrift, approvalHashDrift]) {
      const repository = repositoryFor(invocationWithDrift, invocationWithDrift);
      const dispatcher = new CapabilityMutationDispatcher(
        repository as never,
        registry(owner) as never,
      );

      await expect(dispatcher.dispatch(invocationWithDrift)).rejects.toMatchObject({
        code: 'CAPABILITY_POLICY_DRIFT',
      } satisfies Partial<AgentOsError>);
    }
    expect(owner.invoke).not.toHaveBeenCalled();
  });

  it('fails closed when direct approval and bootstrap receipts no longer match the current approval policy', async () => {
    const direct = invocation();
    const bootstrap = invocation({
      id: '00000000-0000-4000-8000-000000000004',
    });
    const repository = repositoryFor(direct, direct, new Map([
      [bootstrap.id, bootstrap],
    ]));
    repository.listApprovedPending.mockResolvedValue([bootstrap]);
    const owner = {
      capabilityKey: definition.key,
      invoke: vi.fn().mockResolvedValue(ownerResult()),
    };
    const dispatcher = new CapabilityMutationDispatcher(
      repository as never,
      registry(owner, { ...definition, approvalRisk: 'low' }) as never,
    );

    await expect(dispatcher.dispatch(direct)).rejects.toMatchObject({
      code: 'CAPABILITY_POLICY_DRIFT',
    } satisfies Partial<AgentOsError>);
    await expect(dispatcher.onApplicationBootstrap()).resolves.toBeUndefined();

    expect(owner.invoke).not.toHaveBeenCalled();
  });

  it('returns terminal or still-pending receipts without calling the owner', async () => {
    const succeeded = { ...invocation(), status: 'succeeded' as const, result: receipt() };
    const rejected = { ...invocation(), status: 'failed' as const, approvalStatus: 'rejected' as const };
    const expired = { ...invocation(), status: 'failed' as const, approvalStatus: 'expired' as const };
    const stillPending = { ...invocation(), approvalStatus: 'pending' as const };
    const owner = { capabilityKey: definition.key, invoke: vi.fn() };

    for (const record of [succeeded, rejected, expired, stillPending]) {
      const repository = repositoryFor(record, record);
      const dispatcher = new CapabilityMutationDispatcher(
        repository as never,
        registry(owner) as never,
      );
      await expect(dispatcher.dispatch(record)).resolves.toEqual(record);
    }
    expect(owner.invoke).not.toHaveBeenCalled();
  });

  it('keeps an unknown owner outcome pending without synthesizing a result', async () => {
    const approved = invocation();
    const repository = repositoryFor(approved, approved);
    const owner = {
      capabilityKey: definition.key,
      invoke: vi.fn().mockRejectedValue(new Error('owner response lost after write')),
    };
    const dispatcher = new CapabilityMutationDispatcher(
      repository as never,
      registry(owner) as never,
    );

    await expect(dispatcher.dispatch(approved)).rejects.toMatchObject({
      code: 'OWNER_RESULT_AMBIGUOUS',
      invocationId: INVOCATION_ID,
    } satisfies Partial<OwnerResultAmbiguousError>);
    expect(repository.recordSucceeded).not.toHaveBeenCalled();
    expect(repository.recordKnownFailure).not.toHaveBeenCalled();
  });
});

function invocation(overrides: Partial<CapabilityInvocationRecord> = {}): CapabilityInvocationRecord {
  const inputHash = canonicalOwnerInputHash(INPUT);
  return {
    id: INVOCATION_ID,
    organizationId: ORGANIZATION_ID,
    initiatingUserId: USER_ID,
    capabilityKey: definition.key,
    actingAgentKey: 'sourcing',
    requestKey: 'request-1',
    canonicalInput: INPUT,
    inputHash,
    status: 'pending',
    approvalStatus: 'approved',
    approvalInputHash: inputHash,
    approvalRequestedAt: new Date('2026-08-25T00:00:00.000Z'),
    approvalExpiresAt: new Date('2026-08-25T00:30:00.000Z'),
    approvalDecidedByUserId: USER_ID,
    approvalDecisionReason: 'Reviewed',
    approvalDecidedAt: new Date('2026-08-25T00:01:00.000Z'),
    result: null,
    error: null,
    createdAt: new Date('2026-08-25T00:00:00.000Z'),
    updatedAt: new Date('2026-08-25T00:01:00.000Z'),
    finishedAt: null,
    ...overrides,
  };
}

function repositoryFor(
  persisted: CapabilityInvocationRecord,
  finalRecord: CapabilityInvocationRecord,
  additional: Map<string, CapabilityInvocationRecord> = new Map(),
) {
  const records = new Map<string, CapabilityInvocationRecord>([
    [persisted.id, persisted],
    ...additional.entries(),
  ]);
  return {
    findById: vi.fn(({ invocationId }: { invocationId: string }) =>
      Promise.resolve(records.get(invocationId) ?? null)),
    listApprovedPending: vi.fn().mockResolvedValue([]),
    recordSucceeded: vi.fn().mockResolvedValue(finalRecord),
    recordKnownFailure: vi.fn().mockResolvedValue(finalRecord),
  };
}

function registry(
  owner: { capabilityKey: string; invoke: ReturnType<typeof vi.fn> },
  capabilityDefinition = definition,
) {
  return {
    resolveDefinition: vi.fn((key: string) => key === capabilityDefinition.key ? capabilityDefinition : null),
    resolveImplementation: vi.fn((key: string) => key === owner.capabilityKey ? owner : null),
  };
}

function ownerResult() {
  return {
    summary: 'Candidate created.',
    resourceRefs: [{ kind: 'sourcing_candidate', id: '00000000-0000-4000-8000-000000000004', version: null }],
    output: { candidateId: '00000000-0000-4000-8000-000000000004' },
  };
}

function receipt() {
  const result = ownerResult();
  return {
    summary: result.summary,
    resourceRefs: result.resourceRefs,
  };
}

function deferred<T>() {
  let resolve: (value: T) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve: (value: T) => resolve(value) };
}
