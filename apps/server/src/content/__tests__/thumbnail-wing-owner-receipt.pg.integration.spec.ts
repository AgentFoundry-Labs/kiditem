import { randomUUID } from 'node:crypto';
import { ConflictException } from '@nestjs/common';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  makeTestPrisma,
  resetDb,
  seedBaseFixture,
  TEST_ORGANIZATION_ID,
} from '../../test-helpers/real-prisma';
import { ThumbnailWingRepositoryAdapter } from '../adapter/out/repository/thumbnail-wing.repository.adapter';
import type { PrismaClient } from '@prisma/client';
import type { PrismaService } from '../../prisma/prisma.service';

describe('thumbnail Wing owner receipts (PG integration)', () => {
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

  it('serializes same-key Agent submissions, replays success, and rejects request drift', async () => {
    const workspace = await prisma.contentWorkspace.create({
      data: {
        organizationId: TEST_ORGANIZATION_ID,
        ownerType: 'direct_detail_page',
        displayName: 'Wing owner receipt',
        normalizedTitle: 'wingownerreceipt',
      },
    });
    const generation = await prisma.thumbnailGeneration.create({
      data: {
        organizationId: TEST_ORGANIZATION_ID,
        contentWorkspaceId: workspace.id,
        status: 'succeeded',
      },
    });
    const repository = new ThumbnailWingRepositoryAdapter(
      prisma as unknown as PrismaService,
      { readCatalogFacts: async () => [] } as never,
    );
    const owner = { generationId: generation.id, organizationId: TEST_ORGANIZATION_ID, ownerIdempotencyKey: randomUUID(), requestHash: 'a'.repeat(64) };

    const claims = await Promise.all([
      repository.claimAgentRegistrationAttempt(owner),
      repository.claimAgentRegistrationAttempt(owner),
    ]);

    expect(claims.map((claim) => claim.mode).sort()).toEqual(['create', 'reconcile']);
    expect(await prisma.thumbnailRegistrationAttempt.count({
      where: { organizationId: TEST_ORGANIZATION_ID, ownerIdempotencyKey: owner.ownerIdempotencyKey },
    })).toBe(1);
    const created = claims.find((claim) => claim.mode === 'create');
    if (!created || created.mode !== 'create') throw new Error('missing owner receipt creator');
    await repository.finalizeAgentRegistrationAttempt({
      id: created.attemptId,
      organizationId: TEST_ORGANIZATION_ID,
      ownerIdempotencyKey: owner.ownerIdempotencyKey,
      requestHash: owner.requestHash,
      success: true,
      screenshotPath: 'chrome-extension://wing/receipt.png',
    });

    await expect(repository.claimAgentRegistrationAttempt(owner)).resolves.toEqual({
      mode: 'replay', success: true, screenshotPath: 'chrome-extension://wing/receipt.png',
    });
    await expect(repository.claimAgentRegistrationAttempt({ ...owner, requestHash: 'b'.repeat(64) }))
      .rejects.toBeInstanceOf(ConflictException);
  });
});
