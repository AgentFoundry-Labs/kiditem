import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { makeTestPrisma, resetDb, seedBaseFixture, TEST_ORGANIZATION_ID, TEST_USER_ID } from '../../test-helpers/real-prisma';
import { SourcingCandidateRepositoryAdapter } from '../adapter/out/repository/sourcing-candidate.repository.adapter';
import { prepareSourcingScrapeResult } from '../application/service/sourcing-scrape-result.service';
import { SourcingScrapeUrlService } from '../application/service/sourcing-scrape-url.service';
import { SourcingFinalCapabilityAdapter } from '../adapter/in/agent/sourcing-final-capability.adapter';
import { canonicalOwnerInputHash } from '../../common/owner-idempotency-key';
import { SourcingService } from '../application/service/sourcing.service';
import { SourcingExtensionIngestController } from '../adapter/in/http/sourcing-extension-ingest.controller';
import { SourcingExtensionIngestService } from '../application/service/sourcing-extension-ingest.service';
import { SourcingBrowserSourceAttemptRepositoryAdapter } from '../adapter/out/repository/sourcing-browser-source-attempt.repository.adapter';
import { SourceFailureAlerts } from '../../alerts/alerts.service';
import type { INestApplication } from '@nestjs/common';
import type { PrismaClient } from '@prisma/client';
import { realSalesProductDraftPort } from '../../test-helpers/sales-product-draft-port';

const sourceUrl = 'https://detail.1688.com/offer/123.html';
const scraped = {
  source_url: `${sourceUrl}?spm=fixture#detail`, title: ' 실리콘 식판 ', description_text: ' 설명 본문 ',
  category_name: ' 식기 ', tags: [' 유아 ', '', 7], variant_key: '  Blue   Set ',
  images: ['//img.test/main.jpg', 'https://img.test/main.jpg'], imageUrls: ['http://img.test/second.jpg'],
  image_urls: [['https://img.test/third.jpg']], mainImages: ['https://img.test/fourth.jpg'],
  main_images: ['https://img.test/fifth.jpg'], mainImage: 'https://img.test/sixth.jpg',
  main_image: 'https://img.test/seventh.jpg', offerImgList: ['https://img.test/eighth.jpg', 'data:skip'],
  price_range: '14.25-22', sku_list: [{ sku_id: 'sku1', price: 17 }], pack_info: [{ weight: 3 }],
  specs: { material: 'silicone' }, seller_login_id: 'seller', arbitrary_provider_field: { retained: true },
};

describe('retained scrape URL owner normalization and lifecycle (PostgreSQL)', () => {
  let prisma: PrismaClient;
  let candidates: SourcingCandidateRepositoryAdapter;
  let app: INestApplication;
  let providerCalls = 0;
  let provider: () => Promise<Record<string, unknown>>;
  let capability: SourcingFinalCapabilityAdapter;
  beforeAll(async () => {
    prisma = makeTestPrisma(); await prisma.$connect();
    candidates = new SourcingCandidateRepositoryAdapter(prisma as never, undefined, undefined, realSalesProductDraftPort(prisma));
    const attempts = new SourcingBrowserSourceAttemptRepositoryAdapter(prisma as never, new SourceFailureAlerts(prisma as never));
    const owner = new SourcingScrapeUrlService(attempts, candidates, { scrapeProductUrl: async () => { providerCalls++; return provider(); } });
    capability = new SourcingFinalCapabilityAdapter(undefined as never, undefined as never, undefined as never,
      undefined as never, owner, undefined as never, undefined as never);
    const sourcing = new SourcingService(candidates, undefined as never, undefined as never,
      undefined as never, owner);
    const module = await Test.createTestingModule({ controllers: [SourcingExtensionIngestController], providers: [
      { provide: SourcingService, useValue: sourcing }, { provide: SourcingExtensionIngestService, useValue: new SourcingExtensionIngestService(attempts) },
    ] }).compile();
    app = module.createNestApplication(); app.setGlobalPrefix('api');
    app.use((req: any, _res: any, next: () => void) => { req.authUser = { id: TEST_USER_ID, organizationId: TEST_ORGANIZATION_ID }; next(); });
    await app.init();
  });
  afterAll(async () => { await app?.close(); await prisma?.$disconnect(); });
  beforeEach(async () => { await resetDb(prisma); await seedBaseFixture(prisma); providerCalls = 0;
    provider = async () => ({ ok: true, source_url: sourceUrl, scraped_data: scraped }); });
  const collect = (key: string) => request(app.getHttpServer()).post('/api/sourcing/scrape-url')
    .set('idempotency-key', key).send({ url: sourceUrl });

  it('retains every image alias, commercial/provider field, description, variant and CNY fallback from the deployed normalizer', async () => {
    const normalized = prepareSourcingScrapeResult({ organizationId: TEST_ORGANIZATION_ID, triggeredByUserId: TEST_USER_ID,
      output: { ok: true, source_url: sourceUrl, scraped_data: scraped } });
    await candidates.upsertSourced(normalized);
    const candidate = await candidates.findActiveBySourceUrl({ organizationId: TEST_ORGANIZATION_ID, sourceUrl });
    expect(candidate).toMatchObject({ name: '실리콘 식판', description: '설명 본문', category: '식기', tags: ['유아'],
      sourcePlatform: 'ALIBABA_1688', externalOfferId: '123', variantKeyNormalized: 'blue set',
      thumbnailUrl: 'https://img.test/main.jpg', rawData: { ...scraped, source_url: sourceUrl, page_type: 'detail' } });
    expect(Number(candidate!.costCny)).toBe(14.25);
    expect((await prisma.candidateImage.findMany({ orderBy: { sortOrder: 'asc' } })).map(({ url }) => url)).toEqual([
      'https://img.test/main.jpg', 'http://img.test/second.jpg', 'https://img.test/third.jpg', 'https://img.test/fourth.jpg',
      'https://img.test/fifth.jpg', 'https://img.test/sixth.jpg', 'https://img.test/seventh.jpg', 'https://img.test/eighth.jpg',
    ]);
  });

  it('executes the existing provider directly and replays immutable owner results without running it again', async () => {
    const result = (await collect('first').expect(201)).body;
    expect(result).toMatchObject({ ok: true, skipped: false, attempt: { state: 'COMPLETE' } });
    expect(result.candidateId).toBeTruthy(); expect(result).not.toHaveProperty('operation');
    expect(result.attempt).not.toHaveProperty('attemptToken');
    expect((await collect('first').expect(201)).body).toEqual(result);
    await request(app.getHttpServer()).post('/api/sourcing/scrape-url').set('idempotency-key', 'first')
      .send({ url: 'https://detail.1688.com/offer/456.html' }).expect(409);
    expect(providerCalls).toBe(1);
    expect(await prisma.sourcingEvidenceObservation.count()).toBe(1);
    expect(await prisma.sourcingCandidate.count()).toBe(1);
  });

  it('fences concurrent canonical URL requests and never repeats provider IO for a RUNNING key', async () => {
    let release!: () => void;
    let entered!: () => void;
    const started = new Promise<void>((resolve) => { entered = resolve; });
    provider = async () => { entered(); await new Promise<void>((resolve) => { release = resolve; });
      return { ok: true, scraped_data: scraped }; };
    const first = collect('pending').then((response) => response.body);
    await started;
    try {
      expect((await collect('pending').expect(201)).body.attempt.state).toBe('RUNNING');
      const conflict = await request(app.getHttpServer()).post('/api/sourcing/scrape-url')
        .set('idempotency-key', 'other').send({ url: `${sourceUrl}?track=other` }).expect(409);
      expect(conflict.body.code).toBe('SOURCE_ATTEMPT_IN_PROGRESS');
      const status = (await request(app.getHttpServer()).get('/api/sourcing/scrape-url/status').query({ url: sourceUrl })).body;
      expect(status.source).toMatchObject({ ready: false, latestComplete: null, latestAttempt: { state: 'RUNNING' } });
      expect(providerCalls).toBe(1);
    } finally { release(); }
    expect((await first).attempt.state).toBe('COMPLETE');
  });

  it('keeps duplicate skip read-only and replays original completion before considering duplicates', async () => {
    const complete = (await collect('original').expect(201)).body;
    const before = await prisma.sourcingCandidate.findUniqueOrThrow({ where: { id: complete.candidateId } });
    expect((await collect('new-key').expect(201)).body).toMatchObject({ skipped: true, candidateId: complete.candidateId, attempt: null });
    expect((await collect('original').expect(201)).body).toEqual(complete);
    expect(await prisma.sourcingEvidenceIngestionRun.count()).toBe(1);
    expect(await prisma.sourcingCandidate.findUniqueOrThrow({ where: { id: complete.candidateId } })).toEqual(before);
    expect(providerCalls).toBe(1);
  });

  it('publishes failure and Alert without candidate/evidence and requires a new explicit key to retry', async () => {
    provider = async () => ({ ok: false, error: 'provider refused extraction' });
    const failed = (await collect('failed').expect(201)).body;
    expect(failed).toMatchObject({ ok: false, attempt: { state: 'FAILED' }, candidateId: null });
    expect(await prisma.alert.findFirstOrThrow()).toMatchObject({ status: 'OPEN', attemptId: failed.attempt.attemptId });
    expect(await prisma.sourcingCandidate.count()).toBe(0);
    expect(await prisma.sourcingEvidenceObservation.count()).toBe(0);
    expect((await collect('failed').expect(201)).body).toEqual(failed);
    expect(providerCalls).toBe(1);
    provider = async () => ({ ok: true, scraped_data: scraped });
    expect((await collect('retry').expect(201)).body.attempt.state).toBe('COMPLETE');
    expect(providerCalls).toBe(2);
    expect(await prisma.alert.findFirstOrThrow()).toMatchObject({ status: 'RESOLVED' });
  });

  it('retains the actual last COMPLETE cutoff after the product is removed and a later collection fails', async () => {
    const complete = (await collect('baseline').expect(201)).body;
    const baseline = (await request(app.getHttpServer()).get('/api/sourcing/scrape-url/status').query({ url: sourceUrl })).body;
    // Fixture: the user removed the active candidate, making the retained collection CTA available again.
    await prisma.sourcingCandidate.update({ where: { id: complete.candidateId }, data: { isDeleted: true, deletedAt: new Date() } });
    provider = async () => { throw new Error('provider unavailable'); };
    const failed = (await collect('after-removal').expect(201)).body;
    const status = (await request(app.getHttpServer()).get('/api/sourcing/scrape-url/status').query({ url: sourceUrl })).body;
    expect(status.source).toMatchObject({ ready: true, actualCutoffAt: baseline.source.actualCutoffAt,
      latestAttempt: { attemptId: failed.attempt.attemptId, state: 'FAILED' },
      latestComplete: { attemptId: complete.attempt.attemptId, scrapeUrlResult: { candidateId: complete.candidateId } } });
    expect(status.source.latestComplete).not.toHaveProperty('attemptToken');
    expect(await prisma.sourcingEvidenceObservation.count()).toBe(1);
    expect((await collect('baseline').expect(201)).body).toEqual(complete);
  });

  it('uses the same owner from the retained capability and enforces its required owner receipt', async () => {
    const input = { sourceUrl };
    const context = { organizationId: TEST_ORGANIZATION_ID, initiatingUserId: TEST_USER_ID, executionId: 'execution',
      ownerIdempotencyKey: 'capability', ownerInputHash: canonicalOwnerInputHash(input) };
    const result = await capability.scrapeUrlWorkflow({ context, input });
    expect(result).toMatchObject({ ok: true, attempt: { state: 'COMPLETE' } });
    expect((await collect('capability').expect(201)).body.candidateId).toBe(result.candidateId);
    expect(providerCalls).toBe(1);
    await expect(capability.scrapeUrlWorkflow({ context: { ...context, ownerInputHash: 'wrong' }, input })).rejects.toThrow('owner_idempotency_input_conflict');
  });

  it('rolls candidate, images and evidence back together when terminal candidate persistence fails', async () => {
    // Disposable Testcontainers fixture only; the real owner and repositories remain unmocked.
    await prisma.$executeRaw`ALTER TABLE sourcing_candidate_images ADD CONSTRAINT scrape_url_fixture_failure CHECK (url <> 'https://img.test/main.jpg')`;
    try {
      const failed = (await collect('rollback').expect(201)).body;
      expect(failed.attempt.state).toBe('FAILED');
      expect(await prisma.sourcingCandidate.count()).toBe(0);
      expect(await prisma.candidateImage.count()).toBe(0);
      expect(await prisma.sourcingEvidenceObservation.count()).toBe(0);
      expect(await prisma.sourcingEvidenceIngestionRun.count({ where: { isCurrentComplete: true } })).toBe(0);
      expect(await prisma.alert.findFirstOrThrow()).toMatchObject({ status: 'OPEN', attemptId: failed.attempt.attemptId });
    } finally {
      await prisma.$executeRaw`ALTER TABLE sourcing_candidate_images DROP CONSTRAINT scrape_url_fixture_failure`;
    }
  });

  it('reads fixed expiry without mutation and rejects the old provider result after a new explicit attempt', async () => {
    let release!: () => void;
    let entered!: () => void;
    const started = new Promise<void>((resolve) => { entered = resolve; });
    provider = async () => { entered(); await new Promise<void>((resolve) => { release = resolve; });
      return { ok: true, scraped_data: { ...scraped, title: 'late old product' } }; };
    const first = collect('expired').then((response) => response);
    await started;
    const running = await prisma.sourcingEvidenceIngestionRun.findFirstOrThrow();
    await prisma.sourcingEvidenceIngestionRun.update({ where: { id: running.id }, data: { leaseExpiresAt: new Date(Date.now() - 1000) } });
    try {
      const status = (await request(app.getHttpServer()).get('/api/sourcing/scrape-url/status').query({ url: sourceUrl })).body;
      expect(status.source.latestAttempt).toMatchObject({ state: 'FAILED', errorCode: 'ATTEMPT_EXPIRED' });
      expect((await prisma.sourcingEvidenceIngestionRun.findUniqueOrThrow({ where: { id: running.id } })).status).toBe('RUNNING');
      provider = async () => ({ ok: true, scraped_data: scraped });
      expect((await collect('replacement').expect(201)).body.attempt.state).toBe('COMPLETE');
    } finally { release(); }
    await first;
    expect((await prisma.sourcingCandidate.findFirstOrThrow()).name).toBe('실리콘 식판');
    expect(await prisma.sourcingEvidenceObservation.count()).toBe(1);
  });
});
