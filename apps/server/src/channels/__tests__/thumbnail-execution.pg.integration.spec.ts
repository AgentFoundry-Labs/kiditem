import { randomUUID } from 'node:crypto';
import type { PrismaClient } from '@prisma/client';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  makeTestPrisma,
  OTHER_ORGANIZATION_ID,
  resetDb,
  seedBaseFixture,
  TEST_ORGANIZATION_ID as ORG,
  TEST_USER_ID as USER,
} from '../../test-helpers/real-prisma';
import type { PrismaService } from '../../prisma/prisma.service';
import { canonicalOwnerInputHash } from '../../common/owner-idempotency-key';
import { RegistrableThumbnailRepositoryAdapter } from '../../content/adapter/out/repository/registrable-thumbnail.repository.adapter';
import { RegistrableThumbnailService } from '../../content/application/service/registrable-thumbnail.service';
import { fakeStorageImageFetch } from '../../content/__tests__/helpers/fake-storage-image-fetch';
import { RegistrableThumbnailAdapter } from '../adapter/out/content/registrable-thumbnail.adapter';
import { ChannelIntegrityAdapter } from '../adapter/out/integrity/channel-integrity.adapter';
import { ThumbnailExecutionPersistenceAdapter } from '../adapter/out/persistence/thumbnail-execution.persistence.adapter';
import { ThumbnailExecutionService } from '../application/service/registration/thumbnail-execution.service';
import { ChannelAdapterRegistryAdapter } from '../adapter/out/channel/channel-adapter-registry.adapter';
import { channelAdapters } from './channel-adapters';
import { CoupangChannelAdapter } from '../adapter/out/channel/coupang/coupang-channel.adapter';
import type { RepresentativeImageRunnerPort } from '../application/port/out/automation/representative-image-runner.port';
import { mapException, toEnvelope } from '../../common/filters/global-exception.filter';
import { THUMBNAIL_AWAITING_CONFIRMATION_MESSAGE as AWAITING } from '../domain/registration/thumbnail-update';
import { seedSourceProduct } from '../../test-helpers/inventory-seeds';
import { ProductTransactionalReadRepositoryAdapter } from '../../products/adapter/out/persistence/product-transactional-read.repository.adapter';
import { StockoutCheckPersistenceAdapter } from '../adapter/out/persistence/stockout-check.persistence.adapter';
import { RegistrationExecutionRepositoryAdapter } from '../adapter/out/repository/registration-execution.repository.adapter';

const PNG_DATA_URL = `data:image/png;base64,${Buffer.from('89504e470d0a1a0a', 'hex').toString('base64')}`;

/** Playwright runner 는 외부 경계라 여기서만 바꾼다. */
function fakeRunner() {
  const runner = {
    blocked: false,
    calls: 0,
    next: (): ReturnType<RepresentativeImageRunnerPort['upload']> => Promise.resolve({ outcome: 'uploaded_pending_save', screenshotPath: '/tmp/wing.png' }),
    isBlocked: () => runner.blocked,
    upload: (_input: Parameters<RepresentativeImageRunnerPort['upload']>[0]) => { runner.calls += 1; return runner.next(); },
  };
  return runner;
}

/** 거절을 HTTP 봉투의 code · details.reason으로 읽는다(main.ts와 같은 전역 필터 매핑, KID-342). */
async function rejection(promise: Promise<unknown>): Promise<{ code: string; reason?: unknown }> {
  try { await promise; } catch (error) {
    const envelope = toEnvelope(mapException(error));
    return { code: envelope.code, ...(envelope.details?.reason !== undefined ? { reason: envelope.details.reason } : {}) };
  }
  throw new Error('expected a rejection');
}

describe('thumbnail execution owner (PostgreSQL)', () => {
  let prisma: PrismaClient;
  let service: ThumbnailExecutionService;
  let runner: ReturnType<typeof fakeRunner>;

  beforeAll(async () => {
    prisma = makeTestPrisma();
    await prisma.$connect();
  });
  afterAll(async () => prisma?.$disconnect());
  beforeEach(async () => {
    await resetDb(prisma);
    await seedBaseFixture(prisma);
    runner = fakeRunner();
    const db = prisma as PrismaService;
    const content = new RegistrableThumbnailService(
      new RegistrableThumbnailRepositoryAdapter(db),
      fakeStorageImageFetch(new Map()),
    );
    service = new ThumbnailExecutionService(
      new RegistrableThumbnailAdapter(content),
      new ThumbnailExecutionPersistenceAdapter(db),
      // 대표이미지 runner 는 그 채널 어댑터가 들고 있다(KID-321). Sellpia 사전검사는 이 경로에서 부르지 않는다.
      new ChannelAdapterRegistryAdapter(new CoupangChannelAdapter({ preflightExternalProductRegistration: () => Promise.reject(new Error('unused')) }, runner)),
      new ChannelIntegrityAdapter(),
    );
  });

  async function coupangAccount(organizationId = ORG) {
    return prisma.channelAccount.create({ data: { organizationId, channel: 'coupang', name: `Wing ${randomUUID()}`, status: 'active' } });
  }

  /**
   * 판매 상품과 그 작업공간의 대표이미지 자산(업로드). `listings` 개의 대표이미지 지원 listing 을 붙인다 — 첫
   * listing 에는 몰 상품명이 있다.
   */
  async function productAsset(input: { organizationId?: string; listings?: number; source?: 'upload' | 'ai' } = {}) {
    const organizationId = input.organizationId ?? ORG;
    const product = await prisma.salesProduct.create({ data: { organizationId, name: '판매상품' } });
    const listings = [];
    for (let index = 0; index < (input.listings ?? 0); index += 1) {
      const account = await coupangAccount(organizationId);
      listings.push(await prisma.channelListing.create({
        data: {
          organizationId,
          channelAccountId: account.id,
          externalId: randomUUID(),
          salesProductId: product.id,
          ...(index === 0 ? { channelName: '쿠팡 상품명' } : {}),
        },
      }));
    }
    const workspace = await prisma.contentWorkspace.create({
      data: { organizationId, ownerType: 'sales_product', salesProductId: product.id },
    });
    const job = input.source === 'ai'
      ? await prisma.thumbnailGeneration.create({ data: { organizationId, contentWorkspaceId: workspace.id, status: 'succeeded' } })
      : null;
    const asset = await prisma.contentAsset.create({
      data: {
        organizationId,
        contentWorkspaceId: workspace.id,
        source: input.source ?? 'upload',
        thumbnailGenerationId: job?.id ?? null,
        assetKey: `asset:${randomUUID()}`,
        url: PNG_DATA_URL,
        role: 'thumbnail',
      },
    });
    await prisma.contentWorkspace.update({ where: { id: workspace.id }, data: { currentThumbnailAssetId: asset.id } });
    return { product, listings, listing: listings[0]!, account: listings[0] ? { id: listings[0].channelAccountId } : null, workspace, asset };
  }

  /** 판매 상품 하나에 대표이미지 지원 listing 하나(몰 상품명 있음). */
  const listingAsset = async (organizationId = ORG) => {
    const fixture = await productAsset({ organizationId, listings: 1 });
    return { ...fixture, account: fixture.account! };
  };

  /** 확장이 Wing 수정 화면에 올리고, 운영자가 Wing 에서 저장한 뒤 반영됨으로 표시한다. */
  async function uploadAndConfirm(executionId: string) {
    await service.report({ organizationId: ORG, requestedByUserId: USER, executionId, report: { outcome: 'uploaded_pending_save' } });
    return service.confirmApplied({ organizationId: ORG, requestedByUserId: USER, executionId });
  }

  it('prepares an executing thumbnail_update execution, waits for the operator after the upload and records success only on confirmation', async () => {
    const { account, listing, workspace, product, asset } = await listingAsset();

    const prepared = await service.prepare({ organizationId: ORG, requestedByUserId: USER, salesProductId: product.id });
    expect(prepared).toEqual({
      executionId: expect.any(String),
      salesProductId: product.id,
      assetId: asset.id,
      productName: '쿠팡 상품명',
      image: { dataUrl: PNG_DATA_URL, filename: `${asset.id}.png`, mimeType: 'image/png' },
    });
    const row = await prisma.productRegistrationExecution.findUniqueOrThrow({ where: { id: prepared.executionId } });
    expect(row).toMatchObject({
      organizationId: ORG,
      executionKind: 'thumbnail_update',
      channelAccountId: account.id,
      // listing 은 동결 payload 에만 있다 — 실행 행은 listing 자리를 잡지 않는다.
      channelListingId: null,
      status: 'executing',
      providerOutcome: 'uncertain',
      requestedByUserId: USER,
      ownerIdempotencyKey: null,
    });
    expect(row.submissionPayloadJson).toMatchObject({
      kind: 'thumbnail_update', salesProductId: product.id, assetId: asset.id, contentWorkspaceId: workspace.id, channelListingId: listing.id,
      productName: '쿠팡 상품명', image: { url: PNG_DATA_URL, sha256: expect.stringMatching(/^[a-f0-9]{64}$/) },
    });
    expect(row.submissionPayloadHash).toMatch(/^[a-f0-9]{64}$/);
    expect(row.requestHash).toBe(row.submissionPayloadHash);
    expect(row.idempotencyKey).toMatch(new RegExp(`^thumbnail_update:${product.id}:${account.id}:${asset.id}:`));

    await expect(service.report({
      organizationId: ORG, requestedByUserId: USER, executionId: prepared.executionId,
      report: { outcome: 'uploaded_pending_save', screenshotUrl: 'chrome-extension://wing/shot.png', externalId: 'seller-1' },
    })).resolves.toEqual({
      salesProductId: product.id, assetId: asset.id, executionId: prepared.executionId, success: false, status: 'reconciling',
      screenshotPath: 'chrome-extension://wing/shot.png', error: AWAITING,
    });
    await expect(service.listLatest({ organizationId: ORG, salesProductIds: [product.id] }))
      .resolves.toMatchObject([{ status: 'reconciling', providerOutcome: 'uncertain', error: AWAITING, screenshotPath: 'chrome-extension://wing/shot.png' }]);

    await expect(service.confirmApplied({ organizationId: ORG, requestedByUserId: USER, executionId: prepared.executionId })).resolves.toEqual({
      salesProductId: product.id, assetId: asset.id, executionId: prepared.executionId, success: true, status: 'succeeded', screenshotPath: 'chrome-extension://wing/shot.png',
    });
    await expect(service.listLatest({ organizationId: ORG, salesProductIds: [product.id] })).resolves.toEqual([{
      salesProductId: product.id,
      assetId: asset.id,
      executionId: prepared.executionId,
      status: 'succeeded',
      providerOutcome: 'succeeded',
      checkedAt: expect.any(String),
      error: null,
      screenshotPath: 'chrome-extension://wing/shot.png',
    }]);
  });

  it('refuses a second prepare while the first is live and creates one execution from two concurrent prepares', async () => {
    // listing 이 없는 실행이라 부분 unique index 가 아니라 (상품, 계정, 자산) advisory lock 만 막는다.
    await coupangAccount();
    const { product, asset } = await productAsset();
    const input = { organizationId: ORG, requestedByUserId: USER, salesProductId: product.id };

    const settled = await Promise.allSettled([service.prepare(input), service.prepare(input)]);
    expect(settled.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    const refused = settled.find((result) => result.status === 'rejected') as PromiseRejectedResult;
    expect(refused.reason).toMatchObject({ code: 'CHANNELS_THUMBNAIL_EXECUTION_ACTIVE', details: { reason: 'IMAGE_LIVE' } });
    expect(await rejection(service.prepare(input))).toMatchObject({ code: 'CHANNELS_THUMBNAIL_EXECUTION_ACTIVE', reason: 'IMAGE_LIVE' });
    expect(await prisma.productRegistrationExecution.count({ where: { organizationId: ORG, executionKind: 'thumbnail_update' } })).toBe(1);
  });

  it('keeps an unknown outcome reconciling until a later report settles it, then refuses a report on the finished execution', async () => {
    const { product, asset } = await listingAsset();
    const prepared = await service.prepare({ organizationId: ORG, requestedByUserId: USER, salesProductId: product.id });
    const report = (body: Parameters<ThumbnailExecutionService['report']>[0]['report']) =>
      service.report({ organizationId: ORG, requestedByUserId: USER, executionId: prepared.executionId, report: body });

    await expect(report({ outcome: 'uncertain', error: 'port closed' })).resolves.toMatchObject({ success: false, error: 'port closed' });
    await expect(service.listLatest({ organizationId: ORG, salesProductIds: [product.id] }))
      .resolves.toMatchObject([{ status: 'reconciling', providerOutcome: 'uncertain', error: 'port closed' }]);
    expect(await rejection(service.prepare({ organizationId: ORG, requestedByUserId: USER, salesProductId: product.id })))
      .toMatchObject({ code: 'CHANNELS_THUMBNAIL_EXECUTION_ACTIVE', reason: 'IMAGE_LIVE' });

    await expect(report({ outcome: 'uploaded_pending_save' })).resolves.toMatchObject({ success: false, status: 'reconciling' });
    await expect(service.confirmApplied({ organizationId: ORG, requestedByUserId: USER, executionId: prepared.executionId }))
      .resolves.toMatchObject({ success: true, status: 'succeeded' });
    await expect(service.listLatest({ organizationId: ORG, salesProductIds: [product.id] }))
      .resolves.toMatchObject([{ status: 'succeeded', providerOutcome: 'succeeded', error: null }]);

    expect(await rejection(report({ outcome: 'definitive_failure', error: 'late' }))).toMatchObject({ code: 'CHANNELS_EXECUTION_TERMINAL' });
    expect(await rejection(service.report({
      organizationId: ORG, requestedByUserId: USER, executionId: randomUUID(), report: { outcome: 'uploaded_pending_save' },
    }))).toMatchObject({ code: 'CHANNELS_EXECUTION_NOT_FOUND' });
  });

  it('accepts the operator confirmation only after an upload is waiting for it', async () => {
    const { product, asset } = await listingAsset();
    const prepared = await service.prepare({ organizationId: ORG, requestedByUserId: USER, salesProductId: product.id });
    const confirm = () => service.confirmApplied({ organizationId: ORG, requestedByUserId: USER, executionId: prepared.executionId });

    expect(await rejection(confirm())).toMatchObject({ code: 'STATE_CONFLICT', reason: 'NOT_ACCEPTING_REPORT' });
    await service.report({ organizationId: ORG, requestedByUserId: USER, executionId: prepared.executionId, report: { outcome: 'definitive_failure', error: '로그인 필요' } });
    expect(await rejection(confirm())).toMatchObject({ code: 'CHANNELS_EXECUTION_TERMINAL' });
    expect(await prisma.productRegistrationExecution.findUniqueOrThrow({ where: { id: prepared.executionId } })).toMatchObject({ status: 'failed' });
  });

  it('records a definitive failure, lets the operator dismiss it from the latest list and keeps the row', async () => {
    const { product, asset } = await listingAsset();
    const first = await service.prepare({ organizationId: ORG, requestedByUserId: USER, salesProductId: product.id });
    await uploadAndConfirm(first.executionId);
    const second = await service.prepare({ organizationId: ORG, requestedByUserId: USER, salesProductId: product.id });
    await expect(service.report({
      organizationId: ORG, requestedByUserId: USER, executionId: second.executionId, report: { outcome: 'definitive_failure', error: '로그인 필요' },
    })).resolves.toEqual({ salesProductId: product.id, assetId: asset.id, executionId: second.executionId, success: false, status: 'failed', screenshotPath: null, error: '로그인 필요' });
    await expect(service.listLatest({ organizationId: ORG, salesProductIds: [product.id] }))
      .resolves.toMatchObject([{ executionId: second.executionId, status: 'failed', providerOutcome: 'definitive_failure', error: '로그인 필요' }]);

    await expect(service.dismissFailed({ organizationId: OTHER_ORGANIZATION_ID, salesProductId: product.id })).resolves.toEqual({ dismissed: false });
    await expect(service.dismissFailed({ organizationId: ORG, salesProductId: product.id })).resolves.toEqual({ dismissed: true });
    await expect(service.listLatest({ organizationId: ORG, salesProductIds: [product.id] }))
      .resolves.toMatchObject([{ executionId: first.executionId, status: 'succeeded' }]);
    await expect(service.dismissFailed({ organizationId: ORG, salesProductId: product.id })).resolves.toEqual({ dismissed: false });
    expect(await prisma.productRegistrationExecution.findUniqueOrThrow({ where: { id: second.executionId } }))
      .toMatchObject({ status: 'failed', resultJson: expect.objectContaining({ dismissedAt: expect.any(String) }) });
  });

  it('answers an Agent run with a pending receipt until the operator confirms, replays it by owner key and refuses a drifted request hash', async () => {
    const { product, asset } = await listingAsset();
    const owner = { ownerIdempotencyKey: `capability-invocation:${randomUUID()}`, requestHash: canonicalOwnerInputHash({ salesProductId: product.id }) };
    const input = { organizationId: ORG, requestedByUserId: USER, salesProductId: product.id, owner };

    const first = await service.runOnServer(input);
    expect(first).toMatchObject({ success: false, status: 'reconciling', screenshotPath: '/tmp/wing.png', error: AWAITING });
    await expect(service.runOnServer(input)).resolves.toEqual(first);
    await service.confirmApplied({ organizationId: ORG, requestedByUserId: USER, executionId: first.executionId });
    await expect(service.runOnServer(input)).resolves.toMatchObject({ success: true, status: 'succeeded', screenshotPath: '/tmp/wing.png' });
    expect(runner.calls).toBe(1);
    expect(await prisma.productRegistrationExecution.findUniqueOrThrow({ where: { id: first.executionId } }))
      .toMatchObject({ ownerIdempotencyKey: owner.ownerIdempotencyKey, requestHash: owner.requestHash, idempotencyKey: `thumbnail_update:${owner.ownerIdempotencyKey}` });
    expect(await rejection(service.runOnServer({ ...input, owner: { ...owner, requestHash: 'b'.repeat(64) } }))).toMatchObject({ code: 'DB_CONFLICT', reason: 'owner_idempotency_key_conflict' });
  });

  it('answers an owner replay first: before the production block, the Content reads and the account and image checks', async () => {
    const { product, asset, workspace } = await listingAsset();
    const owner = { ownerIdempotencyKey: `capability-invocation:${randomUUID()}`, requestHash: canonicalOwnerInputHash({ salesProductId: product.id }) };
    const input = { organizationId: ORG, requestedByUserId: USER, salesProductId: product.id, owner };
    const first = await service.runOnServer(input);

    runner.blocked = true;
    await prisma.contentWorkspace.update({ where: { id: workspace.id }, data: { status: 'archived', isDeleted: true } });
    await prisma.channelAccount.updateMany({ where: { organizationId: ORG }, data: { status: 'inactive' } });
    await expect(service.runOnServer(input)).resolves.toEqual(first);
    expect(runner.calls).toBe(1);
  });

  it('refuses the same owner key for a different sales product without running the upload', async () => {
    const first = await listingAsset();
    const second = await listingAsset();
    const ownerIdempotencyKey = `capability-invocation:${randomUUID()}`;
    await service.runOnServer({
      organizationId: ORG, requestedByUserId: USER, salesProductId: first.product.id,
      owner: { ownerIdempotencyKey, requestHash: canonicalOwnerInputHash({ salesProductId: first.product.id }) },
    });

    expect(await rejection(service.runOnServer({
      organizationId: ORG, requestedByUserId: USER, salesProductId: second.product.id,
      owner: { ownerIdempotencyKey, requestHash: canonicalOwnerInputHash({ salesProductId: second.product.id }) },
    }))).toMatchObject({ code: 'DB_CONFLICT', reason: 'owner_idempotency_key_conflict' });
    expect(runner.calls).toBe(1);
    expect(await prisma.productRegistrationExecution.count({ where: { executionKind: 'thumbnail_update' } })).toBe(1);
  });

  it('turns a runner crash into an unknown outcome, rethrows it and answers the owner replay as pending reconciliation', async () => {
    const { product, asset } = await listingAsset();
    const owner = { ownerIdempotencyKey: `capability-invocation:${randomUUID()}`, requestHash: canonicalOwnerInputHash({ salesProductId: product.id }) };
    const input = { organizationId: ORG, requestedByUserId: USER, salesProductId: product.id, owner };
    runner.next = () => Promise.reject(new Error('playwriter exited'));

    await expect(service.runOnServer(input)).rejects.toThrow('playwriter exited');
    await expect(service.listLatest({ organizationId: ORG, salesProductIds: [product.id] }))
      .resolves.toMatchObject([{ status: 'reconciling', providerOutcome: 'uncertain', error: 'playwriter exited' }]);
    expect(await rejection(service.runOnServer(input))).toMatchObject({ code: 'SERVICE_UNAVAILABLE', reason: 'RECONCILIATION_PENDING' });
    expect(runner.calls).toBe(1);
  });

  it('records a runner rejection as failed and blocks the server runner in production', async () => {
    const { product, asset } = await listingAsset();
    runner.next = () => Promise.resolve({ outcome: 'definitive_failure', error: '상품을 찾을 수 없습니다' });
    await expect(service.runOnServer({ organizationId: ORG, requestedByUserId: null, salesProductId: product.id, owner: null }))
      .resolves.toMatchObject({ success: false, error: '상품을 찾을 수 없습니다', screenshotPath: null });

    runner.blocked = true;
    expect(await rejection(service.runOnServer({ organizationId: ORG, requestedByUserId: null, salesProductId: product.id, owner: null })))
      .toMatchObject({ code: 'CHANNELS_SERVER_AUTOMATION_BLOCKED' });
    expect(runner.calls).toBe(1);
  });

  it('keeps executions, reports and the latest list inside one organization', async () => {
    const mine = await listingAsset();
    const theirs = await listingAsset(OTHER_ORGANIZATION_ID);
    expect(await rejection(service.prepare({ organizationId: ORG, requestedByUserId: USER, salesProductId: theirs.product.id }))).toMatchObject({ code: 'NOT_FOUND' });
    const prepared = await service.prepare({ organizationId: OTHER_ORGANIZATION_ID, requestedByUserId: null, salesProductId: theirs.product.id });

    expect(await rejection(service.report({ organizationId: ORG, requestedByUserId: USER, executionId: prepared.executionId, report: { outcome: 'uploaded_pending_save' } })))
      .toMatchObject({ code: 'CHANNELS_EXECUTION_NOT_FOUND' });
    await expect(service.listLatest({ organizationId: ORG, salesProductIds: [theirs.product.id, mine.product.id] })).resolves.toEqual([]);
    await expect(service.listLatest({ organizationId: OTHER_ORGANIZATION_ID, salesProductIds: [theirs.product.id] }))
      .resolves.toMatchObject([{ executionId: prepared.executionId, status: 'executing' }]);
  });

  it('never takes the listing slot: a live thumbnail execution blocks neither a sold_out execution nor the stockout check', async () => {
    const { account, listing, product, asset } = await listingAsset();
    await prisma.channelAccount.update({ where: { id: account.id }, data: { externalAccountId: 'vendor' } });
    const option = await prisma.channelListingOption.create({
      data: { organizationId: ORG, listingId: listing.id, externalOptionId: 'option-1', rawJson: { registrationType: 'NORMAL' }, status: 'active', safetyStock: 2 },
    });
    const component = await seedSourceProduct(prisma, { organizationId: ORG, code: randomUUID(), name: 'component', currentStock: 1 });
    await prisma.channelListingOptionInventoryComponent.create({ data: { organizationId: ORG, channelListingOptionId: option.id, masterProductId: component.id, quantity: 1 } });
    await service.prepare({ organizationId: ORG, requestedByUserId: USER, salesProductId: product.id });

    const db = prisma as PrismaService;
    const [subject] = await new StockoutCheckPersistenceAdapter(db, new ProductTransactionalReadRepositoryAdapter()).readSubjects(ORG, [listing.id]);
    expect(subject?.activeExecutions).toEqual([]);
    await expect(new RegistrationExecutionRepositoryAdapter(db, channelAdapters()).prepareListingAvailability({
      organizationId: ORG, requestedByUserId: USER,
      request: { channelAccountId: account.id, externalListingId: listing.externalId, kind: 'sold_out', optionCodes: ['option-1'], idempotencyKey: randomUUID() },
    })).resolves.toMatchObject({ status: 'prepared' });
  });

  it('keeps one live thumbnail upload per listing: another asset of the product waits until the first is marked not applied', async () => {
    const { workspace, product } = await listingAsset();
    const second = await prisma.contentAsset.create({
      data: {
        organizationId: ORG, contentWorkspaceId: workspace.id, source: 'upload', assetKey: `asset:${randomUUID()}`, url: PNG_DATA_URL, role: 'thumbnail',
      },
    });
    const first = await service.prepare({ organizationId: ORG, requestedByUserId: USER, salesProductId: product.id });
    const secondInput = { organizationId: ORG, requestedByUserId: USER, salesProductId: product.id, assetId: second.id };

    const concurrent = await Promise.allSettled([service.prepare(secondInput), service.prepare(secondInput)]);
    expect(concurrent.map((result) => result.status)).toEqual(['rejected', 'rejected']);
    expect(await rejection(service.prepare(secondInput)))
      .toMatchObject({ code: 'CHANNELS_THUMBNAIL_EXECUTION_ACTIVE', reason: 'LISTING_BUSY' });

    await service.markNotApplied({ organizationId: ORG, requestedByUserId: USER, executionId: first.executionId });
    await expect(service.prepare(secondInput)).resolves.toMatchObject({ salesProductId: product.id, assetId: second.id });
  });

  it('lets the operator mark an unknown outcome as not applied, which frees the asset for a new upload', async () => {
    const { product, asset } = await listingAsset();
    const input = { organizationId: ORG, requestedByUserId: USER, salesProductId: product.id };
    const prepared = await service.prepare(input);
    await service.report({ ...input, executionId: prepared.executionId, report: { outcome: 'uncertain', error: 'port closed' } });

    await expect(service.markNotApplied({ organizationId: ORG, requestedByUserId: USER, executionId: prepared.executionId }))
      .resolves.toEqual({ salesProductId: product.id, assetId: asset.id, executionId: prepared.executionId, success: false, status: 'failed', screenshotPath: null, error: '운영자가 반영되지 않았다고 표시함' });
    expect(await prisma.productRegistrationExecution.findUniqueOrThrow({ where: { id: prepared.executionId } }))
      .toMatchObject({ status: 'failed', providerOutcome: 'definitive_failure', lastErrorMessage: '운영자가 반영되지 않았다고 표시함' });
    await expect(service.prepare(input)).resolves.toMatchObject({ salesProductId: product.id });
  });

  it('refuses to mark a finished execution as not applied', async () => {
    const { product, asset } = await listingAsset();
    const prepared = await service.prepare({ organizationId: ORG, requestedByUserId: USER, salesProductId: product.id });
    await uploadAndConfirm(prepared.executionId);
    expect(await rejection(service.markNotApplied({ organizationId: ORG, requestedByUserId: USER, executionId: prepared.executionId })))
      .toMatchObject({ code: 'CHANNELS_EXECUTION_TERMINAL' });
    expect(await prisma.productRegistrationExecution.findUniqueOrThrow({ where: { id: prepared.executionId } }))
      .toMatchObject({ status: 'succeeded' });
  });

  it('hands the frozen upload back for a resend while the outcome is unknown, and only then', async () => {
    const { product, asset } = await listingAsset();
    const prepared = await service.prepare({ organizationId: ORG, requestedByUserId: USER, salesProductId: product.id });
    await service.report({ organizationId: ORG, requestedByUserId: USER, executionId: prepared.executionId, report: { outcome: 'uncertain', error: 'port closed' } });

    await expect(service.resend({ organizationId: ORG, executionId: prepared.executionId })).resolves.toEqual(prepared);
    await uploadAndConfirm(prepared.executionId);
    expect(await rejection(service.resend({ organizationId: ORG, executionId: prepared.executionId }))).toMatchObject({ code: 'CHANNELS_EXECUTION_TERMINAL' });
    expect(await rejection(service.resend({ organizationId: OTHER_ORGANIZATION_ID, executionId: prepared.executionId }))).toMatchObject({ code: 'CHANNELS_EXECUTION_NOT_FOUND' });
  });

  describe('account resolution', () => {
    it('uses the listing a sales product has on Coupang, or the one the operator picks', async () => {
      const single = await productAsset({ listings: 1 });
      const prepared = await service.prepare({ organizationId: ORG, requestedByUserId: USER, salesProductId: single.product.id });
      expect(await prisma.productRegistrationExecution.findUniqueOrThrow({ where: { id: prepared.executionId } }))
        .toMatchObject({ channelAccountId: single.listings[0]!.channelAccountId, channelListingId: null, submissionPayloadJson: expect.objectContaining({ channelListingId: single.listings[0]!.id }) });

      const many = await productAsset({ listings: 2 });
      expect(await rejection(service.prepare({ organizationId: ORG, requestedByUserId: USER, salesProductId: many.product.id })))
        .toMatchObject({ code: 'VALIDATION_FAILED', reason: 'ambiguous_listing' });
      const picked = await service.prepare({ organizationId: ORG, requestedByUserId: USER, salesProductId: many.product.id, channelListingId: many.listings[1]!.id });
      expect(await prisma.productRegistrationExecution.findUniqueOrThrow({ where: { id: picked.executionId } }))
        .toMatchObject({ channelAccountId: many.listings[1]!.channelAccountId, channelListingId: null, submissionPayloadJson: expect.objectContaining({ channelListingId: many.listings[1]!.id }) });
    });

    it('names the upload by the listing, else the sales product, and refuses when neither has a name', async () => {
      const encoded = await listingAsset();
      await prisma.channelListing.update({ where: { id: encoded.listing.id }, data: { channelName: encodeURIComponent('인코딩 이름') } });
      await expect(service.prepare({ organizationId: ORG, requestedByUserId: USER, salesProductId: encoded.product.id }))
        .resolves.toMatchObject({ productName: '인코딩 이름' });

      const product = await productAsset({ listings: 1 });
      await prisma.channelListing.update({ where: { id: product.listing.id }, data: { channelName: null } });
      await expect(service.prepare({ organizationId: ORG, requestedByUserId: USER, salesProductId: product.product.id }))
        .resolves.toMatchObject({ productName: '판매상품' });

      const unnamed = await listingAsset();
      await prisma.channelListing.update({ where: { id: unnamed.listing.id }, data: { channelName: null } });
      await prisma.salesProduct.update({ where: { id: unnamed.product.id }, data: { name: '  ' } });
      expect(await rejection(service.prepare({ organizationId: ORG, requestedByUserId: USER, salesProductId: unnamed.product.id })))
        .toMatchObject({ code: 'CHANNELS_PREFLIGHT_FAILED', reason: 'PRODUCT_NAME_MISSING' });
    });

    it('names the choice with a machine code and lists the product Coupang listings the operator can pick', async () => {
      const product = await productAsset({ listings: 2 });
      await prisma.channelListing.update({ where: { id: product.listings[0]!.id }, data: { channelName: '첫 listing' } });
      await prisma.channelListing.create({
        data: { organizationId: ORG, channelAccountId: product.listings[0]!.channelAccountId, externalId: randomUUID(), salesProductId: product.product.id, isActive: false },
      });

      await expect(service.prepare({ organizationId: ORG, requestedByUserId: USER, salesProductId: product.product.id }))
        .rejects.toMatchObject({ code: 'VALIDATION_FAILED', details: { reason: 'ambiguous_listing' } });
      const choices = await service.listingChoices({ organizationId: ORG, salesProductId: product.product.id });
      expect(choices.map((choice) => choice.channelListingId).sort()).toEqual(product.listings.map((listing) => listing.id).sort());
      expect(choices.find((choice) => choice.channelListingId === product.listings[0]!.id)).toMatchObject({
        channelListingId: product.listings[0]!.id, channelName: '첫 listing', channelAccountName: expect.stringMatching(/^Wing /), externalId: product.listings[0]!.externalId,
      });
      await expect(service.listingChoices({ organizationId: OTHER_ORGANIZATION_ID, salesProductId: product.product.id })).resolves.toEqual([]);
    });

    it('refuses two Coupang listings of the product on one account instead of picking one', async () => {
      const product = await productAsset({ listings: 1 });
      await prisma.channelListing.create({
        data: { organizationId: ORG, channelAccountId: product.listings[0]!.channelAccountId, externalId: randomUUID(), salesProductId: product.product.id },
      });
      expect(await rejection(service.prepare({ organizationId: ORG, requestedByUserId: USER, salesProductId: product.product.id })))
        .toMatchObject({ code: 'VALIDATION_FAILED', reason: 'ambiguous_listing' });
      expect(await prisma.productRegistrationExecution.count({ where: { executionKind: 'thumbnail_update' } })).toBe(0);
    });

    it('falls back to the single active Coupang account and refuses none or several', async () => {
      const none = await productAsset();
      expect(await rejection(service.prepare({ organizationId: ORG, requestedByUserId: USER, salesProductId: none.product.id })))
        .toMatchObject({ code: 'VALIDATION_FAILED', reason: 'no_account' });

      await prisma.channelAccount.create({ data: { organizationId: ORG, channel: 'coupang', name: 'inactive', status: 'inactive' } });
      await prisma.channelAccount.create({ data: { organizationId: ORG, channel: 'rocket', name: 'rocket', status: 'active' } });
      await coupangAccount(OTHER_ORGANIZATION_ID);
      expect(await rejection(service.prepare({ organizationId: ORG, requestedByUserId: USER, salesProductId: none.product.id })))
        .toMatchObject({ code: 'VALIDATION_FAILED', reason: 'no_account' });

      const only = await coupangAccount();
      const prepared = await service.prepare({ organizationId: ORG, requestedByUserId: USER, salesProductId: none.product.id });
      expect(await prisma.productRegistrationExecution.findUniqueOrThrow({ where: { id: prepared.executionId } }))
        .toMatchObject({ channelAccountId: only.id, channelListingId: null });
      await uploadAndConfirm(prepared.executionId);

      await coupangAccount();
      expect(await rejection(service.prepare({ organizationId: ORG, requestedByUserId: USER, salesProductId: none.product.id })))
        .toMatchObject({ code: 'VALIDATION_FAILED', reason: 'ambiguous_account' });
    });

    /** KID-321: 계정 결정은 채널 키가 아니라 registry `representativeImage` 능력을 읽는다. */
    it('counts only listings and accounts of channels that support representative images', async () => {
      const product = await productAsset({ listings: 1 });
      const kakao = await prisma.channelAccount.create({ data: { organizationId: ORG, channel: 'kakao', name: 'kakao', status: 'active' } });
      await prisma.channelListing.create({
        data: { organizationId: ORG, channelAccountId: kakao.id, externalId: randomUUID(), salesProductId: product.product.id },
      });
      const prepared = await service.prepare({ organizationId: ORG, requestedByUserId: USER, salesProductId: product.product.id });
      expect(await prisma.productRegistrationExecution.findUniqueOrThrow({ where: { id: prepared.executionId } }))
        .toMatchObject({ channelAccountId: product.listings[0]!.channelAccountId });
      const choices = await service.listingChoices({ organizationId: ORG, salesProductId: product.product.id });
      expect(choices.map((choice) => choice.channelListingId)).toEqual([product.listings[0]!.id]);

      const bare = await productAsset();
      await prisma.channelAccount.updateMany({ where: { organizationId: ORG, channel: 'coupang' }, data: { status: 'inactive' } });
      await expect(service.prepare({ organizationId: ORG, requestedByUserId: USER, salesProductId: bare.product.id }))
        .rejects.toMatchObject({ code: 'VALIDATION_FAILED', details: { reason: 'no_account' } });
    });

    it('accepts a picked listing only when it is an active representative-image listing of this product', async () => {
      const product = await productAsset({ listings: 1 });
      const other = await productAsset({ listings: 1 });
      const theirs = await listingAsset(OTHER_ORGANIZATION_ID);
      const inactive = await prisma.channelListing.create({
        data: { organizationId: ORG, channelAccountId: product.listings[0]!.channelAccountId, externalId: randomUUID(), salesProductId: product.product.id, isActive: false },
      });
      const pick = (salesProductId: string, channelListingId: string) =>
        rejection(service.prepare({ organizationId: ORG, requestedByUserId: USER, salesProductId, channelListingId }));

      expect(await pick(product.product.id, other.listings[0]!.id)).toMatchObject({ code: 'VALIDATION_FAILED' });
      expect(await pick(product.product.id, theirs.listing.id)).toMatchObject({ code: 'VALIDATION_FAILED' });
      expect(await pick(product.product.id, inactive.id)).toMatchObject({ code: 'VALIDATION_FAILED' });
      await expect(service.prepare({ organizationId: ORG, requestedByUserId: USER, salesProductId: product.product.id, channelListingId: product.listing.id }))
        .resolves.toMatchObject({ salesProductId: product.product.id });
    });
  });

  describe('which asset goes to the mall (KID-313 W3a)', () => {
    it('uploads an AI candidate the same way as an uploaded asset, and only from this product', async () => {
      const { product, asset, workspace } = await listingAsset();
      const job = await prisma.thumbnailGeneration.create({ data: { organizationId: ORG, contentWorkspaceId: workspace.id, status: 'succeeded' } });
      const candidate = await prisma.contentAsset.create({
        data: {
          organizationId: ORG, contentWorkspaceId: workspace.id, source: 'ai', thumbnailGenerationId: job.id,
          assetKey: `ai:${randomUUID()}`, url: PNG_DATA_URL, role: 'thumbnail',
        },
      });
      const foreign = await productAsset();

      const prepared = await service.prepare({ organizationId: ORG, requestedByUserId: USER, salesProductId: product.id, assetId: candidate.id });
      expect(prepared).toMatchObject({ salesProductId: product.id, assetId: candidate.id });
      expect(await rejection(service.prepare({ organizationId: ORG, requestedByUserId: USER, salesProductId: product.id, assetId: foreign.asset.id })))
        .toMatchObject({ code: 'VALIDATION_FAILED' });
      // 다른 자산이라 (상품, 계정, 자산) 이 다르지만 같은 listing 이므로 기다린다.
      expect(await rejection(service.prepare({ organizationId: ORG, requestedByUserId: USER, salesProductId: product.id, assetId: asset.id })))
        .toMatchObject({ code: 'CHANNELS_THUMBNAIL_EXECUTION_ACTIVE', reason: 'LISTING_BUSY' });
    });

    it('uses the asset the registration target chose for that account before the workspace representative image', async () => {
      const { product, workspace, listing } = await listingAsset();
      const chosen = await prisma.contentAsset.create({
        data: { organizationId: ORG, contentWorkspaceId: workspace.id, source: 'upload', assetKey: `chosen:${randomUUID()}`, url: PNG_DATA_URL, role: 'thumbnail' },
      });
      await prisma.registrationTarget.create({
        data: {
          organizationId: ORG, salesProductId: product.id, channelAccountId: listing.channelAccountId,
          registrationInput: {}, selectedThumbnailAssetId: chosen.id,
        },
      });

      await expect(service.prepare({ organizationId: ORG, requestedByUserId: USER, salesProductId: product.id }))
        .resolves.toMatchObject({ assetId: chosen.id });
    });

    it('refuses a product with no representative image and nothing chosen', async () => {
      const { product, workspace } = await listingAsset();
      await prisma.contentWorkspace.update({ where: { id: workspace.id }, data: { currentThumbnailAssetId: null } });
      expect(await rejection(service.prepare({ organizationId: ORG, requestedByUserId: USER, salesProductId: product.id })))
        .toMatchObject({ code: 'NOT_FOUND' });
      expect(await prisma.productRegistrationExecution.count({ where: { executionKind: 'thumbnail_update' } })).toBe(0);
    });
  });
});
