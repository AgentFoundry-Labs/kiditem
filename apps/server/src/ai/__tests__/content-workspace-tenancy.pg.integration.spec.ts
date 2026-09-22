import { randomUUID } from 'node:crypto';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { Prisma, type PrismaClient } from '@prisma/client';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { makeChannelListingQuery, makeChannelRecipes } from '../../test-helpers/channel-catalog-ports';
import {
  makeTestPrisma,
  OTHER_ORGANIZATION_ID,
  resetDb,
  seedBaseFixture,
  TEST_ORGANIZATION_ID,
} from '../../test-helpers/real-prisma';
import { ContentAssetLibraryRepositoryAdapter } from '../adapter/out/repository/content-asset-library.repository.adapter';
import { ContentWorkspaceLifecycleRepositoryAdapter } from '../adapter/out/repository/content-workspace-lifecycle.repository.adapter';
import { SalesProductOwnerReadAdapter } from '../adapter/out/channels/sales-product-owner.adapter';
import { ContentWorkspaceThumbnailSelectionRepositoryAdapter } from '../adapter/out/repository/content-workspace-thumbnail-selection.repository.adapter';
import { ThumbnailGenerationLedgerRepositoryAdapter } from '../adapter/out/repository/thumbnail-generation-ledger.repository.adapter';
import { groupUrlAssetKey } from '../domain/content-asset-key';
import { RegistrationContentWorkspaceRepositoryAdapter } from '../adapter/out/repository/registration-content-workspace.repository.adapter';
import { ChannelListingQueryService } from '../../channels/application/service/listing/channel-listing-query.service';
import { ChannelListingQueryPersistenceAdapter } from '../../channels/adapter/out/persistence/channel-listing-query.persistence.adapter';
import { ownerTransaction } from '../../prisma/owner-transaction';
import type { PrismaService } from '../../prisma/prisma.service';

describe('AI content ownership constraints (PG integration)', () => {
  let prisma: PrismaClient;
  let registrationContent: RegistrationContentWorkspaceRepositoryAdapter;

  beforeAll(async () => {
    prisma = makeTestPrisma();
    await prisma.$connect();
    const channelListings = new ChannelListingQueryService(
      new ChannelListingQueryPersistenceAdapter(prisma as never),
      { findForListings: async () => [] },
    );
    registrationContent = new RegistrationContentWorkspaceRepositoryAdapter(
      prisma as unknown as PrismaService,
      channelListings,
    );
  });

  afterAll(async () => prisma?.$disconnect());

  beforeEach(async () => {
    await resetDb(prisma);
    await seedBaseFixture(prisma);
  });

  /**
   * Stands in for `SALES_PRODUCT_PORT`: the same organization-scoped lookup
   * Channels performs, against the real rows, without pulling the Products
   * runtime that its repository adapter needs.
   */
  function salesProductOwners() {
    return new SalesProductOwnerReadAdapter({
      async get(organizationId: string, salesProductId: string) {
        const row = await prisma.salesProduct.findFirst({
          where: { id: salesProductId, organizationId },
          select: { id: true },
        });
        if (!row) throw new NotFoundException('판매상품을 찾지 못했습니다.');
        return row as never;
      },
    } as never);
  }

  it('refuses a draft workspace whose sales product belongs to another organization', async () => {
    const foreignProduct = await prisma.salesProduct.create({
      data: {
        organizationId: OTHER_ORGANIZATION_ID,
        code: 'FOREIGN-DRAFT',
        name: 'Foreign draft',
      },
    });
    const repository = new ContentWorkspaceLifecycleRepositoryAdapter(
      prisma as unknown as PrismaService,
      new ChannelListingQueryService(
        new ChannelListingQueryPersistenceAdapter(prisma as never),
        { findForListings: async () => [] },
      ),
      salesProductOwners(),
    );

    await expect(repository.ensureActiveWorkspace({
      organizationId: TEST_ORGANIZATION_ID,
      ownerType: 'sales_product',
      salesProductId: foreignProduct.id,
      channelListingId: null,
      originWorkspaceId: null,
      displayName: 'Cross-tenant draft',
      normalizedTitle: 'crosstenantdraft',
      createdByUserId: null,
    })).rejects.toBeInstanceOf(NotFoundException);

    expect(await prisma.contentWorkspace.count({
      where: { organizationId: TEST_ORGANIZATION_ID, salesProductId: foreignProduct.id },
    })).toBe(0);
  });

  it('rejects cross-organization current-content pointers', async () => {
    const foreignWorkspace = await prisma.contentWorkspace.create({
      data: {
        organizationId: OTHER_ORGANIZATION_ID,
        ownerType: 'direct_detail_page',
        displayName: 'Foreign detail page',
        normalizedTitle: 'foreigndetailpage',
      },
    });
    const foreignArtifact = await prisma.detailPageArtifact.create({
      data: {
        organizationId: OTHER_ORGANIZATION_ID,
        contentWorkspaceId: foreignWorkspace.id,
        title: 'Foreign detail page',
      },
    });

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
    const foreignWorkspace = await prisma.contentWorkspace.create({
      data: {
        organizationId: OTHER_ORGANIZATION_ID,
        ownerType: 'direct_detail_page',
        displayName: 'Foreign selected detail page',
        normalizedTitle: 'foreignselecteddetailpage',
      },
    });
    const foreignArtifact = await prisma.detailPageArtifact.create({
      data: {
        organizationId: OTHER_ORGANIZATION_ID,
        contentWorkspaceId: foreignWorkspace.id,
        title: 'Foreign selected detail page',
      },
    });
    const localCandidate = await prisma.sourcingCandidate.create({
      data: {
        organizationId: TEST_ORGANIZATION_ID,
        sourceUrl: `https://example.com/candidate/${randomUUID()}`,
        sourcePlatform: 'ALIBABA_1688',
        rawData: {},
        name: 'Local preparation candidate',
        status: 'sourced',
      },
    });
    const localAccount = await prisma.channelAccount.create({
      data: {
        organizationId: TEST_ORGANIZATION_ID,
        channel: 'coupang',
        externalAccountId: randomUUID(),
        name: 'Local preparation account',
        status: 'active',
      },
    });
    const localProduct = await prisma.salesProduct.create({
      data: {
        organizationId: TEST_ORGANIZATION_ID,
        sourceCandidateId: localCandidate.id,
        code: 'LOCAL-PREPARATION-CANDIDATE',
        name: 'Local preparation candidate',
      },
    });
    const localWorkspace = await prisma.contentWorkspace.create({
      data: {
        organizationId: TEST_ORGANIZATION_ID,
        ownerType: 'sales_product',
        salesProductId: localProduct.id,
        displayName: localCandidate.name,
        normalizedTitle: 'localpreparationcandidate',
      },
    });
    await prisma.salesProductOption.create({
      data: {
        organizationId: TEST_ORGANIZATION_ID,
        salesProductId: localProduct.id,
        optionCode: 'LOCAL-PREPARATION-CANDIDATE-1',
        values: ['단품'],
        optionKey: '단품',
        salePrice: 1000,
      },
    });

    await expect(prisma.$transaction(async (tx) => {
      const selections = await registrationContent.resolveSourceSelections(ownerTransaction(tx), {
        organizationId: TEST_ORGANIZATION_ID,
        sourceWorkspaceId: localWorkspace.id,
        selectedThumbnailUrl: null,
        selectedThumbnailGenerationId: null,
        selectedThumbnailGenerationCandidateId: null,
        selectedDetailPageArtifactId: foreignArtifact.id,
        selectedDetailPageRevisionId: null,
        selectedDetailPageGenerationId: null,
      });
      return tx.registrationTarget.create({
        data: {
          organizationId: TEST_ORGANIZATION_ID,
          salesProductId: localProduct.id,
          sourceCandidateId: localCandidate.id,
          channelAccountId: localAccount.id,
          sourceContentWorkspaceId: localWorkspace.id,
          displayName: 'Cross-tenant preparation',
          registrationInput: {},
          ...selections,
        },
      });
    })).rejects.toThrow('Selected detail artifact is not source-owned.');

    expect(await prisma.registrationTarget.count({
      where: { organizationId: TEST_ORGANIZATION_ID },
    })).toBe(0);
  });

  it('serializes asset deletion behind usage replacement', async () => {
    const repository = new ContentAssetLibraryRepositoryAdapter(
      prisma as unknown as PrismaService,
    );
    const workspace = await prisma.contentWorkspace.create({
      data: {
        organizationId: TEST_ORGANIZATION_ID,
        ownerType: 'direct_detail_page',
        displayName: 'Locked usage replacement',
        normalizedTitle: 'lockedusagereplacement',
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
    const assetUrl = 'https://cdn.example.com/locked-usage.png';
    const asset = await prisma.contentAsset.create({
      data: {
        organizationId: TEST_ORGANIZATION_ID,
        originGenerationGroupId: group.id,
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

  it('locks the origin draft workspace until the listing workspace creation commits', async () => {
    const account = await prisma.channelAccount.create({
      data: {
        organizationId: TEST_ORGANIZATION_ID,
        channel: 'coupang',
        externalAccountId: randomUUID(),
        name: 'Origin lock account',
        status: 'active',
      },
    });
    const listing = await prisma.channelListing.create({
      data: {
        organizationId: TEST_ORGANIZATION_ID,
        channelAccountId: account.id,
        externalId: randomUUID(),
        channelName: 'Origin lock listing',
        status: 'active',
      },
    });
    const origin = await prisma.contentWorkspace.create({
      data: {
        organizationId: TEST_ORGANIZATION_ID,
        ownerType: 'sales_product',
        salesProductId: randomUUID(),
        displayName: 'Origin owner lock',
        normalizedTitle: 'originownerlock',
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
              // The listing lock runs first; pause only once the origin
              // workspace row itself is held.
              if (query.sql.includes('content_workspaces')) {
                signalLocked();
                await released;
              }
              return rows;
            };
          },
        }))),
    };
    const repository = new ContentWorkspaceLifecycleRepositoryAdapter(
      prismaWithPausedOwnerLock as unknown as PrismaService,
      new ChannelListingQueryService(
        new ChannelListingQueryPersistenceAdapter(prisma as never),
        { findForListings: async () => [] },
      ),
      salesProductOwners(),
    );

    const creation = repository.ensureActiveWorkspace({
      organizationId: TEST_ORGANIZATION_ID,
      ownerType: 'channel_listing',
      salesProductId: null,
      channelListingId: listing.id,
      originWorkspaceId: origin.id,
      displayName: 'Origin owner lock',
      normalizedTitle: 'originownerlockbranch',
      createdByUserId: null,
    });
    await locked;
    const archive = prisma.$executeRaw`
      UPDATE content_workspaces
      SET status = 'archived'
      WHERE id = ${origin.id}::uuid
        AND organization_id = ${TEST_ORGANIZATION_ID}::uuid
    `;
    await expect(Promise.race([
      archive.then(() => 'settled'),
      new Promise<string>((resolve) => setTimeout(() => resolve('blocked'), 100)),
    ])).resolves.toBe('blocked');

    releaseLock();
    await expect(creation).resolves.toMatchObject({
      displayName: 'Origin owner lock',
    });
    await expect(archive).resolves.toBe(1);
    expect(await prisma.contentWorkspace.count({
      where: {
        organizationId: TEST_ORGANIZATION_ID,
        channelListingId: listing.id,
      },
    })).toBe(1);
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
        originGenerationGroupId: group.id,
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
      {} as never, makeChannelListingQuery(prisma), makeChannelRecipes(prisma));

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
    const workspace = await prisma.contentWorkspace.create({
      data: {
        organizationId: TEST_ORGANIZATION_ID,
        ownerType: 'direct_detail_page',
        displayName: 'Concurrent usage replacement',
        normalizedTitle: 'concurrentusagereplacement',
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
    const firstUrl = 'https://cdn.example.com/usage-first.png';
    const secondUrl = 'https://cdn.example.com/usage-second.png';
    const [firstAsset, secondAsset] = await Promise.all([
      prisma.contentAsset.create({
        data: {
          organizationId: TEST_ORGANIZATION_ID,
          originGenerationGroupId: group.id,
          assetKey: groupUrlAssetKey(group.id, firstUrl),
          url: firstUrl,
        },
      }),
      prisma.contentAsset.create({
        data: {
          organizationId: TEST_ORGANIZATION_ID,
          originGenerationGroupId: group.id,
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

  it('deletes assets referenced only by historical thumbnail selections while protecting the current asset', async () => {
    const assetRepository = new ContentAssetLibraryRepositoryAdapter(
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
    const [historicalAsset, currentAsset] = await Promise.all([
      prisma.contentAsset.create({
        data: {
          organizationId: TEST_ORGANIZATION_ID,
          originGenerationGroupId: group.id,
          assetKey: groupUrlAssetKey(group.id, 'https://cdn.example.com/historical.png'),
          url: 'https://cdn.example.com/historical.png',
        },
      }),
      prisma.contentAsset.create({
        data: {
          organizationId: TEST_ORGANIZATION_ID,
          originGenerationGroupId: group.id,
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
