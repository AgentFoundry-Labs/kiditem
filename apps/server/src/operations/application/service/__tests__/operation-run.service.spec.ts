import { NotFoundException } from '@nestjs/common';
import { z } from 'zod';
import { describe, expect, it, vi } from 'vitest';
import { OperationHandlerRegistryService } from '../operation-handler-registry.service';
import { OperationLifecycleGateService } from '../operation-lifecycle-gate.service';
import { OperationRunService } from '../operation-run.service';
import type {
  OperationRunRecord,
  OperationRunRepositoryPort,
} from '../../port/out/repository/operation.repository.port';
import type {
  OperationDefinition,
  OperationHandler,
} from '../../../../../common/operation-definition';

const ORG_ID = '5e29b0f8-17be-4b95-9a16-5b9cfc952e99';
const USER_ID = 'b223839e-0958-44e4-8238-fc4f5b7254ae';
const RUN_ID = '4313fb12-dc40-4b51-881b-df83f6308b6d';

const definition: OperationDefinition = {
  key: 'sourcing.collect_daily_trends',
  version: 1,
  title: '일일 트렌드 수집',
  ownerDomain: 'sourcing',
  engineType: 'composite',
  allowedTriggers: ['dashboard', 'schedule'],
  scheduleSupported: true,
  maxAttempts: 3,
  resourceClass: 'default',
  executionTimeoutMs: 900_000,
  inputSchema: z.object({ source: z.string() }).strict(),
};

const handler: OperationHandler = {
  async execute() {
    return { kind: 'completed', result: {} };
  },
};

const compositeCoordinator = {
  waitForChild: vi.fn(),
  listChildren: vi.fn().mockResolvedValue([]),
  resumeTerminalChildren: vi.fn(),
  cancelChildren: vi.fn(),
};

function makeRecord(input: Partial<OperationRunRecord> = {}): OperationRunRecord {
  return {
    id: RUN_ID,
    organizationId: ORG_ID,
    operationKey: definition.key,
    definitionVersion: definition.version,
    ownerDomain: definition.ownerDomain,
    title: definition.title,
    engineType: definition.engineType,
    resourceClass: definition.resourceClass,
    executionTimeoutMs: definition.executionTimeoutMs,
    status: 'queued',
    triggerSource: 'dashboard',
    requestedByUserId: USER_ID,
    parentRunId: null,
    scheduleId: null,
    idempotencyKey: 'dashboard:trends',
    input: { source: 'naver' },
    result: null,
    progress: null,
    stage: null,
    stageUpdatedAt: null,
    progressCurrent: null,
    progressTotal: null,
    deadlineAt: null,
    nativeRunType: null,
    nativeRunId: null,
    attempts: 0,
    maxAttempts: 3,
    claimedBy: null,
    attemptToken: null,
    claimedAt: null,
    leaseExpiresAt: null,
    scheduledFor: null,
    errorCode: null,
    errorMessage: null,
    startedAt: null,
    finishedAt: null,
    createdAt: new Date('2026-08-01T00:00:00Z'),
    updatedAt: new Date('2026-08-01T00:00:00Z'),
    requestedBy: { id: USER_ID, name: '운영자', email: 'operator@example.com' },
    ...input,
  };
}

function makeRepository(): OperationRunRepositoryPort {
  return {
    findRunById: vi.fn(),
    findByIdempotencyKey: vi.fn().mockResolvedValue(null),
    createRun: vi.fn().mockResolvedValue(makeRecord()),
    listRuns: vi.fn().mockResolvedValue([]),
    readLifecycleDatabaseTime: vi.fn().mockResolvedValue(
      new Date('2026-08-01T00:30:00Z'),
    ),
    transition: vi.fn(),
  };
}

function acceptingGate(): OperationLifecycleGateService {
  const gate = new OperationLifecycleGateService();
  gate.open();
  return gate;
}

function gateIn(state: 'BOOTSTRAPPING' | 'STOPPING' | 'STOPPED') {
  const gate = new OperationLifecycleGateService();
  if (state !== 'BOOTSTRAPPING') gate.beginStopping();
  if (state === 'STOPPED') gate.finishStopping();
  return gate;
}

describe('OperationRunService', () => {
  it('makes an ephemeral run non-enumerating on every public runner surface', async () => {
    const registry = new OperationHandlerRegistryService();
    const ephemeralDefinition = {
      ...definition,
      key: 'agent-os.delete-session',
      allowedTriggers: ['system'],
      scheduleSupported: false,
      successPersistence: 'ephemeral_on_success',
    };
    registry.register(ephemeralDefinition as never, {
      ...handler,
      finalizeEphemeralSuccess: vi.fn(),
      exhaustRetry: vi.fn(),
    } as never);
    const ephemeralRun = makeRecord({
      operationKey: ephemeralDefinition.key,
      triggerSource: 'system',
      status: 'queued',
      idempotencyKey: 'session-delete',
    });
    const repository = makeRepository();
    repository.findRunById = vi.fn().mockResolvedValue(ephemeralRun);
    repository.listRuns = vi.fn().mockResolvedValue([ephemeralRun]);
    repository.listReconnectableRuns = vi.fn().mockResolvedValue([ephemeralRun]);
    const coordinator = {
      ...compositeCoordinator,
      cancelChildren: vi.fn().mockResolvedValue(ephemeralRun),
    };
    const service = new OperationRunService(
      registry,
      repository,
      coordinator,
      acceptingGate(),
    );

    await expect(service.start({
      organizationId: ORG_ID,
      operationKey: ephemeralDefinition.key,
      triggerSource: 'system',
      input: { source: 'naver' },
      requestedByUserId: USER_ID,
      idempotencyKey: 'session-delete',
    })).rejects.toBeInstanceOf(NotFoundException);
    await expect(service.get(ORG_ID, RUN_ID)).rejects.toBeInstanceOf(NotFoundException);
    await expect(service.cancel({
      organizationId: ORG_ID,
      runId: RUN_ID,
      requestedByUserId: USER_ID,
    })).rejects.toBeInstanceOf(NotFoundException);
    await expect(service.findReconnectable({
      organizationId: ORG_ID,
      requestedByUserId: USER_ID,
      operationKey: ephemeralDefinition.key,
      input: { source: 'naver' },
    })).resolves.toBeNull();
    await expect(service.list({ organizationId: ORG_ID })).resolves.toEqual([]);
    expect(repository.listRuns).toHaveBeenCalledWith(expect.objectContaining({
      excludedOperationKeys: [ephemeralDefinition.key],
    }));
    expect(await repository.findRunById({ organizationId: ORG_ID, runId: RUN_ID }))
      .toMatchObject({ status: 'queued' });
    expect(repository.findByIdempotencyKey).not.toHaveBeenCalled();
    expect(repository.createRun).not.toHaveBeenCalled();
  });

  it('fails closed when exact-run fencing sees missing, token-drifted, or unproven native authority', async () => {
    const registry = new OperationHandlerRegistryService();
    registry.register(definition, {
      ...handler,
      fenceExternalAuthority: vi.fn().mockResolvedValue('unknown'),
    });
    const terminalRun = makeRecord({
      id: '11111111-1111-4111-8111-111111111111',
      status: 'succeeded',
      attemptToken: null,
    });
    const driftedRun = makeRecord({
      id: '22222222-2222-4222-8222-222222222222',
      attemptToken: 'd5c54820-ab09-4f4b-864c-2a3f873bb24d',
    });
    const nativeRun = makeRecord({
      id: '33333333-3333-4333-8333-333333333333',
      status: 'running',
      attemptToken: 'ced54820-ab09-4f4b-864c-2a3f873bb24d',
      nativeRunType: 'browser',
      nativeRunId: 'native-run-1',
    });
    const repository = makeRepository();
    repository.findRunById = vi.fn(async ({ runId }) => ({
      [terminalRun.id]: terminalRun,
      [driftedRun.id]: driftedRun,
      [nativeRun.id]: nativeRun,
    })[runId] ?? null);
    repository.transition = vi.fn().mockResolvedValue({
      ...nativeRun,
      status: 'cancelled',
      attemptToken: null,
      claimedBy: null,
      claimedAt: null,
      leaseExpiresAt: null,
    });
    const service = new OperationRunService(
      registry,
      repository,
      compositeCoordinator,
      acceptingGate(),
    );
    const exactControl = service as unknown as {
      fenceAndCancel(input: {
        signal: AbortSignal;
        organizationId: string;
        reason: string;
        runs: Array<{
          runId: string;
          operationKey: string;
          expectedAttemptToken: string | null;
        }>;
      }): Promise<unknown>;
    };

    await expect(exactControl.fenceAndCancel({
      signal: new AbortController().signal,
      organizationId: ORG_ID,
      reason: 'session_deleting',
      runs: [
        { runId: terminalRun.id, operationKey: definition.key, expectedAttemptToken: null },
        {
          runId: driftedRun.id,
          operationKey: definition.key,
          expectedAttemptToken: 'ced54820-ab09-4f4b-864c-2a3f873bb24d',
        },
        {
          runId: nativeRun.id,
          operationKey: definition.key,
          expectedAttemptToken: 'ced54820-ab09-4f4b-864c-2a3f873bb24d',
        },
        { runId: '44444444-4444-4444-8444-444444444444', operationKey: definition.key, expectedAttemptToken: null },
      ],
    })).resolves.toEqual([
      {
        runId: terminalRun.id,
        state: 'terminal',
        nativeRunType: null,
        nativeRunId: null,
      },
      {
        runId: driftedRun.id,
        state: 'unknown',
        nativeRunType: null,
        nativeRunId: null,
      },
      {
        runId: nativeRun.id,
        state: 'unknown',
        nativeRunType: 'browser',
        nativeRunId: 'native-run-1',
      },
      {
        runId: '44444444-4444-4444-8444-444444444444',
        state: 'unknown',
        nativeRunType: null,
        nativeRunId: null,
      },
    ]);
    expect(repository.transition).toHaveBeenCalledWith(expect.objectContaining({
      runId: nativeRun.id,
      expectedAttemptToken: 'ced54820-ab09-4f4b-864c-2a3f873bb24d',
      status: 'cancelled',
    }));
  });

  it('fails closed when a terminal exact run has drifted from its expected token', async () => {
    const registry = new OperationHandlerRegistryService();
    registry.register(definition, handler);
    const repository = makeRepository();
    repository.findRunById = vi.fn().mockResolvedValue(makeRecord({
      status: 'cancelled',
      attemptToken: null,
    }));
    const service = new OperationRunService(
      registry,
      repository,
      compositeCoordinator,
      acceptingGate(),
    );

    await expect(service.fenceAndCancel({
      signal: new AbortController().signal,
      organizationId: ORG_ID,
      reason: 'session_deleting',
      runs: [{
        runId: RUN_ID,
        operationKey: definition.key,
        expectedAttemptToken: 'ced54820-ab09-4f4b-864c-2a3f873bb24d',
      }],
    })).resolves.toEqual([{
      runId: RUN_ID,
      state: 'unknown',
      nativeRunType: null,
      nativeRunId: null,
    }]);
    expect(repository.transition).not.toHaveBeenCalled();
  });

  it('requires native fencing proof even when the exact run is already terminal', async () => {
    const nativeTerminal = makeRecord({
      status: 'cancelled',
      attemptToken: null,
      nativeRunType: 'browser',
      nativeRunId: 'native-terminal-run',
    });
    const registry = new OperationHandlerRegistryService();
    const cancel = vi.fn().mockResolvedValue(undefined);
    const fenceExternalAuthority = vi.fn()
      .mockResolvedValueOnce('unknown')
      .mockResolvedValueOnce('fenced');
    registry.register(definition, {
      ...handler,
      cancel,
      fenceExternalAuthority,
    });
    const repository = makeRepository();
    repository.findRunById = vi.fn().mockResolvedValue(nativeTerminal);
    const service = new OperationRunService(
      registry,
      repository,
      compositeCoordinator,
      acceptingGate(),
    );
    const input = {
      signal: new AbortController().signal,
      organizationId: ORG_ID,
      reason: 'session_deleting',
      runs: [{
        runId: nativeTerminal.id,
        operationKey: definition.key,
        expectedAttemptToken: null,
      }],
    };

    await expect(service.fenceAndCancel(input)).resolves.toEqual([{
      runId: nativeTerminal.id,
      state: 'unknown',
      nativeRunType: 'browser',
      nativeRunId: 'native-terminal-run',
    }]);
    await expect(service.fenceAndCancel(input)).resolves.toEqual([{
      runId: nativeTerminal.id,
      state: 'fenced',
      nativeRunType: 'browser',
      nativeRunId: 'native-terminal-run',
    }]);
    expect(cancel).toHaveBeenCalledTimes(2);
    expect(fenceExternalAuthority).toHaveBeenCalledTimes(2);
  });

  it('retries external native fencing after the database transition becomes terminal', async () => {
    const nativeRun = makeRecord({
      status: 'running',
      attemptToken: 'ced54820-ab09-4f4b-864c-2a3f873bb24d',
      nativeRunType: 'browser',
      nativeRunId: 'native-retry-run',
    });
    const registry = new OperationHandlerRegistryService();
    const fenceExternalAuthority = vi.fn()
      .mockResolvedValueOnce('unknown')
      .mockResolvedValueOnce('fenced');
    registry.register(definition, {
      ...handler,
      cancel: vi.fn().mockResolvedValue(undefined),
      fenceExternalAuthority,
    });
    const repository = makeRepository();
    repository.findRunById = vi.fn().mockImplementation(async () => nativeRun);
    repository.transition = vi.fn().mockImplementation(async () => {
      nativeRun.status = 'cancelled';
      nativeRun.attemptToken = null;
      nativeRun.claimedBy = null;
      nativeRun.claimedAt = null;
      nativeRun.leaseExpiresAt = null;
      return nativeRun;
    });
    const service = new OperationRunService(
      registry,
      repository,
      compositeCoordinator,
      acceptingGate(),
    );

    await expect(service.fenceAndCancel({
      signal: new AbortController().signal,
      organizationId: ORG_ID,
      reason: 'session_deleting',
      runs: [{
        runId: nativeRun.id,
        operationKey: definition.key,
        expectedAttemptToken: 'ced54820-ab09-4f4b-864c-2a3f873bb24d',
      }],
    })).resolves.toMatchObject([{ state: 'unknown' }]);
    await expect(service.fenceAndCancel({
      signal: new AbortController().signal,
      organizationId: ORG_ID,
      reason: 'session_deleting',
      runs: [{
        runId: nativeRun.id,
        operationKey: definition.key,
        expectedAttemptToken: null,
      }],
    })).resolves.toMatchObject([{ state: 'fenced' }]);
    expect(repository.transition).toHaveBeenCalledTimes(1);
    expect(fenceExternalAuthority).toHaveBeenCalledTimes(2);
  });

  it('bounds never-settling native cancellation and authority hooks', async () => {
    vi.useFakeTimers();
    try {
      const registry = new OperationHandlerRegistryService();
      const cancel = vi.fn()
        .mockImplementationOnce(() => new Promise<void>(() => undefined))
        .mockResolvedValueOnce(undefined);
      const fenceExternalAuthority = vi.fn()
        .mockImplementationOnce(() => new Promise<'fenced'>(() => undefined));
      registry.register(definition, { ...handler, cancel, fenceExternalAuthority });
      const cancellingRun = makeRecord({
        id: '55555555-5555-4555-8555-555555555555',
        attemptToken: 'ced54820-ab09-4f4b-864c-2a3f873bb24d',
        nativeRunType: 'browser',
        nativeRunId: 'native-cancel-timeout',
      });
      const authorityRun = makeRecord({
        id: '66666666-6666-4666-8666-666666666666',
        attemptToken: 'ced54820-ab09-4f4b-864c-2a3f873bb24d',
        nativeRunType: 'browser',
        nativeRunId: 'native-authority-timeout',
      });
      const repository = makeRepository();
      repository.findRunById = vi.fn(async ({ runId }) => (
        runId === cancellingRun.id ? cancellingRun : authorityRun
      ));
      repository.transition = vi.fn().mockImplementation(async (input) => ({
        ...(input.runId === cancellingRun.id ? cancellingRun : authorityRun),
        status: 'cancelled',
        attemptToken: null,
        claimedBy: null,
        claimedAt: null,
        leaseExpiresAt: null,
      }));
      const service = new OperationRunService(
        registry,
        repository,
        compositeCoordinator,
        acceptingGate(),
      );
      const request = (runId: string) => service.fenceAndCancel({
        signal: new AbortController().signal,
        organizationId: ORG_ID,
        reason: 'session_deleting',
        runs: [{
          runId,
          operationKey: definition.key,
          expectedAttemptToken: 'ced54820-ab09-4f4b-864c-2a3f873bb24d',
        }],
      });

      const cancelTimeout = request(cancellingRun.id);
      await vi.advanceTimersByTimeAsync(5_000);
      await expect(cancelTimeout).resolves.toMatchObject([{ state: 'unknown' }]);
      const authorityTimeout = request(authorityRun.id);
      await vi.advanceTimersByTimeAsync(5_000);
      await expect(authorityTimeout).resolves.toMatchObject([{ state: 'unknown' }]);
    } finally {
      vi.useRealTimers();
    }
  });

  it('propagates the exact abort reason when native exact-run cancellation aborts', async () => {
    const controller = new AbortController();
    const abortReason = new Error('session_deletion_cancelled');
    const nativeRun = makeRecord({
      status: 'running',
      attemptToken: 'ced54820-ab09-4f4b-864c-2a3f873bb24d',
      nativeRunType: 'browser',
      nativeRunId: 'native-abort-run',
    });
    const registry = new OperationHandlerRegistryService();
    registry.register(definition, {
      ...handler,
      cancel: vi.fn(async () => {
        controller.abort(abortReason);
      }),
      fenceExternalAuthority: vi.fn().mockResolvedValue('fenced'),
    });
    const repository = makeRepository();
    repository.findRunById = vi.fn().mockResolvedValue(nativeRun);
    repository.transition = vi.fn().mockResolvedValue({
      ...nativeRun,
      status: 'cancelled',
      attemptToken: null,
      claimedBy: null,
      claimedAt: null,
      leaseExpiresAt: null,
    });
    const service = new OperationRunService(
      registry,
      repository,
      compositeCoordinator,
      acceptingGate(),
    );

    await expect(service.fenceAndCancel({
      signal: controller.signal,
      organizationId: ORG_ID,
      reason: 'session_deleting',
      runs: [{
        runId: nativeRun.id,
        operationKey: definition.key,
        expectedAttemptToken: nativeRun.attemptToken,
      }],
    })).rejects.toBe(abortReason);
  });

  it('returns terminal for a non-native terminal row with an exact token', async () => {
    const registry = new OperationHandlerRegistryService();
    registry.register(definition, handler);
    const terminal = makeRecord({ status: 'succeeded', attemptToken: null });
    const repository = makeRepository();
    repository.findRunById = vi.fn().mockResolvedValue(terminal);
    const service = new OperationRunService(
      registry,
      repository,
      compositeCoordinator,
      acceptingGate(),
    );

    await expect(service.fenceAndCancel({
      signal: new AbortController().signal,
      organizationId: ORG_ID,
      reason: 'session_deleting',
      runs: [{
        runId: terminal.id,
        operationKey: definition.key,
        expectedAttemptToken: null,
      }],
    })).resolves.toMatchObject([{ state: 'terminal' }]);
  });

  it('terminal-fences a queued exact run only when its null attempt token still matches', async () => {
    const registry = new OperationHandlerRegistryService();
    registry.register(definition, handler);
    const queued = makeRecord({ status: 'queued', attemptToken: null });
    const repository = makeRepository();
    repository.findRunById = vi.fn().mockResolvedValue(queued);
    repository.transition = vi.fn().mockResolvedValue({
      ...queued,
      status: 'cancelled',
      finishedAt: new Date('2026-08-01T01:00:00Z'),
    });
    const service = new OperationRunService(
      registry,
      repository,
      compositeCoordinator,
      acceptingGate(),
    );

    await expect(service.fenceAndCancel({
      signal: new AbortController().signal,
      organizationId: ORG_ID,
      reason: 'session_deleting',
      runs: [{
        runId: queued.id,
        operationKey: definition.key,
        expectedAttemptToken: null,
      }],
    })).resolves.toEqual([{
      runId: queued.id,
      state: 'fenced',
      nativeRunType: null,
      nativeRunId: null,
    }]);
    expect(repository.transition).toHaveBeenCalledWith(expect.objectContaining({
      expectedAttemptToken: null,
      status: 'cancelled',
    }));
  });

  it('reconnects only the newest non-terminal run with the exact normalized operation input', async () => {
    const registry = new OperationHandlerRegistryService();
    registry.register(definition, handler);
    const repository = makeRepository();
    const matching = makeRecord({
      id: '71111111-1111-4111-8111-111111111111',
      status: 'attention_required',
      input: { source: 'naver' },
    });
    const otherInput = makeRecord({
      id: '72222222-2222-4222-8222-222222222222',
      status: 'running',
      input: { source: 'shorts' },
    });
    const terminal = makeRecord({
      id: '73333333-3333-4333-8333-333333333333',
      status: 'succeeded',
      input: { source: 'naver' },
    });
    Object.assign(repository, {
      listReconnectableRuns: vi.fn().mockResolvedValue([otherInput, terminal, matching]),
    });
    const service = new OperationRunService(
      registry,
      repository,
      compositeCoordinator,
      acceptingGate(),
    );

    const reconnect = service as unknown as {
      findReconnectable(input: {
        organizationId: string;
        requestedByUserId: string;
        operationKey: string;
        input: Record<string, unknown>;
      }): Promise<unknown>;
    };

    await expect(reconnect.findReconnectable({
      organizationId: ORG_ID,
      requestedByUserId: USER_ID,
      operationKey: definition.key,
      input: { source: 'naver' },
    })).resolves.toMatchObject({ id: matching.id, status: 'attention_required' });

    expect((repository as unknown as { listReconnectableRuns: ReturnType<typeof vi.fn> })
      .listReconnectableRuns).toHaveBeenCalledWith({
        organizationId: ORG_ID,
        requestedByUserId: USER_ID,
        operationKey: definition.key,
        now: new Date('2026-08-01T00:30:00Z'),
        limit: 50,
      });
  });

  it('does not reconnect a run whose operation deadline has already elapsed', async () => {
    const registry = new OperationHandlerRegistryService();
    registry.register(definition, handler);
    const repository = makeRepository();
    const now = new Date('2026-08-01T00:30:00Z');
    const expired = makeRecord({
      id: '74444444-4444-4444-8444-444444444444',
      status: 'running',
      input: { source: 'naver' },
      deadlineAt: new Date('2026-08-01T00:29:59Z'),
    });
    Object.assign(repository, {
      readLifecycleDatabaseTime: vi.fn().mockResolvedValue(now),
      listReconnectableRuns: vi.fn().mockResolvedValue([expired]),
    });
    const service = new OperationRunService(
      registry,
      repository,
      compositeCoordinator,
      acceptingGate(),
    );

    await expect(service.findReconnectable({
      organizationId: ORG_ID,
      requestedByUserId: USER_ID,
      operationKey: definition.key,
      input: { source: 'naver' },
    })).resolves.toBeNull();
  });

  it('reconnects only one active run owned by the authenticated requester when dynamic input is no longer in the form', async () => {
    const registry = new OperationHandlerRegistryService();
    registry.register(definition, handler);
    const repository = makeRepository();
    const owned = makeRecord({
      id: '75555555-5555-4555-8555-555555555555',
      status: 'waiting_runtime',
      input: { source: 'shorts' },
    });
    const foreign = makeRecord({
      id: '76666666-6666-4666-8666-666666666666',
      requestedByUserId: 'd323839e-0958-44e4-8238-fc4f5b7254ae',
      status: 'running',
      input: { source: 'naver' },
    });
    Object.assign(repository, {
      listReconnectableRuns: vi.fn().mockResolvedValue([foreign, owned]),
    });
    const service = new OperationRunService(
      registry,
      repository,
      compositeCoordinator,
      acceptingGate(),
    );

    await expect(service.findReconnectable({
      organizationId: ORG_ID,
      requestedByUserId: USER_ID,
      operationKey: definition.key,
    })).resolves.toMatchObject({ id: owned.id, status: 'waiting_runtime' });

    expect((repository as unknown as { listReconnectableRuns: ReturnType<typeof vi.fn> })
      .listReconnectableRuns).toHaveBeenCalledWith({
        organizationId: ORG_ID,
        requestedByUserId: USER_ID,
        operationKey: definition.key,
        now: new Date('2026-08-01T00:30:00Z'),
        limit: 50,
      });

    const anotherOwned = makeRecord({
      id: '77777777-7777-4777-8777-777777777777',
      status: 'running',
      input: { source: 'naver' },
    });
    repository.listReconnectableRuns = vi.fn().mockResolvedValue([owned, anotherOwned]);

    await expect(service.findReconnectable({
      organizationId: ORG_ID,
      requestedByUserId: USER_ID,
      operationKey: definition.key,
    })).resolves.toBeNull();
  });

  it('uses the atomic composite cancellation result without a separate parent transition', async () => {
    const cancel = vi.fn().mockResolvedValue(undefined);
    const registry = new OperationHandlerRegistryService();
    registry.register(definition, { ...handler, cancel });
    const existing = makeRecord({ status: 'waiting_dependency' });
    const cancelled = makeRecord({
      status: 'cancelled',
      finishedAt: new Date('2026-08-01T01:00:00Z'),
      errorCode: 'cancelled_by_operator',
      errorMessage: 'stop composite',
    });
    const repository = makeRepository();
    repository.findRunById = vi.fn().mockResolvedValue(existing);
    repository.transition = vi.fn();
    const coordinator = {
      ...compositeCoordinator,
      cancelChildren: vi.fn().mockResolvedValue(cancelled),
    };
    const service = new OperationRunService(
      registry,
      repository,
      coordinator,
      acceptingGate(),
    );

    await expect(service.cancel({
      organizationId: ORG_ID,
      runId: RUN_ID,
      requestedByUserId: USER_ID,
      reason: 'stop composite',
    })).resolves.toMatchObject({
      status: 'cancelled',
      error: { code: 'cancelled_by_operator', message: 'stop composite' },
    });

    expect(coordinator.cancelChildren).toHaveBeenCalledWith(existing, 'stop composite');
    expect(repository.transition).not.toHaveBeenCalled();
    expect(cancel).toHaveBeenCalledWith(expect.objectContaining({
      runId: RUN_ID,
      organizationId: ORG_ID,
      reason: 'stop composite',
    }));
  });

  it('returns the same run for an idempotent start command', async () => {
    const registry = new OperationHandlerRegistryService();
    registry.register(definition, handler);
    const repository = makeRepository();
    const service = new OperationRunService(
      registry,
      repository,
      compositeCoordinator,
      acceptingGate(),
    );
    const command = {
      organizationId: ORG_ID,
      operationKey: definition.key,
      triggerSource: 'dashboard' as const,
      input: { source: 'naver' },
      requestedByUserId: USER_ID,
      idempotencyKey: 'dashboard:trends',
    };

    const first = await service.start(command);
    repository.findByIdempotencyKey = vi.fn().mockResolvedValue(makeRecord());
    const second = await service.start(command);

    expect(first.id).toBe(second.id);
    expect(repository.createRun).toHaveBeenCalledTimes(1);
  });

  it('copies definition policy into the run and returns persisted execution metadata', async () => {
    const registry = new OperationHandlerRegistryService();
    registry.register(definition, handler);
    const repository = makeRepository();
    repository.createRun = vi.fn().mockResolvedValue(
      makeRecord({
        resourceClass: 'playwright_1688',
        executionTimeoutMs: 1_200_000,
        stage: 'collecting_keyword',
        stageUpdatedAt: new Date('2026-08-01T00:01:00Z'),
        progressCurrent: 11,
        progressTotal: 12,
        progress: 11 / 12,
        deadlineAt: new Date('2026-08-01T00:20:00Z'),
      }),
    );
    const service = new OperationRunService(
      registry,
      repository,
      compositeCoordinator,
      acceptingGate(),
    );

    const run = await service.start({
      organizationId: ORG_ID,
      operationKey: definition.key,
      triggerSource: 'dashboard',
      input: { source: 'naver' },
      requestedByUserId: USER_ID,
      idempotencyKey: null,
    });

    expect(repository.createRun).toHaveBeenCalledWith(expect.objectContaining({
      resourceClass: 'default',
      executionTimeoutMs: 900_000,
    }));
    expect(run).toMatchObject({
      resourceClass: 'playwright_1688',
      executionTimeoutMs: 1_200_000,
      stage: 'collecting_keyword',
      progressCurrent: 11,
      progressTotal: 12,
      deadlineAt: new Date('2026-08-01T00:20:00Z'),
    });
  });

  it('rejects a trigger that the definition does not allow', async () => {
    const registry = new OperationHandlerRegistryService();
    registry.register(definition, handler);
    const service = new OperationRunService(
      registry,
      makeRepository(),
      compositeCoordinator,
      acceptingGate(),
    );

    await expect(
      service.start({
        organizationId: ORG_ID,
        operationKey: definition.key,
        triggerSource: 'agent',
        input: { source: 'naver' },
        requestedByUserId: USER_ID,
        idempotencyKey: null,
      }),
    ).rejects.toThrow('trigger_not_allowed');
  });

  it('does not expose a mutable attention-required resume operation', () => {
    const registry = new OperationHandlerRegistryService();
    registry.register(definition, handler);
    const service = new OperationRunService(
      registry,
      makeRepository(),
      compositeCoordinator,
      acceptingGate(),
    );

    expect('resume' in service).toBe(false);
  });

  it.each(['BOOTSTRAPPING', 'STOPPING', 'STOPPED'] as const)(
    'rejects a start in %s before any repository mutation',
    async (state) => {
      const registry = new OperationHandlerRegistryService();
      registry.register(definition, handler);
      const repository = makeRepository();
      const service = new OperationRunService(
        registry,
        repository,
        compositeCoordinator,
        gateIn(state),
      );

      await expect(service.start({
        organizationId: ORG_ID,
        operationKey: definition.key,
        triggerSource: 'dashboard',
        input: { source: 'naver' },
        requestedByUserId: USER_ID,
        idempotencyKey: null,
      })).rejects.toMatchObject({ status: 503 });
      expect(repository.findByIdempotencyKey).not.toHaveBeenCalled();
      expect(repository.createRun).not.toHaveBeenCalled();
    },
  );

  it('passes the process shutdown signal into the persisted start transaction', async () => {
    const registry = new OperationHandlerRegistryService();
    registry.register(definition, handler);
    const repository = makeRepository();
    const gate = acceptingGate();
    const service = new OperationRunService(
      registry,
      repository,
      compositeCoordinator,
      gate,
    );

    await service.start({
      organizationId: ORG_ID,
      operationKey: definition.key,
      triggerSource: 'dashboard',
      input: { source: 'naver' },
      requestedByUserId: USER_ID,
      idempotencyKey: null,
    });

    expect(repository.createRun).toHaveBeenCalledWith(expect.objectContaining({
      signal: gate.signal(),
    }));
  });
});
