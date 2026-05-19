import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ThumbnailAgentReconcileService } from '../thumbnail-agent-reconcile.service';
import type { ThumbnailAgentOutputSinkPort } from '../../port/out/thumbnail-agent-output-sink.port';
import type { AgentObservabilityService } from '../../../../agent-os/application/service/agent-observability.service';
import type { AgentRunRecord } from '../../../../agent-os/domain/agent-os.types';
import type { OperationAlertPort } from '../../port/out/operation-alert.port';
import type { ThumbnailGenerationLedgerRepositoryPort } from '../../port/out/thumbnail-generation-ledger.repository.port';

const ORG = '11111111-1111-1111-1111-111111111111';

const VALID_OUTPUT = {
  candidates: [
    {
      url: 'https://cdn.example.com/c1.png',
      filename: 'c1.png',
      storageKey: 'thumbnail-generations/org/c1.png',
      mimeType: 'image/png',
      fileSize: 12345,
    },
  ],
};

function makeRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'req-1',
    organizationId: ORG,
    agentInstanceId: 'inst-1',
    sourceResourceType: 'thumbnail_generation',
    sourceResourceId: 'gen-1',
    source: 'ai.thumbnail_generate',
    status: 'succeeded',
    finishedAt: new Date(),
    lastErrorCode: null,
    lastErrorMessage: null,
    ...overrides,
  };
}

function makeRun(overrides: Partial<AgentRunRecord> = {}): AgentRunRecord {
  return {
    id: 'run-1',
    organizationId: ORG,
    agentInstanceId: 'inst-1',
    requestId: 'req-1',
    taskSessionId: 'sess-1',
    retryOfRunId: null,
    status: 'succeeded',
    attempt: 1,
    invocationSource: 'ai.thumbnail_generate',
    adapterType: 'claude_local',
    model: 'gemini-image-test',
    provider: 'gemini-image',
    taskKey: 'default',
    startedAt: new Date(),
    finishedAt: new Date(),
    errorCode: null,
    errorMessage: null,
    output: VALID_OUTPUT,
    lastEventSeq: 0,
    ...overrides,
  };
}

function makeLedgerStub(input: {
  requests: Array<ReturnType<typeof makeRow>>;
  genStatus: 'pending' | 'running' | 'succeeded' | 'failed' | 'cancelled' | null;
  terminalGenerations?: Array<{ id: string; status: string; errorMessage: string | null }>;
  staleGenerations?: Array<{ id: string }>;
}): ThumbnailGenerationLedgerRepositoryPort {
  return {
    findTerminalAgentRequests: vi.fn().mockResolvedValue(input.requests),
    findGenerationProjectionStatus: vi.fn().mockImplementation(async () =>
        input.genStatus === null
          ? null
          : { id: 'gen-1', status: input.genStatus, errorMessage: null },
    ),
    findRecentlyTerminalGenerations: vi
      .fn()
      .mockResolvedValue(input.terminalGenerations ?? []),
    findStaleNonTerminalGenerations: vi
      .fn()
      .mockResolvedValue(input.staleGenerations ?? []),
  } as unknown as ThumbnailGenerationLedgerRepositoryPort;
}

function makeObservability(runs: AgentRunRecord[]): AgentObservabilityService {
  return {
    findRunByRequest: vi
      .fn()
      .mockImplementation(async (input: { requestId: string; status?: string[] }) => {
        const candidates = runs.filter(
          (r) =>
            r.requestId === input.requestId &&
            (!input.status || input.status.includes(r.status)),
        );
        candidates.sort((a, b) => b.startedAt.getTime() - a.startedAt.getTime());
        return candidates[0] ?? null;
      }),
  } as unknown as AgentObservabilityService;
}

function makeSink(): ThumbnailAgentOutputSinkPort {
  return {
    applySuccess: vi.fn().mockResolvedValue(undefined),
    applyFailure: vi.fn().mockResolvedValue(undefined),
  };
}

function makeOperationAlerts(result: unknown = null): OperationAlertPort {
  return {
    closeBySource: vi.fn().mockResolvedValue(result),
  } as unknown as OperationAlertPort;
}

describe('ThumbnailAgentReconcileService', () => {
  let sink: ThumbnailAgentOutputSinkPort;

  beforeEach(() => {
    sink = makeSink();
  });

  it('throws when organizationId is missing', async () => {
    const generations = makeLedgerStub({ requests: [], genStatus: null });
    const observability = makeObservability([]);
    const svc = new ThumbnailAgentReconcileService(
      generations,
      observability,
      sink,
      makeOperationAlerts(),
    );
    await expect(svc.reconcile('')).rejects.toThrow();
  });

  it('replays succeeded request when ThumbnailGeneration is still pending', async () => {
    const generations = makeLedgerStub({ requests: [makeRow()], genStatus: 'pending' });
    const observability = makeObservability([makeRun()]);
    const svc = new ThumbnailAgentReconcileService(
      generations,
      observability,
      sink,
      makeOperationAlerts(),
    );
    const summary = await svc.reconcile(ORG);
    expect(sink.applySuccess).toHaveBeenCalledWith(
      expect.objectContaining({ sourceResourceId: 'gen-1', runId: 'run-1' }),
    );
    expect(summary).toEqual({
      scanned: 1,
      appliedSuccess: 1,
      appliedFailure: 0,
      skipped: 0,
      closedTerminalAlerts: 0,
      failedStale: 0,
    });
  });

  it('skips terminal generation rows (succeeded/failed) — bridge already applied', async () => {
    const generations = makeLedgerStub({ requests: [makeRow()], genStatus: 'succeeded' });
    const observability = makeObservability([makeRun()]);
    const operationAlerts = makeOperationAlerts({ id: 'alert-1' });
    const svc = new ThumbnailAgentReconcileService(
      generations,
      observability,
      sink,
      operationAlerts,
    );
    const summary = await svc.reconcile(ORG);
    expect(sink.applySuccess).not.toHaveBeenCalled();
    expect(operationAlerts.closeBySource).toHaveBeenCalledWith(
      ORG,
      'thumbnail_generation',
      'gen-1',
      'succeeded',
      expect.objectContaining({
        metadata: expect.objectContaining({ staleReconciled: true }),
      }),
    );
    expect(summary).toEqual({
      scanned: 1,
      appliedSuccess: 0,
      appliedFailure: 0,
      skipped: 1,
      closedTerminalAlerts: 1,
      failedStale: 0,
    });
  });

  it('routes failed request through applyFailure with persisted error fields', async () => {
    const generations = makeLedgerStub({
      requests: [
        makeRow({
          status: 'failed',
          lastErrorCode: 'runtime_not_configured',
          lastErrorMessage: 'no provider',
        }),
      ],
      genStatus: 'pending',
    });
    const observability = makeObservability([]);
    const svc = new ThumbnailAgentReconcileService(
      generations,
      observability,
      sink,
      makeOperationAlerts(),
    );
    const summary = await svc.reconcile(ORG);
    expect(sink.applyFailure).toHaveBeenCalledWith(
      expect.objectContaining({
        errorCode: 'runtime_not_configured',
        errorMessage: 'no provider',
      }),
    );
    expect(summary.appliedFailure).toBe(1);
  });

  it('routes invalid succeeded output to applyFailure with agent_output_invalid', async () => {
    const generations = makeLedgerStub({ requests: [makeRow()], genStatus: 'pending' });
    const observability = makeObservability([
      makeRun({ output: { totally: 'wrong' } as Record<string, unknown> }),
    ]);
    const svc = new ThumbnailAgentReconcileService(
      generations,
      observability,
      sink,
      makeOperationAlerts(),
    );
    await svc.reconcile(ORG);
    expect(sink.applyFailure).toHaveBeenCalledWith(
      expect.objectContaining({ errorCode: 'agent_output_invalid' }),
    );
    expect(sink.applySuccess).not.toHaveBeenCalled();
  });

  it('fails stale non-terminal thumbnail generations', async () => {
    const generations = makeLedgerStub({
      requests: [],
      genStatus: null,
      staleGenerations: [{ id: 'gen-stale' }],
    });
    const observability = makeObservability([]);
    const svc = new ThumbnailAgentReconcileService(
      generations,
      observability,
      sink,
      makeOperationAlerts(),
    );

    const summary = await svc.reconcile(ORG, { stalePendingMinutes: 360 });

    expect(sink.applyFailure).toHaveBeenCalledWith(
      expect.objectContaining({
        sourceResourceId: 'gen-stale',
        errorCode: 'thumbnail_generation_stale',
      }),
    );
    expect(summary.failedStale).toBe(1);
  });
});
