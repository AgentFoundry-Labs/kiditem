/**
 * Real-Postgres integration test for the Agent OS execution pipeline.
 *
 * Verifies: enqueue (`AgentRunCoordinator`) → claim (`AgentRunWorker.tick()`)
 * → executor → runtime → finalize → `agent.run.finalized` event captured.
 *
 * The bus payload carries routing metadata (`agentType`, `source`,
 * `sourceResourceType`, `sourceResourceId`) so AI bridges can filter on it
 * without inspecting the in-band `output`. The test asserts those fields are
 * present on both the success and failure paths.
 *
 * Uses a deterministic in-memory runtime adapter so the success path is
 * exercised without any external provider. The default `RoutingRuntimeAdapter`
 * fail-fast contract (no handler registered) is covered separately by the
 * executor unit tests + the routing-runtime adapter spec.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { EventEmitter2 } from '@nestjs/event-emitter';
import type { PrismaClient } from '@prisma/client';
import {
  makeTestPrisma,
  resetDb,
  seedBaseFixture,
  TEST_ORGANIZATION_ID,
} from '../../test-helpers/real-prisma';
import { AgentOsRepositoryAdapter } from '../adapter/out/repository/agent-os.repository.adapter';
import { AgentRunCoordinator } from '../application/service/agent-run-coordinator.service';
import { AgentRunExecutor } from '../application/service/agent-run-executor.service';
import { AgentRunWorker } from '../application/service/agent-run-worker.service';
import {
  AGENT_RUN_EVENTS,
  type AgentRunFinalizedEvent,
} from '../application/event/agent-run-events';
import type {
  AgentRuntimeExecutionContext,
  AgentRuntimePort,
  AgentRuntimeResult,
} from '../application/port/out/runtime/agent-runtime.port';
import { AgentOsRuntimeError } from '../domain/agent-os.errors';

class DeterministicRuntimeAdapter implements AgentRuntimePort {
  outputs = new Map<string, AgentRuntimeResult>();
  failures = new Map<string, AgentOsRuntimeError>();
  observed: AgentRuntimeExecutionContext[] = [];

  async execute(
    context: AgentRuntimeExecutionContext,
  ): Promise<AgentRuntimeResult> {
    this.observed.push(context);
    const failure = this.failures.get(context.agentType);
    if (failure) throw failure;
    const result = this.outputs.get(context.agentType);
    if (!result) {
      throw new AgentOsRuntimeError(
        'runtime_not_configured',
        `No deterministic output configured for ${context.agentType}.`,
      );
    }
    return result;
  }
}

let prisma: PrismaClient | null = null;
let repository: AgentOsRepositoryAdapter;
let runtime: DeterministicRuntimeAdapter;
let eventBus: EventEmitter2;
let coordinator: AgentRunCoordinator;
let executor: AgentRunExecutor;
let worker: AgentRunWorker;

async function seedInstance(input: {
  type: string;
  name: string;
}) {
  const instance = await repository.createInstanceWithRuntimeState({
    organizationId: TEST_ORGANIZATION_ID,
    type: input.type,
    name: `${input.name} Instance`,
    adapterType: 'claude_local',
    modelOverride: 'test-model',
  });
  return { instance };
}

beforeAll(async () => {
  prisma = makeTestPrisma();
  await prisma.$connect();
  repository = new AgentOsRepositoryAdapter(prisma as never);
  runtime = new DeterministicRuntimeAdapter();
  eventBus = new EventEmitter2();
  coordinator = new AgentRunCoordinator(repository);
  executor = new AgentRunExecutor(repository, runtime, eventBus);
  // Disable the timer; we drive `tick()` directly. (The default is also
  // disabled now — review #1 — but keep the explicit override so the spec
  // still works if a developer flips on the env var locally.)
  process.env.AGENT_RUNTIME_WORKER_ENABLED = '0';
  worker = new AgentRunWorker(executor);
});

afterAll(async () => {
  await prisma?.$disconnect();
});

beforeEach(async () => {
  if (!prisma) throw new Error('Prisma test client was not initialized');
  await resetDb(prisma);
  await seedBaseFixture(prisma);
  runtime.outputs.clear();
  runtime.failures.clear();
  runtime.observed = [];
  eventBus.removeAllListeners();
});

describe('AgentRunWorker → AgentRunExecutor → finalize (real Postgres)', () => {
  it('drains a queued rules_evaluation request and emits FINALIZED with routing metadata', async () => {
    await seedInstance({
      type: 'rules_evaluation',
      name: 'Rules Evaluation',
    });

    const sampleOutput = {
      ok: true,
      sample: 'rules',
    };
    runtime.outputs.set('rules_evaluation', {
      output: sampleOutput,
      provider: 'test-deterministic',
    });

    const finalized: AgentRunFinalizedEvent[] = [];
    eventBus.on(AGENT_RUN_EVENTS.FINALIZED, (event: AgentRunFinalizedEvent) => {
      finalized.push(event);
    });

    const enqueue = await coordinator.runByType('rules_evaluation', {
      organizationId: TEST_ORGANIZATION_ID,
      sourceType: 'rules',
      sourceResourceType: 'rule_set',
      sourceId: 'rules-integration-1',
      payload: { sample: true },
    });
    expect(enqueue.ok).toBe(true);
    const requestId = enqueue.requestId;
    expect(requestId).toBeDefined();

    await worker.tick();

    expect(runtime.observed).toHaveLength(1);
    expect(runtime.observed[0].agentType).toBe('rules_evaluation');

    expect(finalized).toHaveLength(1);
    expect(finalized[0]).toMatchObject({
      organizationId: TEST_ORGANIZATION_ID,
      requestId,
      status: 'succeeded',
      output: sampleOutput,
      agentType: 'rules_evaluation',
      source: 'rules',
      sourceResourceType: 'rule_set',
      sourceResourceId: 'rules-integration-1',
    });

    const persistedRequest = await prisma!.agentRunRequest.findUniqueOrThrow({
      where: { id: requestId! },
    });
    expect(persistedRequest.status).toBe('succeeded');
    expect(persistedRequest.finishedAt).not.toBeNull();

    const persistedRun = await prisma!.agentRun.findFirstOrThrow({
      where: { requestId: requestId! },
    });
    expect(persistedRun.status).toBe('succeeded');
    expect(persistedRun.output).toEqual(sampleOutput);
  });

  it('emits FINALIZED with runtime_not_configured AND routing metadata on terminal failure', async () => {
    await seedInstance({
      type: 'rules_suggest',
      name: 'Rules Suggest',
    });

    const finalized: AgentRunFinalizedEvent[] = [];
    eventBus.on(AGENT_RUN_EVENTS.FINALIZED, (event: AgentRunFinalizedEvent) => {
      finalized.push(event);
    });

    const enqueue = await coordinator.runByType('rules_suggest', {
      organizationId: TEST_ORGANIZATION_ID,
      sourceType: 'rules.suggest',
      sourceResourceType: 'rule_set',
      sourceId: 'rules-suggest-integration-1',
      payload: { prompt: 'test' },
    });
    expect(enqueue.ok).toBe(true);
    // Coordinator does not expose maxAttempts override, so we patch the row
    // directly to make the very first failure terminal — keeping this test
    // independent of the coordinator's default retry count.
    await prisma!.agentRunRequest.update({
      where: { id: enqueue.requestId! },
      data: { maxAttempts: 1 },
    });

    await worker.tick();

    const failedEvent = finalized.find((event) => event.status === 'failed');
    expect(failedEvent).toBeDefined();
    expect(failedEvent).toMatchObject({
      errorCode: 'runtime_not_configured',
      agentType: 'rules_suggest',
      source: 'rules.suggest',
      sourceResourceType: 'rule_set',
      sourceResourceId: 'rules-suggest-integration-1',
    });
    // Failure path has no in-band output — bridges must rely on the metadata
    // above, not on `output.__envelope`.
    expect(failedEvent!.output).toBeUndefined();

    const persistedRequest = await prisma!.agentRunRequest.findUniqueOrThrow({
      where: { id: enqueue.requestId! },
    });
    expect(persistedRequest.status).toBe('failed');
    expect(persistedRequest.lastErrorCode).toBe('runtime_not_configured');
  });

  it('worker tick() is a no-op when the queue is empty', async () => {
    const finalized: AgentRunFinalizedEvent[] = [];
    eventBus.on(AGENT_RUN_EVENTS.FINALIZED, (event: AgentRunFinalizedEvent) => {
      finalized.push(event);
    });

    await worker.tick();

    expect(runtime.observed).toHaveLength(0);
    expect(finalized).toHaveLength(0);
  });
});
