import { randomUUID } from 'node:crypto';
import type { PrismaClient } from '@prisma/client';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  makeTestPrisma,
  resetDb,
  seedBaseFixture,
  TEST_ORGANIZATION_ID,
} from '../../../../../test-helpers/real-prisma';
import { AiDirectJobRepositoryAdapter } from '../ai-direct-job.repository.adapter';
import type { PrismaService } from '../../../../../prisma/prisma.service';

describe('AiDirectJobRepositoryAdapter (PG integration)', () => {
  let prisma: PrismaClient;
  let repository: AiDirectJobRepositoryAdapter;

  beforeAll(async () => {
    prisma = makeTestPrisma();
    await prisma.$connect();
    repository = new AiDirectJobRepositoryAdapter(
      prisma as unknown as PrismaService,
    );
  });

  afterAll(async () => prisma?.$disconnect());

  beforeEach(async () => {
    await resetDb(prisma);
    await seedBaseFixture(prisma);
  });

  it('claims once across workers and preserves a checkpoint across lease recovery', async () => {
    const now = new Date('2026-07-19T00:00:00.000Z');
    const created = await repository.create({
      organizationId: TEST_ORGANIZATION_ID,
      jobType: 'image_edit',
      sourceResourceId: randomUUID(),
      payload: {
        jobType: 'image_edit',
        models: { image: 'gemini-image-model' },
        input: {
          image_url: 'https://storage.example.com/input.png',
          preset: 'custom',
        },
      },
      status: 'held',
      scheduledFor: now,
    });

    const firstClaims = await Promise.all([
      repository.claimNext({
        workerId: 'worker-a',
        now,
        leaseExpiresAt: new Date(now.getTime() + 60_000),
      }),
      repository.claimNext({
        workerId: 'worker-b',
        now,
        leaseExpiresAt: new Date(now.getTime() + 60_000),
      }),
    ]);
    expect(firstClaims.filter(Boolean)).toHaveLength(1);
    expect(firstClaims.filter((claim) => claim === null)).toHaveLength(1);

    const reclaimAt = new Date(now.getTime() + 120_000);
    const reclaimed = await repository.claimNext({
      workerId: 'worker-c',
      now: reclaimAt,
      leaseExpiresAt: new Date(reclaimAt.getTime() + 60_000),
    });
    expect(reclaimed).toMatchObject({
      id: created.id,
      status: 'running',
      claimedFromStatus: 'running',
      attempts: 2,
    });

    const result = { image_url: 'https://storage.example.com/output.png' };
    await expect(
      repository.checkpointResult({
        organizationId: TEST_ORGANIZATION_ID,
        jobId: created.id,
        result,
      }),
    ).resolves.toBe(true);

    const projectionReclaimAt = new Date(reclaimAt.getTime() + 120_000);
    const projectionClaim = await repository.claimNext({
      workerId: 'worker-d',
      now: projectionReclaimAt,
      leaseExpiresAt: new Date(projectionReclaimAt.getTime() + 60_000),
    });
    expect(projectionClaim).toMatchObject({
      id: created.id,
      status: 'projecting',
      claimedFromStatus: 'projecting',
      attempts: 2,
      result,
    });
  });
});
