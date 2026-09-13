import { randomUUID } from 'node:crypto';
import { type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  makeTestPrisma,
  resetDb,
  seedBaseFixture,
  TEST_ORGANIZATION_ID as ORG,
  TEST_USER_ID as USER,
} from '../../test-helpers/real-prisma';
import { seedActiveSellpiaInventorySku } from '../../test-helpers/inventory-seeds';
import { readProductSaleAgeEvidence } from '../../common/product-sale-age';
import { ChannelCatalogCollectionController } from '../adapter/in/http/channel-catalog-collection.controller';
import {
  ChannelCatalogCollectionService,
  hashCatalogChunkPayload,
} from '../application/service/channel-catalog-collection.service';
import { ChannelCatalogCollectionRepositoryAdapter } from '../adapter/out/repository/channel-catalog-collection.repository.adapter';
import { ChannelCatalogPublicationRepositoryAdapter } from '../adapter/out/repository/channel-catalog-publication.repository.adapter';
import { AiCatalogMediaPublicationRepositoryAdapter } from '../../ai/adapter/out/repository/ai-catalog-media-publication.repository.adapter';
import { CHANNEL_CATALOG_COLLECTION_PORT } from '../application/port/in/channel-catalog-collection.port';
import { SourceFailureAlerts } from '../../alerts/alerts.service';
import { ChannelListingQueryService } from '../application/service/channel-listing-query.service';
import { ChannelListingRepositoryAdapter } from '../adapter/out/repository/channel-listing.repository.adapter';
import { ChannelCatalogImportService } from '../application/service/channel-catalog-import.service';
import { ChannelCatalogImportRepositoryAdapter } from '../adapter/out/repository/channel-catalog-import.repository.adapter';
import { ChannelProductMatchingRepositoryAdapter } from '../adapter/out/repository/channel-product-matching.repository.adapter';
import { lockChannelListingRow } from '../adapter/out/repository/channel-listing-row-lock';
import { SellpiaManualMatchRepositoryAdapter } from '../adapter/out/repository/sellpia-manual-match.repository.adapter';
import { lockProductMapping } from '../../common/product-mapping-generation';
import type { PrismaClient } from '@prisma/client';
import type {
  CoupangCatalogCollectionPermit,
  PutCoupangCatalogChunkRequest,
} from '@kiditem/shared/coupang-catalog-snapshot';
import {
  PRODUCT_ABC_ABSOLUTE_CURRENT_PAYLOAD,
  productAbcSaleAgeDays,
} from '@kiditem/shared/product-abc';
import type { SellpiaManualMatchSnapshot } from '@kiditem/shared/sellpia-manual-match';

const ACCOUNT = '11111111-1111-4111-8111-111111111111';
const OTHER_ACCOUNT = '22222222-2222-4222-8222-222222222222';
const MANUAL_MATCH_SKU_ID = '26000000-0000-4000-8000-000000000003';
const MANUAL_MATCH_SKU_CODE = '6402-1';
const base = `/api/channels/accounts/${ACCOUNT}/catalog-imports/coupang-wing/attempts`;
describe('Wing catalog owner HTTP + disposable PG', () => {
  let prisma: PrismaClient;
  let app: INestApplication;
  let httpUrl: string;
  let alerts: SourceFailureAlerts;
  let listings: ChannelListingQueryService;
  let matching: ChannelProductMatchingRepositoryAdapter;
  let manualMatch: SellpiaManualMatchRepositoryAdapter;
  let expireAfterCatalogWrite = false;
  beforeAll(async () => {
    prisma = makeTestPrisma().$extends({
      query: {
        async $allOperations({ model, operation, args, query }) {
          const result = await query(args);
          if (expireAfterCatalogWrite && model === 'ChannelListing' && operation === 'updateMany') {
            expireAfterCatalogWrite = false;
            vi.setSystemTime(Date.now() + 25 * 60 * 60 * 1000);
          }
          return result;
        },
      },
    }) as unknown as PrismaClient;
    await prisma.$connect();
    alerts = new SourceFailureAlerts(prisma as never);
    listings = new ChannelListingQueryService(new ChannelListingRepositoryAdapter(prisma as never));
    matching = new ChannelProductMatchingRepositoryAdapter(prisma as never);
    manualMatch = new SellpiaManualMatchRepositoryAdapter(prisma as never, alerts);
    const publisher = new ChannelCatalogPublicationRepositoryAdapter(
      prisma as never,
      new AiCatalogMediaPublicationRepositoryAdapter(),
      alerts,
    );
    const owner = new ChannelCatalogCollectionService(
      new ChannelCatalogCollectionRepositoryAdapter(prisma as never, alerts, publisher),
      publisher,
    );
    const module = await Test.createTestingModule({
      controllers: [ChannelCatalogCollectionController],
      providers: [{ provide: CHANNEL_CATALOG_COLLECTION_PORT, useValue: owner }],
    }).compile();
    app = module.createNestApplication({ logger: false });
    app.setGlobalPrefix('api');
    app.use(
      (
        req: { authUser?: unknown; headers: Record<string, string> },
        _res: unknown,
        next: () => void,
      ) => {
        req.authUser = {
          id: USER,
          organizationId: req.headers['x-test-org'] ?? ORG,
        };
        next();
      },
    );
    await app.init();
    // Keep one real listener for the whole fixture. Passing an unbound
    // HttpServer to supertest makes each request lazily listen/close it; the
    // full integration run can then race that lifecycle between requests.
    await app.listen(0, '127.0.0.1');
    httpUrl = await app.getUrl();
  });
  afterAll(async () => {
    vi.useRealTimers();
    await app?.close();
    await prisma?.$disconnect();
  });
  beforeEach(async () => {
    vi.useRealTimers();
    await resetDb(prisma);
    await seedBaseFixture(prisma);
    await prisma.channelAccount.create({
      data: {
        id: ACCOUNT,
        organizationId: ORG,
        channel: 'coupang',
        name: 'Wing',
        vendorId: 'V1',
      },
    });
    await prisma.channelAccount.create({
      data: {
        id: OTHER_ACCOUNT,
        organizationId: ORG,
        channel: 'coupang',
        name: 'Other Wing',
        vendorId: 'V2',
      },
    });
  });
  const start = (
    key = randomUUID(),
    collectorVersion = 'wing-inventory-v1',
    stage?: 'full' | 'basics' | 'details',
    expectedBasicAttemptId?: string,
  ) =>
    request(httpUrl)
      .post(base)
      .set('Idempotency-Key', key)
      .send({ collectorVersion, ...(stage ? { stage } : {}),
        ...(expectedBasicAttemptId ? { expectedBasicAttemptId } : {}) });
  const read = (id: string) => request(httpUrl).get(`${base}/${id}`).expect(200);
  const fail = (permit: { attemptId: string; attemptToken: string }, code = 'PROVIDER_ERROR') =>
    request(httpUrl)
      .post(`${base}/${permit.attemptId}/fail`)
      .set('x-source-attempt-token', permit.attemptToken)
      .send({ code, message: 'Collection stopped', phase: 'discovery' });
  const visible = () => listings.list(ORG, { channelAccountId: ACCOUNT });
  const upload = (
    permit: CoupangCatalogCollectionPermit,
    payload: PutCoupangCatalogChunkRequest['payload'],
    sequence = 1,
  ) =>
    request(httpUrl)
      .put(`${base}/${permit.attemptId}/chunks/${payload.kind}/${sequence}`)
      .set('x-source-attempt-token', permit.attemptToken)
      .send({
        kind: payload.kind,
        sequence,
        checksum: hashCatalogChunkPayload(payload),
        itemCount: 'items' in payload
          ? payload.items.length
          : 'products' in payload
            ? payload.products.length
            : 1,
        payload,
      });
  const finish = (permit: CoupangCatalogCollectionPermit, snapshotHash: string) =>
    request(httpUrl)
      .post(`${base}/${permit.attemptId}/finalize`)
      .set('x-source-attempt-token', permit.attemptToken)
      .send({ snapshotHash });
  async function stage(id = 'P1') {
    const permit: CoupangCatalogCollectionPermit = (await start().expect(201)).body;
    const manifest = {
      totalItems: 1,
      pageSize: 50,
      expectedPages: 1,
      firstPageFingerprint: 'a'.repeat(64),
    };
    await upload(permit, {
      version: 1,
      kind: 'discovery_page',
      page: 1,
      manifest,
      items: [
        {
          ordinal: 0,
          externalProductId: id,
          registeredName: id,
          primaryImageUrl: null,
          saleStatus: null,
        },
      ],
    }).expect(200);
    await upload(permit, {
      version: 1,
      kind: 'product_details',
      startOrdinal: 0,
      products: [
        {
          ordinal: 0,
          product: {
            externalProductId: id,
            registeredName: id,
            displayName: id,
            category: null,
            manufacturer: null,
            brand: null,
            productStatus: null,
            options: [
              {
                externalOptionId: `${id}-O`,
                optionName: null,
                skuStatus: null,
                salePrice: null,
                sellerSku: null,
                modelNumber: null,
                barcode: null,
                attributes: [],
                media: [],
                raw: {},
              },
            ],
            media: [],
            raw: {},
          },
        },
      ],
    }).expect(200);
    const ready = await upload(permit, {
      version: 1,
      kind: 'manifest_confirmation',
      manifest,
    }).expect(200);
    return { permit, hash: ready.body.snapshotHash as string };
  }
  async function stageBasics(id = 'BASIC-P1', includeSecondOption = false) {
    const permit: CoupangCatalogCollectionPermit = (
      await start(randomUUID(), 'wing-inventory-v1', 'basics').expect(201)
    ).body;
    const manifest = {
      totalItems: 2,
      pageSize: 50,
      expectedPages: 1,
      firstPageFingerprint: 'b'.repeat(64),
    };
    await upload(permit, {
      version: 1,
      kind: 'discovery_page',
      page: 1,
      manifest,
      items: [
        {
          ordinal: 0,
          externalProductId: id,
          registeredName: 'Basic listing',
          primaryImageUrl: null,
          saleStatus: null,
        },
        {
          ordinal: 1,
          externalProductId: `${id}-P2`,
          registeredName: 'Unobserved listing',
          primaryImageUrl: null,
          saleStatus: null,
        },
      ],
    }).expect(200);
    const basicProduct = (
      productId: string,
      optionName: string,
      sellerSku: string,
      includeSecondProductOption = false,
    ) => ({
      externalProductId: productId,
      registeredName: productId === id ? 'Basic listing' : 'Unobserved listing',
      displayName: productId === id ? 'Basic listing' : 'Unobserved listing',
      category: null,
      manufacturer: null,
      brand: null,
      productStatus: null,
      options: [
        {
          externalOptionId: `${productId}-O`,
          vendorItemId: null,
          vendorInventoryItemId: null,
          sellerProductItemId: null,
          skuId: null,
          externalSkuCode: null,
          stock: 0,
          stockQuantity: 0,
          soldOut: false,
          optionName,
          skuStatus: 'ACTIVE',
          salePrice: 100,
          sellerSku,
          modelNumber: null,
          barcode: null,
          attributes: [],
          media: [],
          raw: {},
        },
        ...(includeSecondProductOption
          ? [{
              externalOptionId: `${productId}-O-2`,
              vendorItemId: null,
              vendorInventoryItemId: null,
              sellerProductItemId: null,
              skuId: null,
              externalSkuCode: null,
              stock: 0,
              stockQuantity: 0,
              soldOut: false,
              optionName: 'Red option',
              skuStatus: 'ACTIVE',
              salePrice: 100,
              sellerSku: `${sellerSku}-2`,
              modelNumber: null,
              barcode: null,
              attributes: [],
              media: [],
              raw: {},
            }]
          : []),
      ],
      media: [],
      raw: {},
    });
    await upload(permit, {
      version: 1,
      kind: 'listing_basics',
      startOrdinal: 0,
      products: [
        {
          ordinal: 0,
          product: basicProduct(id, 'Blue option', 'BASIC-SKU', includeSecondOption),
        },
        { ordinal: 1, product: basicProduct(`${id}-P2`, 'Green option', 'BASIC-SKU-2') },
      ],
    }).expect(200);
    const ready = await upload(permit, {
      version: 1,
      kind: 'manifest_confirmation',
      manifest,
    }).expect(200);
    await finish(permit, ready.body.snapshotHash as string).expect(201);
    return { permit, manifest };
  }
  async function startDetails(
    productIds = ['BASIC-P1', 'BASIC-P1-P2'],
    basisManifest = {
      totalItems: 2,
      pageSize: 50,
      expectedPages: 1,
      firstPageFingerprint: 'b'.repeat(64),
    },
    idempotencyKey = randomUUID(),
  ) {
    const permit: CoupangCatalogCollectionPermit = (
      await start(idempotencyKey, 'wing-inventory-v1', 'details').expect(201)
    ).body;
    const manifest = basisManifest;
    await upload(permit, {
      version: 1,
      kind: 'discovery_page',
      page: 1,
      manifest,
      items: productIds.map((id, ordinal) => ({
        ordinal,
        externalProductId: id,
        registeredName: ordinal === 0 ? 'Basic listing' : 'Unobserved listing',
        primaryImageUrl: null,
        saleStatus: null,
      })),
    }).expect(200);
    return { permit, manifest };
  }
  async function publishOneDetailChunk(
    permit: CoupangCatalogCollectionPermit,
    raw: Record<string, unknown> = {},
    productId = 'BASIC-P1',
    sequence = 1,
  ) {
    await upload(permit, {
      version: 1,
      kind: 'full_details',
      startOrdinal: sequence - 1,
      products: [{
        ordinal: sequence - 1,
        product: {
          externalProductId: productId,
          options: [{
            externalOptionId: `${productId}-O`,
            vendorItemId: 'VENDOR-ITEM-1',
            sellerProductItemId: null,
            documentIds: [],
            raw: {},
          }],
          documents: [],
          media: [],
          raw,
        },
      }],
    }, sequence).expect(200);
  }
  async function publishAggregateDetailChunk(permit: CoupangCatalogCollectionPermit) {
    const optionIds = ['BASIC-P1-O', 'BASIC-P1-O-2'];
    const media = optionIds.flatMap((externalOptionId, optionIndex) =>
      Array.from({ length: 60 }, (_, mediaIndex) => ({
        sourceUrl: `https://example.com/BASIC-P1/detail-${optionIndex + 1}-${mediaIndex + 1}.jpg`,
        role: 'detail' as const,
        sortOrder: optionIndex * 60 + mediaIndex,
        externalOptionIds: [externalOptionId],
      })),
    );
    await upload(permit, {
      version: 1,
      kind: 'full_details',
      startOrdinal: 0,
      products: [{
        ordinal: 0,
        product: {
          externalProductId: 'BASIC-P1',
          options: optionIds.map((externalOptionId, optionIndex) => ({
            externalOptionId,
            vendorItemId: `VENDOR-ITEM-${optionIndex + 1}`,
            sellerProductItemId: null,
            documentIds: [],
            raw: {},
          })),
          documents: [],
          media,
          raw: {},
        },
      }],
    }).expect(200);
  }
  async function detailReceipts(attemptId: string) {
    const staging = await prisma.channelScrapeRun.findFirstOrThrow({
      where: {
        organizationId: ORG,
        channelAccountId: ACCOUNT,
        sourceImportRunId: attemptId,
        source: 'coupang_wing_catalog_browser',
      },
      select: { id: true },
    });
    return prisma.channelScrapeChunk.findMany({
      where: {
        organizationId: ORG,
        scrapeRunId: staging.id,
        kind: 'full_details',
      },
      orderBy: { sequence: 'asc' },
      select: { id: true, publishedAt: true, publicationJson: true },
    });
  }
  async function channelListingMediaAssets(externalId = 'BASIC-P1') {
    const listing = await prisma.channelListing.findFirstOrThrow({
      where: { organizationId: ORG, channelAccountId: ACCOUNT, externalId },
      select: { id: true },
    });
    const workspace = await prisma.contentWorkspace.findFirstOrThrow({
      where: {
        organizationId: ORG,
        channelListingId: listing.id,
        ownerType: 'channel_listing',
        status: 'active',
        isDeleted: false,
      },
      select: {
        contentGenerationGroups: {
          where: { groupType: 'workspace_assets' },
          select: { id: true },
        },
      },
    });
    return prisma.contentAsset.findMany({
      where: {
        organizationId: ORG,
        originGenerationGroupId: { in: workspace.contentGenerationGroups.map((group) => group.id) },
      },
      orderBy: { url: 'asc' },
      select: { id: true, url: true, role: true, sortOrder: true, metadata: true, isDeleted: true },
    });
  }
  async function expectBasicsConsumers(id = 'BASIC-P1') {
    const available = await matching.listAvailabilityRows(ORG, { channelAccountId: ACCOUNT });
    expect(available).toEqual(expect.arrayContaining([
      expect.objectContaining({
        listing: expect.objectContaining({ externalId: id, displayName: 'Basic listing' }),
        option: expect.objectContaining({
          externalOptionId: `${id}-O`,
          itemName: 'Blue option',
        }),
      }),
    ]));
    const listing = await prisma.channelListing.findFirstOrThrow({
      where: { organizationId: ORG, channelAccountId: ACCOUNT, externalId: id },
      select: { id: true },
    });
    await prisma.$transaction(async (tx) => {
      await expect(lockChannelListingRow(tx, {
        organizationId: ORG,
        channelListingId: listing.id,
        activeOnly: true,
        catalogMatchingEligibleOnly: true,
      })).resolves.toMatchObject({ id: listing.id });
    });

    await seedActiveSellpiaInventorySku(prisma, {
      id: MANUAL_MATCH_SKU_ID,
      organizationId: ORG,
      code: MANUAL_MATCH_SKU_CODE,
      name: 'Manual match SKU',
      currentStock: 10,
    });
    const attempt = await manualMatch.beginAttempt({
      organizationId: ORG,
      idempotencyKey: randomUUID(),
    });
    const snapshot: SellpiaManualMatchSnapshot = {
      source: 'sellpia_product_manual_match',
      version: 1,
      targetCount: 1,
      targetCodes: [MANUAL_MATCH_SKU_CODE],
      rowCount: 1,
      rows: [{
        productCode: MANUAL_MATCH_SKU_CODE,
        aliasTitle: 'Basic listing:Blue option',
        itemCount: 1,
        matchedType: 'M',
        evidenceCount: 1,
      }],
    };
    await manualMatch.completeAttempt({
      organizationId: ORG,
      attemptId: attempt.attemptId,
      attemptToken: attempt.attemptToken,
      snapshot,
    });
    await expect(prisma.sellpiaManualMatchAlias.findMany({
      where: { organizationId: ORG },
      select: { aliasTitle: true, sellpiaInventorySkuId: true },
    })).resolves.toEqual([{
      aliasTitle: 'Basic listing:Blue option',
      sellpiaInventorySkuId: MANUAL_MATCH_SKU_ID,
    }]);
  }
  it('keeps the completed basics snapshot consumable during a running partial details attempt', async () => {
    const basics = await stageBasics();
    const details = await startDetails(undefined, basics.manifest);
    await publishOneDetailChunk(details.permit);
    const firstStatus = (await read(details.permit.attemptId)).body;
    const firstReceipts = await detailReceipts(details.permit.attemptId);
    expect(firstReceipts).toHaveLength(1);
    expect(firstReceipts[0]?.publishedAt).toBeInstanceOf(Date);
    const publishedAt = firstReceipts[0]!.publishedAt!.toISOString();
    expect(firstStatus).toMatchObject({
      state: 'RUNNING',
      missing: { productIds: ['BASIC-P1-P2'] },
      progress: {
        publishedProducts: 1,
        publishedOptionCount: 1,
        publishedMediaCount: 0,
        publishedChunks: 1,
        firstPublishedAt: publishedAt,
        lastPublishedAt: publishedAt,
      },
    });
    await publishOneDetailChunk(details.permit);
    await expect(detailReceipts(details.permit.attemptId)).resolves.toEqual(firstReceipts);
    await expect(read(details.permit.attemptId)).resolves.toMatchObject({ body: {
      progress: firstStatus.progress,
    } });
    await expect(prisma.channelListingOption.findFirst({
      where: { organizationId: ORG, externalOptionId: 'BASIC-P1-O' },
      select: { lastImportRunId: true },
    })).resolves.toMatchObject({ lastImportRunId: details.permit.attemptId });
    await expect(prisma.channelListingOption.findFirst({
      where: { organizationId: ORG, externalOptionId: 'BASIC-P1-P2-O' },
      select: { lastImportRunId: true },
    })).resolves.toMatchObject({ lastImportRunId: basics.permit.attemptId });
    await expectBasicsConsumers();
  });
  it('preallocates a details key on basics and admits exactly one child for the pinned basis', async () => {
    const basics = await stageBasics();
    expect(basics.permit.plan).toMatchObject({
      stage: 'basics',
      rootAttemptId: basics.permit.attemptId,
      detailsIdempotencyKey: expect.any(String),
    });

    const wrongBasis = randomUUID();
    await start(randomUUID(), 'wing-inventory-v1', 'details', wrongBasis).expect(409);

    const childKey = basics.permit.plan.detailsIdempotencyKey as string;
    const child = await start(childKey, 'wing-inventory-v1', 'details', basics.permit.attemptId)
      .expect(201);
    expect(child.body).toMatchObject({
      state: 'RUNNING',
      plan: {
        stage: 'details',
        rootAttemptId: basics.permit.attemptId,
        basicAttemptId: basics.permit.attemptId,
      },
    });
    expect(child.body.attemptId).not.toBe(basics.permit.attemptId);

    await expect(
      start(childKey, 'wing-inventory-v1', 'details', basics.permit.attemptId),
    ).resolves.toMatchObject({ status: 201, body: child.body });
    await expect(read(basics.permit.attemptId)).resolves.toMatchObject({ body: {
      attemptId: basics.permit.attemptId,
      rootAttemptId: basics.permit.attemptId,
      currentAttemptId: child.body.attemptId,
      currentStage: 'details',
      overallState: 'RUNNING',
    } });
  });
  it('projects a failed details child onto the root status after the extension is unavailable', async () => {
    const basics = await stageBasics();
    const childKey = basics.permit.plan.detailsIdempotencyKey as string;
    const child = await startDetails(undefined, basics.manifest, childKey);
    await fail(child.permit).expect(201);

    await expect(read(basics.permit.attemptId)).resolves.toMatchObject({ body: {
      state: 'COMPLETE',
      rootAttemptId: basics.permit.attemptId,
      currentAttemptId: child.permit.attemptId,
      currentStage: 'details',
      overallState: 'FAILED',
    } });
  });
  it('projects a completed details child onto the root status after the extension is unavailable', async () => {
    const basics = await stageBasics();
    const childKey = basics.permit.plan.detailsIdempotencyKey as string;
    const child = await startDetails(undefined, basics.manifest, childKey);
    await publishOneDetailChunk(child.permit, {}, 'BASIC-P1', 1);
    await publishOneDetailChunk(child.permit, {}, 'BASIC-P1-P2', 2);
    await upload(child.permit, {
      version: 1,
      kind: 'detail_manifest_confirmation',
      manifest: child.manifest,
      basicAttemptId: basics.permit.attemptId,
      basicManifestHash: child.permit.plan.basicManifestHash!,
    }).expect(200);
    const ready = await read(child.permit.attemptId);
    await finish(child.permit, ready.body.snapshotHash as string).expect(201);

    await expect(read(basics.permit.attemptId)).resolves.toMatchObject({ body: {
      state: 'COMPLETE',
      rootAttemptId: basics.permit.attemptId,
      currentAttemptId: child.permit.attemptId,
      currentStage: 'details',
      overallState: 'COMPLETE',
    } });
  });
  it('marks an unadmitted details handoff failed after the completed basics owner expires', async () => {
    const basics = await stageBasics();
    await prisma.sourceImportRun.update({
      where: { id: basics.permit.attemptId, organizationId: ORG },
      data: { expiresAt: new Date(Date.now() - 1) },
    });

    await expect(read(basics.permit.attemptId)).resolves.toMatchObject({ body: {
      state: 'COMPLETE',
      rootAttemptId: basics.permit.attemptId,
      currentAttemptId: basics.permit.attemptId,
      currentStage: 'basics',
      overallState: 'FAILED',
    } });
  });
  it('does not project a details child whose root identity does not match the basics owner', async () => {
    const basics = await stageBasics();
    const childKey = basics.permit.plan.detailsIdempotencyKey as string;
    const child = await startDetails(undefined, basics.manifest, childKey);
    const childPlan = child.permit.plan as Record<string, unknown>;
    await prisma.sourceImportRun.update({
      where: { id: child.permit.attemptId, organizationId: ORG },
      data: { plan: { ...childPlan, rootAttemptId: randomUUID() } },
    });

    await expect(read(basics.permit.attemptId)).resolves.toMatchObject({ body: {
      currentAttemptId: basics.permit.attemptId,
      currentStage: 'basics',
      overallState: 'RUNNING',
    } });
  });
  it('does not project a details child owned by another channel account', async () => {
    const basics = await stageBasics();
    const childKey = basics.permit.plan.detailsIdempotencyKey as string;
    const child = await startDetails(undefined, basics.manifest, childKey);
    await prisma.sourceImportRun.update({
      where: { id: child.permit.attemptId, organizationId: ORG },
      data: { channelAccountId: OTHER_ACCOUNT },
    });

    await expect(read(basics.permit.attemptId)).resolves.toMatchObject({ body: {
      currentAttemptId: basics.permit.attemptId,
      currentStage: 'basics',
      overallState: 'RUNNING',
    } });
  });
  it('keeps the completed basics snapshot consumable after a failed details attempt', async () => {
    const basics = await stageBasics();
    const details = await startDetails(undefined, basics.manifest);
    await publishOneDetailChunk(details.permit);
    const firstReceipts = await detailReceipts(details.permit.attemptId);
    expect(firstReceipts).toHaveLength(1);
    expect(firstReceipts[0]?.publishedAt).toBeInstanceOf(Date);
    const publishedAt = firstReceipts[0]!.publishedAt!.toISOString();
    await fail(details.permit).expect(201);
    expect((await read(details.permit.attemptId)).body).toMatchObject({
      state: 'FAILED',
      missing: { productIds: ['BASIC-P1-P2'] },
      progress: {
        publishedProducts: 1,
        publishedOptionCount: 1,
        publishedMediaCount: 0,
        publishedChunks: 1,
        firstPublishedAt: publishedAt,
        lastPublishedAt: publishedAt,
      },
    });
    await expect(detailReceipts(details.permit.attemptId)).resolves.toEqual(firstReceipts);
    await expect(prisma.channelListingOption.findFirst({
      where: { organizationId: ORG, externalOptionId: 'BASIC-P1-O' },
      select: { lastImportRunId: true },
    })).resolves.toMatchObject({ lastImportRunId: details.permit.attemptId });
    await expect(prisma.channelListingOption.findFirst({
      where: { organizationId: ORG, externalOptionId: 'BASIC-P1-P2-O' },
      select: { lastImportRunId: true },
    })).resolves.toMatchObject({ lastImportRunId: basics.permit.attemptId });
    await expectBasicsConsumers();
  });
  it('publishes aggregate detail media across option owners and replays it exactly', async () => {
    const basics = await stageBasics('BASIC-P1', true);
    const details = await startDetails(undefined, basics.manifest);
    await publishAggregateDetailChunk(details.permit);

    const status = (await read(details.permit.attemptId)).body;
    const receipts = await detailReceipts(details.permit.attemptId);
    expect(receipts).toHaveLength(1);
    expect(receipts[0]?.publishedAt).toBeInstanceOf(Date);
    const publishedAt = receipts[0]!.publishedAt!.toISOString();
    expect(status).toMatchObject({
      state: 'RUNNING',
      missing: { productIds: ['BASIC-P1-P2'] },
      progress: {
        publishedProducts: 1,
        publishedOptionCount: 2,
        publishedMediaCount: 120,
        publishedChunks: 1,
        firstPublishedAt: publishedAt,
        lastPublishedAt: publishedAt,
      },
    });

    const assets = await channelListingMediaAssets();
    expect(assets).toHaveLength(120);
    expect(assets.every((asset) => asset.role === 'detail' && !asset.isDeleted)).toBe(true);
    expect(new Set(assets.map((asset) => asset.url)).size).toBe(120);
    const associationCounts = new Map<string, number>();
    for (const asset of assets) {
      const metadata = asset.metadata as {
        externalOptionIds?: unknown;
        sourceImportRunId?: unknown;
      };
      expect(metadata.sourceImportRunId).toBe(details.permit.attemptId);
      const optionIds = Array.isArray(metadata.externalOptionIds)
        ? metadata.externalOptionIds.filter((value): value is string => typeof value === 'string')
        : [];
      expect(optionIds).toHaveLength(1);
      associationCounts.set(optionIds[0]!, (associationCounts.get(optionIds[0]!) ?? 0) + 1);
    }
    expect(associationCounts).toEqual(new Map([
      ['BASIC-P1-O', 60],
      ['BASIC-P1-O-2', 60],
    ]));

    await publishAggregateDetailChunk(details.permit);
    await expect(detailReceipts(details.permit.attemptId)).resolves.toEqual(receipts);
    await expect(channelListingMediaAssets()).resolves.toEqual(assets);
    await expect(read(details.permit.attemptId)).resolves.toMatchObject({ body: {
      progress: status.progress,
    } });
  });
  it('carries staged Wing sale age through detail publication and a later basics refresh', async () => {
    const basics = await stageBasics();
    const details = await startDetails(undefined, basics.manifest);
    await publishOneDetailChunk(details.permit, {
      saleStartedAt: '2026-04-01T14:41:57',
    });
    await expect(prisma.channelListing.findFirstOrThrow({
      where: { organizationId: ORG, channelAccountId: ACCOUNT, externalId: 'BASIC-P1' },
      select: { rawJson: true },
    })).resolves.toMatchObject({
      rawJson: {
        source: 'coupang_catalog_details',
        saleStartedAt: '2026-04-01T14:41:57',
      },
    });

    const master = await prisma.masterProduct.create({
      data: {
        organizationId: ORG,
        code: `SALE-AGE-${randomUUID()}`,
        name: 'Sale age regression product',
      },
    });
    const skuSeed = {
      id: randomUUID(),
      organizationId: ORG,
      masterProductId: master.id,
      code: `SALE-AGE-SKU-${randomUUID()}`,
      name: master.name,
      currentStock: 10,
    };
    await seedActiveSellpiaInventorySku(prisma, skuSeed);
    const option = await prisma.channelListingOption.findFirstOrThrow({
      where: { organizationId: ORG, externalOptionId: 'BASIC-P1-O' },
      select: { id: true },
    });
    await prisma.channelListingOptionInventoryComponent.create({
      data: {
        organizationId: ORG,
        channelListingOptionId: option.id,
        sellpiaInventorySkuId: skuSeed.id,
        quantity: 1,
      },
    });

    const beforeRefresh = await readProductSaleAgeEvidence(
      prisma as never,
      ORG,
      [master.id],
      '2026-09-01',
    );
    expect(beforeRefresh).toEqual([{
      masterProductId: master.id,
      mappingValid: true,
      saleStartDate: '2026-04-01',
    }]);
    expect(productAbcSaleAgeDays(
      beforeRefresh[0]!.saleStartDate,
      '2026-09-01',
    )).toBeGreaterThanOrEqual(PRODUCT_ABC_ABSOLUTE_CURRENT_PAYLOAD.minimumSaleAgeDays);

    await stageBasics();
    await expect(prisma.channelListing.findFirstOrThrow({
      where: { organizationId: ORG, channelAccountId: ACCOUNT, externalId: 'BASIC-P1' },
      select: { rawJson: true },
    })).resolves.toMatchObject({
      rawJson: {
        source: 'coupang_catalog_basics',
        saleStartedAt: '2026-04-01T14:41:57',
      },
    });
    await expect(readProductSaleAgeEvidence(
      prisma as never,
      ORG,
      [master.id],
      '2026-09-01',
    )).resolves.toEqual([{
      masterProductId: master.id,
      mappingValid: true,
      saleStartDate: '2026-04-01',
    }]);
  });
  it('replays the exact frozen permit and exposes safe status without a token', async () => {
    const key = randomUUID();
    const admitted = await start(key).expect(201);
    expect(admitted.body).toMatchObject({
      state: 'RUNNING',
      plan: { vendorId: 'V1', publicationRevision: '0' },
    });
    expect(admitted.body.attemptToken).toEqual(expect.any(String));
    expect((await start(key).expect(201)).body).toEqual(admitted.body);
    const status = await request(httpUrl)
      .get(`${base}/${admitted.body.attemptId}`)
      .expect(200);
    expect(status.body).toMatchObject({
      attemptId: admitted.body.attemptId,
      state: 'RUNNING',
    });
    expect(status.body).not.toHaveProperty('attemptToken');
    expect(status.body).not.toHaveProperty('status');
    await start(key, 'changed').expect(409);
    await start().expect(409);
  });
  it('returns the active owner identity with ATTEMPT_IN_PROGRESS when a different key begins', async () => {
    const active = (await start().expect(201)).body;
    const conflict = await start().expect(409);
    expect(conflict.body).toMatchObject({
      code: 'ATTEMPT_IN_PROGRESS',
      attemptId: active.attemptId,
      message: expect.stringContaining(active.attemptId),
    });
    expect(conflict.body).not.toHaveProperty('attemptToken');
    expect((await read(active.attemptId)).body.state).toBe('RUNNING');
  });
  it('fences failure and replays it immutably, while explicit cancellation does not create an Alert', async () => {
    const permit = (await start().expect(201)).body;
    await fail({ ...permit, attemptToken: randomUUID() }).expect(409);
    expect((await read(permit.attemptId)).body.state).toBe('RUNNING');
    const failed = (await fail(permit).expect(201)).body;
    expect(failed.state).toBe('FAILED');
    const before = await alerts.list(ORG);
    expect(before).toHaveLength(1);
    expect(before[0]).toMatchObject({
      attemptId: permit.attemptId,
      status: 'OPEN',
      href: `/product-pipeline/registered-products?collectionAttempt=${permit.attemptId}&channelAccountId=${ACCOUNT}`,
    });
    expect((await fail(permit).expect(201)).body).toEqual(failed);
    expect(await alerts.list(ORG)).toEqual(before);
    await fail(permit, 'DIFFERENT').expect(409);
    const cancelled = (await start().expect(201)).body;
    await fail(cancelled, 'USER_CANCELLED').expect(201);
    expect(await alerts.list(ORG)).toEqual(before);
  });
  it('derives expired failure without a write, then atomically retires it before new admission', async () => {
    const key = randomUUID();
    const permit = (await start(key).expect(201)).body;
    await prisma.sourceImportRun.update({
      where: { id: permit.attemptId, organizationId: ORG },
      data: { expiresAt: new Date(Date.now() - 1) },
    });
    const expired = (await read(permit.attemptId)).body;
    expect(expired).toMatchObject({
      state: 'FAILED',
      error: { code: 'ATTEMPT_EXPIRED' },
    });
    expect(await alerts.list(ORG)).toEqual([]);
    expect((await start(key).expect(201)).body.state).toBe('FAILED');
    await fail(permit).expect(409);
    const next = (await start().expect(201)).body;
    expect(next.attemptId).not.toBe(permit.attemptId);
    expect(await alerts.list(ORG)).toMatchObject([{ attemptId: permit.attemptId, status: 'OPEN' }]);
    expect((await read(permit.attemptId)).body.error.code).toBe('ATTEMPT_EXPIRED');
  });
  it('publishes once through HTTP, resolves the existing Alert atomically, and fences all terminal writes', async () => {
    const failed = (await start().expect(201)).body;
    await fail(failed).expect(201);
    const ready = await stage();
    const before = await visible();
    const otherOrg = 'b2c3d4e5-f6a7-4b8c-9d0e-1f2a3b4c5d6e';
    await request(httpUrl)
      .get(`${base}/${ready.permit.attemptId}`)
      .set('x-test-org', otherOrg)
      .expect(404);
    await finish({ ...ready.permit, attemptToken: randomUUID() }, ready.hash).expect(409);
    expect(await visible()).toEqual(before);
    const [a, b] = await Promise.all([
      finish(ready.permit, ready.hash).expect(201),
      finish(ready.permit, ready.hash).expect(201),
    ]);
    expect(a.body).toEqual(b.body);
    expect(a.body.state).toBe('COMPLETE');
    expect(a.body.publication.sourceImportRunId).toBe(ready.permit.attemptId);
    expect((await visible()).total).toBe(1);
    expect(await alerts.list(ORG)).toMatchObject([
      { status: 'RESOLVED', attemptId: ready.permit.attemptId },
    ]);
    await fail(ready.permit).expect(409);
    await finish(ready.permit, 'b'.repeat(64)).expect(409);
  });
  it('rolls back failure, expiry admission and successful publication when their Alert write fails', async () => {
    const first = (await start().expect(201)).body;
    await prisma.$executeRaw`ALTER TABLE alerts ADD CONSTRAINT test_catalog_alert_failure CHECK (source_type <> 'coupang_wing_catalog')`;
    try {
      await fail(first).expect(500);
      expect((await read(first.attemptId)).body.state).toBe('RUNNING');
      await prisma.sourceImportRun.update({
        where: { id: first.attemptId, organizationId: ORG },
        data: { expiresAt: new Date(Date.now() - 1) },
      });
      await start().expect(500);
      expect(await alerts.list(ORG)).toEqual([]);
    } finally {
      await prisma.$executeRaw`ALTER TABLE alerts DROP CONSTRAINT test_catalog_alert_failure`;
    }
    const next = (await start().expect(201)).body;
    await fail(next).expect(201);
    const ready = await stage();
    await prisma.$executeRaw`ALTER TABLE alerts ADD CONSTRAINT test_catalog_alert_resolution CHECK (source_type <> 'coupang_wing_catalog' OR status <> 'RESOLVED')`;
    try {
      await finish(ready.permit, ready.hash).expect(500);
      expect((await read(ready.permit.attemptId)).body.state).toBe('RUNNING');
      expect((await visible()).total).toBe(0);
      expect(await alerts.list(ORG)).toMatchObject([{ status: 'OPEN', attemptId: next.attemptId }]);
    } finally {
      await prisma.$executeRaw`ALTER TABLE alerts DROP CONSTRAINT test_catalog_alert_resolution`;
    }
    await finish(ready.permit, ready.hash).expect(201);
  });
  it('rejects a late browser snapshot after a real file import publishes to the same account', async () => {
    const ready = await stage();
    const file = new ChannelCatalogImportService(
      new ChannelCatalogImportRepositoryAdapter(prisma as never, alerts),
    );
    await file.importCoupangWing({
      organizationId: ORG,
      userId: USER,
      channelAccountId: ACCOUNT,
      fileName: 'catalog.xlsx',
      fileHash: 'f'.repeat(64),
      headers: [],
      skippedRows: [],
      rows: [
        {
          rowNumber: 2,
          externalProductId: 'FILE',
          registeredName: 'file',
          displayName: 'file',
          category: null,
          manufacturer: null,
          brand: null,
          productStatus: null,
          externalSkuId: 'FILE-O',
          optionName: null,
          skuStatus: null,
          modelNumber: null,
          barcode: null,
          attributesJson: [],
          rawJson: {},
        },
      ],
    });
    const before = await visible();
    expect(before.items.map((row) => row.externalId)).toEqual(['FILE']);
    await finish(ready.permit, ready.hash).expect(409);
    expect(await visible()).toEqual(before);
  });
  it('checks fixed expiry after waiting for the mapping lock and after media work before terminal CAS', async () => {
    const ready = await stage();
    let release!: () => void;
    let acquired!: () => void;
    const locked = new Promise<void>((resolve) => {
      acquired = resolve;
    });
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const blocker = prisma.$transaction(
      async (tx) => {
        await lockProductMapping(tx, ORG);
        acquired();
        await gate;
      },
      { timeout: 10000 },
    );
    await locked;
    const finishing = finish(ready.permit, ready.hash).then((response) => response);
    try {
      await expect
        .poll(
          async () =>
            (
              await prisma.$queryRaw<
                Array<{ n: number }>
              >`SELECT count(*)::int n FROM pg_locks WHERE locktype='advisory' AND NOT granted`
            )[0]?.n,
        )
        .toBeGreaterThan(0);
      await prisma.sourceImportRun.update({
        where: { id: ready.permit.attemptId, organizationId: ORG },
        data: { expiresAt: new Date(Date.now() - 1) },
      });
    } finally {
      release();
      await blocker;
    }
    expect((await finishing).status).toBe(409);
    expect((await visible()).total).toBe(0);
    const replacement = (await start().expect(201)).body;
    await fail(replacement, 'USER_CANCELLED').expect(201);
    const late = await stage();
    // Substitute only the wall clock; actual SQL/media/CAS path remains real.
    vi.useFakeTimers({ toFake: ['Date'] });
    expireAfterCatalogWrite = true;
    try {
      await finish(late.permit, late.hash).expect(409);
    } finally {
      expireAfterCatalogWrite = false;
      vi.useRealTimers();
    }
    expect((await visible()).total).toBe(0);
    expect((await read(late.permit.attemptId)).body.state).toBe('RUNNING');
  });
  it('uses the database idempotency fence when the same key races across two accounts', async () => {
    const secondAccount = randomUUID();
    await prisma.channelAccount.create({
      data: {
        id: secondAccount,
        organizationId: ORG,
        channel: 'coupang',
        name: 'Wing 2',
        vendorId: 'V2',
      },
    });
    await prisma.$executeRaw`CREATE FUNCTION test_catalog_admission_gate() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN PERFORM pg_advisory_xact_lock(782319); RETURN NEW; END $$`;
    await prisma.$executeRaw`CREATE TRIGGER test_catalog_admission_gate BEFORE INSERT ON source_import_runs FOR EACH ROW EXECUTE FUNCTION test_catalog_admission_gate()`;
    let release!: () => void;
    let acquired!: () => void;
    const locked = new Promise<void>((resolve) => {
      acquired = resolve;
    });
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const blocker = prisma.$transaction(
      async (tx) => {
        await tx.$queryRaw`SELECT pg_advisory_xact_lock(782319)::text`;
        acquired();
        await gate;
      },
      { timeout: 10000 },
    );
    await locked;
    const key = randomUUID();
    const first = start(key).then((response) => response);
    const second = request(httpUrl)
      .post(base.replace(ACCOUNT, secondAccount))
      .set('Idempotency-Key', key)
      .send({ collectorVersion: 'wing-inventory-v1' })
      .then((response) => response);
    try {
      await expect
        .poll(
          async () =>
            (
              await prisma.$queryRaw<
                Array<{ n: number }>
              >`SELECT count(*)::int n FROM pg_locks WHERE locktype='advisory' AND NOT granted`
            )[0]?.n,
        )
        .toBe(2);
    } finally {
      release();
      await blocker;
    }
    try {
      expect(
        (await Promise.all([first, second])).map((response) => response.status).sort(),
      ).toEqual([201, 409]);
    } finally {
      await prisma.$executeRaw`DROP TRIGGER test_catalog_admission_gate ON source_import_runs`;
      await prisma.$executeRaw`DROP FUNCTION test_catalog_admission_gate()`;
    }
  });
  it('replays the original plan after account drift but rejects publication using the changed account', async () => {
    const ready = await stage();
    const status = (await read(ready.permit.attemptId)).body;
    await prisma.channelAccount.update({
      where: { id: ACCOUNT, organizationId: ORG },
      data: { vendorId: 'changed' },
    });
    expect((await start(status.idempotencyKey).expect(201)).body).toEqual(ready.permit);
    await finish(ready.permit, ready.hash).expect(409);
    expect((await visible()).total).toBe(0);
  });
  it('fences chunk upload tokens, expiry and the cancel/finalize race at the public boundary', async () => {
    const ready = await stage();
    const payload = {
      version: 1 as const,
      kind: 'manifest_confirmation' as const,
      manifest: {
        totalItems: 1,
        pageSize: 50,
        expectedPages: 1,
        firstPageFingerprint: 'a'.repeat(64),
      },
    };
    await upload({ ...ready.permit, attemptToken: randomUUID() }, payload).expect(409);
    await upload(ready.permit, payload).expect(200);
    const [completed, cancelled] = await Promise.all([
      finish(ready.permit, ready.hash),
      fail(ready.permit, 'USER_CANCELLED'),
    ]);
    expect([completed.status, cancelled.status].sort()).toEqual([201, 409]);
    const terminal = (await read(ready.permit.attemptId)).body;
    expect(['COMPLETE', 'FAILED']).toContain(terminal.state);
    expect((await visible()).total).toBe(terminal.state === 'COMPLETE' ? 1 : 0);
    expect(await alerts.list(ORG)).toEqual([]);
    await upload(ready.permit, payload).expect(409);
    const next = (await start().expect(201)).body;
    await prisma.sourceImportRun.update({
      where: { id: next.attemptId, organizationId: ORG },
      data: { expiresAt: new Date(Date.now() - 1) },
    });
    await upload(next, payload).expect(409);
    expect((await read(next.attemptId)).body.progress.storedChunks).toBe(0);
  });
});
