import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import {
  makeTestPrisma,
  OTHER_ORGANIZATION_ID,
  resetDb,
  seedBaseFixture,
  TEST_ORGANIZATION_ID,
} from '../../../../../test-helpers/real-prisma';
import { OperationCheckpointRepositoryAdapter } from '../operation-checkpoint.repository.adapter';

let prisma: PrismaClient | null = null;
let repository: OperationCheckpointRepositoryAdapter;

beforeAll(async () => {
  prisma = makeTestPrisma();
  repository = new OperationCheckpointRepositoryAdapter(prisma as never);
  await prisma.$connect();
});

afterAll(async () => {
  await prisma?.$disconnect();
});

beforeEach(async () => {
  if (!prisma) throw new Error('Prisma test client was not initialized');
  await resetDb(prisma);
  await seedBaseFixture(prisma);
});

describe('OperationCheckpointRepositoryAdapter', () => {
  it('serializes concurrent checkpoint appends into one monotonic run sequence', async () => {
    const run = await createRun();

    const rows = await Promise.all(
      Array.from({ length: 8 }, (_, index) =>
        repository.append({
          organizationId: TEST_ORGANIZATION_ID,
          operationRunId: run.id,
          kind: 'runtime_event_batch',
          state: { batch: index },
        }),
      ),
    );

    expect(rows.map((row) => row.sequence).sort((a, b) => Number(a - b))).toEqual(
      Array.from({ length: 8 }, (_, index) => BigInt(index + 1)),
    );
    await expect(repository.findLatest({
      organizationId: TEST_ORGANIZATION_ID,
      operationRunId: run.id,
    })).resolves.toMatchObject({ sequence: 8n });
  });

  it('fences both appends and reads by organization ownership', async () => {
    const run = await createRun();
    await repository.append({
      organizationId: TEST_ORGANIZATION_ID,
      operationRunId: run.id,
      kind: 'runtime_started',
      state: { runtimeHandle: 'handle-1' },
    });

    await expect(repository.append({
      organizationId: OTHER_ORGANIZATION_ID,
      operationRunId: run.id,
      kind: 'runtime_started',
      state: { runtimeHandle: 'stolen' },
    })).rejects.toThrow('operation_run_checkpoint_scope_invalid');
    await expect(repository.findLatest({
      organizationId: OTHER_ORGANIZATION_ID,
      operationRunId: run.id,
    })).resolves.toBeNull();
  });
});

async function createRun() {
  if (!prisma) throw new Error('Prisma test client was not initialized');
  return prisma.operationRun.create({
    data: {
      organizationId: TEST_ORGANIZATION_ID,
      operationKey: 'agent-os.execute-session-task',
      definitionVersion: 1,
      ownerDomain: 'agent-os',
      title: 'Execute agent task',
      engineType: 'agent-os',
      triggerSource: 'manual',
      input: {},
    },
  });
}
