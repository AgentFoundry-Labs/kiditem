import { randomUUID } from 'node:crypto';
import { Prisma, type PrismaClient } from '@prisma/client';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  makeTestPrisma,
  OTHER_ORGANIZATION_ID,
  resetDb,
  seedBaseFixture,
  TEST_ORGANIZATION_ID,
} from '../../test-helpers/real-prisma';
import type { PrismaService } from '../../prisma/prisma.service';
import { ContentAssetLibraryRepositoryAdapter } from '../adapter/out/repository/content-asset-library.repository.adapter';
import { ContentWorkspaceAttachmentRepositoryAdapter } from '../adapter/out/repository/content-workspace-attachment.repository.adapter';
import { ContentWorkspaceLifecycleRepositoryAdapter } from '../adapter/out/repository/content-workspace-lifecycle.repository.adapter';
import { groupUrlAssetKey } from '../domain/content-asset-key';

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

    const usageReplacement = prisma.$transaction(async (tx) => {
      const scope = {
        contentAsset: tx.contentAsset,
        contentGenerationAssetUsage: tx.contentGenerationAssetUsage,
        $queryRaw: async <T>(query: Prisma.Sql): Promise<T> => {
          const rows = await tx.$queryRaw<T>(query);
          signalLocked();
          await released;
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
});
