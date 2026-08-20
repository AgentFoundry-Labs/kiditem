import { createHash } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  makeTestPrisma,
  OTHER_ORGANIZATION_ID,
  resetDb,
  seedBaseFixture,
  TEST_ORGANIZATION_ID,
  TEST_USER_ID,
} from '../../test-helpers/real-prisma';
import { OperationRepositoryAdapter } from '../../operations/adapter/out/repository/operation.repository.adapter';
import { CompositeOperationCoordinatorService } from '../../operations/application/service/composite-operation-coordinator.service';
import { OperationHandlerRegistryService } from '../../operations/application/service/operation-handler-registry.service';
import { OperationLifecycleGateService } from '../../operations/application/service/operation-lifecycle-gate.service';
import { OperationRunService } from '../../operations/application/service/operation-run.service';
import { PrismaAgentSessionControlRepository } from '../adapter/out/repository/prisma-agent-session-control.repository';
import { AgentSessionDelegationService } from '../application/service/agent-session-delegation.service';
import { AgentSessionTaskDispatchService } from '../application/service/agent-session-task-dispatch.service';
import { AGENT_OS_OPERATIONS } from '../domain/operation/agent-os.operations';
import type { PrismaClient } from '@prisma/client';

const ROOT_VERSION_ID = '40000000-0000-4000-8000-000000000001';
const CHILD_VERSION_ID = '40000000-0000-4000-8000-000000000002';
const AUTHORITY_PROFILE_ID = 'foundation_read_only_probe:v1';
const CAPABILITY = 'sourcing.retrieveWorkspaceEvidence';

let prisma: PrismaClient | null = null;
let controls: PrismaAgentSessionControlRepository;
let delegations: AgentSessionDelegationService;

beforeAll(async () => {
  prisma = makeTestPrisma();
  controls = new PrismaAgentSessionControlRepository(prisma as never);
  const operationsRepository = new OperationRepositoryAdapter(prisma as never);
  const registry = new OperationHandlerRegistryService();
  registry.register(AGENT_OS_OPERATIONS[0], {} as never);
  const lifecycleGate = new OperationLifecycleGateService();
  lifecycleGate.open();
  const operations = new OperationRunService(
    registry,
    operationsRepository,
    new CompositeOperationCoordinatorService(
      registry,
      operationsRepository,
      lifecycleGate,
    ),
    lifecycleGate,
  );
  delegations = new AgentSessionDelegationService(
    controls,
    new AgentSessionTaskDispatchService(operations, controls),
  );
  await prisma.$connect();
});

afterAll(async () => prisma?.$disconnect());

beforeEach(async () => {
  if (!prisma) throw new Error('Prisma test client was not initialized');
  await resetDb(prisma);
  await seedBaseFixture(prisma);
  await seedDurableDefinitions(prisma);
});

describe('durable session delegation', () => {
  it('coalesces parallel service delegation through one durable OperationRun and rejects a cross-organization graph insert', async () => {
    const graph = await createRootGraph();
    const input = {
      organizationId: TEST_ORGANIZATION_ID,
      sessionId: graph.sessionId,
      parentTaskId: graph.taskId,
      parentExecutionId: graph.executionId,
      targetAgentDefinitionKey: 'sourcing',
      objective: '소싱 근거를 검증한다',
      authoritySubset: [CAPABILITY],
      idempotencyKey: 'durable-delegation:source:1',
      requestedByUserId: TEST_USER_ID,
    };

    const [first, repeated] = await Promise.all([
      delegations.delegate(input),
      delegations.delegate(input),
    ]);

    expect(repeated).toEqual(first);
    await expect(prisma!.agentSessionTask.count({
      where: { organizationId: TEST_ORGANIZATION_ID, sessionId: graph.sessionId, parentTaskId: graph.taskId },
    })).resolves.toBe(1);
    await expect(prisma!.agentSessionTaskDelegation.count({
      where: { organizationId: TEST_ORGANIZATION_ID, sessionId: graph.sessionId, parentTaskId: graph.taskId },
    })).resolves.toBe(1);
    await expect(prisma!.agentExecution.count({
      where: { organizationId: TEST_ORGANIZATION_ID, sessionId: graph.sessionId, sessionTaskId: first.childTaskId },
    })).resolves.toBe(1);
    await expect(prisma!.operationRun.count({
      where: {
        id: first.operationsRunId,
        organizationId: TEST_ORGANIZATION_ID,
        operationKey: 'agent-os.execute-session-task',
      },
    })).resolves.toBe(1);

    await expect(prisma!.agentSessionTask.create({
      data: {
        organizationId: OTHER_ORGANIZATION_ID,
        sessionId: graph.sessionId,
        parentTaskId: graph.taskId,
        assignedAgentVersionId: CHILD_VERSION_ID,
        objective: 'cross-org write',
        isRoot: false,
        status: 'queued',
        idempotencyKey: 'cross-org-direct-insert',
      },
    })).rejects.toMatchObject({ code: 'P2003' });
  });
});

async function seedDurableDefinitions(client: PrismaClient): Promise<void> {
  const assets = {
    prompt: { path: 'agent-config/prompts/agents/manager.md', sha256: 'a'.repeat(64) },
    summaryPrompt: { path: 'agent-config/prompts/system/session-summary.md', sha256: 'b'.repeat(64) },
    skills: [],
    outputSchema: null,
  };
  await client.agentVersion.createMany({
    data: [
      {
        id: ROOT_VERSION_ID,
        agentDefinitionKey: 'operator',
        version: 1,
        displayName: 'Operator',
        description: 'Operator',
        runtimeType: 'hermes_http',
        modelIdentity: 'gpt-test',
        capabilityKeys: [CAPABILITY],
        policyDocument: { sideEffects: ['read'] },
        manifestHash: '1'.repeat(64),
        runtimeManifest: {
          schemaVersion: 1,
          agentDefinitionKey: 'operator',
          runtimeKind: 'coordinator',
          runtimeType: 'hermes_http',
          modelIdentity: 'gpt-test',
          capabilityKeys: [CAPABILITY],
          policyDocument: { sideEffects: ['read'] },
          delegation: {
            role: 'orchestrator',
            allowedAgentDefinitionKeys: ['sourcing'],
            maxDepth: 2,
            maxChildrenPerTask: 2,
          },
          limits: { maxTurns: 20, maxContextTokens: 8_192, summaryTargetTokens: 512 },
          assets,
        },
        activatedAt: new Date('2026-08-14T00:00:00.000Z'),
      },
      {
        id: CHILD_VERSION_ID,
        agentDefinitionKey: 'sourcing',
        version: 1,
        displayName: 'Sourcing',
        description: 'Sourcing',
        runtimeType: 'hermes_http',
        modelIdentity: 'gpt-test',
        capabilityKeys: [CAPABILITY],
        policyDocument: { sideEffects: ['read'] },
        manifestHash: '2'.repeat(64),
        runtimeManifest: {
          schemaVersion: 1,
          agentDefinitionKey: 'sourcing',
          runtimeKind: 'agent',
          runtimeType: 'hermes_http',
          modelIdentity: 'gpt-test',
          capabilityKeys: [CAPABILITY],
          policyDocument: { sideEffects: ['read'] },
          delegation: {
            role: 'leaf',
            allowedAgentDefinitionKeys: [],
            maxDepth: 0,
            maxChildrenPerTask: 0,
          },
          limits: { maxTurns: 20, maxContextTokens: 8_192, summaryTargetTokens: 512 },
          assets,
        },
        activatedAt: new Date('2026-08-14T00:00:00.000Z'),
      },
    ],
  });
  await client.agentAuthorityProfileVersion.create({
    data: {
      id: AUTHORITY_PROFILE_ID,
      organizationId: TEST_ORGANIZATION_ID,
      profileKey: 'foundation_read_only_probe',
      version: 1,
      capabilityKeys: [CAPABILITY],
      policyDocument: { sideEffects: ['read'] },
      policyHash: '3'.repeat(64),
    },
  });
}

async function createRootGraph(): Promise<{
  sessionId: string;
  taskId: string;
  executionId: string;
}> {
  const session = await prisma!.agentSession.create({
    data: {
      organizationId: TEST_ORGANIZATION_ID,
      createdByUserId: TEST_USER_ID,
      copilotThreadId: crypto.randomUUID(),
      primaryAgentVersionId: ROOT_VERSION_ID,
      authorityProfileVersionId: AUTHORITY_PROFILE_ID,
      lifecycle: 'active',
    },
  });
  const task = await prisma!.agentSessionTask.create({
    data: {
      organizationId: TEST_ORGANIZATION_ID,
      sessionId: session.id,
      assignedAgentVersionId: ROOT_VERSION_ID,
      isRoot: true,
      status: 'running',
      idempotencyKey: 'root',
    },
  });
  const policy = await prisma!.agentPolicySnapshot.create({
    data: {
      organizationId: TEST_ORGANIZATION_ID,
      sessionId: session.id,
      agentVersionId: ROOT_VERSION_ID,
      authorityProfileVersionId: AUTHORITY_PROFILE_ID,
      capabilityKeys: [CAPABILITY],
      policyHash: '4'.repeat(64),
    },
  });
  const userEvent = {
    externalEventId: `user-event:${crypto.randomUUID()}`,
    schemaVersion: 1,
    payload: {
      phase: 'complete',
      messageId: `message-${crypto.randomUUID()}`,
      content: 'canonical root request',
    },
  };
  const currentInput = { userEvent };
  const execution = await prisma!.agentExecution.create({
    data: {
      organizationId: TEST_ORGANIZATION_ID,
      sessionId: session.id,
      sessionTaskId: task.id,
      copilotThreadId: session.copilotThreadId,
      aguiRunId: `run-${crypto.randomUUID()}`,
      agentVersionId: ROOT_VERSION_ID,
      runtimeType: 'hermes_http',
      modelIdentity: 'gpt-test',
      policySnapshotId: policy.id,
      inputHash: createHash('sha256').update(canonicalJson(currentInput)).digest('hex'),
      currentInput,
      resourceRefs: [],
      status: 'running',
    },
  });
  await prisma!.agentConversationEvent.create({
    data: {
      organizationId: TEST_ORGANIZATION_ID,
      sessionId: session.id,
      executionId: execution.id,
      externalEventId: userEvent.externalEventId,
      sequence: 1n,
      eventType: 'user_message',
      schemaVersion: userEvent.schemaVersion,
      payload: userEvent.payload,
    },
  });
  await prisma!.agentSession.update({
    where: { id: session.id },
    data: { lastEventSequence: 1n },
  });
  return { sessionId: session.id, taskId: task.id, executionId: execution.id };
}

function canonicalJson(value: unknown): string {
  if (value === null || typeof value === 'string' || typeof value === 'boolean' || typeof value === 'number') {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  return `{${Object.entries(value as Record<string, unknown>)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, nested]) => `${JSON.stringify(key)}:${canonicalJson(nested)}`)
    .join(',')}}`;
}
