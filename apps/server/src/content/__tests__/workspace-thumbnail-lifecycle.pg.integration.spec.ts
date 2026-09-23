import { makeChannelListingQuery, makeChannelRecipes } from '../../test-helpers/channel-catalog-ports';
import { randomUUID } from 'node:crypto';
import { NotFoundException } from '@nestjs/common';
import { Prisma, type PrismaClient } from '@prisma/client';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { PrismaService } from '../../prisma/prisma.service';
import {
  makeTestPrisma,
  resetDb,
  seedBaseFixture,
  TEST_ORGANIZATION_ID,
} from '../../test-helpers/real-prisma';
import { ContentAssetLibraryRepositoryAdapter } from '../adapter/out/repository/content-asset-library.repository.adapter';
import { SalesProductWorkspaceArchiveRepositoryAdapter } from '../adapter/out/repository/sales-product-workspace-archive.repository.adapter';
import { ThumbnailGenerationLedgerRepositoryAdapter } from '../adapter/out/repository/thumbnail-generation-ledger.repository.adapter';

describe('workspace thumbnail lifecycle (PG integration)', () => {
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

  it('archives a draft workspace before a concurrent adoption can repoint its representative image', async () => {
    const salesProductId = randomUUID();
    const workspace = await prisma.contentWorkspace.create({
      data: { organizationId: TEST_ORGANIZATION_ID, ownerType: 'sales_product', salesProductId },
    });
    const [current, other] = await Promise.all(['current', 'other'].map((name) => prisma.contentAsset.create({
      data: {
        organizationId: TEST_ORGANIZATION_ID,
        contentWorkspaceId: workspace.id,
        source: 'upload',
        assetKey: `archive-${name}:${workspace.id}`,
        url: `https://cdn.example.com/archive-${name}.png`,
        role: 'thumbnail',
      },
    })));
    await prisma.contentWorkspace.update({
      where: { id: workspace.id },
      data: { currentThumbnailAssetId: current!.id },
    });

    let reportWorkspaceLocked!: () => void;
    const workspaceLocked = new Promise<void>((resolve) => {
      reportWorkspaceLocked = resolve;
    });
    let releaseWorkspace!: () => void;
    const workspaceRelease = new Promise<void>((resolve) => {
      releaseWorkspace = resolve;
    });
    const archiveRepository = new SalesProductWorkspaceArchiveRepositoryAdapter();
    const archivedAt = new Date('2026-07-13T02:00:00.000Z');
    const archive = prisma.$transaction(async (tx) => {
      let didPause = false;
      const pausedScope = new Proxy(tx, {
        get(target, property, receiver) {
          if (property !== '$queryRaw') return Reflect.get(target, property, receiver);
          return async <T>(query: Prisma.Sql): Promise<T> => {
            const rows = await tx.$queryRaw<T>(query);
            if (!didPause) {
              didPause = true;
              reportWorkspaceLocked();
              await workspaceRelease;
            }
            return rows;
          };
        },
      });
      return archiveRepository.archiveSalesProductWorkspace(pausedScope, {
        organizationId: TEST_ORGANIZATION_ID,
        salesProductId,
        archivedAt,
      });
    });
    await workspaceLocked;

    const assets = new ContentAssetLibraryRepositoryAdapter(prisma as unknown as PrismaService);
    const adoption = assets.setCurrentThumbnail({
      organizationId: TEST_ORGANIZATION_ID,
      contentWorkspaceId: workspace.id,
      assetId: other!.id,
    });
    const adoptionState = await Promise.race([
      adoption.then(() => 'settled', () => 'settled'),
      new Promise<string>((resolve) => setTimeout(() => resolve('blocked'), 100)),
    ]);

    releaseWorkspace();
    await archive;
    await expect(adoption).rejects.toBeInstanceOf(NotFoundException);
    expect(adoptionState).toBe('blocked');
    await expect(prisma.contentWorkspace.findUniqueOrThrow({
      where: { id: workspace.id },
      select: { status: true, isDeleted: true, deletedAt: true, currentThumbnailAssetId: true },
    })).resolves.toEqual({
      status: 'archived',
      isDeleted: true,
      deletedAt: archivedAt,
      currentThumbnailAssetId: null,
    });
  });

  it('serializes concurrent candidate removals and derives the terminal generation state in-transaction', async () => {
    const firstUrl = 'https://cdn.example.com/remove-first.png';
    const secondUrl = 'https://cdn.example.com/remove-second.png';
    const workspace = await prisma.contentWorkspace.create({
      data: {
        organizationId: TEST_ORGANIZATION_ID,
        ownerType: 'direct_detail_page',
        displayName: 'Concurrent candidate removal',
        normalizedTitle: 'concurrentcandidateremoval',
      },
    });
    const generation = await prisma.thumbnailGeneration.create({
      data: {
        organizationId: TEST_ORGANIZATION_ID,
        contentWorkspaceId: workspace.id,
        status: 'succeeded',
        phase: 'ready',
        selectedUrl: firstUrl,
        candidates: {
          create: [
            { organizationId: TEST_ORGANIZATION_ID, url: firstUrl, sortOrder: 0 },
            { organizationId: TEST_ORGANIZATION_ID, url: secondUrl, sortOrder: 1 },
          ],
        },
      },
      include: { candidates: { orderBy: { sortOrder: 'asc' } } },
    });
    let reportGenerationLocked!: () => void;
    const generationLocked = new Promise<void>((resolve) => {
      reportGenerationLocked = resolve;
    });
    let releaseGeneration!: () => void;
    const generationRelease = new Promise<void>((resolve) => {
      releaseGeneration = resolve;
    });
    let didPause = false;
    const pausedPrisma = {
      $transaction: <T>(callback: (tx: Prisma.TransactionClient) => Promise<T>) =>
        prisma.$transaction(async (tx) => callback(new Proxy(tx, {
          get(target, property, receiver) {
            if (property !== '$queryRaw') return Reflect.get(target, property, receiver);
            return async <R>(query: Prisma.Sql): Promise<R> => {
              const rows = await tx.$queryRaw<R>(query);
              if (!didPause) {
                didPause = true;
                reportGenerationLocked();
                await generationRelease;
              }
              return rows;
            };
          },
        }))),
    };
    const firstRepository = new ThumbnailGenerationLedgerRepositoryAdapter(
      pausedPrisma as unknown as PrismaService,
      {} as never, makeChannelListingQuery(prisma), makeChannelRecipes(prisma));
    const secondRepository = new ThumbnailGenerationLedgerRepositoryAdapter(
      prisma as unknown as PrismaService,
      {} as never, makeChannelListingQuery(prisma), makeChannelRecipes(prisma));

    const first = firstRepository.removeCandidate({
      id: generation.id,
      organizationId: TEST_ORGANIZATION_ID,
      candidateUrl: firstUrl,
    });
    await generationLocked;
    const second = secondRepository.removeCandidate({
      id: generation.id,
      organizationId: TEST_ORGANIZATION_ID,
      candidateUrl: secondUrl,
    });
    const secondState = await Promise.race([
      second.then(() => 'settled', () => 'settled'),
      new Promise<string>((resolve) => setTimeout(() => resolve('blocked'), 100)),
    ]);

    releaseGeneration();
    await Promise.all([first, second]);
    expect(secondState).toBe('blocked');
    await expect(prisma.thumbnailGeneration.findUniqueOrThrow({
      where: { id: generation.id },
      select: { isDeleted: true, selectedUrl: true, candidates: { select: { id: true } } },
    })).resolves.toEqual({
      isDeleted: true,
      selectedUrl: null,
      candidates: [],
    });
  });
});
