/**
 * Real-Postgres integration test for the end-to-end detail-page Agent OS
 * pipeline:
 *
 *   DetailPageAiService.enqueue → AgentRunRequest → AgentRunWorker.tick →
 *   DetailPageGenerateRuntimeHandler (deterministic stub here) →
 *   AgentRunExecutor.finalize → bus event →
 *   DetailPageAgentOutputBridge → DetailPageContentGenerationSinkAdapter →
 *   ContentGeneration READY (or FAILED).
 *
 * Plus the recovery path (DetailPageAgentReconcileService) for the case
 * where the listener silently dropped the bus event.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { EventEmitter2 } from '@nestjs/event-emitter';
import type { PrismaClient } from '@prisma/client';
import {
  makeTestPrisma,
  resetDb,
  seedBaseFixture,
  TEST_ORGANIZATION_ID,
  TEST_USER_ID,
} from '../../test-helpers/real-prisma';
import { AgentOsRepositoryAdapter } from '../../agent-os/adapter/out/repository/agent-os.repository.adapter';
import { AgentRunCoordinator } from '../../agent-os/application/service/agent-run-coordinator.service';
import { AgentRunExecutor } from '../../agent-os/application/service/agent-run-executor.service';
import { AgentRunWorker } from '../../agent-os/application/service/agent-run-worker.service';
import { AgentRuntimeHandlerRegistry } from '../../agent-os/application/service/agent-runtime-handler-registry.service';
import { AgentObservabilityService } from '../../agent-os/application/service/agent-observability.service';
import { RoutingRuntimeAdapter } from '../../agent-os/adapter/out/runtime/routing-runtime.adapter';
import { AgentOsRuntimeError } from '../../agent-os/domain/agent-os.errors';
import { AGENT_RUN_EVENTS } from '../../agent-os/application/event/agent-run-events';
import { DetailPageAiService } from '../application/service/detail-page-ai.service';
import { DetailPageAgentReconcileService } from '../application/service/detail-page-agent-reconcile.service';
import { DetailPageAgentOutputBridge } from '../application/service/detail-page-agent-output.bridge';
import { DetailPageGenerationService } from '../application/service/detail-page-generation.service';
import { DetailPageGeneratedImagesService } from '../application/service/detail-page-generated-images.service';
import { DetailPagePrefillService } from '../application/service/detail-page-prefill.service';
import { DetailPageQueryService } from '../application/service/detail-page-query.service';
import { DetailPageResultRefinerService } from '../application/service/detail-page-result-refiner.service';
import { DetailPageContentGenerationSinkAdapter } from '../adapter/out/agent-output/detail-page-content-generation-sink.adapter';
import type { AgentRunnerPort } from '../../agent-os/application/port/in/agent-runner.port';
import type { AgentTypeRuntimeHandler } from '../../agent-os/application/port/out/agent-runtime-handler.port';
import type { AgentRuntimeExecutionContext, AgentRuntimeResult } from '../../agent-os/application/port/out/agent-runtime.port';

const ORG = TEST_ORGANIZATION_ID;
const MASTER_ID = '99999999-9999-4999-8999-999999999999';

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

class StubRuntimeHandler implements AgentTypeRuntimeHandler {
  output: AgentRuntimeResult | null = null;
  failureCode: string | null = null;
  observed: AgentRuntimeExecutionContext[] = [];

  async execute(ctx: AgentRuntimeExecutionContext): Promise<AgentRuntimeResult> {
    this.observed.push(ctx);
    if (this.failureCode) {
      throw new AgentOsRuntimeError(this.failureCode, this.failureCode);
    }
    if (!this.output) {
      throw new AgentOsRuntimeError(
        'runtime_not_configured',
        'StubRuntimeHandler.output is not set.',
      );
    }
    return this.output;
  }
}

class FakeOperationAlertService {
  starts: unknown[] = [];
  succeeds: unknown[] = [];
  fails: unknown[] = [];
  async start(input: unknown) { this.starts.push(input); return null; }
  async succeed(_o: string, _k: string, p?: unknown) { this.succeeds.push(p ?? null); return null; }
  async fail(_o: string, _k: string, p?: unknown) { this.fails.push(p ?? null); return null; }
}

async function seedMasterAndAgentInstance(prisma: PrismaClient, repo: AgentOsRepositoryAdapter) {
  await prisma.masterProduct.create({
    data: {
      id: MASTER_ID,
      organizationId: ORG,
      name: '더블샷 슈퍼워터건',
      code: 'INT-DETAIL-PAGE-001',
    },
  });
  await repo.createInstanceWithRuntimeState({
    organizationId: ORG,
    type: 'detail_page_generate',
    name: 'Detail Page Generate Instance',
    adapterType: 'claude_local',
    modelOverride: 'gemini-test',
  });
}

async function waitForStatus(
  prisma: PrismaClient,
  cgId: string,
  expected: 'READY' | 'FAILED',
): Promise<void> {
  for (let i = 0; i < 50; i += 1) {
    const row = await prisma.contentGeneration.findUnique({ where: { id: cgId } });
    if (row?.status === expected) return;
    await new Promise((r) => setTimeout(r, 20));
  }
  throw new Error(`Timed out waiting for ContentGeneration ${cgId} to reach ${expected}.`);
}

let prisma: PrismaClient | null = null;
let repo: AgentOsRepositoryAdapter;
let registry: AgentRuntimeHandlerRegistry;
let runtime: RoutingRuntimeAdapter;
let stubHandler: StubRuntimeHandler;
let bus: EventEmitter2;
let coordinator: AgentRunCoordinator;
let executor: AgentRunExecutor;
let worker: AgentRunWorker;
let alerts: FakeOperationAlertService;
let bridge: DetailPageAgentOutputBridge;
let sink: DetailPageContentGenerationSinkAdapter;
let aiService: DetailPageAiService;
let reconcile: DetailPageAgentReconcileService;

beforeAll(async () => {
  prisma = makeTestPrisma();
  await prisma.$connect();
  repo = new AgentOsRepositoryAdapter(prisma as never);
  registry = new AgentRuntimeHandlerRegistry();
  runtime = new RoutingRuntimeAdapter(registry);
  stubHandler = new StubRuntimeHandler();
  registry.register('detail_page_generate', stubHandler);

  bus = new EventEmitter2();
  coordinator = new AgentRunCoordinator(repo);
  executor = new AgentRunExecutor(repo, runtime, bus);
  process.env.AGENT_RUNTIME_WORKER_ENABLED = '0';
  worker = new AgentRunWorker(executor);

  alerts = new FakeOperationAlertService();
  const generatedImages = {
    generateBestEffort: async () => ({}),
  } as unknown as DetailPageGeneratedImagesService;
  sink = new DetailPageContentGenerationSinkAdapter(
    prisma as never,
    alerts as never,
    generatedImages,
  );

  bridge = new DetailPageAgentOutputBridge(sink);
  bus.on(AGENT_RUN_EVENTS.FINALIZED, (event) => {
    void bridge.onAgentRunFinalized(event);
  });

  const refiner = new DetailPageResultRefinerService(undefined);
  // Stub TextCompletionPort + ImageStoragePort — DetailPageAiService only
  // uses them on the standalone path, which we never exercise here. The
  // enqueue path only touches Prisma + agentRunner + alerts + refiner.
  const textCompletion = { complete: async () => ({ text: '{}' }) };
  const query = new DetailPageQueryService(prisma as never, refiner);
  const generation = new DetailPageGenerationService(
    prisma as never,
    textCompletion,
    { save: async () => '' },
    alerts as never,
    refiner,
    generatedImages,
    query,
    coordinator as unknown as AgentRunnerPort,
  );
  const prefill = new DetailPagePrefillService(textCompletion);
  aiService = new DetailPageAiService(generation, prefill, query);

  const observability = new AgentObservabilityService(repo);
  reconcile = new DetailPageAgentReconcileService(
    prisma as never,
    observability,
    sink,
  );
});

afterAll(async () => {
  await prisma?.$disconnect();
});

beforeEach(async () => {
  if (!prisma) throw new Error('Prisma test client was not initialized');
  await resetDb(prisma);
  await seedBaseFixture(prisma);
  await seedMasterAndAgentInstance(prisma, repo);
  stubHandler.output = null;
  stubHandler.failureCode = null;
  stubHandler.observed = [];
  alerts.starts = [];
  alerts.succeeds = [];
  alerts.fails = [];
  bus.removeAllListeners();
  bus.on(AGENT_RUN_EVENTS.FINALIZED, (event) => {
    void bridge.onAgentRunFinalized(event);
  });
});

describe('Detail-page Agent OS pipeline (real Postgres)', () => {
  it('enqueue → worker → handler → bridge → sink → ContentGeneration READY', async () => {
    stubHandler.output = {
      output: VALID_OUTPUT,
      provider: 'gemini-text',
    };

    const dto = await aiService.generate(
      {
        productId: MASTER_ID,
        templateId: 'bold-vertical',
        rawTitle: '더블샷 슈퍼워터건',
        rawCategory: '완구',
        rawDescription: '강력한 사거리의 물총',
        rawOptions: '4 색상 / 사이즈 24cm',
        imageUrls: ['https://example.com/p1.jpg'],
        heroImageMode: 'first',
      },
      ORG,
      TEST_USER_ID,
    );

    expect(dto.imageProcessingStatus).toBe('processing');
    expect(dto.id).toBeDefined();

    const initialRow = await prisma!.contentGeneration.findUniqueOrThrow({
      where: { id: dto.id },
    });
    expect(initialRow.status).toBe('PROCESSING');

    await worker.tick();
    await waitForStatus(prisma!, dto.id, 'READY');

    expect(stubHandler.observed).toHaveLength(1);
    expect(stubHandler.observed[0].agentType).toBe('detail_page_generate');

    const finalRow = await prisma!.contentGeneration.findUniqueOrThrow({
      where: { id: dto.id },
    });
    expect(finalRow.status).toBe('READY');
    expect(finalRow.errorMessage).toBeNull();
    expect(finalRow.generatedTitle).toBe('더블샷 슈퍼워터건');
    const stored = JSON.parse(finalRow.detailPageHtml ?? '{}');
    expect(stored.templateId).toBe('bold-vertical');
    expect(stored.result.hook.text).toBeDefined();

    expect(alerts.starts).toHaveLength(1);
    expect(alerts.succeeds).toHaveLength(1);
    expect(alerts.fails).toHaveLength(0);
  });

  it('runtime fail-fast → bridge → sink → ContentGeneration FAILED', async () => {
    stubHandler.failureCode = 'runtime_not_configured';

    const dto = await aiService.generate(
      {
        productId: MASTER_ID,
        templateId: 'bold-vertical',
        rawTitle: '더블샷 슈퍼워터건',
        rawCategory: '완구',
        rawDescription: '강력한 사거리의 물총',
        rawOptions: '4 색상',
        imageUrls: ['https://example.com/p1.jpg'],
      },
      ORG,
      TEST_USER_ID,
    );

    // Force a single-attempt request so the failure becomes terminal on the
    // first run — FINALIZED fires only on terminal request states.
    await prisma!.agentRunRequest.updateMany({
      where: { sourceResourceId: dto.id },
      data: { maxAttempts: 1 },
    });

    await worker.tick();
    await waitForStatus(prisma!, dto.id, 'FAILED');

    const failedRow = await prisma!.contentGeneration.findUniqueOrThrow({
      where: { id: dto.id },
    });
    expect(failedRow.status).toBe('FAILED');
    expect(failedRow.errorMessage).toContain('runtime_not_configured');

    expect(alerts.fails).toHaveLength(1);
    expect(alerts.succeeds).toHaveLength(0);
  });

  it('reconcile replays a stuck PROCESSING row when the bridge missed the bus event', async () => {
    stubHandler.output = {
      output: VALID_OUTPUT,
      provider: 'gemini-text',
    };

    const dto = await aiService.generate(
      {
        productId: MASTER_ID,
        templateId: 'bold-vertical',
        rawTitle: '더블샷 슈퍼워터건',
        rawCategory: '완구',
        rawDescription: '강력한 사거리의 물총',
        rawOptions: '4 색상',
        imageUrls: ['https://example.com/p1.jpg'],
      },
      ORG,
      TEST_USER_ID,
    );

    // Detach the bridge so the bus event is "lost" — simulating a process
    // restart between executor.finalizeRun and the listener.
    bus.removeAllListeners();

    await worker.tick();
    // Wait briefly to let the executor finish even though no listener is
    // registered. We can't await waitForStatus(READY) because nothing is
    // applying the result.
    await new Promise((r) => setTimeout(r, 200));
    let stuck = await prisma!.contentGeneration.findUniqueOrThrow({
      where: { id: dto.id },
    });
    expect(stuck.status).toBe('PROCESSING');

    const summary = await reconcile.reconcile(ORG);
    expect(summary.scanned).toBeGreaterThanOrEqual(1);
    expect(summary.appliedSuccess).toBe(1);

    stuck = await prisma!.contentGeneration.findUniqueOrThrow({
      where: { id: dto.id },
    });
    expect(stuck.status).toBe('READY');
  });
});
