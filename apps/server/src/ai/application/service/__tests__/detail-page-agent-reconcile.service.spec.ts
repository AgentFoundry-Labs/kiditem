import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DetailPageAgentReconcileService } from '../detail-page-agent-reconcile.service';
import type { DetailPageAgentOutputSinkPort } from '../../port/out/detail-page-agent-output-sink.port';
import type { AgentObservabilityService } from '../../../../agent-os/application/service/agent-observability.service';
import type { AgentRunRecord } from '../../../../agent-os/domain/agent-os.types';

const ORG = '11111111-1111-1111-1111-111111111111';

function makeRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'req-1',
    organizationId: ORG,
    agentInstanceId: 'inst-1',
    sourceResourceType: 'content_generation',
    sourceResourceId: 'cg-1',
    source: 'ai.detail_page_generate',
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
    invocationSource: 'ai.detail_page_generate',
    adapterType: 'claude_local',
    model: 'gemini-test',
    provider: 'gemini-text',
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

// Mirrors the canonical VALID_BOLD_VERTICAL_OUTPUT in the bridge spec — the
// shape is what `DetailPageGenerateAgentOutputSchema` accepts for the
// bold-vertical discriminator.
const VALID_OUTPUT = {
  templateId: 'bold-vertical',
  result: {
    hook: {
      subtext: '여름 필수템',
      text: '더블샷',
      titleSub: '슈퍼워터건',
      description: '아이가 신나게 노는\n여름의 시작',
      imageIndex: 0,
      bannerImageIndex: 1,
    },
    section: { name: '더블샷', title: '슈퍼워터건', subtitle: '핵심 포인트' },
    keyPoints: [
      { title: '튼튼한 본체', description: '오래 쓰는 재질', imageIndex: 2 },
      { title: '먼 사거리', description: '경쟁 제품 대비 김', imageIndex: 3 },
      { title: '간편 충전', description: '한 번에 오래 발사', imageIndex: 4 },
    ],
    size: { subtitle: '아이 손 사이즈', imageIndices: [5] },
    color: { subtitle: '비비드 4색', imageIndices: [6, 7] },
    usage: { subtitle: '쉽고 안전한 사용법', imageIndices: [8] },
    detailImageIndices: [9, 10],
    productInfo: [
      { key: '제품명', value: '더블샷 슈퍼워터건' },
      { key: '사이즈', value: '24cm' },
      { key: '재질', value: 'ABS' },
    ],
  },
  imageUrls: ['https://example.com/0.jpg'],
};

function makePrismaStub(input: {
  requests: Array<ReturnType<typeof makeRow>>;
  cgStatus: 'PROCESSING' | 'READY' | 'FAILED' | null;
}) {
  return {
    agentRunRequest: {
      findMany: vi.fn().mockResolvedValue(input.requests),
    },
    contentGeneration: {
      findFirst: vi.fn().mockImplementation(async () =>
        input.cgStatus === null
          ? null
          : { id: 'cg-1', status: input.cgStatus },
      ),
    },
  };
}

function makeObservabilityStub(runs: AgentRunRecord[]): AgentObservabilityService {
  // Reconcile uses `findRunByRequest({ organizationId, requestId, status })`
  // — keyed on the EXACT request, not just on the agent instance. The
  // stub honours the requestId filter so the regression test in this
  // spec (two succeeded runs sharing one instance) actually exercises the
  // P1 fix.
  const findRunByRequest = vi
    .fn()
    .mockImplementation(
      async (input: { requestId: string; status?: string[] }) => {
        const candidates = runs.filter(
          (r) =>
            r.requestId === input.requestId &&
            (!input.status || input.status.includes(r.status)),
        );
        // Latest startedAt wins — adapter contract.
        candidates.sort((a, b) => b.startedAt.getTime() - a.startedAt.getTime());
        return candidates[0] ?? null;
      },
    );
  return {
    findRunByRequest,
  } as unknown as AgentObservabilityService;
}

function makeSinkStub(): DetailPageAgentOutputSinkPort {
  return {
    applySuccess: vi.fn().mockResolvedValue(undefined),
    applyFailure: vi.fn().mockResolvedValue(undefined),
  };
}

describe('DetailPageAgentReconcileService', () => {
  let sink: DetailPageAgentOutputSinkPort;

  beforeEach(() => {
    sink = makeSinkStub();
  });

  it('throws when organizationId is missing', async () => {
    const prisma = makePrismaStub({ requests: [], cgStatus: null });
    const observability = makeObservabilityStub([]);
    const svc = new DetailPageAgentReconcileService(
      prisma as never,
      observability,
      sink,
    );
    await expect(svc.reconcile('')).rejects.toThrow();
  });

  it('replays succeeded request when ContentGeneration is still PROCESSING', async () => {
    const prisma = makePrismaStub({
      requests: [makeRow()],
      cgStatus: 'PROCESSING',
    });
    const observability = makeObservabilityStub([makeRun()]);
    const svc = new DetailPageAgentReconcileService(
      prisma as never,
      observability,
      sink,
    );

    const summary = await svc.reconcile(ORG);
    expect(sink.applySuccess).toHaveBeenCalledTimes(1);
    expect(sink.applySuccess).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: ORG,
        sourceResourceId: 'cg-1',
        runId: 'run-1',
      }),
    );
    expect(sink.applyFailure).not.toHaveBeenCalled();
    expect(summary).toEqual({
      scanned: 1,
      appliedSuccess: 1,
      appliedFailure: 0,
      skipped: 0,
    });
  });

  it('skips terminal ContentGeneration rows (READY/FAILED) — bridge already applied', async () => {
    const prisma = makePrismaStub({
      requests: [makeRow()],
      cgStatus: 'READY',
    });
    const observability = makeObservabilityStub([makeRun()]);
    const svc = new DetailPageAgentReconcileService(
      prisma as never,
      observability,
      sink,
    );
    const summary = await svc.reconcile(ORG);
    expect(sink.applySuccess).not.toHaveBeenCalled();
    expect(sink.applyFailure).not.toHaveBeenCalled();
    expect(summary).toEqual({
      scanned: 1,
      appliedSuccess: 0,
      appliedFailure: 0,
      skipped: 1,
    });
  });

  it('routes failed request through applyFailure with the persisted error fields', async () => {
    const prisma = makePrismaStub({
      requests: [
        makeRow({
          status: 'failed',
          lastErrorCode: 'runtime_not_configured',
          lastErrorMessage: 'no provider',
        }),
      ],
      cgStatus: 'PROCESSING',
    });
    const observability = makeObservabilityStub([]);
    const svc = new DetailPageAgentReconcileService(
      prisma as never,
      observability,
      sink,
    );
    const summary = await svc.reconcile(ORG);
    expect(sink.applyFailure).toHaveBeenCalledWith(
      expect.objectContaining({
        sourceResourceId: 'cg-1',
        errorCode: 'runtime_not_configured',
        errorMessage: 'no provider',
      }),
    );
    expect(summary.appliedFailure).toBe(1);
  });

  it('routes invalid succeeded output to applyFailure with agent_output_invalid', async () => {
    const prisma = makePrismaStub({
      requests: [makeRow()],
      cgStatus: 'PROCESSING',
    });
    const observability = makeObservabilityStub([
      makeRun({ output: { totally: 'wrong shape' } as Record<string, unknown> }),
    ]);
    const svc = new DetailPageAgentReconcileService(
      prisma as never,
      observability,
      sink,
    );
    await svc.reconcile(ORG);
    expect(sink.applyFailure).toHaveBeenCalledWith(
      expect.objectContaining({ errorCode: 'agent_output_invalid' }),
    );
    expect(sink.applySuccess).not.toHaveBeenCalled();
  });

  // P1#1 regression — two succeeded runs share an instance; the older one
  // is the stuck request the reconcile is replaying. The previous
  // implementation grabbed `listRuns({ agentInstanceId, limit: 1 })` and
  // landed on the newer run, then routed the stuck request to
  // `applyFailure({ errorCode: 'agent_output_invalid' })` because the
  // requestId on the latest run did not match. Asserts that the request
  // resolves to its OWN run output.
  it('replays the request-specific run even when a newer succeeded run exists on the same instance', async () => {
    const stuckRequestId = 'req-stuck';
    const newerRequestId = 'req-newer';
    const prisma = makePrismaStub({
      requests: [makeRow({ id: stuckRequestId })],
      cgStatus: 'PROCESSING',
    });
    const stuckRun = makeRun({
      id: 'run-stuck',
      requestId: stuckRequestId,
      startedAt: new Date('2026-05-08T10:00:00.000Z'),
      output: VALID_OUTPUT,
    });
    const newerRun = makeRun({
      id: 'run-newer',
      requestId: newerRequestId,
      startedAt: new Date('2026-05-08T11:00:00.000Z'),
      // Newer succeeded run on the SAME instance — different request.
      output: { templateId: 'bold-vertical', result: { unrelated: true } } as Record<string, unknown>,
    });
    const observability = makeObservabilityStub([newerRun, stuckRun]);
    const svc = new DetailPageAgentReconcileService(
      prisma as never,
      observability,
      sink,
    );

    await svc.reconcile(ORG);

    expect(sink.applySuccess).toHaveBeenCalledTimes(1);
    expect(sink.applySuccess).toHaveBeenCalledWith(
      expect.objectContaining({
        requestId: stuckRequestId,
        runId: 'run-stuck',
      }),
    );
    expect(sink.applyFailure).not.toHaveBeenCalled();
  });
});
