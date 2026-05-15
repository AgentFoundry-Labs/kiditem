/**
 * Real-Postgres integration test for the thumbnail editor Agent OS
 * pipeline:
 *
 *   ThumbnailGenerationService.enqueueEditorGeneration → AgentRunRequest
 *   → AgentRunWorker.tick → ThumbnailGenerateRuntimeHandler (deterministic
 *   stub here) → AgentRunExecutor.finalize → bus event →
 *   ThumbnailAgentOutputBridge → ThumbnailGenerationSinkAdapter →
 *   ThumbnailGeneration succeeded (or failed).
 *
 * Plus the recovery path
 * (`ThumbnailAgentReconcileService`) for the case where the listener
 * silently dropped the bus event.
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
import { ThumbnailAgentOutputBridge } from '../application/service/thumbnail-agent-output.bridge';
import { ThumbnailAgentReconcileService } from '../application/service/thumbnail-agent-reconcile.service';
import { ThumbnailGenerationJobService } from '../application/service/thumbnail-generation-job.service';
import { ThumbnailGenerationService } from '../application/service/thumbnail-generation.service';
import { ThumbnailGenerationSinkAdapter } from '../adapter/out/agent-output/thumbnail-generation-sink.adapter';
import type { AgentRunnerPort } from '../../agent-os/application/port/in/agent-runner.port';
import type { AgentTypeRuntimeHandler } from '../../agent-os/application/port/out/agent-runtime-handler.port';
import type {
  AgentRuntimeExecutionContext,
  AgentRuntimeResult,
} from '../../agent-os/application/port/out/agent-runtime.port';

const ORG = TEST_ORGANIZATION_ID;
const MASTER_ID = '99999999-aaaa-4999-8999-999999999999';

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
  async cancel() { return null; }
}

async function seedMasterAndAgentInstance(prisma: PrismaClient, repo: AgentOsRepositoryAdapter) {
  await prisma.masterProduct.create({
    data: {
      id: MASTER_ID,
      organizationId: ORG,
      name: '키즈 텀블러',
      code: 'INT-THUMB-001',
    },
  });
  await repo.createInstanceWithRuntimeState({
    organizationId: ORG,
    type: 'thumbnail_generate',
    name: 'Thumbnail Generate Instance',
    adapterType: 'claude_local',
    modelOverride: 'gemini-image-test',
  });
}

async function waitForStatus(
  prisma: PrismaClient,
  generationId: string,
  expected: 'succeeded' | 'failed',
): Promise<void> {
  for (let i = 0; i < 50; i += 1) {
    const row = await prisma.thumbnailGeneration.findUnique({
      where: { id: generationId },
    });
    if (row?.status === expected) return;
    await new Promise((r) => setTimeout(r, 20));
  }
  throw new Error(`Timed out waiting for ThumbnailGeneration ${generationId} to reach ${expected}.`);
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
let bridge: ThumbnailAgentOutputBridge;
let sink: ThumbnailGenerationSinkAdapter;
let generationService: ThumbnailGenerationService;
let reconcile: ThumbnailAgentReconcileService;

const PRODUCT_INPUT = {
  data: 'YmFzZTY0LWRhdGE=',
  mimeType: 'image/png',
  label: 'Product photo',
  url: 'https://cdn.example.com/p.png',
  storageKey: 'thumbnail-inputs/org/p.png',
  role: 'product' as const,
  sortOrder: 0,
  source: 'upload',
  fileSize: 1234,
};

beforeAll(async () => {
  prisma = makeTestPrisma();
  await prisma.$connect();
  repo = new AgentOsRepositoryAdapter(prisma as never);
  registry = new AgentRuntimeHandlerRegistry();
  runtime = new RoutingRuntimeAdapter(registry);
  stubHandler = new StubRuntimeHandler();
  registry.register('thumbnail_generate', stubHandler);

  bus = new EventEmitter2();
  coordinator = new AgentRunCoordinator(repo);
  executor = new AgentRunExecutor(repo, runtime, bus);
  process.env.AGENT_RUNTIME_WORKER_ENABLED = '0';
  worker = new AgentRunWorker(executor);

  alerts = new FakeOperationAlertService();
  sink = new ThumbnailGenerationSinkAdapter(prisma as never, alerts as never, null);

  bridge = new ThumbnailAgentOutputBridge(sink);
  bus.on(AGENT_RUN_EVENTS.FINALIZED, (event) => {
    void bridge.onAgentRunFinalized(event);
  });

  // The enqueue path exercises the facade plus its explicit job orchestrator:
  // prisma, operationAlerts (fake), and agentRunner (coordinator). Editor AI
  // remains stubbed because `enqueueEditorGeneration` does not reach into it.
  const generationJobs = new ThumbnailGenerationJobService(
    prisma as never,
    {} as never,
    alerts as never,
    coordinator as unknown as AgentRunnerPort,
    null,
  );
  generationService = new ThumbnailGenerationService(
    prisma as never,
    {} as never, // trackingService — unused here
    alerts as never,
    generationJobs,
    null,
  );

  const observability = new AgentObservabilityService(repo);
  reconcile = new ThumbnailAgentReconcileService(
    prisma as never,
    observability,
    sink,
    alerts as never,
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

describe('Thumbnail-editor Agent OS pipeline (real Postgres)', () => {
  it('enqueue → worker → handler → bridge → sink → ThumbnailGeneration succeeded', async () => {
    stubHandler.output = { output: VALID_OUTPUT, provider: 'gemini-image' };

    const dto = await generationService.enqueueEditorGeneration({
      organizationId: ORG,
      productId: MASTER_ID,
      productName: '키즈 텀블러',
      triggeredByUserId: TEST_USER_ID,
      inputs: [PRODUCT_INPUT],
      inputMeta: { mode: 'edit', editCase: 'single' },
      method: 'generate',
      originalUrl: 'https://cdn.example.com/master.png',
      agentPayload: {
        mode: 'edit',
        editCase: 'single',
        purpose: 'compliance',
        productName: '키즈 텀블러',
        category: 'toys',
        inputs: [PRODUCT_INPUT],
      },
    });

    expect(dto.status).toBe('pending');
    const initial = await prisma!.thumbnailGeneration.findUniqueOrThrow({
      where: { id: dto.generationId },
    });
    expect(initial.status).toBe('pending');
    expect(initial.triggeredByUserId).toBe(TEST_USER_ID);

    await worker.tick();
    await waitForStatus(prisma!, dto.generationId, 'succeeded');

    expect(stubHandler.observed).toHaveLength(1);
    expect(stubHandler.observed[0].agentType).toBe('thumbnail_generate');

    const final = await prisma!.thumbnailGeneration.findUniqueOrThrow({
      where: { id: dto.generationId },
      include: { candidates: true },
    });
    expect(final.status).toBe('succeeded');
    expect(final.phase).toBe('ready');
    expect(final.candidates).toHaveLength(1);
    expect(final.candidates[0].url).toBe('https://cdn.example.com/c1.png');

    expect(alerts.starts).toHaveLength(1);
    expect(alerts.succeeds).toHaveLength(1);
  });

  it('runtime fail-fast → bridge → sink → ThumbnailGeneration failed', async () => {
    stubHandler.failureCode = 'runtime_not_configured';

    const dto = await generationService.enqueueEditorGeneration({
      organizationId: ORG,
      productId: MASTER_ID,
      productName: '키즈 텀블러',
      triggeredByUserId: TEST_USER_ID,
      inputs: [PRODUCT_INPUT],
      inputMeta: { mode: 'edit' },
      method: 'generate',
      originalUrl: 'https://cdn.example.com/master.png',
      agentPayload: {
        mode: 'edit',
        editCase: 'single',
        purpose: 'compliance',
        inputs: [PRODUCT_INPUT],
      },
    });

    await prisma!.agentRunRequest.updateMany({
      where: { sourceResourceId: dto.generationId },
      data: { maxAttempts: 1 },
    });

    await worker.tick();
    await waitForStatus(prisma!, dto.generationId, 'failed');

    const failed = await prisma!.thumbnailGeneration.findUniqueOrThrow({
      where: { id: dto.generationId },
    });
    expect(failed.status).toBe('failed');
    expect(failed.errorMessage).toContain('runtime_not_configured');

    expect(alerts.fails).toHaveLength(1);
    expect(alerts.succeeds).toHaveLength(0);
  });

  it('reconcile replays a stuck pending row when the bridge missed the bus event', async () => {
    stubHandler.output = { output: VALID_OUTPUT, provider: 'gemini-image' };

    const dto = await generationService.enqueueEditorGeneration({
      organizationId: ORG,
      productId: MASTER_ID,
      productName: '키즈 텀블러',
      triggeredByUserId: TEST_USER_ID,
      inputs: [PRODUCT_INPUT],
      inputMeta: { mode: 'edit' },
      method: 'generate',
      originalUrl: 'https://cdn.example.com/master.png',
      agentPayload: {
        mode: 'edit',
        editCase: 'single',
        purpose: 'compliance',
        inputs: [PRODUCT_INPUT],
      },
    });

    // Detach the bridge so the bus event is "lost".
    bus.removeAllListeners();

    await worker.tick();
    await new Promise((r) => setTimeout(r, 200));
    let stuck = await prisma!.thumbnailGeneration.findUniqueOrThrow({
      where: { id: dto.generationId },
    });
    expect(stuck.status).toBe('pending');

    const summary = await reconcile.reconcile(ORG);
    expect(summary.appliedSuccess).toBeGreaterThanOrEqual(1);

    stuck = await prisma!.thumbnailGeneration.findUniqueOrThrow({
      where: { id: dto.generationId },
    });
    expect(stuck.status).toBe('succeeded');
  });
});
