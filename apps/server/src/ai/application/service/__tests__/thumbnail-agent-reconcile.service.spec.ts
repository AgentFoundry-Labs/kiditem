import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ThumbnailAgentReconcileService } from '../thumbnail-agent-reconcile.service';
import type { ThumbnailAgentOutputSinkPort } from '../../port/out/thumbnail-agent-output-sink.port';
import type { AgentObservabilityService } from '../../../../agent-os/application/service/agent-observability.service';
import type { AgentRunRecord } from '../../../../agent-os/domain/agent-os.types';

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

function makePrismaStub(input: {
  requests: Array<ReturnType<typeof makeRow>>;
  genStatus: 'pending' | 'running' | 'succeeded' | 'failed' | 'cancelled' | null;
}) {
  return {
    agentRunRequest: {
      findMany: vi.fn().mockResolvedValue(input.requests),
    },
    thumbnailGeneration: {
      findFirst: vi.fn().mockImplementation(async () =>
        input.genStatus === null ? null : { id: 'gen-1', status: input.genStatus },
      ),
    },
  };
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

describe('ThumbnailAgentReconcileService', () => {
  let sink: ThumbnailAgentOutputSinkPort;

  beforeEach(() => {
    sink = makeSink();
  });

  it('throws when organizationId is missing', async () => {
    const prisma = makePrismaStub({ requests: [], genStatus: null });
    const observability = makeObservability([]);
    const svc = new ThumbnailAgentReconcileService(prisma as never, observability, sink);
    await expect(svc.reconcile('')).rejects.toThrow();
  });

  it('replays succeeded request when ThumbnailGeneration is still pending', async () => {
    const prisma = makePrismaStub({ requests: [makeRow()], genStatus: 'pending' });
    const observability = makeObservability([makeRun()]);
    const svc = new ThumbnailAgentReconcileService(prisma as never, observability, sink);
    const summary = await svc.reconcile(ORG);
    expect(sink.applySuccess).toHaveBeenCalledWith(
      expect.objectContaining({ sourceResourceId: 'gen-1', runId: 'run-1' }),
    );
    expect(summary).toEqual({
      scanned: 1,
      appliedSuccess: 1,
      appliedFailure: 0,
      skipped: 0,
    });
  });

  it('skips terminal generation rows (succeeded/failed) — bridge already applied', async () => {
    const prisma = makePrismaStub({ requests: [makeRow()], genStatus: 'succeeded' });
    const observability = makeObservability([makeRun()]);
    const svc = new ThumbnailAgentReconcileService(prisma as never, observability, sink);
    const summary = await svc.reconcile(ORG);
    expect(sink.applySuccess).not.toHaveBeenCalled();
    expect(summary).toEqual({
      scanned: 1,
      appliedSuccess: 0,
      appliedFailure: 0,
      skipped: 1,
    });
  });

  it('routes failed request through applyFailure with persisted error fields', async () => {
    const prisma = makePrismaStub({
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
    const svc = new ThumbnailAgentReconcileService(prisma as never, observability, sink);
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
    const prisma = makePrismaStub({ requests: [makeRow()], genStatus: 'pending' });
    const observability = makeObservability([
      makeRun({ output: { totally: 'wrong' } as Record<string, unknown> }),
    ]);
    const svc = new ThumbnailAgentReconcileService(prisma as never, observability, sink);
    await svc.reconcile(ORG);
    expect(sink.applyFailure).toHaveBeenCalledWith(
      expect.objectContaining({ errorCode: 'agent_output_invalid' }),
    );
    expect(sink.applySuccess).not.toHaveBeenCalled();
  });
});
