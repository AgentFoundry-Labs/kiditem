import { randomUUID } from 'node:crypto';
import { type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import { AlertsRepository } from '../../alerts/alerts.repository';
import { SourceFailureAlerts } from '../../alerts/alerts.service';
import {
  makeTestPrisma,
  resetDb,
  seedBaseFixture,
  TEST_ORGANIZATION_ID as ORG,
  TEST_USER_ID as USER,
} from '../../test-helpers/real-prisma';
import { RocketPoSourceController } from '../adapter/in/http/rocket-po-source.controller';
import { RocketPoCatalogRepositoryAdapter } from '../adapter/out/repository/rocket-po-catalog.repository.adapter';
import { RocketPoCatalogService } from '../application/service/rocket-po-catalog.service';
import { ROCKET_PO_CATALOG_PORT } from '../application/port/in/rocket-po-catalog.port';
import { RocketPurchasePreviewService } from '../../supply/application/service/rocket-purchase-preview.service';
import { ChannelSkuAvailabilityService } from '../application/service/channel-sku-availability.service';
import { ChannelProductMatchingRepositoryAdapter } from '../adapter/out/repository/channel-product-matching.repository.adapter';
import { InventoryAvailabilityService } from '../../inventory/application/service/inventory-availability.service';
import { InventoryAvailabilityRepositoryAdapter } from '../../inventory/adapter/out/repository/inventory-availability.repository.adapter';
import { SellpiaInventoryFreshnessService } from '../../inventory/application/service/sellpia-inventory-freshness.service';
import { SellpiaInventoryFreshnessRepositoryAdapter } from '../../inventory/adapter/out/repository/sellpia-inventory-freshness.repository.adapter';
import { RocketWorkbookExportService } from '../../supply/application/service/rocket-purchase-confirmation.service';
import { RocketPurchaseConfirmationTransactionAdapter } from '../../supply/adapter/out/transaction/rocket-purchase-confirmation.transaction.adapter';
import { RocketWorkbookProgressService } from '../../inventory/application/service/rocket-workbook-progress.service';
import { RocketWorkbookProgressRepositoryAdapter } from '../../inventory/adapter/out/repository/rocket-workbook-progress.repository.adapter';
import { configureAgentRuntimeBodyParsers } from '../../common/http/agent-runtime-body-parser';

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
  let catalog: RocketPoCatalogService;
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
    const alerts = new SourceFailureAlerts(new AlertsRepository(prisma as never));
    const repository = new RocketPoCatalogRepositoryAdapter(prisma as never, alerts);
    catalog = new RocketPoCatalogService(repository);
    const module = await Test.createTestingModule({
      controllers: [RocketPoSourceController],
      providers: [{ provide: ROCKET_PO_CATALOG_PORT, useValue: catalog }],
    }).compile();
    app = module.createNestApplication({ logger: false, bodyParser: false });
    configureAgentRuntimeBodyParsers(app);
    app.setGlobalPrefix('api');
    app.use(
      (
        req: { headers: Record<string, string>; authUser?: unknown },
        _res: unknown,
        next: () => void,
      ) => {
        if (req.headers['x-test-org'])
          req.authUser = { id: USER, organizationId: req.headers['x-test-org'] };
        next();
      },
    );
    await app.init();
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
    request(app.getHttpServer())
      .post(`${base}/attempts`)
      .set('x-test-org', ORG)
      .set('Idempotency-Key', key)
      .send(body);
  const readSource = () =>
    request(app.getHttpServer())
      .get(`${base}/source?channelAccountId=${ACCOUNT}`)
      .set('x-test-org', ORG)
      .expect(200);
  const finish = (attempt: { attemptId: string; attemptToken: string }, rows = [row('P1')]) =>
    request(app.getHttpServer())
      .put(`${base}/attempts/${attempt.attemptId}`)
      .set('x-test-org', ORG)
      .set('x-source-attempt-token', attempt.attemptToken)
      .send(submission(attempt.attemptId, rows));
  const previewService = () =>
    new RocketPurchasePreviewService(
      catalog,
      new ChannelSkuAvailabilityService(
        new ChannelProductMatchingRepositoryAdapter(prisma as never),
        new InventoryAvailabilityService(
          new InventoryAvailabilityRepositoryAdapter(prisma as never),
        ),
      ),
      new SellpiaInventoryFreshnessService(
        new SellpiaInventoryFreshnessRepositoryAdapter(
          prisma as never,
          new SourceFailureAlerts(new AlertsRepository(prisma as never)),
        ),
      ),
    );
  it('freezes an authorized plan, replays the same begin, and rejects a distinct concurrent start', async () => {
    const key = randomUUID();
    const first = await start(key).expect(201);
    expect(first.body).toMatchObject({
      state: 'RUNNING',
      generation: '1',
      plan: {
        ...plan,
        sourceType: 'coupang_rocket_po_catalog',
        vendorExpectations: { rocketVendorId: 'V1', sharedCoupangVendorId: null },
      },
    });
    expect((await start(key).expect(201)).body).toEqual(first.body);
    await start().expect(409);
    await start(key, { ...plan, status: 'RP' }).expect(409);
    const source = await request(app.getHttpServer())
      .get(`${base}/source?channelAccountId=${ACCOUNT}`)
      .set('x-test-org', ORG)
      .expect(200);
    expect(source.body).toMatchObject({
      status: 'MISSING',
      refreshing: true,
      latestAttempt: { attemptId: first.body.attemptId },
      latestComplete: null,
    });
    expect(source.body.latestAttempt).not.toHaveProperty('attemptToken');
  });
  it('publishes exact B, retains A, preserves B on failure, and lets empty COMPLETE become current', async () => {
    const a = (await start()).body;
    await finish(a).expect(200);
    const b = (await start()).body;
    await finish(b, [row('P2')]).expect(200);
    const scope = { organizationId: ORG, channelAccountId: ACCOUNT };
    expect(
      (await catalog.loadSavedCollection({ ...scope, sourceImportRunId: a.attemptId }))?.rows.map(
        (r) => r.productNo,
      ),
    ).toEqual(['P1']);
    expect(
      (await catalog.listSavedPos({ ...scope, from: plan.from, to: plan.to })).map(
        (r) => r.firstProductName,
      ),
    ).toEqual(['P2 item']);
    const failed = (await start()).body;
    await request(app.getHttpServer())
      .post(`${base}/attempts/${failed.attemptId}/fail`)
      .set('x-test-org', ORG)
      .set('x-source-attempt-token', failed.attemptToken)
      .send({ code: 'coupang_po_session_required', message: '로그인 필요' })
      .expect(201);
    expect((await readSource()).body).toMatchObject({
      status: 'STALE',
      latestAttempt: { state: 'FAILED' },
      latestComplete: { attemptId: b.attemptId },
    });
    const empty = (await start()).body;
    await finish(empty, []).expect(200);
    expect((await readSource()).body).toMatchObject({
      status: 'READY',
      latestComplete: { attemptId: empty.attemptId, state: 'COMPLETE' },
    });
    expect(await catalog.listSavedPos({ ...scope, from: plan.from, to: plan.to })).toEqual([]);
    expect(
      (await catalog.loadSavedCollection({ ...scope, sourceImportRunId: empty.attemptId }))?.rows,
    ).toEqual([]);
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
    await prisma.channelAccount.update({ where: { id: ACCOUNT }, data: { vendorId: 'CHANGED' } });
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
    await prisma.channelAccount.update({ where: { id: ACCOUNT }, data: { status: 'inactive' } });
    expect((await finish(b).expect(200)).body).toMatchObject({
      state: 'FAILED',
      errorCode: 'ROCKET_PO_ACCOUNT_UNAVAILABLE',
    });
    expect((await readSource()).body).toMatchObject({
      status: 'STALE',
      latestAttempt: { attemptId: b.attemptId, state: 'FAILED' },
      latestComplete: { attemptId: a.attemptId },
    });
    await start().expect(404);
    await start(randomUUID(), { ...plan, channelAccountId: randomUUID() }).expect(404);
    await request(app.getHttpServer())
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
    await prisma.channelAccount.update({ where: { id: ACCOUNT }, data: { vendorId: null } });
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
      (await prisma.channelAccount.findUniqueOrThrow({ where: { id: ACCOUNT } })).vendorId,
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
    const scope = { organizationId: ORG, channelAccountId: ACCOUNT, from: plan.from, to: plan.to };
    expect(await catalog.listSavedPos({ ...scope, status: '거래처확인요청' })).toHaveLength(2);
    expect(
      await catalog.loadSavedCollection({
        ...scope,
        organizationId: randomUUID(),
        sourceImportRunId: a.attemptId,
      }),
    ).toBeNull();
    await prisma.sourceImportRun.update({
      where: { id: a.attemptId },
      data: { status: 'completed', parserVersion: null, plan: {} },
    });
    expect((await readSource()).body).toMatchObject({
      status: 'MISSING',
      latestAttempt: null,
      latestComplete: null,
    });
    expect(await catalog.listSavedPos(scope)).toEqual([]);
    expect(
      await catalog.loadSavedCollection({ ...scope, sourceImportRunId: a.attemptId }),
    ).toBeNull();
    const b = (await start()).body;
    await finish(b, [row('NEW')]).expect(200);
    expect((await catalog.listSavedPos(scope)).map((po) => po.firstProductName)).toEqual([
      'NEW item',
    ]);
    expect(await prisma.rocketPoCatalogSnapshot.count()).toBe(2);
    expect(await prisma.rocketPoCatalogLine.count()).toBe(4);
  });
  it('Supply preview reads exact COMPLETE rows and cannot publish or accept replacement rows', async () => {
    const a = (await start()).body;
    await finish(a).expect(200);
    const b = (await start()).body;
    await finish(b, [row('P2')]).expect(200);
    const preview = previewService();
    const input = {
      organizationId: ORG,
      userId: USER,
      inventoryRequirement: 'advisory' as const,
      request: {
        channelAccountId: ACCOUNT,
        sourceImportRunId: a.attemptId,
        editedQuantities: {},
        previewScope: 'confirmation_requested' as const,
      },
    };
    const result = await preview.preview(input);
    expect(result.rows).toMatchObject([
      { productNo: 'P1', orderQuantity: 4, reason: 'mapping_required' },
    ]);
    expect(result.catalog).toMatchObject({ sourceImportRunId: a.attemptId });
    expect((await readSource()).body.latestComplete.attemptId).toBe(b.attemptId);
    await expect(
      preview.preview({ ...input, request: { ...input.request, rows: [] } as never }),
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
      data: { organizationId: ORG, code: 'KI1', name: 'Confirmed product' },
    });
    await prisma.channelListing.update({
      where: { id: option.listingId },
      data: { masterProductId: master.id },
    });
    const sku = await prisma.sellpiaInventorySku.create({
      data: { organizationId: ORG, code: 'S1', name: 'Component', currentStock: 5, isActive: true },
    });
    await prisma.channelListingOptionInventoryComponent.create({
      data: {
        organizationId: ORG,
        channelListingOptionId: option.id,
        sellpiaInventorySkuId: sku.id,
        quantity: 1,
      },
    });
    await prisma.sellpiaInventoryState.create({
      data: {
        organizationId: ORG,
        requestedGeneration: 1n,
        verifiedGeneration: 1n,
        lastVerifiedAt: new Date(),
        sourceOrigin: 'https://kiditem.sellpia.com',
        sourceAccountKey: 'kiditem',
      },
    });
    const service = new RocketWorkbookExportService(
      previewService(),
      new RocketPurchaseConfirmationTransactionAdapter(
        prisma as never,
        new RocketWorkbookProgressService(new RocketWorkbookProgressRepositoryAdapter()),
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
      (await service.downloadWorkbook({ organizationId: ORG, exportId: first.exportId })).bytes,
    ).toEqual(input.artifactBytes);
    expect((await readSource()).body.latestComplete.attemptId).toBe(a.attemptId);
  });
  it('replays canonical terminal content but a new identical capture gets its own generation', async () => {
    const a = (await start()).body;
    const rows = [row('P1'), row('P2')];
    const first = (await finish(a, rows).expect(200)).body;
    const payload = submission(a.attemptId, rows.reverse());
    const replay = await request(app.getHttpServer())
      .put(`${base}/attempts/${a.attemptId}`)
      .set('x-test-org', ORG)
      .set('x-source-attempt-token', a.attemptToken)
      .send({
        proof: payload.proof,
        rows: payload.rows.map(({ productNo, ...rest }) => ({ productNo, ...rest })),
        collection: payload.collection,
      })
      .expect(200);
    expect(replay.body).toEqual(first);
    await finish(a, [row('CHANGED')]).expect(409);
    const b = (await start()).body;
    expect(b.generation).toBe('2');
    await finish(b, rows).expect(200);
    expect((await readSource()).body.latestComplete.attemptId).toBe(b.attemptId);
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
    await request(app.getHttpServer()).get(`${base}/attempts/${a.attemptId}`).expect(401);
    await request(app.getHttpServer())
      .get(`${base}/attempts/${a.attemptId}`)
      .set('x-test-org', randomUUID())
      .expect(404);
    await finish({ ...a, attemptToken: randomUUID() }).expect(409);
    await request(app.getHttpServer())
      .put(`${base}/attempts/${a.attemptId}`)
      .set('x-test-org', ORG)
      .set('x-source-attempt-token', a.attemptToken)
      .send({
        ...submission(a.attemptId, []),
        proof: { ...submission(a.attemptId, []).proof, from: '2026-08-01' },
      })
      .expect(409);
    await request(app.getHttpServer())
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
    await request(app.getHttpServer())
      .post(`${base}/attempts/${a.attemptId}/fail`)
      .set('x-test-org', ORG)
      .set('x-source-attempt-token', a.attemptToken)
      .send({ code: 'FAILED', message: 'Too late' })
      .expect(409);
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
      (await prisma.sourceImportRun.findUniqueOrThrow({ where: { id: a.attemptId } })).status,
    ).toBe('running');
    await finish(a).expect(409);
    expect((await start()).body.generation).toBe('2');
    expect(
      (await prisma.sourceImportRun.findUniqueOrThrow({ where: { id: a.attemptId } })).status,
    ).toBe('failed');
    expect(await prisma.alert.count({ where: { organizationId: ORG } })).toBe(1);
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
        request(app.getHttpServer())
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
      expect(await prisma.alert.count({ where: { organizationId: ORG } })).toBe(1);
    },
  );
  it('rolls back COMPLETE facts and FAILED status when the owner Alert write fails', async () => {
    const a = (await start()).body;
    const fail = () =>
      request(app.getHttpServer())
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
      await prisma.$executeRawUnsafe('DROP TRIGGER reject_rocket_alert ON alerts');
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
      await prisma.$executeRawUnsafe('DROP TRIGGER reject_rocket_alert ON alerts');
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
          await request(app.getHttpServer())
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
    await prisma.channelAccount.update({ where: { id: ACCOUNT }, data: { vendorId: null } });
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
      (await prisma.channelAccount.findUniqueOrThrow({ where: { id: ACCOUNT } })).vendorId,
    ).toBeNull();
    const a = (await start()).body;
    await finish(a).expect(200);
    expect(
      (await prisma.channelAccount.findUniqueOrThrow({ where: { id: wing.id } })).vendorId,
    ).toBe('V1');
    const option = await prisma.channelListingOption.findFirstOrThrow({
      where: { organizationId: ORG, externalOptionId: 'P1' },
    });
    const master = await prisma.masterProduct.create({
      data: { organizationId: ORG, code: 'KEEP', name: 'Keep' },
    });
    const sku = await prisma.sellpiaInventorySku.create({
      data: { organizationId: ORG, code: 'KEEP', name: 'Keep', currentStock: 7 },
    });
    await prisma.channelListing.update({
      where: { id: option.listingId },
      data: { masterProductId: master.id },
    });
    await prisma.channelListingOptionInventoryComponent.create({
      data: {
        organizationId: ORG,
        channelListingOptionId: option.id,
        sellpiaInventorySkuId: sku.id,
        quantity: 2,
      },
    });
    const b = (await start()).body;
    await finish(b, [row('P2')]).expect(200);
    const c = (await start()).body;
    await finish(c).expect(200);
    expect(await prisma.masterProduct.count()).toBe(1);
    expect(
      (await prisma.channelListing.findUniqueOrThrow({ where: { id: option.listingId } }))
        .masterProductId,
    ).toBe(master.id);
    expect(
      await prisma.channelListingOptionInventoryComponent.findMany({
        where: { channelListingOptionId: option.id },
        select: { sellpiaInventorySkuId: true, quantity: true },
      }),
    ).toEqual([{ sellpiaInventorySkuId: sku.id, quantity: 2 }]);
    expect(
      (await prisma.sellpiaInventorySku.findUniqueOrThrow({ where: { id: sku.id } })).currentStock,
    ).toBe(7);
  });
  it('keeps explicit generic evidence distinct from confirmation requirements without limiting provider pages', async () => {
    const generic = (
      await start(randomUUID(), { ...plan, requireConfirmation: false, status: 'PA' })
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
    await request(app.getHttpServer())
      .put(`${base}/attempts/${generic.attemptId}`)
      .set('x-test-org', ORG)
      .set('x-source-attempt-token', generic.attemptToken)
      .send(payload)
      .expect(200);
    const strict = (await start()).body;
    expect((await finish(strict, [{ ...row('P1'), barcode: '' }]).expect(200)).body.state).toBe(
      'FAILED',
    );
    expect((await readSource()).body.latestComplete.attemptId).toBe(generic.attemptId);
  });
  it('accepts and measures the existing 4,000-line one-shot range using bulk identity writes', async () => {
    const a = (await start()).body;
    const rows = Array.from({ length: 4000 }, (_, index) => ({
      ...row(`PRODUCT-${index}`),
      poNumber: String(100000 + index),
    }));
    const payloadBytes = Buffer.byteLength(JSON.stringify(submission(a.attemptId, rows)));
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
function submission(attemptId: string, rows: ReturnType<typeof row>[]) {
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
