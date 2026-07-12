import { randomUUID } from 'node:crypto';
import { Prisma, type PrismaClient } from '@prisma/client';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { PrismaService } from '../../prisma/prisma.service';
import {
  makeTestPrisma,
  resetDb,
  seedBaseFixture,
  TEST_ORGANIZATION_ID,
  TEST_USER_ID,
} from '../../test-helpers/real-prisma';
import { RegistrationContentWorkspaceRepositoryAdapter } from '../adapter/out/repository/registration-content-workspace.repository.adapter';

describe('RegistrationContentWorkspaceRepositoryAdapter (PG integration)', () => {
  let prisma: PrismaClient;
  let repository: RegistrationContentWorkspaceRepositoryAdapter;

  beforeAll(async () => {
    prisma = makeTestPrisma();
    await prisma.$connect();
    repository = new RegistrationContentWorkspaceRepositoryAdapter(
      prisma as unknown as PrismaService,
    );
  });

  afterAll(async () => prisma?.$disconnect());

  beforeEach(async () => {
    await resetDb(prisma);
    await seedBaseFixture(prisma);
  });

  it('adopts an ordinary active candidate thumbnail into managed source content', async () => {
    const thumbnailUrl = 'https://cdn.example.com/source.jpg';
    const candidate = await prisma.sourcingCandidate.create({
      data: {
        organizationId: TEST_ORGANIZATION_ID,
        sourceUrl: `https://1688.com/item/${randomUUID()}`,
        sourcePlatform: 'ALIBABA_1688',
        rawData: {},
        name: 'Kids rain boots',
        thumbnailUrl,
        imageUrl: thumbnailUrl,
        status: 'sourced',
        images: {
          create: {
            organizationId: TEST_ORGANIZATION_ID,
            url: thumbnailUrl,
            storageKey: 'sourcing/source.jpg',
            role: 'product',
            sortOrder: 0,
            source: 'sourcing-extension',
            isPrimary: true,
          },
        },
      },
    });
    const sourceWorkspace = await prisma.contentWorkspace.create({
      data: {
        organizationId: TEST_ORGANIZATION_ID,
        ownerType: 'sourcing_candidate',
        sourceCandidateId: candidate.id,
        displayName: candidate.name,
        normalizedTitle: 'kidsrainboots',
        createdByUserId: TEST_USER_ID,
      },
    });

    await expect(prisma.$transaction((transaction) =>
      repository.resolveSourceSelections(transaction, {
        organizationId: TEST_ORGANIZATION_ID,
        sourceWorkspaceId: sourceWorkspace.id,
        selectedThumbnailUrl: thumbnailUrl,
        selectedThumbnailGenerationId: null,
        selectedThumbnailGenerationCandidateId: null,
        selectedDetailPageArtifactId: null,
        selectedDetailPageRevisionId: null,
        selectedDetailPageGenerationId: null,
      }),
    )).resolves.toMatchObject({ selectedThumbnailUrl: thumbnailUrl });

    const selection = await prisma.contentWorkspaceThumbnailSelection.findFirstOrThrow({
      where: {
        organizationId: TEST_ORGANIZATION_ID,
        contentWorkspaceId: sourceWorkspace.id,
        sourceThumbnailGenerationId: null,
        sourceThumbnailCandidateId: null,
      },
      include: { contentAsset: true },
    });
    expect(selection.contentAsset).toMatchObject({
      url: thumbnailUrl,
      storageKey: 'sourcing/source.jpg',
      role: 'thumbnail',
      isDeleted: false,
    });
  });

  it('waits for generation-to-candidate locks and rejects a concurrently archived selection', async () => {
    const account = await prisma.channelAccount.create({
      data: {
        organizationId: TEST_ORGANIZATION_ID,
        channel: 'coupang',
        name: 'Coupang test account',
        externalAccountId: randomUUID(),
      },
    });
    const candidate = await prisma.sourcingCandidate.create({
      data: {
        organizationId: TEST_ORGANIZATION_ID,
        sourceUrl: `https://1688.com/item/${randomUUID()}`,
        sourcePlatform: 'ALIBABA_1688',
        rawData: {},
        name: 'Kids rain boots',
        status: 'sourced',
      },
    });
    const sourceWorkspace = await prisma.contentWorkspace.create({
      data: {
        organizationId: TEST_ORGANIZATION_ID,
        ownerType: 'sourcing_candidate',
        sourceCandidateId: candidate.id,
        displayName: candidate.name,
        normalizedTitle: 'kidsrainboots',
        createdByUserId: TEST_USER_ID,
      },
    });
    const listing = await prisma.channelListing.create({
      data: {
        organizationId: TEST_ORGANIZATION_ID,
        channelAccountId: account.id,
        sourceCandidateId: candidate.id,
        channel: 'coupang',
        externalId: randomUUID(),
        channelName: candidate.name,
        status: 'active',
      },
    });
    const generation = await prisma.thumbnailGeneration.create({
      data: {
        organizationId: TEST_ORGANIZATION_ID,
        sourceCandidateId: candidate.id,
        contentWorkspaceId: sourceWorkspace.id,
        originalUrl: 'https://cdn.example.com/source.jpg',
        status: 'succeeded',
        triggeredByUserId: TEST_USER_ID,
      },
    });
    const generatedCandidate = await prisma.thumbnailGenerationCandidate.create({
      data: {
        organizationId: TEST_ORGANIZATION_ID,
        generationId: generation.id,
        url: 'https://cdn.example.com/generated.jpg',
      },
    });

    let releaseArchive!: () => void;
    let reportSourceRowsLocked!: () => void;
    const archiveRelease = new Promise<void>((resolve) => {
      releaseArchive = resolve;
    });
    const sourceRowsLocked = new Promise<void>((resolve) => {
      reportSourceRowsLocked = resolve;
    });
    const archive = prisma.$transaction(async (transaction) => {
      await transaction.$queryRaw(Prisma.sql`
        SELECT id FROM thumbnail_generations
        WHERE id = ${generation.id}::uuid
          AND organization_id = ${TEST_ORGANIZATION_ID}::uuid
        FOR UPDATE
      `);
      await transaction.$queryRaw(Prisma.sql`
        SELECT id FROM thumbnail_generation_candidates
        WHERE id = ${generatedCandidate.id}::uuid
          AND organization_id = ${TEST_ORGANIZATION_ID}::uuid
          AND generation_id = ${generation.id}::uuid
        FOR UPDATE
      `);
      reportSourceRowsLocked();
      await archiveRelease;
      await transaction.thumbnailGeneration.updateMany({
        where: {
          id: generation.id,
          organizationId: TEST_ORGANIZATION_ID,
          isDeleted: false,
        },
        data: { isDeleted: true, deletedAt: new Date() },
      });
    });
    await sourceRowsLocked;

    const branch = prisma.$transaction((transaction) => repository.branchToListing(
      transaction,
      {
        organizationId: TEST_ORGANIZATION_ID,
        sourceWorkspaceId: sourceWorkspace.id,
        listingId: listing.id,
        displayName: candidate.name,
        normalizedTitle: 'kidsrainboots',
        createdByUserId: TEST_USER_ID,
        selectedThumbnailUrl: generatedCandidate.url,
        selectedThumbnailGenerationId: generation.id,
        selectedThumbnailGenerationCandidateId: generatedCandidate.id,
        selectedDetailPageArtifactId: null,
        selectedDetailPageRevisionId: null,
        selectedDetailPageGenerationId: null,
      },
    ));
    const observation = await Promise.race([
      branch.then(() => 'settled' as const, () => 'settled' as const),
      new Promise<'blocked'>((resolve) => setTimeout(() => resolve('blocked'), 100)),
    ]);
    releaseArchive();

    await expect(archive).resolves.toBeUndefined();
    await expect(branch).rejects.toThrow(
      'Selected thumbnail generation is not successful source content.',
    );
    expect(observation).toBe('blocked');
    expect(await prisma.contentWorkspace.count({
      where: {
        organizationId: TEST_ORGANIZATION_ID,
        channelListingId: listing.id,
        isDeleted: false,
      },
    })).toBe(0);
    expect(await prisma.contentWorkspaceThumbnailSelection.count({
      where: {
        organizationId: TEST_ORGANIZATION_ID,
        sourceThumbnailCandidateId: generatedCandidate.id,
      },
    })).toBe(0);
  });
});
