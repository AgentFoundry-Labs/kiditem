import { createHash } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { DiscoveryModule } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import type { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { OPERATION_TOKEN_HEADER, OperationBeginResponseSchema, type OperationBeginResponse } from '@kiditem/shared/operation';
import {
  COUPANG_REVIEWS_CHUNK_KIND,
  COUPANG_REVIEWS_KIND,
  COUPANG_REVIEWS_WINDOW_CHUNK_KIND,
  CoupangReviewsWindowSchema,
  type CoupangReviewsChunkItem,
} from '@kiditem/shared/reviews';
import {
  makeTestPrisma,
  OTHER_ORGANIZATION_ID,
  resetDb,
  seedBaseFixture,
  TEST_ORGANIZATION_ID as ORG,
  TEST_USER_ID as USER,
} from '../../test-helpers/real-prisma';
import { realRegistrationStates } from '../../test-helpers/registration-state';
import { GlobalExceptionFilter } from '../../common/filters/global-exception.filter';
import { OperationsController } from '../../common/operation/adapter/in/web/operations.controller';
import { OperationRepositoryAdapter } from '../../common/operation/adapter/out/repository/operation.repository.adapter';
import { OPERATION_PORT } from '../../common/operation/application/port/in/operation.port';
import { OPERATION_REPOSITORY } from '../../common/operation/application/port/out/repository/operation.repository.port';
import { OperationOwnerRegistry } from '../../common/operation/application/service/operation-owner.registry';
import { OperationService } from '../../common/operation/application/service/operation.service';
import { ChannelAccountPersistenceAdapter } from '../../channels/adapter/out/persistence/channel-account.persistence.adapter';
import { ChannelCredentialsAdapter } from '../../channels/adapter/out/credentials/channel-credentials.adapter';
import { ChannelListingQueryPersistenceAdapter } from '../../channels/adapter/out/persistence/channel-listing-query.persistence.adapter';
import { ChannelsProductMappingGenerationAdapter } from '../../channels/adapter/out/products/product-mapping-generation.adapter';
import { ChannelAccountService } from '../../channels/application/service/account/channel-account.service';
import { ChannelListingQueryService } from '../../channels/application/service/listing/channel-listing-query.service';
import { ProductMappingGenerationRepositoryAdapter } from '../../products/adapter/out/persistence/product-mapping-generation.repository.adapter';
import { CoupangReviewsOperationOwner } from '../adapter/in/operation/coupang-reviews-operation-owner';
import { ReviewIngestService } from '../application/service/review-ingest.service';

// 확장 수집기(orders.coupang_reviews)가 밟는 길을 서버에서 그대로: begin → reviews 청크(창별) →
// review_windows 표식 → finish. 원장 쓰기는 finish 트랜잭션 안에서만(ADR-0025).
const checksum = (payload: unknown[]) => createHash('sha256').update(JSON.stringify(payload)).digest('hex');
const REVIEW_OPTION = 'VENDOR-ITEM-1';

function review(externalReviewId: string, windowIndex: number, content = `content ${externalReviewId}`): CoupangReviewsChunkItem {
  return {
    externalReviewId,
    externalOptionId: REVIEW_OPTION,
    externalProductId: 'PRODUCT-1',
    itemName: 'Red',
    rating: 5,
    title: null,
    content,
    reviewerName: 'buyer',
    reviewedAt: Date.parse('2026-09-01T03:00:00.000Z'),
    imageCount: 1,
    videoCount: 0,
    isDeleted: false,
    isBlinded: false,
    windowIndex,
  };
}

describe('orders.coupang_reviews owner over the operation contract + disposable PG', () => {
  let prisma: PrismaClient;
  let app: INestApplication;
  let httpUrl: string;
  let accountId: string;

  beforeAll(async () => {
    prisma = makeTestPrisma();
    await prisma.$connect();
    const mappingGenerations = new ChannelsProductMappingGenerationAdapter(new ProductMappingGenerationRepositoryAdapter());
    const channelAccounts = new ChannelAccountService(
      new ChannelAccountPersistenceAdapter(prisma as never, mappingGenerations),
      new ChannelCredentialsAdapter(),
    );
    const channelListings = new ChannelListingQueryService(
      new ChannelListingQueryPersistenceAdapter(prisma as never),
      { findForListings: async () => [] },
      realRegistrationStates(prisma),
    );
    const module = await Test.createTestingModule({
      imports: [DiscoveryModule],
      controllers: [OperationsController],
      providers: [
        OperationOwnerRegistry,
        OperationService,
        { provide: OPERATION_PORT, useExisting: OperationService },
        { provide: OPERATION_REPOSITORY, useValue: new OperationRepositoryAdapter(prisma as never) },
        { provide: CoupangReviewsOperationOwner, useValue: new CoupangReviewsOperationOwner(new ReviewIngestService(prisma as never, channelListings, channelAccounts)) },
      ],
    }).compile();
    app = module.createNestApplication({ logger: false });
    app.setGlobalPrefix('api');
    app.use((req: { authUser?: unknown }, _res: unknown, next: () => void) => {
      req.authUser = { id: USER, organizationId: ORG };
      next();
    });
    app.useGlobalFilters(new GlobalExceptionFilter());
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
    const account = await prisma.channelAccount.create({
      data: { organizationId: ORG, channel: 'coupang', name: 'Coupang Wing', externalAccountId: 'wing-review', vendorId: 'VENDOR-REVIEW', isPrimary: true },
    });
    accountId = account.id;
    const listing = await prisma.channelListing.create({
      data: { organizationId: ORG, channelAccountId: account.id, externalId: 'PRODUCT-1', channelName: 'Coupang product', displayName: 'Review product' },
    });
    await prisma.channelListingOption.create({
      data: { organizationId: ORG, listingId: listing.id, externalOptionId: REVIEW_OPTION, itemName: 'Red' },
    });
  });

  async function begin(scope: Record<string, unknown>, expected = 201) {
    return request(httpUrl).post('/api/operations').send({ kind: COUPANG_REVIEWS_KIND, scope }).expect(expected);
  }

  async function beginRun(months: number): Promise<OperationBeginResponse> {
    return OperationBeginResponseSchema.parse((await begin({ channelAccountId: accountId, months })).body);
  }

  async function put(run: OperationBeginResponse, chunkKind: string, sequence: number, payload: unknown[], progress?: Record<string, unknown>) {
    await request(httpUrl)
      .put(`/api/operations/${run.operation.id}/chunks/${chunkKind}/${sequence}`)
      .set(OPERATION_TOKEN_HEADER, run.token)
      .send({ checksum: checksum(payload), payload, ...(progress ? { progress } : {}) })
      .expect(200);
  }

  function finish(run: OperationBeginResponse, body: Record<string, unknown> = { outcome: 'succeeded' }) {
    return request(httpUrl).post(`/api/operations/${run.operation.id}/finish`).set(OPERATION_TOKEN_HEADER, run.token).send(body);
  }

  /** 창마다 reviews 청크를 올리고 끝에 표식을 올린다(확장 수집기의 순서). */
  async function collect(run: OperationBeginResponse, windows: CoupangReviewsChunkItem[][], markerItems?: number[]) {
    let reviewSequence = 0;
    for (const [index, items] of windows.entries()) {
      if (items.length > 0) await put(run, COUPANG_REVIEWS_CHUNK_KIND, ++reviewSequence, items);
      await put(run, COUPANG_REVIEWS_WINDOW_CHUNK_KIND, index + 1, [{ index, pages: 1, items: markerItems?.[index] ?? items.length }]);
    }
  }

  it('plan은 계정 잠금과 최신 달부터의 KST 월 창을 정하고, finish가 finalize 트랜잭션에서 리뷰를 operation 행으로 쓴다', async () => {
    const run = await beginRun(2);
    expect(run.operation.lockKeys).toEqual([`account:${accountId}`]);
    const windows = CoupangReviewsWindowSchema.array().parse(run.operation.plan?.windows);
    expect(windows.map((window) => window.index)).toEqual([0, 1]);
    expect(windows[0]!.start > windows[1]!.start).toBe(true);
    expect(windows[0]!.start).toMatch(/^\d{4}-\d{2}-01T00:00:00\+09:00$/);
    expect(run.operation.plan).toMatchObject({ channelAccountId: accountId, maxPagesPerWindow: 40 });
    expect(run.operation.plan).not.toHaveProperty('startedBy');
    expect(run.operation.window).toEqual({ start: windows[1]!.start.slice(0, 10), end: windows[0]!.end.slice(0, 10) });

    await collect(run, [[review('r-1', 0), review('r-2', 0)], [review('r-3', 1)]]);
    const finished = await finish(run).expect(200);
    expect(finished.body.operation).toMatchObject({
      status: 'succeeded',
      result: { windows: 2, reviews: 3, inserted: 3, updated: 0 },
    });

    const rows = await prisma.review.findMany({ where: { organizationId: ORG }, orderBy: { externalReviewId: 'asc' } });
    expect(rows.map((row) => row.externalReviewId)).toEqual(['r-1', 'r-2', 'r-3']);
    expect(rows.every((row) => row.operationId === run.operation.id && row.sourceImportRunId === null)).toBe(true);
    expect(rows.every((row) => row.publishedAt instanceof Date && row.listingId !== null)).toBe(true);
    expect(rows[0]).toMatchObject({ content: 'content r-1', rating: 5, imageCount: 1, reviewedAt: new Date('2026-09-01T03:00:00.000Z') });
    await expect(prisma.sourceImportRun.count({ where: { organizationId: ORG, sourceType: 'coupang_reviews' } })).resolves.toBe(0);
  });

  it('창 항목 수가 표식과 다르거나 표식이 빠지면 finalize가 VALIDATION_FAILED로 거절하고, failed로 끝난 실행은 원장에 아무것도 남기지 않는다', async () => {
    const mismatch = await beginRun(1);
    await collect(mismatch, [[review('r-1', 0), review('r-2', 0)]], [3]);
    const refused = await finish(mismatch).expect(400);
    expect(refused.body).toMatchObject({ code: 'VALIDATION_FAILED', details: { reason: 'review_window_incomplete' } });
    const failed = await finish(mismatch, { outcome: 'failed', errorCode: 'VALIDATION_FAILED' }).expect(200);
    expect(failed.body.operation).toMatchObject({ status: 'failed', lockKeys: [] });
    await expect(prisma.review.count({ where: { organizationId: ORG } })).resolves.toBe(0);

    const missing = await beginRun(2);
    await put(missing, COUPANG_REVIEWS_CHUNK_KIND, 1, [review('r-1', 0)]);
    await put(missing, COUPANG_REVIEWS_WINDOW_CHUNK_KIND, 1, [{ index: 0, pages: 1, items: 1 }]);
    const unfinished = await finish(missing).expect(400);
    expect(unfinished.body).toMatchObject({ code: 'VALIDATION_FAILED', details: { reason: 'review_window_incomplete' } });
    await expect(prisma.review.count({ where: { organizationId: ORG } })).resolves.toBe(0);
  });

  it('두 번째 실행이 같은 리뷰를 다시 올리면 그 operation 행을 갱신한다(inserted/updated), 옛 run 행은 그대로 남는다', async () => {
    const legacyRun = await prisma.sourceImportRun.create({
      data: { organizationId: ORG, sourceType: 'coupang_reviews', status: 'completed', importedAt: new Date('2026-01-01T00:00:00Z') },
    });
    await prisma.review.create({
      data: { organizationId: ORG, sourceImportRunId: legacyRun.id, platform: 'coupang', externalReviewId: 'r-1', rating: 1, content: 'legacy' },
    });

    const first = await beginRun(1);
    await collect(first, [[review('r-1', 0, 'first')]]);
    await finish(first).expect(200);
    const second = await beginRun(1);
    await collect(second, [[review('r-1', 0, 'second'), review('r-2', 0)]]);
    const finished = await finish(second).expect(200);
    expect(finished.body.operation.result).toEqual({ windows: 1, reviews: 2, inserted: 1, updated: 1 });

    const operationRows = await prisma.review.findMany({ where: { organizationId: ORG, operationId: { not: null } }, orderBy: { externalReviewId: 'asc' } });
    expect(operationRows.map((row) => [row.externalReviewId, row.content, row.operationId])).toEqual([
      ['r-1', 'second', second.operation.id],
      ['r-2', 'content r-2', second.operation.id],
    ]);
    await expect(prisma.review.count({ where: { organizationId: ORG, sourceImportRunId: legacyRun.id } })).resolves.toBe(1);
  });

  it('listing 연결: 옵션이 없거나 두 계정에 걸치면 null로 남기고 리뷰는 버리지 않는다, 같은 리뷰가 두 번 오면 마지막 값 하나', async () => {
    const other = await prisma.channelAccount.create({
      data: { organizationId: ORG, channel: 'coupang', name: 'Second Wing', externalAccountId: 'wing-2', vendorId: 'VENDOR-2' },
    });
    for (const [account, externalId] of [[accountId, 'PRODUCT-A'], [other.id, 'PRODUCT-B']] as const) {
      const listing = await prisma.channelListing.create({
        data: { organizationId: ORG, channelAccountId: account, externalId, channelName: externalId, displayName: externalId },
      });
      await prisma.channelListingOption.create({ data: { organizationId: ORG, listingId: listing.id, externalOptionId: 'SHARED-OPTION' } });
    }
    const run = await beginRun(1);
    await collect(run, [[
      review('linked', 0),
      { ...review('unmatched', 0), externalOptionId: 'NO-SUCH-OPTION' },
      { ...review('ambiguous', 0), externalOptionId: 'SHARED-OPTION' },
      review('twice', 0, 'first copy'),
      review('twice', 0, 'last copy'),
    ]]);
    const finished = await finish(run).expect(200);
    expect(finished.body.operation.result).toEqual({ windows: 1, reviews: 4, inserted: 4, updated: 0 });

    const rows = await prisma.review.findMany({ where: { organizationId: ORG }, orderBy: { externalReviewId: 'asc' } });
    expect(rows.map((row) => [row.externalReviewId, row.listingId !== null, row.content])).toEqual([
      ['ambiguous', false, 'content ambiguous'],
      ['linked', true, 'content linked'],
      ['twice', true, 'last copy'],
      ['unmatched', false, 'content unmatched'],
    ]);
  });

  it('같은 계정의 두 번째 begin은 OPERATION_IN_PROGRESS로 거절된다', async () => {
    const first = await beginRun(1);
    const refused = await begin({ channelAccountId: accountId, months: 3 }, 409);
    expect(refused.body).toMatchObject({ code: 'OPERATION_IN_PROGRESS', details: { operationId: first.operation.id } });
  });

  it('scope 검증: 다른 조직·쿠팡이 아닌 계정·범위 밖 months는 VALIDATION_FAILED', async () => {
    const foreign = await prisma.channelAccount.create({
      data: { organizationId: OTHER_ORGANIZATION_ID, channel: 'coupang', name: 'Other Wing', externalAccountId: 'other', vendorId: 'OTHER' },
    });
    const rocket = await prisma.channelAccount.create({
      data: { organizationId: ORG, channel: 'rocket', name: 'Rocket', externalAccountId: 'rocket', vendorId: 'ROCKET' },
    });
    for (const scope of [
      { channelAccountId: foreign.id, months: 1 },
      { channelAccountId: rocket.id, months: 1 },
      { channelAccountId: accountId, months: 37 },
      { channelAccountId: accountId, months: 1, extra: true },
    ]) {
      const refused = await begin(scope, 400);
      expect(refused.body).toMatchObject({ code: 'VALIDATION_FAILED' });
    }
  });
});
