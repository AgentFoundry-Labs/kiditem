import { PrismaClient } from '@prisma/client';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  makeTestPrisma,
  resetDb,
  seedBaseFixture,
  TEST_ORGANIZATION_ID,
} from '../../test-helpers/real-prisma';
import { allocatePublicationSequence } from '../publication-sequence';

describe('allocatePublicationSequence (PostgreSQL)', () => {
  let prisma: PrismaClient;

  beforeAll(async () => {
    prisma = makeTestPrisma();
    await prisma.$connect();
  });

  afterAll(async () => prisma?.$disconnect());

  beforeEach(async () => {
    await resetDb(prisma);
    await seedBaseFixture(prisma);
  });

  it('serializes concurrent publications within organization and source type', async () => {
    const sourceType = 'publication-sequence-spec';
    const runs = await Promise.all([
      prisma.sourceImportRun.create({
        data: { organizationId: TEST_ORGANIZATION_ID, sourceType },
      }),
      prisma.sourceImportRun.create({
        data: { organizationId: TEST_ORGANIZATION_ID, sourceType },
      }),
    ]);

    const allocated = await Promise.all(runs.map((run) =>
      prisma.$transaction(async (tx) => {
        const publicationSequence = await allocatePublicationSequence(
          tx,
          TEST_ORGANIZATION_ID,
          sourceType,
        );
        await tx.sourceImportRun.update({
          where: { id: run.id },
          data: { status: 'completed', publicationSequence },
        });
        return publicationSequence;
      }),
    ));

    expect(allocated.sort((left, right) => Number(left - right))).toEqual([1n, 2n]);
  });

  it('allocates independent sequences for different source types', async () => {
    await prisma.sourceImportRun.create({
      data: {
        organizationId: TEST_ORGANIZATION_ID,
        sourceType: 'other-source',
        status: 'completed',
        publicationSequence: 8n,
      },
    });

    await expect(prisma.$transaction((tx) =>
      allocatePublicationSequence(tx, TEST_ORGANIZATION_ID, 'new-source'),
    )).resolves.toBe(1n);
  });
});
