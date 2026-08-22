import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import {
  makeTestPrisma,
  resetDb,
  seedBaseFixture,
  TEST_ORGANIZATION_ID,
  TEST_USER_ID,
} from '../../../../../../test-helpers/real-prisma';
import { PrismaAgentSessionArtifactMaterializationTransaction } from '../prisma-agent-session-artifact-materialization.transaction';

const VERSION_ID = '10000000-0000-4000-8000-000000000001';
const PROFILE_ID = 'artifact-materialization:v1';
const ATTEMPT_TOKEN = '20000000-0000-4000-8000-000000000001';

let prisma: PrismaClient | null = null;
let materializations: PrismaAgentSessionArtifactMaterializationTransaction;

beforeAll(async () => {
  prisma = makeTestPrisma();
  materializations = new PrismaAgentSessionArtifactMaterializationTransaction(
    prisma as never,
  );
  await prisma.$connect();
});

afterAll(async () => prisma?.$disconnect());

beforeEach(async () => {
  if (!prisma) throw new Error('Prisma test client was not initialized');
  await resetDb(prisma);
  await seedBaseFixture(prisma);
  await seedGraph(prisma);
});

describe('AgentSession artifact materialization transaction', () => {
  it('keeps materializing rows out of normal active reads, binds an opaque upload ID, and replays the same artifact ID', async () => {
    const sessionGraph = await loadGraph();
    const input = materializationInput(sessionGraph);

    const first = await materializations.prepare(input);
    const replay = await materializations.prepare(input);

    expect(replay).toEqual(first);
    await expect(prisma!.agentSessionArtifact.count({
      where: { organizationId: TEST_ORGANIZATION_ID, sessionId: sessionGraph.sessionId, lifecycle: 'active' },
    })).resolves.toBe(0);
    await expect(prisma!.agentSessionArtifactMaterialization.findFirst({
      where: { artifactId: first.artifactId, organizationId: TEST_ORGANIZATION_ID },
    })).resolves.toMatchObject({ providerUploadId: null });

    await materializations.bindUpload({
      organizationId: TEST_ORGANIZATION_ID,
      sessionId: sessionGraph.sessionId,
      artifactId: first.artifactId,
      operationRunId: sessionGraph.operationRunId,
      attemptToken: ATTEMPT_TOKEN,
      uploadId: 'provider-opaque-upload-1',
    });
    await materializations.activate({
      organizationId: TEST_ORGANIZATION_ID,
      sessionId: sessionGraph.sessionId,
      taskId: sessionGraph.taskId,
      executionId: sessionGraph.executionId,
      artifactId: first.artifactId,
      operationRunId: sessionGraph.operationRunId,
      attemptToken: ATTEMPT_TOKEN,
      sha256: 'a'.repeat(64),
      metadata: { source: 'test' },
    });

    await expect(prisma!.agentSessionArtifact.findMany({
      where: { organizationId: TEST_ORGANIZATION_ID, sessionId: sessionGraph.sessionId, lifecycle: 'active' },
    })).resolves.toMatchObject([{ id: first.artifactId, metadata: { source: 'test' } }]);
    await expect(prisma!.agentSessionArtifactMaterialization.count({
      where: { artifactId: first.artifactId },
    })).resolves.toBe(0);
  });

  it('rejects a foreign OperationRun even with a valid attempt token', async () => {
    const sessionGraph = await loadGraph();
    const foreignRun = await prisma!.operationRun.create({
      data: operationRunData({ idempotencyKey: 'foreign-artifact-run', attemptToken: '20000000-0000-4000-8000-000000000002' }),
    });

    await expect(materializations.prepare({
      ...materializationInput(sessionGraph),
      operationRunId: foreignRun.id,
      attemptToken: foreignRun.attemptToken!,
    })).rejects.toMatchObject({ code: 'AGENT_SESSION_CONTROL_SCOPE_INVALID' });
  });

  it('rejects a late activation after the lifecycle fence and preserves the transient row for erasure', async () => {
    const sessionGraph = await loadGraph();
    const prepared = await materializations.prepare(materializationInput(sessionGraph));
    await materializations.bindUpload({
      organizationId: TEST_ORGANIZATION_ID,
      sessionId: sessionGraph.sessionId,
      artifactId: prepared.artifactId,
      operationRunId: sessionGraph.operationRunId,
      attemptToken: ATTEMPT_TOKEN,
      uploadId: 'provider-opaque-upload-race',
    });
    await prisma!.agentSession.update({
      where: { id: sessionGraph.sessionId },
      data: { lifecycle: 'deleting' },
    });

    await expect(materializations.activate({
      organizationId: TEST_ORGANIZATION_ID,
      sessionId: sessionGraph.sessionId,
      taskId: sessionGraph.taskId,
      executionId: sessionGraph.executionId,
      artifactId: prepared.artifactId,
      operationRunId: sessionGraph.operationRunId,
      attemptToken: ATTEMPT_TOKEN,
      sha256: 'a'.repeat(64),
      metadata: {},
    })).rejects.toMatchObject({ code: 'AGENT_SESSION_CONTROL_STATE_CONFLICT' });
    await expect(prisma!.agentSessionArtifactMaterialization.findFirst({
      where: { artifactId: prepared.artifactId },
    })).resolves.toMatchObject({ providerUploadId: 'provider-opaque-upload-race' });
  });
});

async function loadGraph(): Promise<{
  sessionId: string;
  taskId: string;
  executionId: string;
  operationRunId: string;
}> {
  const session = await prisma!.agentSession.findFirstOrThrow({
    where: { organizationId: TEST_ORGANIZATION_ID },
  });
  const task = await prisma!.agentSessionTask.findFirstOrThrow({
    where: { sessionId: session.id, organizationId: TEST_ORGANIZATION_ID },
  });
  const execution = await prisma!.agentExecution.findFirstOrThrow({
    where: { sessionId: session.id, sessionTaskId: task.id, organizationId: TEST_ORGANIZATION_ID },
  });
  const ownership = await prisma!.agentSessionOperationRunOwnership.findFirstOrThrow({
    where: { sessionId: session.id, organizationId: TEST_ORGANIZATION_ID },
  });
  return {
    sessionId: session.id,
    taskId: task.id,
    executionId: execution.id,
    operationRunId: ownership.operationRunId,
  };
}

function materializationInput(graph: Awaited<ReturnType<typeof loadGraph>>) {
  return {
    organizationId: TEST_ORGANIZATION_ID,
    sessionId: graph.sessionId,
    taskId: graph.taskId,
    executionId: graph.executionId,
    operationRunId: graph.operationRunId,
    attemptToken: ATTEMPT_TOKEN,
    externalArtifactId: 'runtime-artifact-1',
    artifactType: 'report',
    sha256: 'a'.repeat(64),
  };
}

async function seedGraph(client: PrismaClient): Promise<void> {
  await client.agentVersion.create({
    data: {
      id: VERSION_ID,
      agentDefinitionKey: 'artifact-materialization',
      version: 1,
      displayName: 'Artifact materialization',
      description: 'Artifact materialization',
      runtimeType: 'hermes_http',
      modelIdentity: 'gpt-test',
      capabilityKeys: [],
      policyDocument: {},
      manifestHash: '1'.repeat(64),
      runtimeManifest: {},
      activatedAt: new Date('2026-08-22T00:00:00.000Z'),
    },
  });
  await client.agentAuthorityProfileVersion.create({
    data: {
      id: PROFILE_ID,
      organizationId: TEST_ORGANIZATION_ID,
      profileKey: 'artifact_materialization',
      version: 1,
      capabilityKeys: [],
      policyDocument: {},
      policyHash: '2'.repeat(64),
    },
  });
  const session = await client.agentSession.create({
    data: {
      organizationId: TEST_ORGANIZATION_ID,
      createdByUserId: TEST_USER_ID,
      copilotThreadId: crypto.randomUUID(),
      primaryAgentVersionId: VERSION_ID,
      authorityProfileVersionId: PROFILE_ID,
      lifecycle: 'active',
    },
  });
  const task = await client.agentSessionTask.create({
    data: {
      organizationId: TEST_ORGANIZATION_ID,
      sessionId: session.id,
      assignedAgentVersionId: VERSION_ID,
      isRoot: true,
      status: 'running',
      idempotencyKey: 'root',
    },
  });
  const policy = await client.agentPolicySnapshot.create({
    data: {
      organizationId: TEST_ORGANIZATION_ID,
      sessionId: session.id,
      agentVersionId: VERSION_ID,
      authorityProfileVersionId: PROFILE_ID,
      capabilityKeys: [],
      policyHash: '3'.repeat(64),
    },
  });
  await client.agentExecution.create({
    data: {
      organizationId: TEST_ORGANIZATION_ID,
      sessionId: session.id,
      sessionTaskId: task.id,
      copilotThreadId: session.copilotThreadId,
      aguiRunId: crypto.randomUUID(),
      agentVersionId: VERSION_ID,
      runtimeType: 'hermes_http',
      modelIdentity: 'gpt-test',
      policySnapshotId: policy.id,
      inputHash: '4'.repeat(64),
      status: 'running',
    },
  });
  const operation = await client.operationRun.create({
    data: operationRunData({ idempotencyKey: 'artifact-materialization', attemptToken: ATTEMPT_TOKEN }),
  });
  await client.agentSessionOperationRunOwnership.create({
    data: {
      organizationId: TEST_ORGANIZATION_ID,
      sessionId: session.id,
      operationRunId: operation.id,
    },
  });
}

function operationRunData(input: { idempotencyKey: string; attemptToken: string }) {
  return {
    organizationId: TEST_ORGANIZATION_ID,
    operationKey: 'agent-os.execute-session-task',
    definitionVersion: 1,
    ownerDomain: 'agent-os',
    title: 'Materialize artifact',
    engineType: 'node',
    triggerSource: 'agent',
    requestedByUserId: TEST_USER_ID,
    idempotencyKey: input.idempotencyKey,
    input: {},
    attemptToken: input.attemptToken,
  };
}
