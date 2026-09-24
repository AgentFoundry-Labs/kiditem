import { realSalesProductDraftPort } from '../../test-helpers/sales-product-draft-port';
import { persistBrowserSourceAttemptFacts } from '../adapter/out/repository/sourcing-browser-source-attempt.persistence';
import 'reflect-metadata';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { SourceFailureAlerts } from '../../alerts/alerts.service';
import { makeTestPrisma, resetDb, seedBaseFixture, TEST_ORGANIZATION_ID, TEST_USER_ID, OTHER_ORGANIZATION_ID } from '../../test-helpers/real-prisma';
import { SourcingBrowserSourceAttemptRepositoryAdapter } from '../adapter/out/repository/sourcing-browser-source-attempt.repository.adapter';
import { SourcingExtensionIngestController } from '../adapter/in/http/sourcing-extension-ingest.controller';
import { SourcingExtensionIngestService } from '../application/service/sourcing-extension-ingest.service';
import { SourcingService } from '../application/service/sourcing.service';
import type { INestApplication } from '@nestjs/common';
import type { PrismaClient } from '@prisma/client';
import { GlobalExceptionFilter } from '../../common/filters/global-exception.filter';

const product = JSON.parse(readFileSync(resolve(__dirname, '../../../../../extensions/tests/fixtures/1688-product-detail-v1.json'), 'utf8'));
const base = '/api/sourcing/extension/product-data';
const description = { source_url: product.source_url, product_id: product.product_id,
  description_images: ['https://cbu01.alicdn.com/description.jpg'], description_text: '설명 본문', description_image_count: 1 };

describe('product extension actual HTTP source owner (PostgreSQL)', () => {
  let prisma: PrismaClient, app: INestApplication;
  beforeAll(async () => {
    prisma = makeTestPrisma(); await prisma.$connect();
    const owner = new SourcingBrowserSourceAttemptRepositoryAdapter(
      prisma as never, new SourceFailureAlerts(prisma as never), realSalesProductDraftPort(prisma),
    );
    const module = await Test.createTestingModule({
      controllers: [SourcingExtensionIngestController],
      providers: [{ provide: SourcingService, useValue: {} },
        { provide: SourcingExtensionIngestService, useValue: new SourcingExtensionIngestService(owner as never) }],
    }).compile();
    app = module.createNestApplication(); app.setGlobalPrefix('api');
    app.use((req: any, _res: any, next: () => void) => {
      if (req.headers.authorization) req.authUser = { id: TEST_USER_ID, organizationId: req.headers['test-organization'] || TEST_ORGANIZATION_ID };
      next();
    });
    // KidItem 오류(인증 401 등)를 운영 main.ts와 같은 봉투로 낸다(ADR-0023).
    app.useGlobalFilters(new GlobalExceptionFilter());
    await app.init();
  });
  afterAll(async () => { await app?.close(); await prisma?.$disconnect(); });
  beforeEach(async () => { await resetDb(prisma); await seedBaseFixture(prisma); });
  const call = () => request(app.getHttpServer());
  const begin = async (key: string, sourceUrl = product.source_url) => (await call().post(`${base}/attempts`)
    .set('authorization', 'fixture').set('idempotency-key', key).send({ sourceUrl }).expect(201)).body;
  const complete = (attempt: any, body = { product, description, hadDescription: true }) => call()
    .put(`${base}/attempts/${attempt.attemptId}/complete`).set('authorization', 'fixture')
    .set('x-source-attempt-token', attempt.attemptToken).send(body);

  it('freezes the current URL before extraction, replays the same key, and atomically preserves normalized commercial/detail-description projection', async () => {
    const attempt = await begin('first');
    expect(attempt.plan).toMatchObject({ sourceUrl: product.source_url });
    expect(await begin('first')).toEqual(attempt);
    await call().post(`${base}/attempts`).set('authorization', 'fixture').set('idempotency-key', 'first')
      .send({ sourceUrl: `${product.source_url}?different=true` }).expect(409);
    expect(await prisma.sourceRecord.count()).toBe(0);
    await complete(attempt).expect(200);
    const candidate = await prisma.sourceRecord.findFirstOrThrow();
    const { description_image_count: _count, ...normalizedDescription } = description;
    // Retained V1 defaults plus the existing shallow description merge.
    expect(candidate.rawData).toEqual({ ...product, ...normalizedDescription, page_type: 'description',
      images: [], detail_images: [], tags: [], pack_info: [], sku_attrs: [], sku_list: [], price_tiers: [] });
    expect(candidate).toMatchObject({ sourcePlatform: 'ALIBABA_1688', name: product.title, description: description.description_text });
    expect(Number(candidate.costCny)).toBe(product.price_min);
    expect(await prisma.sourceRecordImage.findMany()).toMatchObject([{ url: product.images[0], role: 'product' }]);
    expect(await prisma.sourcingEvidenceObservation.count()).toBe(2);
    const evidence = await prisma.sourcingEvidenceObservation.findMany();
    expect(evidence.map((row) => row.payload)).toContainEqual(expect.objectContaining({ commercial: expect.objectContaining({
      images: product.images, sku_attrs: product.sku_attrs, sku_list: product.sku_list, price_tiers: product.price_tiers,
      price_min: product.price_min, price_max: product.price_max,
    }) }));
    // 원본 기록과 그 초안은 수집 종료와 한 커밋이다(KID-313). 초안은 상세 · 설명을 다 담은 뒤 만든다.
    const draft = await prisma.salesProduct.findFirstOrThrow({ where: { sourceRecordId: candidate.id } });
    expect(draft).toMatchObject({ status: 'draft', code: null, name: product.title, sourcePlatform: 'ALIBABA_1688',
      description: description.description_text, sourceRaw: null });
    const terminal = (await complete(attempt).expect(200)).body;
    expect(terminal).toMatchObject({ state: 'COMPLETE' }); expect(terminal).not.toHaveProperty('attemptToken');
    // 같은 키로 다시 보내도 초안은 하나다.
    expect(await prisma.salesProduct.count({ where: { sourceRecordId: candidate.id } })).toBe(1);
    await complete(attempt, { product: { ...product, title: 'changed' }, description, hadDescription: true }).expect(409);
    expect(await prisma.sourcingEvidenceObservation.count()).toBe(2);
  });

  it('rejects unauthorized and mismatched URLs/tokens and retains the prior COMPLETE source record/facts with a concrete failure Alert', async () => {
    await call().post(`${base}/attempts`).send({ sourceUrl: product.source_url }).expect(401);
    await call().post(`${base}/attempts`).set('authorization', 'fixture').set('idempotency-key', 'bad-url')
      .send({ sourceUrl: 'https://evil.invalid/offer/1' }).expect(400);
    const baseline = await begin('baseline'); await complete(baseline).expect(200);
    const before = await prisma.sourceRecord.findFirstOrThrow();
    const refresh = await begin('refresh');
    await call().get(`${base}/attempts/${refresh.attemptId}`).set('authorization', 'fixture')
      .set('test-organization', OTHER_ORGANIZATION_ID).expect(404);
    await complete({ ...refresh, attemptToken: '33333333-3333-4333-8333-333333333333' }).expect(409);
    await complete(refresh, { product: { ...product, source_url: 'https://detail.1688.com/offer/9999999.html' }, description, hadDescription: true }).expect(400);
    expect(await prisma.sourceRecord.findFirstOrThrow()).toEqual(before);
    expect(await prisma.sourcingEvidenceObservation.count()).toBe(2);
    expect(await prisma.alert.findFirstOrThrow()).toMatchObject({ status: 'OPEN', attemptId: refresh.attemptId });
    const status = (await call().get(`${base}/status`).query({ sourceUrl: product.source_url }).set('authorization', 'fixture').expect(200)).body;
    expect(status).toMatchObject({ ready: true, latestComplete: { attemptId: baseline.attemptId }, latestAttempt: { state: 'FAILED' } });
    expect(status.latestComplete).not.toHaveProperty('attemptToken');
  });

  it('requires the optional description promised by completion, and refuses expired terminal writes without read side effects', async () => {
    const incomplete = await begin('incomplete');
    await complete(incomplete, { product, hadDescription: true } as never).expect(400);
    expect(await prisma.sourceRecord.count()).toBe(0);
    const expired = await begin('expired');
    await prisma.sourcingEvidenceIngestionRun.update({ where: { id: expired.attemptId }, data: { leaseExpiresAt: new Date('2020-01-01') } });
    const read = (await call().get(`${base}/attempts/${expired.attemptId}`).set('authorization', 'fixture').expect(200)).body;
    expect(read).toMatchObject({ state: 'FAILED', errorCode: 'ATTEMPT_EXPIRED' }); expect(read).not.toHaveProperty('attemptToken');
    await complete(expired).expect(409);
    expect(await prisma.sourcingEvidenceIngestionRun.findUniqueOrThrow({ where: { id: expired.attemptId } })).toMatchObject({ status: 'RUNNING' });
  });

  it('completes search artifacts without creating a source record and accepts detail with no optional description', async () => {
    const searchUrl = 'https://s.1688.com/selloffer/offer_search.htm?keywords=test#offers';
    const search = await begin('search', searchUrl);
    expect(search.plan.sourceUrl).toBe(searchUrl);
    await complete(search, { product: { ...product, source_url: searchUrl, page_type: 'search', total_found: 3 }, hadDescription: false } as never).expect(200);
    expect(await prisma.sourceRecord.count()).toBe(0);
    expect(await prisma.sourcingEvidenceObservation.count()).toBe(0);
    const detail = await begin('detail'); await complete(detail, { product, hadDescription: false } as never).expect(200);
    expect(await prisma.sourceRecord.count()).toBe(1);
  });

  it('rejects changed query identity even when source-record URL normalization would discard the query', async () => {
    const attempt = await begin('query-identity', `${product.source_url}?spm=original`);
    await complete(attempt, { product: { ...product, source_url: `${product.source_url}?spm=changed` }, hadDescription: false } as never).expect(400);
    expect(await prisma.sourceRecord.count()).toBe(0);
    expect(await prisma.sourcingEvidenceIngestionRun.findUniqueOrThrow({ where: { id: attempt.attemptId } })).toMatchObject({ status: 'FAILED' });
  });

  it('serializes tracking-URL variants in one canonical product scope and retains its COMPLETE through the next refresh', async () => {
    const firstUrl = `${product.source_url}?spm=first#detail`;
    const nextUrl = `${product.source_url}?spm=second#description`;
    const first = await begin('canonical-first', firstUrl);
    expect(first.plan.sourceUrl).toBe(firstUrl);
    const blocked = await call().post(`${base}/attempts`).set('authorization', 'fixture')
      .set('idempotency-key', 'canonical-next').send({ sourceUrl: nextUrl }).expect(409);
    expect(blocked.body).toMatchObject({ code: 'ATTEMPT_IN_PROGRESS', attemptId: first.attemptId });
    expect(await prisma.sourcingEvidenceIngestionRun.count()).toBe(1);

    await complete(first, { product: { ...product, source_url: firstUrl }, hadDescription: false } as never).expect(200);
    const before = await prisma.sourceRecord.findFirstOrThrow();
    const next = await begin('canonical-next', nextUrl);
    expect(next.plan.sourceUrl).toBe(nextUrl);
    expect(next.planChecksum).not.toBe(first.planChecksum);
    expect(next.targetKey).toBe(first.targetKey);
    expect(next.generation).toBe(first.generation + 1);
    expect(await prisma.sourceRecord.findFirstOrThrow()).toEqual(before);
    const status = (await call().get(`${base}/status`).query({ sourceUrl: nextUrl })
      .set('authorization', 'fixture').expect(200)).body;
    expect(status).toMatchObject({ latestAttempt: { attemptId: next.attemptId },
      latestComplete: { attemptId: first.attemptId } });

    await call().post(`${base}/attempts/${next.attemptId}/fail`).set('authorization', 'fixture')
      .set('x-source-attempt-token', next.attemptToken).send({ code: 'EXTRACTION_TIMEOUT', message: 'timeout' }).expect(201);
    expect(await prisma.sourceRecord.findFirstOrThrow()).toEqual(before);
    expect(await prisma.sourcingEvidenceObservation.count()).toBe(1);
    const failedStatus = (await call().get(`${base}/status`).query({ sourceUrl: firstUrl })
      .set('authorization', 'fixture').expect(200)).body;
    expect(failedStatus).toMatchObject({ ready: true, latestAttempt: { attemptId: next.attemptId, state: 'FAILED' },
      latestComplete: { attemptId: first.attemptId } });
  });
  it('refuses a second collection of the same source with 409 and the existing draft, without a source-failure Alert', async () => {
    const first = await begin('first-collection'); await complete(first, { product, hadDescription: false } as never).expect(200);
    const record = await prisma.sourceRecord.findFirstOrThrow();
    const draft = await prisma.salesProduct.findFirstOrThrow({ where: { sourceRecordId: record.id } });

    const again = await begin('second-collection');
    const refused = await complete(again, { product, hadDescription: false } as never).expect(409);

    expect(refused.body).toMatchObject({
      code: 'SOURCING_DUPLICATE_RECORD',
      details: {
        reason: 'draft_exists',
        existing: { sourceRecordId: record.id, salesProductId: draft.id, salesProductStatus: 'draft' },
      },
    });
    expect(await prisma.sourceRecord.count()).toBe(1);
    expect(await prisma.salesProduct.count()).toBe(1);
    expect(await prisma.sourcingEvidenceIngestionRun.findUniqueOrThrow({ where: { id: again.attemptId } }))
      .toMatchObject({ status: 'FAILED', errorCode: 'ALREADY_COLLECTED_CANCELLED' });
    expect(await prisma.alert.count()).toBe(0);
  });

  it('accepts only the platforms its extension source keys authorize', async () => {
    const permit = { runId: '11111111-1111-4111-8111-111111111111', organizationId: TEST_ORGANIZATION_ID,
      sourceKey: 'alibaba.product_extension', scopeKey: 'current-tab', targetKey: 't', leaseToken: 'l', generation: 1,
      leaseExpiresAt: new Date() };
    const projection = { organizationId: TEST_ORGANIZATION_ID, pageType: 'detail' as const, sourceUrl: product.source_url,
      sourcePlatform: 'TAOBAO', externalOfferId: '1', variantKeyNormalized: '', sourceIdentityHash: 'h', rawData: {},
      name: 'x', description: null, category: null, tags: [], thumbnailUrl: null, imageUrl: null, costCny: null,
      triggeredByUserId: null, images: [] };
    const output = { observations: [], typedRecords: [{ kind: 'extension_source_record' as const, row: projection }],
      discoveredCount: 1, rejectedCount: 0, qualityReport: {} };

    await expect(persistBrowserSourceAttemptFacts(prisma as never, permit, output, new Date(), realSalesProductDraftPort(prisma)))
      .rejects.toThrow('does not match its authorized source attempt');
    await expect(persistBrowserSourceAttemptFacts(prisma as never, { ...permit, sourceKey: '1688.product_extension' },
      { ...output, typedRecords: [{ kind: 'extension_source_record' as const, row: { ...projection, sourcePlatform: 'ALIBABA' } }] },
      new Date(), realSalesProductDraftPort(prisma))).rejects.toThrow('does not match its authorized source attempt');
    expect(await prisma.sourceRecord.count()).toBe(0);
  });
});
