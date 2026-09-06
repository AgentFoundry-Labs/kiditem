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
import { AlertsRepository } from '../../alerts/alerts.repository';
import { ChannelListingQueryService } from '../application/service/channel-listing-query.service';
import { ChannelListingRepositoryAdapter } from '../adapter/out/repository/channel-listing.repository.adapter';
import { ChannelCatalogImportService } from '../application/service/channel-catalog-import.service';
import { ChannelCatalogImportRepositoryAdapter } from '../adapter/out/repository/channel-catalog-import.repository.adapter';
import { lockProductMapping } from '../../common/product-mapping-generation';
import type { PrismaClient } from '@prisma/client';
import type {
  CoupangCatalogCollectionPermit,
  PutCoupangCatalogChunkRequest,
} from '@kiditem/shared/coupang-catalog-snapshot';

const ACCOUNT = '11111111-1111-4111-8111-111111111111';
const base = `/api/channels/accounts/${ACCOUNT}/catalog-imports/coupang-wing/attempts`;
describe('Wing catalog owner HTTP + disposable PG', () => {
  let prisma: PrismaClient;
  let app: INestApplication;
  let alerts: SourceFailureAlerts;
  let listings: ChannelListingQueryService;
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
    alerts = new SourceFailureAlerts(new AlertsRepository(prisma as never));
    listings = new ChannelListingQueryService(new ChannelListingRepositoryAdapter(prisma as never));
    const owner = new ChannelCatalogCollectionService(
      new ChannelCatalogCollectionRepositoryAdapter(prisma as never, alerts),
      new ChannelCatalogPublicationRepositoryAdapter(
        prisma as never,
        new AiCatalogMediaPublicationRepositoryAdapter(),
        alerts,
      ),
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
        channel: 'coupang',
        name: 'Wing',
        vendorId: 'V1',
      },
    });
  });
  const start = (key = randomUUID(), collectorVersion = 'wing-inventory-v1') =>
    request(app.getHttpServer()).post(base).set('Idempotency-Key', key).send({ collectorVersion });
  const read = (id: string) => request(app.getHttpServer()).get(`${base}/${id}`).expect(200);
  const fail = (permit: { attemptId: string; attemptToken: string }, code = 'PROVIDER_ERROR') =>
    request(app.getHttpServer())
      .post(`${base}/${permit.attemptId}/fail`)
      .set('x-source-attempt-token', permit.attemptToken)
      .send({ code, message: 'Collection stopped', phase: 'discovery' });
  const visible = () => listings.list(ORG, { channelAccountId: ACCOUNT });
  const upload = (
    permit: CoupangCatalogCollectionPermit,
    payload: PutCoupangCatalogChunkRequest['payload'],
  ) =>
    request(app.getHttpServer())
      .put(`${base}/${permit.attemptId}/chunks/${payload.kind}/1`)
      .set('x-source-attempt-token', permit.attemptToken)
      .send({
        kind: payload.kind,
        sequence: 1,
        checksum: hashCatalogChunkPayload(payload),
        itemCount: 1,
        payload,
      });
  const finish = (permit: CoupangCatalogCollectionPermit, snapshotHash: string) =>
    request(app.getHttpServer())
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
  it('replays the exact frozen permit and exposes safe status without a token', async () => {
    const key = randomUUID();
    const admitted = await start(key).expect(201);
    expect(admitted.body).toMatchObject({
      state: 'RUNNING',
      plan: { vendorId: 'V1', publicationRevision: '0' },
    });
    expect(admitted.body.attemptToken).toEqual(expect.any(String));
    expect((await start(key).expect(201)).body).toEqual(admitted.body);
    const status = await request(app.getHttpServer())
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
    await request(app.getHttpServer())
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
      new ChannelCatalogImportRepositoryAdapter(prisma as never),
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
    const second = request(app.getHttpServer())
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
