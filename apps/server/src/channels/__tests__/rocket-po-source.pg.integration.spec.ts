import { realRegistrationStates } from '../../test-helpers/registration-state';
import { ChannelAccountService } from '../application/service/account/channel-account.service';
import { ChannelAccountPersistenceAdapter } from '../adapter/out/persistence/channel-account.persistence.adapter';
import { CatalogIdentityService } from '../application/service/collection/catalog-identity.service';
import { CatalogIdentityPersistenceAdapter } from '../adapter/out/persistence/catalog-identity.persistence.adapter';
import { ChannelListingQueryService } from '../application/service/listing/channel-listing-query.service';
import { ChannelListingQueryPersistenceAdapter } from '../adapter/out/persistence/channel-listing-query.persistence.adapter';
import { randomUUID } from 'node:crypto';
import { type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import { SourceFailureAlerts } from '../../alerts/alerts.service';
import {
  makeTestPrisma,
  resetDb,
  seedBaseFixture,
  TEST_ORGANIZATION_ID as ORG,
  TEST_USER_ID as USER,
} from '../../test-helpers/real-prisma';
import { RocketPoSourceController } from '../../orders/adapter/in/web/rocket-po-source.controller';
import { RocketPoCatalogRepositoryAdapter } from '../../orders/adapter/out/repository/rocket-po-catalog.repository.adapter';
import { RocketPoCatalogService } from '../../orders/application/service/rocket-po-catalog.service';
import { readRocketPoSource } from '../../orders/adapter/out/persistence/read/rocket-po-catalog.reader';
import { ROCKET_PO_CATALOG_PORT } from '../../orders/application/port/in/rocket-po-catalog.port';
import { RocketPurchasePreviewService } from '../../supply/application/service/rocket-purchase-preview.service';
import { ChannelSkuAvailabilityService } from '../application/service/listing/channel-sku-availability.service';
import { ChannelProductMatchingRepositoryAdapter } from '../adapter/out/repository/channel-product-matching.repository.adapter';
import { ProductAvailabilityRepositoryAdapter } from '../../products/adapter/out/persistence/product-availability.repository.adapter';
import { ProductAvailabilityUseCase } from '../../products/application/service/product-availability.usecase';
import { ProductCollectionFreshnessRepositoryAdapter } from '../../products/adapter/out/persistence/product-source-freshness.repository.adapter';
import { ProductCollectionFreshnessUseCase } from '../../products/application/service/product-collection-freshness.usecase';
import { ProductSourceReadRepositoryAdapter } from '../../products/adapter/out/persistence/product-source-read.repository.adapter';
import { ProductTransactionalReadRepositoryAdapter } from '../../products/adapter/out/persistence/product-transactional-read.repository.adapter';
import { ChannelOptionRecipeRepositoryAdapter } from '../adapter/out/persistence/channel-option-recipe.repository.adapter';
import { ChannelOptionRecipeService } from '../application/service/listing/channel-option-recipe.service';
import { RocketWorkbookExportService } from '../../supply/application/service/rocket-purchase-confirmation.service';
import { RocketPurchaseConfirmationTransactionAdapter } from '../../supply/adapter/out/transaction/rocket-purchase-confirmation.transaction.adapter';
import { RocketWorkbookProgressService } from '../../inventory/application/usecase/rocket-workbook-progress.service';
import { RocketWorkbookProgressRepositoryAdapter } from '../../inventory/adapter/out/persistence/rocket-workbook-progress.repository.adapter';
import { configureAgentRuntimeBodyParsers } from '../../common/http/agent-runtime-body-parser';
import { FactConflictError } from '../../common/errors/fact-errors';
import { ChannelsProductMappingGenerationAdapter } from "../adapter/out/products/product-mapping-generation.adapter";
import { ProductMappingGenerationRepositoryAdapter } from "../../products/adapter/out/persistence/product-mapping-generation.repository.adapter";

const ACCOUNT = '11111111-1111-4111-8111-111111111111';
const base = '/api/channels/rocket-po';
const plan = {
  channelAccountId: ACCOUNT,
  from: '2026-09-01',
  to: '2026-09-30',
  status: '',
  dateType: 'WAREHOUSING_PLAN_DATE',
  requireConfirmation: true,
};

describe('Rocket owner public HTTP + disposable PG', () => {
  let prisma: PrismaClient;
  const dbOperations: string[] = [];
  let app: INestApplication;
  let httpUrl: string;
  let catalog: RocketPoCatalogService;
  let accounts: ChannelAccountService;
  beforeAll(async () => {
    prisma = makeTestPrisma().$extends({
      query: {
        async $allOperations({ model, operation, args, query }) {
          dbOperations.push(`${model ?? 'raw'}.${operation}`);
          const started = performance.now();
          try {
            return await query(args);
          } finally {
            const elapsedMs = Math.round(performance.now() - started);
            if (elapsedMs > 1000)
              console.info(
                'ROCKET_SLOW_DB_OPERATION',
                JSON.stringify({ model, operation, elapsedMs }),
              );
          }
        },
      },
    }) as unknown as PrismaClient;
    await prisma.$connect();
    const alerts = new SourceFailureAlerts(prisma as never);
    accounts = new ChannelAccountService(new ChannelAccountPersistenceAdapter(prisma as never, new ChannelsProductMappingGenerationAdapter(new ProductMappingGenerationRepositoryAdapter())), {} as never);
    const repository = new RocketPoCatalogRepositoryAdapter(
      prisma as never,
      alerts,
      accounts,
      new CatalogIdentityService(new CatalogIdentityPersistenceAdapter()),
      new ChannelListingQueryService(new ChannelListingQueryPersistenceAdapter(prisma as never), { findForListings: async () => [] }, realRegistrationStates(prisma as never)),
    );
    catalog = new RocketPoCatalogService(repository);
    const module = await Test.createTestingModule({
      controllers: [RocketPoSourceController],
      providers: [{ provide: ROCKET_PO_CATALOG_PORT, useValue: catalog }],
    }).compile();
    app = module.createNestApplication({ logger: false, bodyParser: false });
    configureAgentRuntimeBodyParsers(app as never);
    app.setGlobalPrefix('api');
    app.use(
      (
        req: { headers: Record<string, string>; authUser?: unknown },
        _res: unknown,
        next: () => void,
      ) => {
        if (req.headers['x-test-org'])
          req.authUser = {
            id: USER,
            organizationId: req.headers['x-test-org'],
          };
        next();
      },
    );
    await app.init();
    await app.listen(0, '127.0.0.1');
    httpUrl = await app.getUrl();
  });
  afterAll(async () => {
    await app?.close();
    await prisma?.$disconnect();
  });
  beforeEach(async () => {
    await resetDb(prisma);
    await seedBaseFixture(prisma);
    await prisma.channelAccount.create({
      data: {
        id: ACCOUNT,
        organizationId: ORG,
        channel: 'rocket',
        name: 'Rocket',
        vendorId: 'V1',
        status: 'active',
      },
    });
  });
  const start = (key = randomUUID(), body = plan) =>
    request(httpUrl)
      .post(`${base}/attempts`)
      .set('x-test-org', ORG)
      .set('Idempotency-Key', key)
      .send(body);
  const readSource = () =>
    request(httpUrl)
      .get(`${base}/source?channelAccountId=${ACCOUNT}`)
      .set('x-test-org', ORG)
      .expect(200);
  const finish = (
    attempt: { attemptId: string; attemptToken: string },
    rows: SubmittedRow[] = [row('P1')],
  ) =>
    request(httpUrl)
      .put(`${base}/attempts/${attempt.attemptId}`)
      .set('x-test-org', ORG)
      .set('x-source-attempt-token', attempt.attemptToken)
      .send(submission(attempt.attemptId, rows));
  const previewService = () =>
    (() => {
      const products = new ProductSourceReadRepositoryAdapter(prisma as never);
      const productTransactions = new ProductTransactionalReadRepositoryAdapter();
      const availability = new ProductAvailabilityUseCase(
        new ProductAvailabilityRepositoryAdapter(prisma as never),
      );
      const recipes = new ChannelOptionRecipeService(
        new ChannelOptionRecipeRepositoryAdapter(prisma as never, productTransactions, new ChannelsProductMappingGenerationAdapter(new ProductMappingGenerationRepositoryAdapter())),
      );
      const matching = new ChannelProductMatchingRepositoryAdapter(
        prisma as never,
        productTransactions,
        products,
        recipes,
      );
      return new RocketPurchasePreviewService(
        catalog,
        new ChannelSkuAvailabilityService(matching, availability),
        new ProductCollectionFreshnessUseCase(
          new ProductCollectionFreshnessRepositoryAdapter(prisma as never),
        ),
      );
    })();
  it('freezes an authorized plan, replays the same begin, and rejects a distinct concurrent start', async () => {
    const key = randomUUID();
    const first = await start(key).expect(201);
    expect(first.body).toMatchObject({
      state: 'RUNNING',
      generation: '1',
      plan: {
        ...plan,
        sourceType: 'coupang_rocket_po_catalog',
        vendorExpectations: {
          rocketVendorId: 'V1',
          sharedCoupangVendorId: null,
        },
      },
    });
    expect((await start(key).expect(201)).body).toEqual(first.body);
    await start().expect(409);
    await start(key, { ...plan, status: 'RP' }).expect(409);
    const source = await request(httpUrl)
      .get(`${base}/source?channelAccountId=${ACCOUNT}`)
      .set('x-test-org', ORG)
      .expect(200);
    expect(source.body).toMatchObject({
      ready: false,
      latestAttempt: { attemptId: first.body.attemptId },
      latestComplete: null,
    });
    expect(source.body.latestAttempt).not.toHaveProperty('attemptToken');
  });
  it('publishes exact B, retains A, preserves B on failure, and lets empty COMPLETE become current', async () => {
    const a = (await start()).body;
    await finish(a).expect(200);
    await expect(
      prisma.sourceImportRun.findUniqueOrThrow({ where: { id: a.attemptId } }),
    ).resolves.toMatchObject({ status: 'completed' });
    const b = (await start()).body;
    await finish(b, [row('P2')]).expect(200);
    const scope = { organizationId: ORG, channelAccountId: ACCOUNT };
    const replayed = await catalog.loadSavedCollection({
      ...scope,
      sourceImportRunId: a.attemptId,
    });
    expect(replayed?.rows.map((r) => r.productNo)).toEqual(['P1']);
    expect(replayed?.collection).toEqual(
      submission(a.attemptId, [row('P1')]).collection,
    );
    expect(
      (
        await catalog.listSavedPos({ ...scope, from: plan.from, to: plan.to })
      ).map((r) => r.firstProductName),
    ).toEqual(['P2 item']);
    const failed = (await start()).body;
    await request(httpUrl)
      .post(`${base}/attempts/${failed.attemptId}/fail`)
      .set('x-test-org', ORG)
      .set('x-source-attempt-token', failed.attemptToken)
      .send({ code: 'coupang_po_session_required', message: '로그인 필요' })
      .expect(201);
    expect((await readSource()).body).toMatchObject({
      ready: true,
      latestAttempt: { state: 'FAILED' },
      latestComplete: { attemptId: b.attemptId },
    });
    const empty = (await start()).body;
    await finish(empty, []).expect(200);
    expect((await readSource()).body).toMatchObject({
      ready: true,
      latestComplete: { attemptId: empty.attemptId, state: 'COMPLETE' },
    });
    expect(
      await catalog.listSavedPos({ ...scope, from: plan.from, to: plan.to }),
    ).toEqual([]);
    expect(
      (
        await catalog.loadSavedCollection({
          ...scope,
          sourceImportRunId: empty.attemptId,
        })
      )?.rows,
    ).toEqual([]);
  });
  it.each([
    { parserVersion: 'unsupported-parser' },
    { sourceType: 'another-owner-source' },
    { status: 'running' },
  ])('rejects saved snapshot whose explicit source reference no longer proves completion: %j', async (data) => {
    const attempt = (await start()).body;
    await finish(attempt).expect(200);
    await prisma.sourceImportRun.update({ where: { id: attempt.attemptId }, data });
    expect(await prisma.rocketPoCatalogSnapshot.count({ where: { sourceImportRunId: attempt.attemptId } })).toBe(1);
    const scope = { organizationId: ORG, channelAccountId: ACCOUNT };
    await expect(catalog.loadSavedCollection({ ...scope, sourceImportRunId: attempt.attemptId })).resolves.toBeNull();
    await expect(catalog.listSavedPos({ ...scope, from: plan.from, to: plan.to })).resolves.toEqual([]);
  });

  it('keeps a PO amount unknown when a listed line has no confirmed total', async () => {
    const attempt = (
      await start(randomUUID(), { ...plan, requireConfirmation: false })
    ).body;
    const completed = await finish(attempt, [
      { ...row('P1'), poNumber: '2001' },
      { ...row('P2'), poNumber: '2001', confirmation: undefined },
      { ...row('P3'), poNumber: '2002' },
    ]).expect(200);
    expect(completed.body.state).toBe('COMPLETE');

    const summaries = await catalog.listSavedPos({
      organizationId: ORG,
      channelAccountId: ACCOUNT,
      from: plan.from,
      to: plan.to,
    });

    // An unconfirmed line has no provider total, so its PO amount is unknown,
    // not the sum of the confirmed lines.
    expect(
      summaries.map(({ poNumber, skuCount, orderQuantity, orderAmount }) => ({
        poNumber,
        skuCount,
        orderQuantity,
        orderAmount,
      })),
    ).toEqual([
      { poNumber: '2001', skuCount: 2, orderQuantity: 8, orderAmount: null },
      { poNumber: '2002', skuCount: 1, orderQuantity: 4, orderAmount: 3960 },
    ]);
  });
  it('reopens a saved line with its confirmation exactly when that evidence was stored', async () => {
    const attempt = (
      await start(randomUUID(), { ...plan, requireConfirmation: false })
    ).body;
    const unconfirmed: SubmittedRow = row('P2');
    delete unconfirmed.confirmation;
    await finish(attempt, [row('P1'), unconfirmed]).expect(200);

    const saved = await catalog.loadSavedCollection({
      organizationId: ORG,
      channelAccountId: ACCOUNT,
      sourceImportRunId: attempt.attemptId,
    });

    expect(saved?.rows).toEqual([row('P1'), unconfirmed]);
  });
  it('fails a saved read closed with a typed conflict when stored evidence is incomplete', async () => {
    const attempt = (await start()).body;
    await finish(attempt, [row('P1')]).expect(200);
    const exact = {
      organizationId: ORG,
      channelAccountId: ACCOUNT,
      sourceImportRunId: attempt.attemptId,
    };
    await prisma.channelListingOption.updateMany({
      where: { organizationId: ORG, externalOptionId: 'P1' },
      data: { externalOptionId: 'P1-RENUMBERED' },
    });

    const complete = catalog.readComplete(exact);
    await expect(complete).rejects.toBeInstanceOf(FactConflictError);
    await expect(complete).rejects.toThrow('Rocket identity P1 was not persisted');

    await prisma.rocketPoCatalogLine.updateMany({
      where: { organizationId: ORG, snapshot: { sourceImportRunId: attempt.attemptId } },
      data: { poStatus: null },
    });
    const saved = catalog.loadSavedCollection(exact);
    await expect(saved).rejects.toBeInstanceOf(FactConflictError);
    await expect(saved).rejects.toThrow('Saved Rocket PO confirmation is missing poStatus');
  });
  it('dates the COMPLETE cutoff by its KST business day across the 00:30 KST boundary', async () => {
    const attempt = (await start()).body;
    await finish(attempt).expect(200);
    // 2026-09-14 00:30 KST is still 2026-09-13 in UTC.
    const importedAt = new Date('2026-09-13T15:30:00.000Z');
    await prisma.sourceImportRun.update({
      where: { id: attempt.attemptId },
      data: { importedAt },
    });
    const readAt = (now: string) =>
      prisma.$transaction((tx) =>
        readRocketPoSource(tx, {
          organizationId: ORG,
          channelAccountId: ACCOUNT,
          now: new Date(now),
        }, accounts),
      );

    // At 2026-09-15 00:40 KST the required cutoff is 2026-09-14, the
    // import's KST business day.
    await expect(readAt('2026-09-14T15:40:00.000Z')).resolves.toMatchObject({
      ready: true,
      latestComplete: {
        attemptId: attempt.attemptId,
        actualCutoffAt: importedAt.toISOString(),
      },
    });
    // One KST day later the same import no longer covers the required cutoff.
    await expect(readAt('2026-09-15T15:40:00.000Z')).resolves.toMatchObject({
      ready: false,
    });
  });
  it('serializes concurrent begins into one account attempt without losing same-key replay', async () => {
    const key = randomUUID();
    const same = await Promise.all([start(key), start(key)]);
    expect(same.map((result) => result.status)).toEqual([201, 201]);
    expect(same[0]!.body.attemptId).toBe(same[1]!.body.attemptId);
    await finish(same[0]!.body).expect(200);
    const distinct = await Promise.all([start(), start()]);
    expect(distinct.map((result) => result.status).sort()).toEqual([201, 409]);
    expect(
      await prisma.sourceImportRun.count({
        where: {
          organizationId: ORG,
          sourceType: 'coupang_rocket_po_catalog',
          channelAccountId: ACCOUNT,
          status: 'running',
        },
      }),
    ).toBe(1);
  });
  it('rejects frozen vendor drift even when the later provider observation is empty', async () => {
    const a = (await start()).body;
    await prisma.channelAccount.update({
      where: { id: ACCOUNT },
      data: { vendorId: 'CHANGED' },
    });
    expect((await finish(a, []).expect(200)).body).toMatchObject({
      state: 'FAILED',
      errorCode: 'ROCKET_PO_VENDOR_MISMATCH',
    });
    expect((await readSource()).body.latestComplete).toBeNull();
  });
  it('keeps prior COMPLETE visible when an account becomes inactive during provider work', async () => {
    const a = (await start()).body;
    await finish(a).expect(200);
    const b = (await start()).body;
    await prisma.channelAccount.update({
      where: { id: ACCOUNT },
      data: { status: 'inactive' },
    });
    expect((await finish(b).expect(200)).body).toMatchObject({
      state: 'FAILED',
      errorCode: 'ROCKET_PO_ACCOUNT_UNAVAILABLE',
    });
    expect((await readSource()).body).toMatchObject({
      ready: true,
      latestAttempt: { attemptId: b.attemptId, state: 'FAILED' },
      latestComplete: { attemptId: a.attemptId },
    });
    await start().expect(404);
    await start(randomUUID(), {
      ...plan,
      channelAccountId: randomUUID(),
    }).expect(404);
    await request(httpUrl)
      .post(`${base}/attempts`)
      .set('x-test-org', randomUUID())
      .set('Idempotency-Key', randomUUID())
      .send(plan)
      .expect(404);
    await prisma.channelAccount.update({
      where: { id: ACCOUNT },
      data: { status: 'active', channel: 'coupang' },
    });
    await start().expect(404);
  });
  it('rejects conflicting known Wing vendor without claiming a blank Rocket vendor', async () => {
    await prisma.channelAccount.update({
      where: { id: ACCOUNT },
      data: { vendorId: null },
    });
    await prisma.channelAccount.create({
      data: {
        organizationId: ORG,
        channel: 'coupang',
        name: 'Wing',
        vendorId: 'OTHER',
        isPrimary: true,
        status: 'active',
      },
    });
    const a = (await start()).body;
    expect((await finish(a).expect(200)).body).toMatchObject({
      state: 'FAILED',
      errorCode: 'ROCKET_PO_VENDOR_MISMATCH',
    });
    expect(
      (
        await prisma.channelAccount.findUniqueOrThrow({
          where: { id: ACCOUNT },
        })
      ).vendorId,
    ).toBeNull();
    expect(await prisma.channelListingOption.count()).toBe(0);
  });
  it('retains legacy facts without certifying them and preserves saved status aliases within latest COMPLETE only', async () => {
    const a = (await start()).body;
    const statuses = ['거래처확인요청', '거래명세서확인요청', '발주확정'];
    const rows = statuses.map((poStatus, index) => ({
      ...row(`P${index}`),
      poNumber: String(1001 + index),
      confirmation: { ...row('P1').confirmation, poStatus },
    }));
    await finish(a, rows).expect(200);
    const scope = {
      organizationId: ORG,
      channelAccountId: ACCOUNT,
      from: plan.from,
      to: plan.to,
    };
    expect(
      await catalog.listSavedPos({ ...scope, status: '거래처확인요청' }),
    ).toHaveLength(2);
    expect(
      await catalog.loadSavedCollection({
        ...scope,
        organizationId: randomUUID(),
        sourceImportRunId: a.attemptId,
      }),
    ).toBeNull();
    await prisma.sourceImportRun.update({
      where: { id: a.attemptId },
      data: { parserVersion: null, plan: {} },
    });
    expect((await readSource()).body).toMatchObject({
      ready: false,
      latestAttempt: null,
      latestComplete: null,
    });
    expect(await catalog.listSavedPos(scope)).toEqual([]);
    expect(
      await catalog.loadSavedCollection({
        ...scope,
        sourceImportRunId: a.attemptId,
      }),
    ).toBeNull();
    const b = (await start()).body;
    await finish(b, [row('NEW')]).expect(200);
    expect(
      (await catalog.listSavedPos(scope)).map((po) => po.firstProductName),
    ).toEqual(['NEW item']);
    expect(await prisma.rocketPoCatalogSnapshot.count()).toBe(2);
    expect(await prisma.rocketPoCatalogLine.count()).toBe(4);
  });
  it('Supply preview reads exact COMPLETE rows and cannot publish or accept replacement rows', async () => {
    const a = (await start()).body;
    await finish(a).expect(200);
    const b = (await start()).body;
    await finish(b, [row('P2')]).expect(200);
    const inventoryRun = await prisma.sourceImportRun.create({ data: {
      organizationId: ORG, sourceType: 'sellpia_inventory', status: 'completed',
      importedAt: new Date(), freshnessGeneration: 1n,
    } });
    await prisma.sellpiaInventoryState.create({ data: {
      organizationId: ORG, lastCompletedImportRunId: inventoryRun.id,
      sourceOrigin: 'https://kiditem.sellpia.com', sourceAccountKey: 'kiditem',
      lastVerifiedAt: new Date(), requestedGeneration: 1n, verifiedGeneration: 1n,
    } });
    const preview = previewService();
    const input = {
      organizationId: ORG,
      userId: USER,
      request: {
        channelAccountId: ACCOUNT,
        sourceImportRunId: a.attemptId,
        inventoryAttemptId: inventoryRun.id,
        editedQuantities: {},
        previewScope: 'confirmation_requested' as const,
      },
    };
    const result = await preview.preview(input);
    expect(result.rows).toMatchObject([
      { productNo: 'P1', orderQuantity: 4, reason: 'mapping_required' },
    ]);
    expect(result.catalog).toMatchObject({ sourceImportRunId: a.attemptId });
    expect((await readSource()).body.latestComplete.attemptId).toBe(
      b.attemptId,
    );
    await expect(
      preview.preview({
        ...input,
        request: { ...input.request, rows: [] } as never,
      }),
    ).rejects.toThrow();
    await expect(
      preview.preview({
        ...input,
        request: { ...input.request, editedQuantities: { unknown: 1 } },
      }),
    ).rejects.toThrow(/unknown/i);
  });
  it('official workbook loads canonical source and preserves exact-byte replay through the existing Supply interface', async () => {
    const a = (await start()).body;
    await finish(a).expect(200);
    const option = await prisma.channelListingOption.findFirstOrThrow({
      where: { organizationId: ORG, externalOptionId: 'P1' },
    });
    const master = await prisma.masterProduct.create({
      data: {
        organizationId: ORG,
        code: 'KI1',
        sourceAccountKey: 'kiditem',
        sourceProductCode: 'KI1',
        sourceOptionCode: '',
        name: 'Confirmed product',
        currentStock: 5,
      },
    });
    const inventoryImportedAt = new Date();
    const inventoryRun = await prisma.sourceImportRun.create({
      data: {
        organizationId: ORG,
        sourceType: 'sellpia_inventory',
        channelAccountId: null,
        fileName: 'rocket-inventory.json',
        fileHash: 'e'.repeat(64),
        status: 'completed',
        rowCount: 1,
        importedAt: inventoryImportedAt,
        lastVerifiedAt: inventoryImportedAt,
        verificationCount: 1,
        freshnessGeneration: 1n,
      },
    });
    await prisma.channelListingOptionInventoryComponent.create({
      data: {
        organizationId: ORG,
        channelListingOptionId: option.id,
        masterProductId: master.id,
        quantity: 1,
      },
    });
    await prisma.sellpiaInventoryState.create({
      data: {
        organizationId: ORG,
        requestedGeneration: 1n,
        verifiedGeneration: 1n,
        lastVerifiedAt: inventoryImportedAt,
        lastCompletedImportRunId: inventoryRun.id,
        sourceOrigin: 'https://kiditem.sellpia.com',
        sourceAccountKey: 'kiditem',
      },
    });
    const service = new RocketWorkbookExportService(
      previewService(),
      new RocketPurchaseConfirmationTransactionAdapter(
        prisma as never,
        new RocketWorkbookProgressService(
          new RocketWorkbookProgressRepositoryAdapter(),
        ),
        new ProductTransactionalReadRepositoryAdapter(),
        new ChannelOptionRecipeService(new ChannelOptionRecipeRepositoryAdapter(prisma as never, new ProductTransactionalReadRepositoryAdapter(), new ChannelsProductMappingGenerationAdapter(new ProductMappingGenerationRepositoryAdapter()))),
      ),
      catalog,
    );
    const input = {
      organizationId: ORG,
      userId: USER,
      artifactBytes: Buffer.from('unchanged workbook bytes'),
      request: {
        channelAccountId: ACCOUNT,
        sourceImportRunId: a.attemptId,
        inventoryAttemptId: inventoryRun.id,
        idempotencyKey: randomUUID(),
        editedQuantities: { [row('P1').poLineId]: 4 },
        shortageReasons: {},
        artifactFileName: 'rocket.xlsx',
        artifactContentType:
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' as const,
      },
    };
    const first = await service.exportWorkbook(input);
    expect(first).toMatchObject({
      duplicate: false,
      rows: [{ poLineId: row('P1').poLineId, workbookQuantity: 4 }],
      inventoryGeneration: '1',
    });
    expect(await service.exportWorkbook(input)).toMatchObject({
      exportId: first.exportId,
      duplicate: true,
    });
    expect(
      (
        await service.downloadWorkbook({
          organizationId: ORG,
          exportId: first.exportId,
        })
      ).bytes,
    ).toEqual(input.artifactBytes);
    expect((await readSource()).body.latestComplete.attemptId).toBe(
      a.attemptId,
    );
  });
  it('replays canonical terminal content but a new identical capture gets its own generation', async () => {
    const a = (await start()).body;
    const rows = [row('P1'), row('P2')];
    const first = (await finish(a, rows).expect(200)).body;
    const payload = submission(a.attemptId, rows.reverse());
    const replay = await request(httpUrl)
      .put(`${base}/attempts/${a.attemptId}`)
      .set('x-test-org', ORG)
      .set('x-source-attempt-token', a.attemptToken)
      .send({
        proof: payload.proof,
        rows: payload.rows.map(({ productNo, ...rest }) => ({
          productNo,
          ...rest,
        })),
        collection: payload.collection,
      })
      .expect(200);
    expect(replay.body).toEqual(first);
    await finish(a, [row('CHANGED')]).expect(409);
    const b = (await start()).body;
    expect(b.generation).toBe('2');
    await finish(b, rows).expect(200);
    expect((await readSource()).body.latestComplete.attemptId).toBe(
      b.attemptId,
    );
  });
  it('fences organization, token, observed plan, missing proof and terminal state', async () => {
    const a = (await start()).body;
    await expect(
      catalog.readComplete({
        organizationId: ORG,
        channelAccountId: ACCOUNT,
        sourceImportRunId: a.attemptId,
      }),
    ).rejects.toThrow('ROCKET_PO_COMPLETE_NOT_FOUND');
    await request(httpUrl).get(`${base}/attempts/${a.attemptId}`).expect(401);
    await request(httpUrl)
      .get(`${base}/attempts/${a.attemptId}`)
      .set('x-test-org', randomUUID())
      .expect(404);
    await finish({ ...a, attemptToken: randomUUID() }).expect(409);
    await request(httpUrl)
      .put(`${base}/attempts/${a.attemptId}`)
      .set('x-test-org', ORG)
      .set('x-source-attempt-token', a.attemptToken)
      .send({
        ...submission(a.attemptId, []),
        proof: { ...submission(a.attemptId, []).proof, from: '2026-08-01' },
      })
      .expect(409);
    await request(httpUrl)
      .put(`${base}/attempts/${a.attemptId}`)
      .set('x-test-org', ORG)
      .set('x-source-attempt-token', a.attemptToken)
      .send({
        ...submission(a.attemptId, []),
        proof: { ...submission(a.attemptId, []).proof, validatedList: false },
      })
      .expect(400);
    await finish(a).expect(200);
    await expect(
      catalog.readComplete({
        organizationId: ORG,
        channelAccountId: randomUUID(),
        sourceImportRunId: a.attemptId,
      }),
    ).rejects.toThrow('ROCKET_PO_COMPLETE_NOT_FOUND');
    await request(httpUrl)
      .post(`${base}/attempts/${a.attemptId}/fail`)
      .set('x-test-org', ORG)
      .set('x-source-attempt-token', a.attemptToken)
      .send({ code: 'FAILED', message: 'Too late' })
      .expect(409);
  });
  const cancel = (attemptId: string, organizationId = ORG) =>
    request(httpUrl)
      .post(`${base}/attempts/${attemptId}/cancel`)
      .set('x-test-org', organizationId);
  it('stops a running attempt for an operator without its token or an Alert, then admits the next begin at once', async () => {
    const a = (await start()).body;
    await cancel(a.attemptId, randomUUID()).expect(404);
    const stopped = (await cancel(a.attemptId).expect(200)).body;
    expect(stopped).toMatchObject({
      attemptId: a.attemptId,
      state: 'FAILED',
      errorCode: 'USER_CANCELLED',
      errorMessage: '운영자가 수집을 중단했습니다.',
    });
    expect(await prisma.alert.count({ where: { organizationId: ORG } })).toBe(0);
    await finish(a).expect(409);
    expect((await cancel(a.attemptId).expect(200)).body).toEqual(stopped);
    const next = (await start()).body;
    expect(next).toMatchObject({ state: 'RUNNING', generation: '2' });
  });
  it('settles an operator stop after the lease passed as expiry with its Alert and leaves a COMPLETE attempt unchanged', async () => {
    const a = (await start()).body;
    await prisma.sourceImportRun.update({
      where: { id: a.attemptId },
      data: { expiresAt: new Date(Date.now() - 1) },
    });
    expect((await cancel(a.attemptId).expect(200)).body).toMatchObject({
      state: 'FAILED',
      errorCode: 'ATTEMPT_EXPIRED',
    });
    expect(
      (await prisma.sourceImportRun.findUniqueOrThrow({ where: { id: a.attemptId } })).status,
    ).toBe('failed');
    expect(
      await prisma.alert.count({ where: { organizationId: ORG, status: 'OPEN' } }),
    ).toBe(1);
    const b = (await start()).body;
    await finish(b).expect(200);
    const view = (
      await request(httpUrl)
        .get(`${base}/attempts/${b.attemptId}`)
        .set('x-test-org', ORG)
        .expect(200)
    ).body;
    expect(view.state).toBe('COMPLETE');
    expect((await cancel(b.attemptId).expect(200)).body).toEqual(view);
  });
  it('reads expiry without writes and terminalizes it with Alert only on a new begin', async () => {
    const a = (await start()).body;
    expect(Date.parse(a.expiresAt) - Date.now()).toBeGreaterThan(590_000);
    await prisma.sourceImportRun.update({
      where: { id: a.attemptId },
      data: { expiresAt: new Date(Date.now() - 1) },
    });
    expect((await readSource()).body.latestAttempt).toMatchObject({
      state: 'FAILED',
      errorCode: 'ATTEMPT_EXPIRED',
    });
    expect(
      (
        await prisma.sourceImportRun.findUniqueOrThrow({
          where: { id: a.attemptId },
        })
      ).status,
    ).toBe('running');
    await finish(a).expect(409);
    expect((await start()).body.generation).toBe('2');
    expect(
      (
        await prisma.sourceImportRun.findUniqueOrThrow({
          where: { id: a.attemptId },
        })
      ).status,
    ).toBe('failed');
    expect(await prisma.alert.count({ where: { organizationId: ORG } })).toBe(
      1,
    );
  });
  it.each([
    { truncated: true },
    { failedPoNumbers: ['1001'] },
    { vendorId: '' },
    { detailPoCount: 0 },
    { listPagesRead: 0 },
    { totalListPages: 2 },
  ])(
    'source-invalid but parsed provider evidence atomically fails and can replay exactly: %j',
    async (invalid) => {
      const a = (await start()).body;
      const payload = submission(a.attemptId, [row('P1')]);
      Object.assign(payload.collection, invalid);
      const submit = () =>
        request(httpUrl)
          .put(`${base}/attempts/${a.attemptId}`)
          .set('x-test-org', ORG)
          .set('x-source-attempt-token', a.attemptToken)
          .send(payload);
      expect((await submit().expect(200)).body).toMatchObject({
        state: 'FAILED',
        errorCode: 'ROCKET_PO_COLLECTION_INCOMPLETE',
      });
      expect((await submit().expect(200)).body.state).toBe('FAILED');
      expect((await readSource()).body.latestComplete).toBeNull();
      expect(await prisma.alert.count({ where: { organizationId: ORG } })).toBe(
        1,
      );
    },
  );
  it('rolls back COMPLETE facts and FAILED status when the owner Alert write fails', async () => {
    const a = (await start()).body;
    const fail = () =>
      request(httpUrl)
        .post(`${base}/attempts/${a.attemptId}/fail`)
        .set('x-test-org', ORG)
        .set('x-source-attempt-token', a.attemptToken)
        .send({ code: 'LOGIN', message: '로그인 필요' });
    await prisma.$executeRawUnsafe(
      `CREATE FUNCTION reject_rocket_alert() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'test alert unavailable'; END $$`,
    );
    await prisma.$executeRawUnsafe(
      `CREATE TRIGGER reject_rocket_alert BEFORE UPDATE OR INSERT ON alerts FOR EACH ROW EXECUTE FUNCTION reject_rocket_alert()`,
    );
    try {
      await fail().expect(500);
      expect((await readSource()).body.latestAttempt.state).toBe('RUNNING');
    } finally {
      await prisma.$executeRawUnsafe(
        'DROP TRIGGER reject_rocket_alert ON alerts',
      );
    }
    await fail().expect(201);
    const b = (await start()).body;
    await prisma.$executeRawUnsafe(
      `CREATE TRIGGER reject_rocket_alert BEFORE UPDATE OR INSERT ON alerts FOR EACH ROW EXECUTE FUNCTION reject_rocket_alert()`,
    );
    try {
      await finish(b).expect(500);
      expect((await readSource()).body).toMatchObject({
        latestAttempt: { state: 'RUNNING' },
        latestComplete: null,
      });
      expect(await prisma.rocketPoCatalogSnapshot.count()).toBe(0);
      expect(await prisma.channelListingOption.count()).toBe(0);
    } finally {
      await prisma.$executeRawUnsafe(
        'DROP TRIGGER reject_rocket_alert ON alerts',
      );
      await prisma.$executeRawUnsafe('DROP FUNCTION reject_rocket_alert()');
    }
    await finish(b).expect(200);
  });
  it.each(['mixed_vendor', 'duplicate_line', 'missing_confirmation'] as const)(
    'rejects %s rows without publishing identities',
    async (invalid) => {
      const a = (await start()).body;
      const payload = submission(a.attemptId, [row('P1')]);
      if (invalid === 'mixed_vendor') payload.rows[0]!.vendorId = 'OTHER';
      if (invalid === 'duplicate_line') payload.rows.push(row('P1'));
      if (invalid === 'missing_confirmation')
        delete (payload.rows[0] as { confirmation?: unknown }).confirmation;
      expect(
        (
          await request(httpUrl)
            .put(`${base}/attempts/${a.attemptId}`)
            .set('x-test-org', ORG)
            .set('x-source-attempt-token', a.attemptToken)
            .send(payload)
            .expect(200)
        ).body.state,
      ).toBe('FAILED');
      expect(await prisma.channelListingOption.count()).toBe(0);
      expect(await prisma.rocketPoCatalogSnapshot.count()).toBe(0);
    },
  );
  it('claims configured blank vendors only from nonempty evidence and preserves confirmed recipes on recollection', async () => {
    await prisma.channelAccount.update({
      where: { id: ACCOUNT },
      data: { vendorId: null },
    });
    const wing = await prisma.channelAccount.create({
      data: {
        organizationId: ORG,
        channel: 'coupang',
        name: 'Wing',
        vendorId: null,
        isPrimary: true,
        status: 'active',
      },
    });
    const empty = (await start()).body;
    await finish(empty, []).expect(200);
    expect(
      (
        await prisma.channelAccount.findUniqueOrThrow({
          where: { id: ACCOUNT },
        })
      ).vendorId,
    ).toBeNull();
    const a = (await start()).body;
    await finish(a).expect(200);
    expect(
      (
        await prisma.channelAccount.findUniqueOrThrow({
          where: { id: wing.id },
        })
      ).vendorId,
    ).toBe('V1');
    const option = await prisma.channelListingOption.findFirstOrThrow({
      where: { organizationId: ORG, externalOptionId: 'P1' },
    });
    const master = await prisma.masterProduct.create({
      data: {
        organizationId: ORG,
        code: 'KEEP',
        sourceAccountKey: 'kiditem',
        sourceProductCode: 'KEEP',
        sourceOptionCode: '',
        name: 'Keep',
        currentStock: 7,
      },
    });
    await prisma.channelListingOptionInventoryComponent.create({
      data: {
        organizationId: ORG,
        channelListingOptionId: option.id,
        masterProductId: master.id,
        quantity: 2,
      },
    });
    const b = (await start()).body;
    await finish(b, [row('P2')]).expect(200);
    const c = (await start()).body;
    await finish(c).expect(200);
    expect(await prisma.masterProduct.count()).toBe(1);
    expect(
      await prisma.channelListingOptionInventoryComponent.findMany({
        where: { channelListingOptionId: option.id },
        select: { masterProductId: true, quantity: true },
      }),
    ).toEqual([{ masterProductId: master.id, quantity: 2 }]);
    expect(
      (
        await prisma.masterProduct.findUniqueOrThrow({
          where: { id: master.id },
        })
      ).currentStock,
    ).toBe(7);
  });
  it('keeps explicit generic evidence distinct from confirmation requirements without limiting provider pages', async () => {
    const generic = (
      await start(randomUUID(), {
        ...plan,
        requireConfirmation: false,
        status: 'PA',
      })
    ).body;
    const rows = Array.from({ length: 63 }, (_, index) => ({
      ...row(`P${index}`),
      poNumber: String(1001 + index),
      barcode: '',
    }));
    const payload = submission(generic.attemptId, rows);
    payload.proof.status = 'PA';
    payload.collection.listPagesRead = 21;
    payload.collection.totalListPages = 21;
    await request(httpUrl)
      .put(`${base}/attempts/${generic.attemptId}`)
      .set('x-test-org', ORG)
      .set('x-source-attempt-token', generic.attemptToken)
      .send(payload)
      .expect(200);
    const strict = (await start()).body;
    expect(
      (await finish(strict, [{ ...row('P1'), barcode: '' }]).expect(200)).body
        .state,
    ).toBe('FAILED');
    expect((await readSource()).body.latestComplete.attemptId).toBe(
      generic.attemptId,
    );
  });
  it('accepts and measures the existing 4,000-line one-shot range using bulk identity writes', async () => {
    const a = (await start()).body;
    const rows = Array.from({ length: 4000 }, (_, index) => ({
      ...row(`PRODUCT-${index}`),
      poNumber: String(100000 + index),
    }));
    const payloadBytes = Buffer.byteLength(
      JSON.stringify(submission(a.attemptId, rows)),
    );
    dbOperations.length = 0;
    const started = performance.now();
    await finish(a, rows).expect(200);
    const elapsedMs = Math.round(performance.now() - started);
    const operationCounts = Object.fromEntries(
      [...new Set(dbOperations)].map((operation) => [
        operation,
        dbOperations.filter((value) => value === operation).length,
      ]),
    );
    process.stdout.write(
      `ROCKET_ONE_SHOT_MEASUREMENT ${JSON.stringify({ rows: 4000, payloadBytes, elapsedMs, operationCounts })}\n`,
    );
    const readStarted = performance.now();
    const saved = await catalog.readComplete({
      organizationId: ORG,
      channelAccountId: ACCOUNT,
      sourceImportRunId: a.attemptId,
    });
    process.stdout.write(
      `ROCKET_COMPLETE_READ_MEASUREMENT ${JSON.stringify({ rows: rows.length, elapsedMs: Math.round(performance.now() - readStarted) })}\n`,
    );
    expect(saved.rows).toHaveLength(4000);
    expect(saved.identities).toHaveLength(4000);
    expect(saved.catalog.rowCount).toBe(4000);
    expect(payloadBytes).toBeLessThan(25 * 1024 * 1024);
  }, 120_000);
});

function row(productNo: string) {
  return {
    poLineId: `1001:${productNo}:8801234567890:1`,
    poNumber: '1001',
    vendorId: 'V1',
    productNo,
    barcode: '8801234567890',
    productName: `${productNo} item`,
    orderQty: 4,
    plannedDeliveryDate: '2026-09-20',
    poStatusCode: 'RP',
    businessDateBasis: 'expected_inbound' as const,
    confirmation: {
      center: '덕평1센터',
      inboundType: '택배',
      poStatus: '거래처확인요청',
      returnManager: '담당자',
      returnContact: '010-0000-0000',
      returnAddress: '서울',
      purchasePrice: 1000,
      supplyPrice: 900,
      vat: 90,
      totalPurchase: 3960,
      poRegisteredAt: '2026-09-17 09:00:00',
      xdock: 'N',
    },
  };
}
type SubmittedRow = Omit<ReturnType<typeof row>, 'confirmation'> & {
  confirmation?: ReturnType<typeof row>['confirmation'];
};
function submission(attemptId: string, rows: SubmittedRow[]) {
  return {
    collection: {
      collectionRunId: attemptId,
      vendorId: rows.length ? 'V1' : '',
      listPagesRead: 1,
      totalListPages: 1,
      truncated: false,
      detailPoCount: new Set(rows.map((r) => r.poNumber)).size,
      failedPoNumbers: [],
    },
    rows,
    proof: {
      from: plan.from,
      to: plan.to,
      status: plan.status,
      dateType: plan.dateType,
      validatedList: true,
    },
  };
}
