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
import { ContentWorkspaceThumbnailSelectionRepositoryAdapter } from '../adapter/out/repository/content-workspace-thumbnail-selection.repository.adapter';
import { SourcingWorkspaceArchiveRepositoryAdapter } from '../adapter/out/repository/sourcing-workspace-archive.repository.adapter';
import { ThumbnailGenerationLedgerRepositoryAdapter } from '../adapter/out/repository/thumbnail-generation-ledger.repository.adapter';
import { groupUrlAssetKey } from '../domain/content-asset-key';

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

  it('archives a candidate workspace before a concurrent thumbnail selection can edit it', async () => {
    const candidate = await prisma.sourcingCandidate.create({
      data: {
        organizationId: TEST_ORGANIZATION_ID,
        sourceUrl: `https://1688.com/item/${randomUUID()}`,
        sourcePlatform: 'ALIBABA_1688',
        rawData: {},
        name: 'Archive workspace lock',
        status: 'sourced',
      },
    });
    const workspace = await prisma.contentWorkspace.create({
      data: {
        organizationId: TEST_ORGANIZATION_ID,
        ownerType: 'sourcing_candidate',
        sourceCandidateId: candidate.id,
        displayName: candidate.name,
        normalizedTitle: 'archiveworkspacelock',
      },
    });
    const group = await prisma.contentGenerationGroup.create({
      data: {
        organizationId: TEST_ORGANIZATION_ID,
        contentWorkspaceId: workspace.id,
        groupType: 'workspace_assets',
      },
    });
    const generation = await prisma.contentGeneration.create({
      data: {
        organizationId: TEST_ORGANIZATION_ID,
        generationGroupId: group.id,
        contentWorkspaceId: workspace.id,
        sourceCandidateId: candidate.id,
      },
    });
    const asset = await prisma.contentAsset.create({
      data: {
        organizationId: TEST_ORGANIZATION_ID,
        generationGroupId: group.id,
        assetKey: groupUrlAssetKey(group.id, 'https://cdn.example.com/archive-current.png'),
        url: 'https://cdn.example.com/archive-current.png',
        usages: {
          create: {
            organizationId: TEST_ORGANIZATION_ID,
            contentGenerationId: generation.id,
          },
        },
      },
    });
    const historicalSelection = await prisma.contentWorkspaceThumbnailSelection.create({
      data: {
        organizationId: TEST_ORGANIZATION_ID,
        contentWorkspaceId: workspace.id,
        contentAssetId: asset.id,
      },
    });
    await prisma.contentWorkspace.update({
      where: { id: workspace.id },
      data: { currentThumbnailSelectionId: historicalSelection.id },
    });

    let reportWorkspaceLocked!: () => void;
    const workspaceLocked = new Promise<void>((resolve) => {
      reportWorkspaceLocked = resolve;
    });
    let releaseWorkspace!: () => void;
    const workspaceRelease = new Promise<void>((resolve) => {
      releaseWorkspace = resolve;
    });
    const archiveRepository = new SourcingWorkspaceArchiveRepositoryAdapter();
    const archivedAt = new Date('2026-07-13T02:00:00.000Z');
    const archive = prisma.$transaction(async (tx) => {
      await tx.$queryRaw(Prisma.sql`
        SELECT id FROM sourcing_candidates
        WHERE id = ${candidate.id}::uuid
          AND organization_id = ${TEST_ORGANIZATION_ID}::uuid
        FOR UPDATE
      `);
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
      await tx.sourcingCandidate.updateMany({
        where: {
          id: candidate.id,
          organizationId: TEST_ORGANIZATION_ID,
          isDeleted: false,
        },
        data: { isDeleted: true, deletedAt: archivedAt },
      });
      return archiveRepository.archiveSourcingWorkspace(pausedScope, {
        organizationId: TEST_ORGANIZATION_ID,
        sourceCandidateId: candidate.id,
        archivedAt,
      });
    });
    await workspaceLocked;

    const selectionRepository = new ContentWorkspaceThumbnailSelectionRepositoryAdapter(
      prisma as unknown as PrismaService,
    );
    const selection = selectionRepository.selectCurrent({
      organizationId: TEST_ORGANIZATION_ID,
      workspaceId: workspace.id,
      userId: null,
      selection: { kind: 'content_asset', contentAssetId: asset.id },
    });
    const selectionState = await Promise.race([
      selection.then(() => 'settled', () => 'settled'),
      new Promise<string>((resolve) => setTimeout(() => resolve('blocked'), 100)),
    ]);

    releaseWorkspace();
    await archive;
    await expect(selection).rejects.toBeInstanceOf(NotFoundException);
    expect(selectionState).toBe('blocked');
    await expect(prisma.contentWorkspace.findUniqueOrThrow({
      where: { id: workspace.id },
      select: {
        status: true,
        isDeleted: true,
        deletedAt: true,
        currentThumbnailSelectionId: true,
      },
    })).resolves.toEqual({
      status: 'archived',
      isDeleted: true,
      deletedAt: archivedAt,
      currentThumbnailSelectionId: null,
    });
    expect(await prisma.contentWorkspaceThumbnailSelection.count({
      where: { id: historicalSelection.id },
    })).toBe(1);
    expect(await prisma.contentAsset.findUniqueOrThrow({
      where: { id: asset.id },
      select: { isDeleted: true },
    })).toEqual({ isDeleted: true });
  });

  it('serializes first external URL adoption and reuses one managed asset group', async () => {
    const workspace = await prisma.contentWorkspace.create({
      data: {
        organizationId: TEST_ORGANIZATION_ID,
        ownerType: 'direct_detail_page',
        displayName: 'Concurrent external selection',
        normalizedTitle: 'concurrentexternalselection',
      },
    });
    let reportWorkspaceLocked!: () => void;
    const workspaceLocked = new Promise<void>((resolve) => {
      reportWorkspaceLocked = resolve;
    });
    let releaseWorkspace!: () => void;
    const workspaceRelease = new Promise<void>((resolve) => {
      releaseWorkspace = resolve;
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
                reportWorkspaceLocked();
                await workspaceRelease;
              }
              return rows;
            };
          },
        }))),
    };
    const firstRepository = new ContentWorkspaceThumbnailSelectionRepositoryAdapter(
      pausedPrisma as unknown as PrismaService,
    );
    const secondRepository = new ContentWorkspaceThumbnailSelectionRepositoryAdapter(
      prisma as unknown as PrismaService,
    );
    const managedUrl = 'https://cdn.example.com/concurrent-external.png';
    const source = {
      kind: 'external' as const,
      url: managedUrl,
      storageKey: 'content-assets/concurrent-external.png',
      mimeType: 'image/png',
      fileSize: 128,
    };

    const first = firstRepository.selectCurrent({
      organizationId: TEST_ORGANIZATION_ID,
      workspaceId: workspace.id,
      userId: null,
      selection: source,
    });
    await workspaceLocked;
    const second = secondRepository.selectCurrent({
      organizationId: TEST_ORGANIZATION_ID,
      workspaceId: workspace.id,
      userId: null,
      selection: source,
    });
    const secondState = await Promise.race([
      second.then(() => 'settled', () => 'settled'),
      new Promise<string>((resolve) => setTimeout(() => resolve('blocked'), 100)),
    ]);

    releaseWorkspace();
    const [firstResult, secondResult] = await Promise.all([first, second]);
    expect(secondState).toBe('blocked');
    expect(secondResult.contentAssetId).toBe(firstResult.contentAssetId);
    expect(await prisma.contentGenerationGroup.count({
      where: {
        organizationId: TEST_ORGANIZATION_ID,
        contentWorkspaceId: workspace.id,
        groupType: 'workspace_assets',
      },
    })).toBe(1);
    expect(await prisma.contentAsset.count({
      where: { organizationId: TEST_ORGANIZATION_ID, url: managedUrl },
    })).toBe(1);
  });

  it('serializes concurrent candidate removals and derives the terminal generation state in-transaction', async () => {
    const firstUrl = 'https://cdn.example.com/remove-first.png';
    const secondUrl = 'https://cdn.example.com/remove-second.png';
    const generation = await prisma.thumbnailGeneration.create({
      data: {
        organizationId: TEST_ORGANIZATION_ID,
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
    );
    const secondRepository = new ThumbnailGenerationLedgerRepositoryAdapter(
      prisma as unknown as PrismaService,
    );

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
