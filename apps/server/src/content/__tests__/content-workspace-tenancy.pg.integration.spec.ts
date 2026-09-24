import { realRegistrationStates } from '../../test-helpers/registration-state';
import { randomUUID } from 'node:crypto';
import { NotFoundException } from '@nestjs/common';
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
import { RegistrationContentWorkspaceRepositoryAdapter } from '../adapter/out/repository/registration-content-workspace.repository.adapter';
import { DetailPageRepositoryAdapter } from '../adapter/out/repository/detail-page.repository.adapter';
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
    registrationContent = new RegistrationContentWorkspaceRepositoryAdapter(
      prisma as unknown as PrismaService,
      new DetailPageRepositoryAdapter(prisma as unknown as PrismaService),
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
        { findForListings: async () => [] }, realRegistrationStates(prisma as never),),
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
        { findForListings: async () => [] }, realRegistrationStates(prisma as never),),
      salesProductOwners(),
    );
  }

  // 판매 상품 작업공간은 이름을 갖지 않는다 — 상품 이름이 바뀌어도 같은 작업공간이다.
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
        normalizedTitle: 'foreigndetailpage',
      },
    });
    const foreignPage = await prisma.detailPage.create({
      data: { organizationId: OTHER_ORGANIZATION_ID, contentWorkspaceId: foreignWorkspace.id, source: 'manual', title: 'Foreign detail page' },
    });
    const foreignRevision = await prisma.detailPageRevision.create({
      data: { organizationId: OTHER_ORGANIZATION_ID, detailPageId: foreignPage.id, html: '<p>foreign</p>' },
    });

    await expect(prisma.contentWorkspace.create({
      data: {
        organizationId: TEST_ORGANIZATION_ID,
        ownerType: 'direct_detail_page',
        currentDetailPageRevisionId: foreignRevision.id,
        normalizedTitle: 'crosstenantcurrentcontent',
      },
    })).rejects.toMatchObject({ code: 'P2003' });

    expect(await prisma.contentWorkspace.count({
      where: { organizationId: TEST_ORGANIZATION_ID },
    })).toBe(0);
  });

  /** KID-321 · W3b: 몰 상세 렌더는 그 작업공간 · 조직의 살아 있는 상세 페이지 revision 만 읽는다. */
  it('reads a chosen detail revision only from the workspace and organization that own it', async () => {
    const detailPages = new DetailPageRepositoryAdapter(prisma as unknown as PrismaService);
    const workspace = async (organizationId: string, title: string) => {
      const row = await prisma.contentWorkspace.create({
        data: { organizationId, ownerType: 'direct_detail_page', normalizedTitle: `${title}-${randomUUID()}` },
      });
      const page = await prisma.detailPage.create({ data: { organizationId, contentWorkspaceId: row.id, source: 'manual', title } });
      const revision = await prisma.detailPageRevision.create({ data: { organizationId, detailPageId: page.id, html: `<p>${title}</p>` } });
      await prisma.contentWorkspace.update({ where: { id: row.id }, data: { currentDetailPageRevisionId: revision.id } });
      return { id: row.id, detailPageId: page.id, revisionId: revision.id };
    };
    const mine = await workspace(TEST_ORGANIZATION_ID, 'mine');
    const sibling = await workspace(TEST_ORGANIZATION_ID, 'sibling');
    const foreign = await workspace(OTHER_ORGANIZATION_ID, 'foreign');
    const read = (contentWorkspaceId: string, revisionId: string | null, organizationId = TEST_ORGANIZATION_ID) =>
      detailPages.findWorkspaceRevision({ organizationId, contentWorkspaceId, revisionId });

    await expect(read(mine.id, mine.revisionId)).resolves.toMatchObject({ id: mine.revisionId, detailPageId: mine.detailPageId, html: '<p>mine</p>' });
    await expect(read(mine.id, null)).resolves.toMatchObject({ id: mine.revisionId });
    await expect(read(mine.id, sibling.revisionId)).resolves.toBeNull();
    await expect(read(mine.id, foreign.revisionId)).resolves.toBeNull();
    await expect(read(foreign.id, foreign.revisionId)).resolves.toBeNull();
    await prisma.detailPage.update({ where: { id: mine.detailPageId }, data: { isDeleted: true } });
    await expect(read(mine.id, mine.revisionId)).resolves.toBeNull();
  });

  it('rejects a preparation selection that points at another organization', async () => {
    const foreignWorkspace = await prisma.contentWorkspace.create({
      data: {
        organizationId: OTHER_ORGANIZATION_ID,
        ownerType: 'direct_detail_page',
        normalizedTitle: 'foreignselecteddetailpage',
      },
    });
    const foreignPage = await prisma.detailPage.create({
      data: { organizationId: OTHER_ORGANIZATION_ID, contentWorkspaceId: foreignWorkspace.id, source: 'manual', title: 'Foreign selected detail page' },
    });
    const foreignRevision = await prisma.detailPageRevision.create({
      data: {
        organizationId: OTHER_ORGANIZATION_ID,
        detailPageId: foreignPage.id,
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
    })).rejects.toMatchObject({ code: 'CONTENT_SELECTION_INVALID', details: { reason: 'DETAIL_REVISION_NOT_OWNED' } });

    expect(await prisma.registrationTarget.count({
      where: { organizationId: TEST_ORGANIZATION_ID },
    })).toBe(0);
  });

  it('serializes thumbnail adoption against job deletion and reports an explicit conflict', async () => {
    const workspace = await prisma.contentWorkspace.create({
      data: { organizationId: TEST_ORGANIZATION_ID, ownerType: 'sales_product', salesProductId: randomUUID() },
    });
    const generation = await prisma.thumbnailGeneration.create({
      data: { organizationId: TEST_ORGANIZATION_ID, contentWorkspaceId: workspace.id, status: 'succeeded' },
    });
    const candidate = await prisma.contentAsset.create({
      data: {
        organizationId: TEST_ORGANIZATION_ID,
        contentWorkspaceId: workspace.id,
        source: 'ai',
        thumbnailGenerationId: generation.id,
        assetKey: `ai-candidate:${generation.id}:0`,
        url: 'https://cdn.example.com/adoption-lock.png',
        role: 'thumbnail',
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
    const prismaWithPausedAssetLock = {
      $transaction: <T>(callback: (tx: Prisma.TransactionClient) => Promise<T>) =>
        prisma.$transaction(async (tx) => callback(new Proxy(tx, {
          get(target, property, receiver) {
            if (property !== '$queryRaw') return Reflect.get(target, property, receiver);
            return async <R>(query: Prisma.Sql): Promise<R> => {
              const rows = await tx.$queryRaw<R>(query);
              rawCallCount += 1;
              // Adoption locks its workspace, then the adopted asset. Pause
              // once both are held so the job deletion must wait on the asset.
              if (rawCallCount === 2) {
                signalLocked();
                await released;
              }
              return rows;
            };
          },
        }))),
    };
    const adoptingAssets = new ContentAssetLibraryRepositoryAdapter(
      prismaWithPausedAssetLock as unknown as PrismaService,
    );
    const ledger = new ThumbnailGenerationLedgerRepositoryAdapter(
      prisma as unknown as PrismaService,
      {} as never, makeChannelListingQuery(prisma), makeChannelRecipes(prisma));

    const adoption = adoptingAssets.setCurrentThumbnail({
      organizationId: TEST_ORGANIZATION_ID,
      contentWorkspaceId: workspace.id,
      assetId: candidate.id,
    });
    await locked;
    const deletion = ledger.deleteGeneration(generation.id, TEST_ORGANIZATION_ID);
    const deletionState = await Promise.race([
      deletion.then(() => 'settled', () => 'settled'),
      new Promise<string>((resolve) => setTimeout(() => resolve('blocked'), 100)),
    ]);

    releaseLock();
    await adoption;
    await expect(deletion).rejects.toMatchObject({ code: 'CONTENT_ASSET_IN_USE', details: { reason: 'ADOPTED_REPRESENTATIVE_IMAGE' } });
    expect(deletionState).toBe('blocked');
    await expect(prisma.thumbnailGeneration.findUniqueOrThrow({
      where: { id: generation.id },
      select: { isDeleted: true, status: true },
    })).resolves.toEqual({ isDeleted: false, status: 'succeeded' });
    await expect(prisma.contentAsset.findUniqueOrThrow({ where: { id: candidate.id } }))
      .resolves.toMatchObject({ isDeleted: false });
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
