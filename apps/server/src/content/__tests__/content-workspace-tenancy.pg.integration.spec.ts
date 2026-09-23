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
import { ThumbnailGenerationLedgerRepositoryAdapter } from '../adapter/out/repository/thumbnail-generation-ledger.repository.adapter';
import { groupUrlAssetKey } from '../domain/content-asset-key';
import { RegistrationContentWorkspaceRepositoryAdapter } from '../adapter/out/repository/registration-content-workspace.repository.adapter';
import { DetailPageQueryRepositoryAdapter } from '../adapter/out/repository/detail-page-query.repository.adapter';
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
      normalizedTitle: null,
      createdByUserId: null,
    })).rejects.toBeInstanceOf(NotFoundException);

    expect(await prisma.contentWorkspace.count({
      where: { organizationId: TEST_ORGANIZATION_ID, salesProductId: foreignProduct.id },
    })).toBe(0);
  });

  function lifecycleRepository() {
    return new ContentWorkspaceLifecycleRepositoryAdapter(
      prisma as unknown as PrismaService,
      new ChannelListingQueryService(
        new ChannelListingQueryPersistenceAdapter(prisma as never),
        { findForListings: async () => [] },
      ),
      salesProductOwners(),
    );
  }

  function draftWorkspaceInput(salesProductId: string) {
    return {
      organizationId: TEST_ORGANIZATION_ID,
      ownerType: 'sales_product' as const,
      salesProductId,
      channelListingId: null,
      normalizedTitle: null,
      createdByUserId: null,
    };
  }

  it('reuses the one workspace of a draft after the draft is renamed', async () => {
    const product = await prisma.salesProduct.create({
      data: { organizationId: TEST_ORGANIZATION_ID, code: null, name: 'Old name' },
    });
    const repository = lifecycleRepository();

    const first = await repository.ensureActiveWorkspace(draftWorkspaceInput(product.id));
    const renamed = await repository.ensureActiveWorkspace(draftWorkspaceInput(product.id));

    expect(renamed.id).toBe(first.id);
    expect(await prisma.contentWorkspace.count({
      where: { organizationId: TEST_ORGANIZATION_ID, salesProductId: product.id },
    })).toBe(1);
  });

  it('finds a draft workspace by its sales product and never another organization\'s', async () => {
    const product = await prisma.salesProduct.create({
      data: { organizationId: TEST_ORGANIZATION_ID, code: null, name: 'Draft' },
    });
    const foreign = await prisma.salesProduct.create({
      data: { organizationId: OTHER_ORGANIZATION_ID, code: null, name: 'Foreign draft' },
    });
    await prisma.contentWorkspace.create({
      data: {
        organizationId: OTHER_ORGANIZATION_ID,
        ownerType: 'sales_product',
        salesProductId: foreign.id,
      },
    });
    const repository = lifecycleRepository();

    await expect(repository.findActiveSalesProductWorkspaceId({
      organizationId: TEST_ORGANIZATION_ID, salesProductId: product.id,
    })).resolves.toBeNull();
    const created = await repository.ensureActiveWorkspace(draftWorkspaceInput(product.id));
    await expect(repository.findActiveSalesProductWorkspaceId({
      organizationId: TEST_ORGANIZATION_ID, salesProductId: product.id,
    })).resolves.toBe(created.id);
    await expect(repository.findActiveSalesProductWorkspaceId({
      organizationId: TEST_ORGANIZATION_ID, salesProductId: foreign.id,
    })).resolves.toBeNull();
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

  /** KID-321: 등록 대상이 고른 상세 revision 렌더는 그 작업공간 · 조직의 살아 있는 artifact revision 만 읽는다. */
  it('reads a chosen detail revision only from the workspace and organization that own it', async () => {
    const detailPages = new DetailPageQueryRepositoryAdapter(prisma as unknown as PrismaService, {} as never);
    const workspace = async (organizationId: string, title: string) => {
      const row = await prisma.contentWorkspace.create({
        data: { organizationId, ownerType: 'direct_detail_page', displayName: title, normalizedTitle: `${title}-${randomUUID()}` },
      });
      const artifact = await prisma.detailPageArtifact.create({ data: { organizationId, contentWorkspaceId: row.id, title } });
      const revision = await prisma.detailPageRevision.create({ data: { organizationId, artifactId: artifact.id, html: `<p>${title}</p>` } });
      return { id: row.id, artifactId: artifact.id, revisionId: revision.id };
    };
    const mine = await workspace(TEST_ORGANIZATION_ID, 'mine');
    const sibling = await workspace(TEST_ORGANIZATION_ID, 'sibling');
    const foreign = await workspace(OTHER_ORGANIZATION_ID, 'foreign');
    const read = (contentWorkspaceId: string, revisionId: string, organizationId = TEST_ORGANIZATION_ID) =>
      detailPages.findWorkspaceDetailPageRevisionHtml({ organizationId, contentWorkspaceId, revisionId });

    await expect(read(mine.id, mine.revisionId)).resolves.toMatchObject({ revisionId: mine.revisionId, artifactId: mine.artifactId, html: '<p>mine</p>' });
    await expect(read(mine.id, sibling.revisionId)).resolves.toBeNull();
    await expect(read(mine.id, foreign.revisionId)).resolves.toBeNull();
    await expect(read(foreign.id, foreign.revisionId)).resolves.toBeNull();
    await prisma.detailPageArtifact.update({ where: { id: mine.artifactId }, data: { isDeleted: true } });
    await expect(read(mine.id, mine.revisionId)).resolves.toBeNull();
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
    const foreignRevision = await prisma.detailPageRevision.create({
      data: {
        organizationId: OTHER_ORGANIZATION_ID,
        artifactId: foreignArtifact.id,
        html: '<p>foreign</p>',
      },
    });
    const localCandidate = await prisma.sourceRecord.create({
      data: {
        organizationId: TEST_ORGANIZATION_ID,
        sourceUrl: `https://example.com/candidate/${randomUUID()}`,
        sourcePlatform: 'ALIBABA_1688',
        sourceIdentityHash: randomUUID(),
        rawData: {},
        name: 'Local preparation candidate',
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
        sourceRecordId: localCandidate.id,
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
        selectedThumbnailAssetId: null,
        selectedDetailPageRevisionId: foreignRevision.id,
      });
      return tx.registrationTarget.create({
        data: {
          organizationId: TEST_ORGANIZATION_ID,
          salesProductId: localProduct.id,
          channelAccountId: localAccount.id,
          registrationInput: {},
          ...selections,
        },
      });
    })).rejects.toThrow('Selected detail revision is not source-owned.');

    expect(await prisma.registrationTarget.count({
      where: { organizationId: TEST_ORGANIZATION_ID },
    })).toBe(0);
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

  it('deletes an unreferenced asset while protecting the representative image, and rejects a foreign pointer', async () => {
    const assetRepository = new ContentAssetLibraryRepositoryAdapter(
      prisma as unknown as PrismaService,
    );
    const workspace = await prisma.contentWorkspace.create({
      data: { organizationId: TEST_ORGANIZATION_ID, ownerType: 'sales_product', salesProductId: randomUUID() },
    });
    const [spareAsset, currentAsset] = await Promise.all(['spare', 'current'].map((name) => prisma.contentAsset.create({
      data: {
        organizationId: TEST_ORGANIZATION_ID,
        contentWorkspaceId: workspace.id,
        source: 'upload',
        assetKey: `tenancy-${name}:${workspace.id}`,
        url: `https://cdn.example.com/${name}.png`,
        role: 'thumbnail',
      },
    })));
    await prisma.contentWorkspace.update({
      where: { id: workspace.id },
      data: { currentThumbnailAssetId: currentAsset!.id },
    });

    await expect(assetRepository.deleteAsset({
      organizationId: TEST_ORGANIZATION_ID,
      contentAssetId: spareAsset!.id,
      deletedAt: new Date('2026-07-13T01:00:00.000Z'),
    })).resolves.toEqual({ status: 'deleted' });
    await expect(assetRepository.deleteAsset({
      organizationId: TEST_ORGANIZATION_ID,
      contentAssetId: currentAsset!.id,
      deletedAt: new Date('2026-07-13T01:00:00.000Z'),
    })).resolves.toEqual({ status: 'in_use' });
    await expect(assetRepository.deleteAsset({
      organizationId: OTHER_ORGANIZATION_ID,
      contentAssetId: currentAsset!.id,
      deletedAt: new Date('2026-07-13T01:00:00.000Z'),
    })).resolves.toEqual({ status: 'not_found' });

    // 다른 조직의 워크스페이스가 이 자산을 대표이미지로 가리킬 수 없다(복합 FK).
    const foreignWorkspace = await prisma.contentWorkspace.create({
      data: { organizationId: OTHER_ORGANIZATION_ID, ownerType: 'sales_product', salesProductId: randomUUID() },
    });
    await expect(prisma.contentWorkspace.update({
      where: { id: foreignWorkspace.id },
      data: { currentThumbnailAssetId: currentAsset!.id },
    })).rejects.toMatchObject({ code: 'P2003' });
  });
});
