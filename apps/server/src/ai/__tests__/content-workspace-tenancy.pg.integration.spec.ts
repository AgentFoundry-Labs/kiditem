import { randomUUID } from 'node:crypto';
import { ConflictException } from '@nestjs/common';
import { Prisma, type PrismaClient } from '@prisma/client';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  makeTestPrisma,
  OTHER_ORGANIZATION_ID,
  resetDb,
  seedBaseFixture,
  TEST_ORGANIZATION_ID,
} from '../../test-helpers/real-prisma';
import { ContentAssetLibraryRepositoryAdapter } from '../adapter/out/repository/content-asset-library.repository.adapter';
import { ContentArchiveRepositoryAdapter } from '../adapter/out/repository/content-archive.repository.adapter';
import { ContentWorkspaceAttachmentRepositoryAdapter } from '../adapter/out/repository/content-workspace-attachment.repository.adapter';
import { ContentWorkspaceLifecycleRepositoryAdapter } from '../adapter/out/repository/content-workspace-lifecycle.repository.adapter';
import { ContentWorkspaceThumbnailSelectionRepositoryAdapter } from '../adapter/out/repository/content-workspace-thumbnail-selection.repository.adapter';
import { ThumbnailGenerationLedgerRepositoryAdapter } from '../adapter/out/repository/thumbnail-generation-ledger.repository.adapter';
import { groupUrlAssetKey } from '../domain/content-asset-key';
import type { PrismaService } from '../../prisma/prisma.service';

describe('AI content ownership constraints (PG integration)', () => {
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

  it('rejects cross-organization workspace owner and current-content pointers', async () => {
    const foreignCandidate = await prisma.sourcingCandidate.create({
      data: {
        organizationId: OTHER_ORGANIZATION_ID,
        sourceUrl: `https://example.com/candidate/${randomUUID()}`,
        sourcePlatform: 'ALIBABA_1688',
        rawData: {},
        name: 'Foreign candidate',
        status: 'sourced',
      },
    });
    const foreignArtifact = await prisma.detailPageArtifact.create({
      data: {
        organizationId: OTHER_ORGANIZATION_ID,
        title: 'Foreign detail page',
      },
    });

    await expect(prisma.contentWorkspace.create({
      data: {
        organizationId: TEST_ORGANIZATION_ID,
        ownerType: 'sourcing_candidate',
        sourceCandidateId: foreignCandidate.id,
        displayName: 'Cross-tenant owner',
        normalizedTitle: 'crosstenantowner',
      },
    })).rejects.toMatchObject({ code: 'P2003' });

    await expect(prisma.contentWorkspace.create({
      data: {
        organizationId: TEST_ORGANIZATION_ID,
        ownerType: 'direct_detail_page',
        currentDetailPageArtifactId: foreignArtifact.id,
        displayName: 'Cross-tenant current content',
        normalizedTitle: 'crosstenantcurrentcontent',
      },
    })).rejects.toMatchObject({ code: 'P2003' });

    expect(await prisma.contentWorkspace.count({
      where: { organizationId: TEST_ORGANIZATION_ID },
    })).toBe(0);
  });

  it('rejects a preparation selection that points at another organization', async () => {
    const foreignArtifact = await prisma.detailPageArtifact.create({
      data: {
        organizationId: OTHER_ORGANIZATION_ID,
        title: 'Foreign selected detail page',
      },
    });

    await expect(prisma.productPreparation.create({
      data: {
        organizationId: TEST_ORGANIZATION_ID,
        displayName: 'Cross-tenant preparation',
        selectedDetailPageArtifactId: foreignArtifact.id,
      },
    })).rejects.toMatchObject({ code: 'P2003' });

    expect(await prisma.productPreparation.count({
      where: { organizationId: TEST_ORGANIZATION_ID },
    })).toBe(0);
  });

  it('serializes asset deletion behind usage replacement', async () => {
    const repository = new ContentAssetLibraryRepositoryAdapter(
      prisma as unknown as PrismaService,
    );
    const group = await prisma.contentGenerationGroup.create({
      data: { organizationId: TEST_ORGANIZATION_ID },
    });
    const generation = await prisma.contentGeneration.create({
      data: {
        organizationId: TEST_ORGANIZATION_ID,
        generationGroupId: group.id,
      },
    });
    const assetUrl = 'https://cdn.example.com/locked-usage.png';
    const asset = await prisma.contentAsset.create({
      data: {
        organizationId: TEST_ORGANIZATION_ID,
        generationGroupId: group.id,
        assetKey: groupUrlAssetKey(group.id, assetUrl),
        url: assetUrl,
      },
    });

    let signalLocked!: () => void;
    const locked = new Promise<void>((resolve) => {
      signalLocked = resolve;
    });
    let releaseLock!: () => void;
    const released = new Promise<void>((resolve) => {
      releaseLock = resolve;
    });

    let rawCallCount = 0;
    const usageReplacement = prisma.$transaction(async (tx) => {
      const scope = {
        contentAsset: tx.contentAsset,
        contentGenerationAssetUsage: tx.contentGenerationAssetUsage,
        $queryRaw: async <T>(query: Prisma.Sql): Promise<T> => {
          const rows = await tx.$queryRaw<T>(query);
          rawCallCount += 1;
          if (rawCallCount === 2) {
            signalLocked();
            await released;
          }
          return rows;
        },
      };
      return repository.syncGenerationImageUsagesInScope(scope, {
        organizationId: TEST_ORGANIZATION_ID,
        generationGroupId: group.id,
        contentGenerationId: generation.id,
        createdByUserId: null,
        imageUrls: [assetUrl],
      });
    });

    await locked;
    const deletion = repository.deleteAsset({
      organizationId: TEST_ORGANIZATION_ID,
      contentAssetId: asset.id,
      deletedAt: new Date('2026-07-13T00:00:00.000Z'),
    });
    await expect(Promise.race([
      deletion.then(() => 'settled'),
      new Promise<string>((resolve) => setTimeout(() => resolve('blocked'), 100)),
    ])).resolves.toBe('blocked');

    releaseLock();
    await usageReplacement;
    await expect(deletion).resolves.toEqual({ status: 'in_use' });
    await expect(prisma.contentAsset.findUniqueOrThrow({
      where: { id: asset.id },
      select: { isDeleted: true, usages: { select: { contentGenerationId: true } } },
    })).resolves.toEqual({
      isDeleted: false,
      usages: [{ contentGenerationId: generation.id }],
    });
  });

  it('locks a workspace owner until candidate workspace creation commits', async () => {
    const candidate = await prisma.sourcingCandidate.create({
      data: {
        organizationId: TEST_ORGANIZATION_ID,
        sourceUrl: `https://example.com/candidate/${randomUUID()}`,
        sourcePlatform: 'ALIBABA_1688',
        rawData: {},
        name: 'Candidate owner lock',
        status: 'sourced',
      },
    });
    let signalLocked!: () => void;
    const locked = new Promise<void>((resolve) => {
      signalLocked = resolve;
    });
    let releaseLock!: () => void;
    const released = new Promise<void>((resolve) => {
      releaseLock = resolve;
    });
    const prismaWithPausedOwnerLock = {
      $transaction: <T>(callback: (tx: Prisma.TransactionClient) => Promise<T>) =>
        prisma.$transaction(async (tx) => callback(new Proxy(tx, {
          get(target, property, receiver) {
            if (property !== '$queryRaw') return Reflect.get(target, property, receiver);
            return async <R>(query: Prisma.Sql): Promise<R> => {
              const rows = await tx.$queryRaw<R>(query);
              signalLocked();
              await released;
              return rows;
            };
          },
        }))),
    };
    const repository = new ContentWorkspaceLifecycleRepositoryAdapter(
      prismaWithPausedOwnerLock as unknown as PrismaService,
    );

    const creation = repository.ensureActiveWorkspace({
      organizationId: TEST_ORGANIZATION_ID,
      ownerType: 'sourcing_candidate',
      sourceCandidateId: candidate.id,
      targetMasterId: null,
      channelListingId: null,
      originWorkspaceId: null,
      displayName: 'Candidate owner lock',
      normalizedTitle: 'candidateownerlock',
      createdByUserId: null,
    });
    await locked;
    const archive = prisma.sourcingCandidate.updateMany({
      where: {
        id: candidate.id,
        organizationId: TEST_ORGANIZATION_ID,
        isDeleted: false,
      },
      data: { isDeleted: true, deletedAt: new Date('2026-07-13T00:00:00.000Z') },
    });
    await expect(Promise.race([
      archive.then(() => 'settled'),
      new Promise<string>((resolve) => setTimeout(() => resolve('blocked'), 100)),
    ])).resolves.toBe('blocked');

    releaseLock();
    await expect(creation).resolves.toMatchObject({
      displayName: 'Candidate owner lock',
    });
    await expect(archive).resolves.toEqual({ count: 1 });
    expect(await prisma.contentWorkspace.count({
      where: {
        organizationId: TEST_ORGANIZATION_ID,
        sourceCandidateId: candidate.id,
      },
    })).toBe(1);
  });

  it('locks a duplicate-merge target against concurrent deletion', async () => {
    const deletionRepository = new ContentAssetLibraryRepositoryAdapter(
      prisma as unknown as PrismaService,
    );
    const [sourceGroup, targetGroup] = await Promise.all([
      prisma.contentGenerationGroup.create({
        data: { organizationId: TEST_ORGANIZATION_ID },
      }),
      prisma.contentGenerationGroup.create({
        data: {
          organizationId: TEST_ORGANIZATION_ID,
          groupType: 'product_workspace',
        },
      }),
    ]);
    const assetUrl = 'https://cdn.example.com/duplicate-merge-lock.png';
    const [sourceAsset, targetAsset] = await Promise.all([
      prisma.contentAsset.create({
        data: {
          organizationId: TEST_ORGANIZATION_ID,
          generationGroupId: sourceGroup.id,
          assetKey: groupUrlAssetKey(sourceGroup.id, assetUrl),
          url: assetUrl,
        },
      }),
      prisma.contentAsset.create({
        data: {
          organizationId: TEST_ORGANIZATION_ID,
          generationGroupId: targetGroup.id,
          assetKey: groupUrlAssetKey(targetGroup.id, assetUrl),
          url: assetUrl,
        },
      }),
    ]);
    const workspace = await prisma.contentWorkspace.create({
      data: {
        organizationId: TEST_ORGANIZATION_ID,
        ownerType: 'direct_detail_page',
        displayName: 'Duplicate merge lock',
        normalizedTitle: 'duplicatemergelock',
      },
    });
    const selection = await prisma.contentWorkspaceThumbnailSelection.create({
      data: {
        organizationId: TEST_ORGANIZATION_ID,
        contentWorkspaceId: workspace.id,
        contentAssetId: sourceAsset.id,
      },
    });
    await prisma.contentWorkspace.update({
      where: { id: workspace.id },
      data: { currentThumbnailSelectionId: selection.id },
    });

    let signalLocked!: () => void;
    const locked = new Promise<void>((resolve) => {
      signalLocked = resolve;
    });
    let releaseLock!: () => void;
    const released = new Promise<void>((resolve) => {
      releaseLock = resolve;
    });
    const prismaWithPausedAssetLock = {
      $transaction: <T>(callback: (tx: Prisma.TransactionClient) => Promise<T>) =>
        prisma.$transaction(async (tx) => callback(new Proxy(tx, {
          get(target, property, receiver) {
            if (property !== '$queryRaw') return Reflect.get(target, property, receiver);
            return async <R>(query: Prisma.Sql): Promise<R> => {
              const rows = await tx.$queryRaw<R>(query);
              signalLocked();
              await released;
              return rows;
            };
          },
        }))),
    };
    const pausedRepository = new ContentWorkspaceAttachmentRepositoryAdapter(
      prismaWithPausedAssetLock as unknown as PrismaService,
    );

    const merge = pausedRepository.attachGroupToProduct({
      organizationId: TEST_ORGANIZATION_ID,
      groupId: sourceGroup.id,
      productId: randomUUID(),
      productWorkspaceId: targetGroup.id,
    });
    await locked;
    const deletion = deletionRepository.deleteAsset({
      organizationId: TEST_ORGANIZATION_ID,
      contentAssetId: targetAsset.id,
      deletedAt: new Date('2026-07-13T00:00:00.000Z'),
    });
    await expect(Promise.race([
      deletion.then(() => 'settled'),
      new Promise<string>((resolve) => setTimeout(() => resolve('blocked'), 100)),
    ])).resolves.toBe('blocked');

    releaseLock();
    await merge;
    await expect(deletion).resolves.toEqual({ status: 'in_use' });
    await expect(prisma.contentWorkspaceThumbnailSelection.findUniqueOrThrow({
      where: { id: selection.id },
      select: { contentAssetId: true, contentAsset: { select: { isDeleted: true } } },
    })).resolves.toEqual({
      contentAssetId: targetAsset.id,
      contentAsset: { isDeleted: false },
    });
  });

  it('serializes thumbnail adoption against generation deletion and reports an explicit conflict', async () => {
    const workspace = await prisma.contentWorkspace.create({
      data: {
        organizationId: TEST_ORGANIZATION_ID,
        ownerType: 'direct_detail_page',
        displayName: 'Generation adoption lock',
        normalizedTitle: 'generationadoptionlock',
      },
    });
    const group = await prisma.contentGenerationGroup.create({
      data: {
        organizationId: TEST_ORGANIZATION_ID,
        contentWorkspaceId: workspace.id,
        groupType: 'workspace_assets',
      },
    });
    const generation = await prisma.thumbnailGeneration.create({
      data: {
        organizationId: TEST_ORGANIZATION_ID,
        contentWorkspaceId: workspace.id,
        status: 'succeeded',
        phase: 'ready',
      },
    });
    const candidate = await prisma.thumbnailGenerationCandidate.create({
      data: {
        organizationId: TEST_ORGANIZATION_ID,
        generationId: generation.id,
        url: 'https://cdn.example.com/adoption-lock.png',
      },
    });
    await prisma.contentAsset.create({
      data: {
        organizationId: TEST_ORGANIZATION_ID,
        generationGroupId: group.id,
        assetKey: groupUrlAssetKey(group.id, candidate.url),
        url: candidate.url,
      },
    });

    let signalLocked!: () => void;
    const locked = new Promise<void>((resolve) => {
      signalLocked = resolve;
    });
    let releaseLock!: () => void;
    const released = new Promise<void>((resolve) => {
      releaseLock = resolve;
    });
    let rawCallCount = 0;
    const prismaWithPausedGenerationLock = {
      $transaction: <T>(callback: (tx: Prisma.TransactionClient) => Promise<T>) =>
        prisma.$transaction(async (tx) => callback(new Proxy(tx, {
          get(target, property, receiver) {
            if (property !== '$queryRaw') return Reflect.get(target, property, receiver);
            return async <R>(query: Prisma.Sql): Promise<R> => {
              const rows = await tx.$queryRaw<R>(query);
              rawCallCount += 1;
              // The selection path locks its active workspace first, then the
              // generation whose provenance is being adopted. Pause only
              // after both locks are held so deletion must serialize behind
              // the adopted-provenance decision.
              if (rawCallCount === 2) {
                signalLocked();
                await released;
              }
              return rows;
            };
          },
        }))),
    };
    const selectionRepository = new ContentWorkspaceThumbnailSelectionRepositoryAdapter(
      prismaWithPausedGenerationLock as unknown as PrismaService,
    );
    const ledger = new ThumbnailGenerationLedgerRepositoryAdapter(
      prisma as unknown as PrismaService,
    );

    const adoption = selectionRepository.selectCurrent({
      organizationId: TEST_ORGANIZATION_ID,
      workspaceId: workspace.id,
      userId: null,
      selection: {
        kind: 'generation_candidate',
        sourceThumbnailGenerationId: generation.id,
        sourceThumbnailCandidateId: candidate.id,
      },
    });
    await locked;
    const deletion = ledger.deleteGeneration(generation.id, TEST_ORGANIZATION_ID);
    const deletionState = await Promise.race([
      deletion.then(() => 'settled', () => 'settled'),
      new Promise<string>((resolve) => setTimeout(() => resolve('blocked'), 100)),
    ]);

    releaseLock();
    await adoption;
    await expect(deletion).rejects.toBeInstanceOf(ConflictException);
    expect(deletionState).toBe('blocked');
    await expect(prisma.thumbnailGeneration.findUniqueOrThrow({
      where: { id: generation.id },
      select: { isDeleted: true, status: true },
    })).resolves.toEqual({ isDeleted: false, status: 'succeeded' });
  });

  it('serializes generation usage replacements so the last writer replaces instead of unions', async () => {
    const repository = new ContentAssetLibraryRepositoryAdapter(
      prisma as unknown as PrismaService,
    );
    const group = await prisma.contentGenerationGroup.create({
      data: { organizationId: TEST_ORGANIZATION_ID },
    });
    const generation = await prisma.contentGeneration.create({
      data: {
        organizationId: TEST_ORGANIZATION_ID,
        generationGroupId: group.id,
      },
    });
    const firstUrl = 'https://cdn.example.com/usage-first.png';
    const secondUrl = 'https://cdn.example.com/usage-second.png';
    const [firstAsset, secondAsset] = await Promise.all([
      prisma.contentAsset.create({
        data: {
          organizationId: TEST_ORGANIZATION_ID,
          generationGroupId: group.id,
          assetKey: groupUrlAssetKey(group.id, firstUrl),
          url: firstUrl,
        },
      }),
      prisma.contentAsset.create({
        data: {
          organizationId: TEST_ORGANIZATION_ID,
          generationGroupId: group.id,
          assetKey: groupUrlAssetKey(group.id, secondUrl),
          url: secondUrl,
        },
      }),
    ]);

    let signalLocked!: () => void;
    const locked = new Promise<void>((resolve) => {
      signalLocked = resolve;
    });
    let releaseLock!: () => void;
    const released = new Promise<void>((resolve) => {
      releaseLock = resolve;
    });
    const firstReplacement = prisma.$transaction(async (tx) => repository
      .syncGenerationImageUsagesInScope({
        contentAsset: tx.contentAsset,
        contentGenerationAssetUsage: tx.contentGenerationAssetUsage,
        $queryRaw: async <T>(query: Prisma.Sql): Promise<T> => {
          const rows = await tx.$queryRaw<T>(query);
          signalLocked();
          await released;
          return rows;
        },
      } as never, {
        organizationId: TEST_ORGANIZATION_ID,
        generationGroupId: group.id,
        contentGenerationId: generation.id,
        createdByUserId: null,
        imageUrls: [firstUrl],
      }));
    await locked;
    const secondReplacement = repository.syncGenerationImageUsages({
      organizationId: TEST_ORGANIZATION_ID,
      generationGroupId: group.id,
      contentGenerationId: generation.id,
      createdByUserId: null,
      imageUrls: [secondUrl],
    });
    const secondState = await Promise.race([
      secondReplacement.then(() => 'settled'),
      new Promise<string>((resolve) => setTimeout(() => resolve('blocked'), 100)),
    ]);

    releaseLock();
    await firstReplacement;
    await secondReplacement;
    expect(secondState).toBe('blocked');
    await expect(prisma.contentGenerationAssetUsage.findMany({
      where: {
        organizationId: TEST_ORGANIZATION_ID,
        contentGenerationId: generation.id,
      },
      select: { contentAssetId: true },
    })).resolves.toEqual([{ contentAssetId: secondAsset.id }]);
    expect(firstAsset.id).not.toBe(secondAsset.id);
  });

  it('lets historical thumbnail provenance be collected while the current asset remains protected', async () => {
    const assetRepository = new ContentAssetLibraryRepositoryAdapter(
      prisma as unknown as PrismaService,
    );
    const archiveRepository = new ContentArchiveRepositoryAdapter(
      prisma as unknown as PrismaService,
    );
    const workspace = await prisma.contentWorkspace.create({
      data: {
        organizationId: TEST_ORGANIZATION_ID,
        ownerType: 'direct_detail_page',
        displayName: 'Current-only thumbnail usage',
        normalizedTitle: 'currentonlythumbnailusage',
      },
    });
    const group = await prisma.contentGenerationGroup.create({
      data: {
        organizationId: TEST_ORGANIZATION_ID,
        contentWorkspaceId: workspace.id,
      },
    });
    const generation = await prisma.contentGeneration.create({
      data: {
        organizationId: TEST_ORGANIZATION_ID,
        generationGroupId: group.id,
        contentWorkspaceId: workspace.id,
      },
    });
    const [historicalAsset, currentAsset] = await Promise.all([
      prisma.contentAsset.create({
        data: {
          organizationId: TEST_ORGANIZATION_ID,
          generationGroupId: group.id,
          assetKey: groupUrlAssetKey(group.id, 'https://cdn.example.com/historical.png'),
          url: 'https://cdn.example.com/historical.png',
        },
      }),
      prisma.contentAsset.create({
        data: {
          organizationId: TEST_ORGANIZATION_ID,
          generationGroupId: group.id,
          assetKey: groupUrlAssetKey(group.id, 'https://cdn.example.com/current.png'),
          url: 'https://cdn.example.com/current.png',
        },
      }),
    ]);
    const [historicalSelection, currentSelection] = await Promise.all([
      prisma.contentWorkspaceThumbnailSelection.create({
        data: {
          organizationId: TEST_ORGANIZATION_ID,
          contentWorkspaceId: workspace.id,
          contentAssetId: historicalAsset.id,
        },
      }),
      prisma.contentWorkspaceThumbnailSelection.create({
        data: {
          organizationId: TEST_ORGANIZATION_ID,
          contentWorkspaceId: workspace.id,
          contentAssetId: currentAsset.id,
        },
      }),
    ]);
    await prisma.contentWorkspace.update({
      where: { id: workspace.id },
      data: { currentThumbnailSelectionId: currentSelection.id },
    });

    await expect(assetRepository.deleteAsset({
      organizationId: TEST_ORGANIZATION_ID,
      contentAssetId: historicalAsset.id,
      deletedAt: new Date('2026-07-13T01:00:00.000Z'),
    })).resolves.toEqual({ status: 'deleted' });
    await expect(assetRepository.deleteAsset({
      organizationId: TEST_ORGANIZATION_ID,
      contentAssetId: currentAsset.id,
      deletedAt: new Date('2026-07-13T01:00:00.000Z'),
    })).resolves.toEqual({ status: 'in_use' });
    await prisma.contentAsset.update({
      where: { id: historicalAsset.id },
      data: { isDeleted: false, deletedAt: null },
    });
    await prisma.contentGenerationAssetUsage.createMany({
      data: [historicalAsset.id, currentAsset.id].map((contentAssetId) => ({
        organizationId: TEST_ORGANIZATION_ID,
        contentGenerationId: generation.id,
        contentAssetId,
      })),
    });

    await expect(archiveRepository.deleteGroupWorkspace({
      organizationId: TEST_ORGANIZATION_ID,
      groupId: group.id,
    })).resolves.toMatchObject({ status: 'deleted', deletedAssets: 1 });
    await expect(prisma.contentAsset.findMany({
      where: { id: { in: [historicalAsset.id, currentAsset.id] } },
      orderBy: { url: 'asc' },
      select: { id: true, isDeleted: true },
    })).resolves.toEqual([
      { id: currentAsset.id, isDeleted: false },
      { id: historicalAsset.id, isDeleted: true },
    ]);
    expect(historicalSelection.id).not.toBe(currentSelection.id);
  });
});
