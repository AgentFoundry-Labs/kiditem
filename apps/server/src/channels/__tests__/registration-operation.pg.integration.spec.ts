import { createHash, randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { DiscoveryModule } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import type { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  OPERATION_TOKEN_HEADER,
  OperationBeginResponseSchema,
  type OperationBeginResponse,
} from '@kiditem/shared/operation';
import {
  MALL_AVAILABILITY_READ_KIND,
  REGISTRATION_EVIDENCE_CHUNK_KIND,
  REGISTRATION_FILL_CHUNK_KIND,
  REGISTRATION_KIND,
  RegistrationPlanSchema,
  parseRegistrationPayload,
} from '@kiditem/shared/channels-operations';
import {
  makeTestPrisma,
  OTHER_ORGANIZATION_ID,
  resetDb,
  seedBaseFixture,
  TEST_ORGANIZATION_ID as ORG,
  TEST_USER_ID as USER,
} from '../../test-helpers/real-prisma';
import { realRegistrableDetailPages, realRegistrationContentWorkspace } from '../../test-helpers/registration-content-workspace';
import { realDraftDeletionPorts, untouchedRegistrationStates } from '../../test-helpers/sales-product-draft-port';
import { GlobalExceptionFilter } from '../../common/filters/global-exception.filter';
import { OperationsController } from '../../common/operation/adapter/in/web/operations.controller';
import { OperationRepositoryAdapter } from '../../common/operation/adapter/out/persistence/operation.repository';
import { OPERATION_PORT } from '../../common/operation/application/port/in/operation.port';
import { OPERATION_REPOSITORY } from '../../common/operation/application/port/out/repository/operation.repository.port';
import { OperationOwnerRegistry } from '../../common/operation/application/service/operation-owner.registry';
import { OperationService } from '../../common/operation/application/service/operation.service';
import type { PrismaService } from '../../prisma/prisma.service';
import { MallAvailabilityReadOperationOwner, RegistrationOperationOwner } from '../adapter/in/operation/registration-operation-owner';
import { RegistrationOperationController } from '../adapter/in/web/registration-operation.controller';
import { ThumbnailExecutionController } from '../adapter/in/web/thumbnail-execution.controller';
import { CHANNELS_THUMBNAIL_EXECUTION_PORT } from '../application/port/in/thumbnail-execution.port';
import { REGISTRATION_OPERATION_PORT } from '../application/port/in/registration-operation.port';
import { ChannelIntegrityAdapter } from '../adapter/out/integrity/channel-integrity.adapter';
import { ChannelOptionRecipeRepositoryAdapter } from '../adapter/out/persistence/channel-option-recipe.repository';
import { RegistrationTargetRepositoryAdapter } from '../adapter/out/persistence/registration-target.repository';
import { SalesProductRepositoryAdapter } from '../adapter/out/persistence/sales-product.repository';
import { ThumbnailExecutionPersistenceAdapter } from '../adapter/out/persistence/thumbnail-execution.repository';
import { ChannelsProductMappingGenerationAdapter } from '../adapter/out/products/product-mapping-generation.adapter';
import { RegistrationOperationRepositoryAdapter } from '../adapter/out/persistence/registration-operation.repository';
import type { ChannelRegistrableThumbnailPort } from '../application/port/out/content/registrable-thumbnail.port';
import { ChannelOptionRecipeService } from '../application/service/listing/channel-option-recipe.service';
import { MallAvailabilityReadService } from '../application/service/registration/mall-availability-read.service';
import { RegistrationOperationService } from '../application/service/registration/registration-operation.service';
import { RegistrationTargetUseCase } from '../application/service/registration/registration-target.usecase';
import { ThumbnailExecutionService } from '../application/service/registration/thumbnail-execution.service';
import { SalesProductUseCase } from '../application/service/sales-product/sales-product.usecase';
import { ProductTransactionalReadRepositoryAdapter } from '../../products/adapter/out/persistence/product-transactional-read.repository';
import { ProductMappingGenerationRepositoryAdapter } from '../../products/adapter/out/persistence/product-mapping-generation.repository';
import { channelAdapters } from './channel-adapters';
import { realRegistrationStates } from '../../test-helpers/registration-state';
import { productTransactionalRead } from './product-transactional-read.fake';

// 확장 몰 쓰기 모듈(KID-256)이 밟는 길을 서버에서 그대로: begin(channels.registration) → registration_fill · registration_evidence
// 청크 → finish(succeeded | reconciling | failed), 그리고 운영자의 확인 · 닫기(KID-218). 옛 등록 실행 fence 스펙의 케이스를 이
// seam 으로 옮겼다(KID-364). 원장 쓰기는 finish 트랜잭션 안에서만(ADR-0025).
const checksum = (payload: unknown[]) => createHash('sha256').update(JSON.stringify(payload)).digest('hex');

/** Content 의 대표이미지 자산(외부 owner). 사진 바이트는 저장소에서 오므로 여기서는 고정 값을 준다. */
const thumbnails: ChannelRegistrableThumbnailPort = {
  read: async ({ salesProductId }) => ({ assetId: THUMBNAIL_ASSET_ID, contentWorkspaceId: randomUUID(), salesProductId, image: { url: 'https://cdn.example/thumb.png', sha256: null } }),
  find: async () => null,
  loadImage: async () => ({ dataUrl: 'data:image/png;base64,AAAA', filename: 'thumb.png', mimeType: 'image/png', sha256: 'f'.repeat(64) }),
};
const THUMBNAIL_ASSET_ID = '00000000-0000-4000-8000-0000000000aa';

describe('channels.registration owner over the operation contract + disposable PG (KID-364)', () => {
  let prisma: PrismaClient;
  let app: INestApplication;
  let httpUrl: string;
  let targets: RegistrationTargetRepositoryAdapter;
  const registrationStates = () => realRegistrationStates(prisma);

  beforeAll(async () => {
    prisma = makeTestPrisma();
    await prisma.$connect();
    const db = prisma as unknown as PrismaService;
    targets = new RegistrationTargetRepositoryAdapter(db, productTransactionalRead(), realRegistrationContentWorkspace(prisma));
    const salesProducts = new SalesProductUseCase(
      new SalesProductRepositoryAdapter(db, productTransactionalRead(), targets, realRegistrationContentWorkspace(prisma), realRegistrableDetailPages(prisma)),
      ...realDraftDeletionPorts(prisma),
      untouchedRegistrationStates,
    );
    const recipes = new ChannelOptionRecipeService(new ChannelOptionRecipeRepositoryAdapter(
      db,
      new ProductTransactionalReadRepositoryAdapter(),
      new ChannelsProductMappingGenerationAdapter(new ProductMappingGenerationRepositoryAdapter()),
    ));
    const adapters = channelAdapters();
    const repository = new RegistrationOperationRepositoryAdapter(db, adapters, recipes);
    const thumbnailExecutions = new ThumbnailExecutionService(thumbnails, new ThumbnailExecutionPersistenceAdapter(db));
    const module = await Test.createTestingModule({
      imports: [DiscoveryModule],
      controllers: [OperationsController, RegistrationOperationController, ThumbnailExecutionController],
      providers: [
        OperationOwnerRegistry,
        OperationService,
        { provide: OPERATION_PORT, useExisting: OperationService },
        { provide: OPERATION_REPOSITORY, useValue: new OperationRepositoryAdapter(db) },
        {
          provide: RegistrationOperationService,
          inject: [OPERATION_PORT],
          useFactory: (operations: OperationService) => new RegistrationOperationService(
            repository, salesProducts, new RegistrationTargetUseCase(targets), realRegistrableDetailPages(prisma), thumbnails,
            thumbnailExecutions, adapters, new ChannelIntegrityAdapter(), operations,
          ),
        },
        { provide: REGISTRATION_OPERATION_PORT, useExisting: RegistrationOperationService },
        { provide: CHANNELS_THUMBNAIL_EXECUTION_PORT, useValue: thumbnailExecutions },
        {
          provide: RegistrationOperationOwner,
          inject: [RegistrationOperationService],
          useFactory: (service: RegistrationOperationService) => new RegistrationOperationOwner(service),
        },
        { provide: MallAvailabilityReadOperationOwner, useValue: new MallAvailabilityReadOperationOwner(new MallAvailabilityReadService(repository)) },
      ],
    }).compile();
    app = module.createNestApplication({ logger: false });
    app.setGlobalPrefix('api');
    app.use((req: { headers: Record<string, string>; authUser?: unknown }, _res: unknown, next: () => void) => {
      req.authUser = { id: USER, organizationId: req.headers['x-test-org'] ?? ORG };
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
  });

  const begin = (scope: Record<string, unknown>, kind: string = REGISTRATION_KIND) =>
    request(httpUrl).post('/api/operations').send({ kind, scope });
  const beginOk = async (scope: Record<string, unknown>, kind: string = REGISTRATION_KIND): Promise<OperationBeginResponse> => {
    const response = await begin(scope, kind);
    expect(response.status, JSON.stringify(response.body)).toBe(201);
    return OperationBeginResponseSchema.parse(response.body);
  };
  const put = (id: string, token: string, chunkKind: string, sequence: number, payload: unknown[]) =>
    request(httpUrl).put(`/api/operations/${id}/chunks/${chunkKind}/${sequence}`).set(OPERATION_TOKEN_HEADER, token)
      .send({ checksum: checksum(payload), payload });
  const finish = (id: string, token: string, body: Record<string, unknown>) =>
    request(httpUrl).post(`/api/operations/${id}/finish`).set(OPERATION_TOKEN_HEADER, token).send(body);
  const planOf = (begun: OperationBeginResponse) => RegistrationPlanSchema.parse(begun.operation.plan);
  const registerScope = (fixture: Fixture, extra: Record<string, unknown> = {}) => ({
    executionKind: 'register', registrationTargetId: fixture.targetId, expectedVersion: 1,
    idempotencyKey: `register-${randomUUID()}`, submit: true, ...extra,
  });
  const evidence = (begun: OperationBeginResponse, fixture: Fixture, values: Record<string, unknown> = {}) => ({
    payloadHash: planOf(begun).payloadHash,
    channelAccountId: fixture.accountId,
    externalListingId: 'provider-listing-9',
    observedUrl: null,
    providerAccountId: 'vendor-1',
    observedStatus: '판매중',
    message: null,
    options: [{ salesProductOptionId: fixture.optionId, externalOptionId: 'provider-option-9', sellerSku: 'SKU-9' }],
    ...values,
  });
  const fill = { steps: ['상품명 입력'], warnings: [], manualSteps: [], dialogs: [] };
  const submittedResult = {
    providerOutcome: 'uncertain', mallOutcome: 'submitted', submitted: true, submitSkipped: null,
    externalListingId: null, mallMessage: null, fill, evidence: null,
  };

  it('plans a register: frozen snapshot and web form, the target lock, and refuses a second begin on the same target', async () => {
    const fixture = await createFixture(prisma, targets);
    const begun = await beginOk(registerScope(fixture, { form: { url: 'https://mall.example/new', productName: '웹 이름' } }));
    const plan = planOf(begun);
    expect(begun.operation.lockKeys).toEqual([`resource:registration-target:${fixture.targetId}`]);
    expect(plan).toMatchObject({
      executionKind: 'register', mallKey: 'smartstore', channelAccountId: fixture.accountId, registrationTargetId: fixture.targetId,
      salesProductId: fixture.productId, channelListingId: null, externalListingId: null, expectedProviderAccountId: 'vendor-1', submit: true,
    });
    const payload = parseRegistrationPayload('register', plan.payload);
    expect(payload.form).toEqual({ url: 'https://mall.example/new', productName: '웹 이름' });
    expect(payload.snapshot).toMatchObject({ targetId: fixture.targetId, kind: 'register', product: { id: fixture.productId } });

    const refused = await begin(registerScope(fixture)).expect(409);
    expect(refused.body).toMatchObject({ code: 'OPERATION_IN_PROGRESS', details: { operationId: begun.operation.id } });

    // 브라우저가 죽어도 "진행 중"에 영구히 남지 않는다: 임대가 지나면 다음 begin이 lazy 만료로 연다.
    await prisma.operation.update({ where: { id: begun.operation.id }, data: { expiresAt: new Date(Date.now() - 1_000) } });
    const next = await beginOk(registerScope(fixture));
    expect(next.operation.id).not.toBe(begun.operation.id);
    expect(await prisma.operation.findUniqueOrThrow({ where: { id: begun.operation.id } })).toMatchObject({ status: 'failed', errorMessage: 'expired' });
  });

  it('holds a submitted register as reconciling, then the operator confirm links the listing and option', async () => {
    const fixture = await createFixture(prisma, targets);
    const begun = await beginOk(registerScope(fixture));
    await put(begun.operation.id, begun.token, REGISTRATION_FILL_CHUNK_KIND, 1, [fill]).expect(200);
    const held = await finish(begun.operation.id, begun.token, { outcome: 'reconciling', result: submittedResult }).expect(200);
    expect(held.body.operation).toMatchObject({ status: 'reconciling', lockKeys: [`resource:registration-target:${fixture.targetId}`] });
    await begin(registerScope(fixture)).expect(409);

    const confirmed = await request(httpUrl).post(`/api/channels/registration-operations/${begun.operation.id}/confirm`).send({
      externalListingId: 'provider-listing-9',
      options: [{ salesProductOptionId: fixture.optionId, externalOptionId: 'provider-option-9', sellerSku: 'SKU-9' }],
    }).expect(201);
    expect(confirmed.body.operation).toMatchObject({
      status: 'succeeded', lockKeys: [],
      result: { providerOutcome: 'succeeded', mallOutcome: 'confirmed', externalListingId: 'provider-listing-9', fill },
    });
    const listing = await prisma.channelListing.findFirstOrThrow({ where: { organizationId: ORG, externalId: 'provider-listing-9' }, include: { options: true } });
    expect(listing).toMatchObject({ channelAccountId: fixture.accountId, salesProductId: fixture.productId });
    expect(listing.options).toEqual([expect.objectContaining({ externalOptionId: 'provider-option-9', salesProductOptionId: fixture.optionId, kidItemCode: 'KID00000001', sellerSku: 'SKU-9' })]);
    expect(confirmed.body.operation.result.channelListingId).toBe(listing.id);

    // 성공한 등록이 이 계정에 있으면 새 register는 열리지 않는다(KID-320 S7).
    const again = await begin(registerScope(fixture)).expect(409);
    expect(again.body).toMatchObject({ code: 'REGISTRATION_ALREADY_REGISTERED' });
  });

  it('connects the listing at once when the extension finishes succeeded with the mall evidence', async () => {
    const fixture = await createFixture(prisma, targets);
    const begun = await beginOk(registerScope(fixture));
    await put(begun.operation.id, begun.token, REGISTRATION_EVIDENCE_CHUNK_KIND, 1, [evidence(begun, fixture)]).expect(200);
    const finished = await finish(begun.operation.id, begun.token, {
      outcome: 'succeeded', result: { ...submittedResult, providerOutcome: 'succeeded', mallOutcome: 'confirmed', externalListingId: 'provider-listing-9' },
    }).expect(200);
    expect(finished.body.operation).toMatchObject({ status: 'succeeded', result: { mallOutcome: 'confirmed', externalListingId: 'provider-listing-9' } });
    expect(await prisma.channelListing.count({ where: { organizationId: ORG, externalId: 'provider-listing-9', salesProductId: fixture.productId } })).toBe(1);
  });

  it('ends a target register the gate did not submit as fill-only: succeeded, no evidence, no listing, still unregistered', async () => {
    const fixture = await createFixture(prisma, targets);
    const begun = await beginOk(registerScope(fixture));
    await put(begun.operation.id, begun.token, REGISTRATION_FILL_CHUNK_KIND, 1, [fill]).expect(200);
    const filled = await finish(begun.operation.id, begun.token, {
      outcome: 'succeeded',
      result: { ...submittedResult, providerOutcome: 'not_attempted', mallOutcome: 'not_submitted', submitted: false, submitSkipped: 'no_verified_submit' },
    }).expect(200);
    expect(filled.body.operation).toMatchObject({
      status: 'succeeded', lockKeys: [],
      result: { providerOutcome: 'not_attempted', mallOutcome: 'not_submitted', submitted: false, submitSkipped: 'no_verified_submit', fill, channelListingId: null },
    });
    expect(await prisma.channelListing.count({ where: { organizationId: ORG } })).toBe(0);
    const [state] = (await registrationStates().readForSalesProducts(ORG, [fixture.productId])).get(fixture.productId)!.accounts;
    expect(state).toMatchObject({ channelAccountId: fixture.accountId, state: 'unregistered' });
    await beginOk(registerScope(fixture));
  });

  it('refuses a submitted and confirmed register without the mall listing id', async () => {
    const fixture = await createFixture(prisma, targets);
    const begun = await beginOk(registerScope(fixture));
    const refused = await finish(begun.operation.id, begun.token, {
      outcome: 'succeeded', result: { ...submittedResult, providerOutcome: 'succeeded', mallOutcome: 'confirmed' },
    }).expect(409);
    expect(refused.body).toMatchObject({ code: 'CHANNELS_EXECUTION_EVIDENCE_REJECTED', details: { reason: 'PROVIDER_LISTING_MISSING' } });
  });

  it('reads a submitting register whose lease lapsed as awaiting confirmation, not as a failure', async () => {
    const fixture = await createFixture(prisma, targets);
    const begun = await beginOk(registerScope(fixture));
    expect(planOf(begun).submit).toBe(true);
    await prisma.operation.update({ where: { id: begun.operation.id }, data: { expiresAt: new Date(Date.now() - 1_000) } });
    const [state] = (await registrationStates().readForSalesProducts(ORG, [fixture.productId])).get(fixture.productId)!.accounts;
    expect(state).toMatchObject({ state: 'confirming', lastExecution: expect.objectContaining({ providerOutcome: 'uncertain' }) });
    // 만료 처분이 끝나도(실패로 닫힘) 같다 — 몰에 올라갔을 수 있으니 다시 올리게 하지 않는다.
    await request(httpUrl).get(`/api/operations/${begun.operation.id}`).expect(200);
    const [after] = (await registrationStates().readForSalesProducts(ORG, [fixture.productId])).get(fixture.productId)!.accounts;
    expect(after).toMatchObject({ state: 'confirming' });
  });

  it('refuses a malformed evidence chunk and a succeeded finish that submitted without a confirmation as evidence rejections', async () => {
    const fixture = await createFixture(prisma, targets);
    const begun = await beginOk(registerScope(fixture));
    await put(begun.operation.id, begun.token, REGISTRATION_EVIDENCE_CHUNK_KIND, 1, [{ externalListingId: 'provider-listing-9' }]).expect(200);
    const malformed = await finish(begun.operation.id, begun.token, { outcome: 'succeeded' }).expect(409);
    expect(malformed.body).toMatchObject({ code: 'CHANNELS_EXECUTION_EVIDENCE_REJECTED', details: { reason: 'EVIDENCE_INVALID' } });

    const other = await createFixture(prisma, targets, { channel: 'kidkids' });
    const second = await beginOk(registerScope(other));
    await put(second.operation.id, second.token, REGISTRATION_EVIDENCE_CHUNK_KIND, 1, [evidence(second, other)]).expect(200);
    // 제출했지만 몰이 확정하지 않은 결과(submitted · uncertain · awaiting_approval)는 reconciling 으로 와야 한다.
    const pending = await finish(second.operation.id, second.token, { outcome: 'succeeded', result: { ...submittedResult, mallOutcome: 'awaiting_approval' } }).expect(409);
    expect(pending.body).toMatchObject({ code: 'CHANNELS_EXECUTION_EVIDENCE_REJECTED', details: { reason: 'SUBMITTED_NOT_CONFIRMED' } });
    expect(await prisma.channelListing.count({ where: { organizationId: ORG } })).toBe(0);
  });

  it('refuses evidence frozen for another payload and evidence without the mall account, leaving the operation running', async () => {
    const fixture = await createFixture(prisma, targets);
    const begun = await beginOk(registerScope(fixture));
    await put(begun.operation.id, begun.token, REGISTRATION_EVIDENCE_CHUNK_KIND, 1, [evidence(begun, fixture, { payloadHash: 'e'.repeat(64) })]).expect(200);
    const refused = await finish(begun.operation.id, begun.token, { outcome: 'succeeded' }).expect(409);
    expect(refused.body).toMatchObject({ code: 'CHANNELS_EXECUTION_FENCE_LOST', details: { reason: 'PAYLOAD_HASH_MISMATCH' } });
    expect(await prisma.operation.findUniqueOrThrow({ where: { id: begun.operation.id } })).toMatchObject({ status: 'executing' });
    expect(await prisma.channelListing.count({ where: { organizationId: ORG } })).toBe(0);

    const other = await createFixture(prisma, targets, { channel: 'kidkids' });
    const second = await beginOk(registerScope(other));
    await put(second.operation.id, second.token, REGISTRATION_EVIDENCE_CHUNK_KIND, 1, [evidence(second, other, { providerAccountId: 'someone-else' })]).expect(200);
    const mismatch = await finish(second.operation.id, second.token, { outcome: 'succeeded' }).expect(409);
    expect(mismatch.body).toMatchObject({ code: 'CHANNELS_EXECUTION_EVIDENCE_REJECTED', details: { reason: 'account_mismatch' } });
  });

  it('closes a reconciling register as failed when the operator finds nothing on the mall, freeing the target', async () => {
    const fixture = await createFixture(prisma, targets);
    const begun = await beginOk(registerScope(fixture));
    await finish(begun.operation.id, begun.token, { outcome: 'reconciling', result: submittedResult }).expect(200);
    const closed = await request(httpUrl).post(`/api/channels/registration-operations/${begun.operation.id}/close`)
      .send({ reason: '몰 상품 목록에 없음' }).expect(201);
    expect(closed.body.operation).toMatchObject({
      status: 'failed', errorCode: 'CHANNELS_REGISTRATION_NOT_FOUND_ON_MALL', errorMessage: '몰 상품 목록에 없음', lockKeys: [],
    });
    await beginOk(registerScope(fixture));
    // 다른 조직 · 실행 중인 실행은 확인 · 닫기로 끝낼 수 없다.
    await request(httpUrl).post(`/api/channels/registration-operations/${begun.operation.id}/close`).set('x-test-org', OTHER_ORGANIZATION_ID)
      .send({ reason: 'x' }).expect(404);
  });

  it('locks the listing and its external id for a register onto an existing listing, and an update needs a listing', async () => {
    const fixture = await createFixture(prisma, targets, { listing: true });
    const begun = await beginOk(registerScope(fixture, { channelListingId: fixture.listingId }));
    expect(begun.operation.lockKeys).toEqual([
      `resource:channel-listing:${fixture.listingId}`,
      `resource:external-listing:${fixture.accountId}:provider-listing-1`,
      `resource:registration-target:${fixture.targetId}`,
    ]);
    expect(planOf(begun)).toMatchObject({ channelListingId: fixture.listingId, externalListingId: 'provider-listing-1' });
    await request(httpUrl).post(`/api/operations/${begun.operation.id}/cancel`).expect(200);
    const refused = await begin({ executionKind: 'update', registrationTargetId: fixture.targetId, expectedVersion: 1, idempotencyKey: 'u-1' }).expect(400);
    expect(refused.body).toMatchObject({ code: 'VALIDATION_FAILED' });
  });

  it('plans a quick register (fill only) on the account lock, keeping the draft sales product it came from', async () => {
    const fixture = await createFixture(prisma, targets, { channel: 'kidkids' });
    const begun = await beginOk({
      executionKind: 'register', channelAccountId: fixture.accountId, salesProductId: fixture.productId, sourceProductId: randomUUID(),
      idempotencyKey: 'quick-1', submit: false, form: { url: 'https://mall.example/new' },
    });
    expect(begun.operation.lockKeys).toEqual([`account:${fixture.accountId}`]);
    expect(planOf(begun)).toMatchObject({ registrationTargetId: null, salesProductId: fixture.productId, submit: false, mallKey: 'kidkids' });
    expect(parseRegistrationPayload('register', planOf(begun).payload)).toEqual({ snapshot: null, form: { url: 'https://mall.example/new' } });
    const done = await finish(begun.operation.id, begun.token, { outcome: 'succeeded' }).expect(200);
    expect(done.body.operation.result).toMatchObject({ providerOutcome: 'not_attempted', mallOutcome: 'not_submitted' });
    // 폼만 채운 빠른 등록은 이 계정의 등록이 아니다: 대상 등록은 그대로 열린다.
    await beginOk(registerScope(fixture));
  });

  it('plans a sold-out batch per mall account: the account lock plus one per listing, options resolved from option ids', async () => {
    const fixture = await createFixture(prisma, targets, { listing: true, channel: 'kidkids' });
    const begun = await beginOk({
      executionKind: 'sold_out', channelAccountId: fixture.accountId, idempotencyKey: 'sold-out-1', submit: true,
      items: [{ channelListingOptionIds: [fixture.listingOptionId] }],
    });
    expect(begun.operation.lockKeys).toEqual([`account:${fixture.accountId}`, `resource:channel-listing:${fixture.listingId}`]);
    const plan = planOf(begun);
    expect(plan).toMatchObject({ executionKind: 'sold_out', mallKey: 'kidkids', channelListingId: null, externalListingId: null, registrationTargetId: null });
    expect(parseRegistrationPayload('sold_out', plan.payload)).toEqual({
      action: 'sold_out',
      listings: [{
        channelListingId: fixture.listingId,
        externalListingId: 'provider-listing-1',
        options: [{ salesProductOptionId: fixture.optionId, channelListingOptionId: fixture.listingOptionId, externalOptionId: 'provider-option-1', sellerSku: 'EXISTING-SKU' }],
      }],
    });
    // 같은 계정의 몰 로그인을 쓰는 다른 실행(목록 수집 · 판매 상태 읽기)은 겹치지 않는다.
    const read = await begin({ channelAccountId: fixture.accountId, mallKey: 'kidkids', externalListingIds: ['provider-listing-1'] }, MALL_AVAILABILITY_READ_KIND).expect(409);
    expect(read.body).toMatchObject({ code: 'OPERATION_IN_PROGRESS' });
    const confirmed = { ...submittedResult, providerOutcome: 'succeeded', mallOutcome: 'confirmed' };
    // 리스팅 단위 몰은 다시 읽은 리스팅 상태가 있어야 확인이다.
    const listingEvidence = (values: Record<string, unknown>) => ({
      ...evidence(begun, fixture, { externalListingId: 'provider-listing-1', options: [], observedStatus: null }), ...values,
    });
    await put(begun.operation.id, begun.token, REGISTRATION_EVIDENCE_CHUNK_KIND, 1, [listingEvidence({})]).expect(200);
    const unread = await finish(begun.operation.id, begun.token, { outcome: 'succeeded', result: confirmed }).expect(409);
    expect(unread.body).toMatchObject({ code: 'CHANNELS_EXECUTION_EVIDENCE_REJECTED', details: { reason: 'AVAILABILITY_STATUS_UNREAD' } });
    await put(begun.operation.id, begun.token, REGISTRATION_EVIDENCE_CHUNK_KIND, 2, [listingEvidence({ observedStatus: '품절' })]).expect(200);
    const repeated = await finish(begun.operation.id, begun.token, { outcome: 'succeeded', result: confirmed }).expect(409);
    expect(repeated.body.details).toMatchObject({ reason: 'EVIDENCE_REPEATED' });
    const done = await finish(begun.operation.id, begun.token, { outcome: 'failed', errorCode: 'PROVIDER_ERROR' }).expect(200);
    expect(done.body.operation).toMatchObject({ status: 'failed', lockKeys: [] });

    const again = await beginOk({ executionKind: 'sold_out', channelAccountId: fixture.accountId, idempotencyKey: 'sold-out-2', submit: true, items: [{ channelListingId: fixture.listingId }] });
    await put(again.operation.id, again.token, REGISTRATION_EVIDENCE_CHUNK_KIND, 1, [{ ...listingEvidence({ observedStatus: '품절' }), payloadHash: planOf(again).payloadHash }]).expect(200);
    const sold = await finish(again.operation.id, again.token, { outcome: 'succeeded', result: confirmed }).expect(200);
    expect(sold.body.operation).toMatchObject({ status: 'succeeded', result: { mallOutcome: 'confirmed' } });
    expect(await prisma.channelListing.findUniqueOrThrow({ where: { id: fixture.listingId! } })).toMatchObject({ status: '품절' });
  });

  it('lets the operator confirm a reconciling sold-out without reread evidence and marks the listing sold out', async () => {
    const onch = await createFixture(prisma, targets, { listing: true, channel: 'onch' });
    const begun = await beginOk({ executionKind: 'sold_out', channelAccountId: onch.accountId, idempotencyKey: 'onch-so', submit: true, items: [{ channelListingId: onch.listingId }] });
    // 온채널은 품절이 관리자 승인 요청이라 확장이 확인 증거를 낼 수 없다.
    await finish(begun.operation.id, begun.token, { outcome: 'reconciling', result: { ...submittedResult, mallOutcome: 'awaiting_approval' } }).expect(200);
    const confirmed = await request(httpUrl).post(`/api/channels/registration-operations/${begun.operation.id}/confirm`)
      .send({ externalListingId: 'provider-listing-1' }).expect(201);
    expect(confirmed.body.operation).toMatchObject({ status: 'succeeded', lockKeys: [], result: { providerOutcome: 'succeeded', mallOutcome: 'confirmed' } });
    expect(await prisma.channelListing.findUniqueOrThrow({ where: { id: onch.listingId! } })).toMatchObject({ status: '품절' });
  });

  it('confirms an option-level sold-out only with a reread of every frozen option from the same seller', async () => {
    const wing = await createFixture(prisma, targets, { listing: true, channel: 'coupang' });
    const begun = await beginOk({ executionKind: 'sold_out', channelAccountId: wing.accountId, idempotencyKey: 'wing-so', submit: true, items: [{ channelListingId: wing.listingId }] });
    const confirmed = { ...submittedResult, providerOutcome: 'succeeded', mallOutcome: 'confirmed' };
    const wingEvidence = (values: Record<string, unknown>) => ({
      ...evidence(begun, wing, { externalListingId: 'provider-listing-1', options: [], observedUrl: 'https://wing.coupang.com/vendor-inventory/list' }), ...values,
    });
    await put(begun.operation.id, begun.token, REGISTRATION_EVIDENCE_CHUNK_KIND, 1, [wingEvidence({ observedOptions: [{ externalOptionId: 'provider-option-1', stock: 4, status: '판매중' }] })]).expect(200);
    const stillOnSale = await finish(begun.operation.id, begun.token, { outcome: 'succeeded', result: confirmed }).expect(409);
    expect(stillOnSale.body).toMatchObject({ code: 'CHANNELS_EXECUTION_EVIDENCE_REJECTED', details: { reason: 'OPTION_REREAD_MISMATCH' } });
    await request(httpUrl).post(`/api/operations/${begun.operation.id}/cancel`).expect(200);

    const other = await beginOk({ executionKind: 'sold_out', channelAccountId: wing.accountId, idempotencyKey: 'wing-so-2', submit: true, items: [{ channelListingId: wing.listingId }] });
    const reread = { observedOptions: [{ externalOptionId: 'provider-option-1', stock: 0, status: null }], payloadHash: planOf(other).payloadHash };
    await put(other.operation.id, other.token, REGISTRATION_EVIDENCE_CHUNK_KIND, 1, [wingEvidence({ ...reread, providerAccountId: 'someone-else' })]).expect(200);
    const foreign = await finish(other.operation.id, other.token, { outcome: 'succeeded', result: confirmed }).expect(409);
    expect(foreign.body).toMatchObject({ code: 'CHANNELS_EXECUTION_EVIDENCE_REJECTED', details: { reason: 'account_mismatch' } });
    await request(httpUrl).post(`/api/operations/${other.operation.id}/cancel`).expect(200);

    const last = await beginOk({ executionKind: 'sold_out', channelAccountId: wing.accountId, idempotencyKey: 'wing-so-3', submit: true, items: [{ channelListingId: wing.listingId }] });
    await put(last.operation.id, last.token, REGISTRATION_EVIDENCE_CHUNK_KIND, 1, [wingEvidence({ ...reread, payloadHash: planOf(last).payloadHash })]).expect(200);
    await finish(last.operation.id, last.token, { outcome: 'succeeded', result: confirmed }).expect(200);
  });

  it('freezes only the asked options for an option-level mall, and every live option for a listing-level mall', async () => {
    const wing = await createFixture(prisma, targets, { listing: true, channel: 'coupang' });
    const sibling = await prisma.channelListingOption.create({ data: {
      organizationId: ORG, listingId: wing.listingId!, externalOptionId: 'provider-option-2', rawJson: { registrationType: 'NORMAL' }, isActive: true,
    } });
    const optionLevel = await beginOk({ executionKind: 'sold_out', channelAccountId: wing.accountId, idempotencyKey: 'wing-1', items: [{ channelListingOptionIds: [sibling.id] }] });
    expect(parseRegistrationPayload('sold_out', planOf(optionLevel).payload).listings[0]!.options.map((option) => option.externalOptionId)).toEqual(['provider-option-2']);
    await request(httpUrl).post(`/api/operations/${optionLevel.operation.id}/cancel`).expect(200);
    const wholeListing = await beginOk({ executionKind: 'sold_out', channelAccountId: wing.accountId, idempotencyKey: 'wing-2', items: [{ channelListingId: wing.listingId }] });
    expect(parseRegistrationPayload('sold_out', planOf(wholeListing).payload).listings[0]!.options.map((option) => option.externalOptionId)).toEqual(['provider-option-1', 'provider-option-2']);
    await request(httpUrl).post(`/api/operations/${wholeListing.operation.id}/cancel`).expect(200);
    // 판매자 재고를 받지 않는 옵션은 얼리지 않은 옵션이면 막지 않는다.
    await prisma.channelListingOption.update({ where: { id: wing.listingOptionId! }, data: { rawJson: { registrationType: 'RFM' } } });
    await beginOk({ executionKind: 'sold_out', channelAccountId: wing.accountId, idempotencyKey: 'wing-3', items: [{ channelListingOptionIds: [sibling.id] }] });

    const kidkids = await createFixture(prisma, targets, { listing: true, channel: 'kidkids' });
    await prisma.channelListingOption.create({ data: { organizationId: ORG, listingId: kidkids.listingId!, externalOptionId: 'provider-option-3', isActive: true } });
    const listingLevel = await beginOk({ executionKind: 'sold_out', channelAccountId: kidkids.accountId, idempotencyKey: 'kk-1', items: [{ channelListingOptionIds: [kidkids.listingOptionId] }] });
    expect(parseRegistrationPayload('sold_out', planOf(listingLevel).payload).listings[0]!.options.map((option) => option.externalOptionId)).toEqual(['provider-option-1', 'provider-option-3']);
  });

  it('refuses a sold-out batch for a mall without an availability route before any lock', async () => {
    const fixture = await createFixture(prisma, targets, { listing: true, channel: 'rocket' });
    const refused = await begin({ executionKind: 'sold_out', channelAccountId: fixture.accountId, idempotencyKey: 's-2', items: [{ channelListingId: fixture.listingId }] });
    expect(refused.status).toBe(501);
    expect(refused.body).toMatchObject({ code: 'CHANNELS_MALL_UNSUPPORTED' });
    expect(await prisma.operation.count()).toBe(0);
  });

  it('plans a representative image on its sales product lock and waits for the operator after the upload', async () => {
    const fixture = await createFixture(prisma, targets, { listing: true, channel: 'coupang' });
    const begun = await beginOk({ executionKind: 'thumbnail_update', salesProductId: fixture.productId, idempotencyKey: 'thumb-1' });
    expect(begun.operation.lockKeys).toEqual([`resource:sales-product:${fixture.productId}`]);
    const plan = planOf(begun);
    expect(plan).toMatchObject({ executionKind: 'thumbnail_update', submit: false, salesProductId: fixture.productId, channelListingId: fixture.listingId });
    expect(parseRegistrationPayload('thumbnail_update', plan.payload)).toMatchObject({
      dataUrl: 'data:image/png;base64,AAAA', assetId: THUMBNAIL_ASSET_ID, externalListingId: 'provider-listing-1', productName: 'smartstore',
    });
    // 확장은 사진만 넣고 [저장]은 운영자 몫이다(M2): submitted false · operator_saves · uncertain 으로 멈춘다.
    await finish(begun.operation.id, begun.token, {
      outcome: 'reconciling', result: { ...submittedResult, submitted: false, submitSkipped: 'operator_saves', mallOutcome: 'uncertain', providerOutcome: 'uncertain' },
    }).expect(200);
    const listed = await request(httpUrl).get(`/api/operations/${begun.operation.id}`).expect(200);
    expect(listed.body.operation.status).toBe('reconciling');
    // 화면의 대표이미지 상태 읽기: executionId 는 실행 계약의 실행 id 다(확인 · 닫기 라우트에 그대로 넘긴다).
    const status = await request(httpUrl).get(`/api/channels/thumbnail-executions?salesProductIds=${fixture.productId}`).expect(200);
    expect(status.body.items).toEqual([expect.objectContaining({
      salesProductId: fixture.productId, executionId: begun.operation.id, assetId: THUMBNAIL_ASSET_ID, status: 'reconciling', providerOutcome: 'uncertain',
    })]);
    const choices = await request(httpUrl).get(`/api/channels/thumbnail-executions/listing-choices?salesProductId=${fixture.productId}`).expect(200);
    expect(choices.body.items).toEqual([expect.objectContaining({ channelListingId: fixture.listingId, externalId: 'provider-listing-1' })]);
    // 운영자가 몰에서 저장을 확인하면 확인 라우트가 성공으로 닫는다(리스팅 · 원장 쓰기 없음).
    const confirmed = await request(httpUrl).post(`/api/channels/registration-operations/${begun.operation.id}/confirm`)
      .send({ externalListingId: 'provider-listing-1' }).expect(201);
    expect(confirmed.body.operation).toMatchObject({
      status: 'succeeded', lockKeys: [], result: { providerOutcome: 'succeeded', mallOutcome: 'confirmed', submitSkipped: 'operator_saves' },
    });
    const after = await request(httpUrl).get(`/api/channels/thumbnail-executions?salesProductIds=${fixture.productId}`).expect(200);
    expect(after.body.items).toEqual([expect.objectContaining({ executionId: begun.operation.id, status: 'succeeded', providerOutcome: 'succeeded' })]);
  });

  it('accepts a mall account the mall account screen configured, and refuses a paused one (KID-330 usable accounts)', async () => {
    const fixture = await createFixture(prisma, targets, { listing: true, channel: 'kidkids' });
    await prisma.channelAccount.update({ where: { id: fixture.accountId }, data: { status: 'configured' } });
    const read = await beginOk({ channelAccountId: fixture.accountId, mallKey: 'kidkids', externalListingIds: ['provider-listing-1'] }, MALL_AVAILABILITY_READ_KIND);
    await request(httpUrl).post(`/api/operations/${read.operation.id}/cancel`).expect(200);
    const registered = await beginOk(registerScope(fixture, { channelListingId: fixture.listingId }));
    expect(planOf(registered)).toMatchObject({ channelAccountId: fixture.accountId, mallKey: 'kidkids' });
    await request(httpUrl).post(`/api/operations/${registered.operation.id}/cancel`).expect(200);

    await prisma.channelAccount.update({ where: { id: fixture.accountId }, data: { status: 'paused' } });
    for (const refused of [
      await begin({ channelAccountId: fixture.accountId, mallKey: 'kidkids', externalListingIds: ['provider-listing-1'] }, MALL_AVAILABILITY_READ_KIND),
      await begin(registerScope(fixture, { channelListingId: fixture.listingId })),
    ]) {
      expect(refused.status).toBe(422);
      expect(refused.body).toMatchObject({ code: 'CHANNELS_ACCOUNT_INACTIVE' });
    }
  });

  it('keeps the mall availability rows it read in the result without touching the ledger', async () => {
    const fixture = await createFixture(prisma, targets, { listing: true, channel: 'kidkids' });
    const begun = await beginOk({ channelAccountId: fixture.accountId, mallKey: 'kidkids', externalListingIds: ['provider-listing-1', 'gone-1'] }, MALL_AVAILABILITY_READ_KIND);
    expect(begun.operation.lockKeys).toEqual([`account:${fixture.accountId}`]);
    const row = { externalListingId: 'provider-listing-1', externalOptionId: null, rocket: false, available: false, stock: 0, observedStatus: '품절', observedAt: new Date().toISOString() };
    await put(begun.operation.id, begun.token, 'availability_rows', 1, [row, { ...row, externalListingId: 'not-asked' }]).expect(200);
    const done = await finish(begun.operation.id, begun.token, { outcome: 'succeeded' }).expect(200);
    expect(done.body.operation.result).toEqual({ rowCount: 1, missingExternalListingIds: ['gone-1'], rows: [row] });
    expect(await prisma.channelListing.findUniqueOrThrow({ where: { id: fixture.listingId! } })).toMatchObject({ status: null });
  });
});

type Fixture = Awaited<ReturnType<typeof createFixture>>;

async function createFixture(
  prisma: PrismaClient,
  targets: RegistrationTargetRepositoryAdapter,
  input: { listing?: boolean; channel?: string } = {},
) {
  const accountId = randomUUID();
  const productId = randomUUID();
  const optionId = randomUUID();
  const listingId = input.listing ? randomUUID() : null;
  const listingOptionId = input.listing ? randomUUID() : null;
  const channel = input.channel ?? 'smartstore';
  await prisma.channelAccount.create({
    data: { id: accountId, organizationId: ORG, channel, name: `${channel} ${accountId.slice(0, 4)}`, externalAccountId: 'vendor-1', vendorId: 'vendor-1', status: 'active' },
  });
  await prisma.salesProduct.create({ data: { id: productId, organizationId: ORG, code: `SP-${productId.slice(0, 8)}`, status: 'active', name: '공통 상품', version: 1 } });
  await prisma.salesProductOption.create({
    data: { id: optionId, organizationId: ORG, salesProductId: productId, optionCode: 'KID00000001', optionKey: '파랑', values: ['파랑'], salePrice: 3_000, normalPrice: 5_000, supplyStatus: 'selling', sortOrder: 0 },
  });
  if (listingId && listingOptionId) {
    await prisma.channelListing.create({
      data: { id: listingId, organizationId: ORG, channelAccountId: accountId, salesProductId: productId, externalId: 'provider-listing-1', channelName: 'smartstore', isActive: true },
    });
    await prisma.channelListingOption.create({
      data: { id: listingOptionId, organizationId: ORG, listingId, externalOptionId: 'provider-option-1', salesProductOptionId: optionId, sellerSku: 'EXISTING-SKU', isActive: true, rawJson: channel === 'coupang' ? { registrationType: 'NORMAL' } : undefined },
    });
  }
  const targetId = await targets.create(ORG, {
    salesProductId: productId,
    channelAccountId: accountId,
    registrationInput: { mallCategory: { key: 'category-1', label: null }, mallFields: {}, adapter: {} },
    selectedOptions: [{ salesProductOptionId: optionId }],
  });
  return { accountId, productId, optionId, listingId, listingOptionId, targetId };
}
