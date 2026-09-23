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
import { ChannelBusinessError } from '../domain/exception/channel-business-error';
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

async function rejection(promise: Promise<unknown>): Promise<{ kind: string; message: string }> {
  try { await promise; } catch (error) {
    if (error instanceof ChannelBusinessError) return { kind: error.kind, message: error.message };
    const status = (error as { getStatus?: () => number }).getStatus?.();
    return { kind: String(status ?? 'error'), message: (error as Error).message };
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

  async function listingGeneration(organizationId = ORG) {
    const account = await coupangAccount(organizationId);
    const listing = await prisma.channelListing.create({
      data: { organizationId, channelAccountId: account.id, externalId: randomUUID(), channelName: '쿠팡 상품명' },
    });
    const workspace = await prisma.contentWorkspace.create({
      data: { organizationId, ownerType: 'channel_listing', channelListingId: listing.id, displayName: '작업공간', normalizedTitle: randomUUID() },
    });
    const generation = await prisma.thumbnailGeneration.create({
      data: { organizationId, contentWorkspaceId: workspace.id, status: 'succeeded', selectedUrl: PNG_DATA_URL },
    });
    return { account, listing, workspace, generation };
  }

  async function salesProductGeneration(input: { listings?: number } = {}) {
    const product = await prisma.salesProduct.create({ data: { organizationId: ORG, name: '판매상품' } });
    const listings = [];
    for (let index = 0; index < (input.listings ?? 0); index += 1) {
      const account = await coupangAccount();
      listings.push(await prisma.channelListing.create({
        data: { organizationId: ORG, channelAccountId: account.id, externalId: randomUUID(), salesProductId: product.id },
      }));
    }
    const workspace = await prisma.contentWorkspace.create({
      data: { organizationId: ORG, ownerType: 'sales_product', salesProductId: product.id, displayName: '판매상품 작업공간', normalizedTitle: randomUUID() },
    });
    const generation = await prisma.thumbnailGeneration.create({
      data: { organizationId: ORG, contentWorkspaceId: workspace.id, status: 'succeeded', selectedUrl: PNG_DATA_URL },
    });
    return { product, listings, workspace, generation };
  }

  /** 확장이 Wing 수정 화면에 올리고, 운영자가 Wing 에서 저장한 뒤 반영됨으로 표시한다. */
  async function uploadAndConfirm(executionId: string) {
    await service.report({ organizationId: ORG, requestedByUserId: USER, executionId, report: { outcome: 'uploaded_pending_save' } });
    return service.confirmApplied({ organizationId: ORG, requestedByUserId: USER, executionId });
  }

  it('prepares an executing thumbnail_update execution, waits for the operator after the upload and records success only on confirmation', async () => {
    const { account, listing, workspace, generation } = await listingGeneration();

    const prepared = await service.prepare({ organizationId: ORG, requestedByUserId: USER, generationId: generation.id });
    expect(prepared).toEqual({
      executionId: expect.any(String),
      generationId: generation.id,
      productName: '쿠팡 상품명',
      image: { dataUrl: PNG_DATA_URL, filename: `${generation.id}.png`, mimeType: 'image/png' },
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
      kind: 'thumbnail_update', generationId: generation.id, contentWorkspaceId: workspace.id, channelListingId: listing.id,
      productName: '쿠팡 상품명', image: { url: PNG_DATA_URL, assetId: null, sha256: expect.stringMatching(/^[a-f0-9]{64}$/) },
    });
    expect(row.submissionPayloadHash).toMatch(/^[a-f0-9]{64}$/);
    expect(row.requestHash).toBe(row.submissionPayloadHash);
    expect(row.idempotencyKey).toMatch(new RegExp(`^thumbnail_update:${generation.id}:`));

    await expect(service.report({
      organizationId: ORG, requestedByUserId: USER, executionId: prepared.executionId,
      report: { outcome: 'uploaded_pending_save', screenshotUrl: 'chrome-extension://wing/shot.png', externalId: 'seller-1' },
    })).resolves.toEqual({
      generationId: generation.id, executionId: prepared.executionId, success: false, status: 'reconciling',
      screenshotPath: 'chrome-extension://wing/shot.png', error: AWAITING,
    });
    await expect(service.listLatest({ organizationId: ORG, generationIds: [generation.id] }))
      .resolves.toMatchObject([{ status: 'reconciling', providerOutcome: 'uncertain', error: AWAITING, screenshotPath: 'chrome-extension://wing/shot.png' }]);

    await expect(service.confirmApplied({ organizationId: ORG, requestedByUserId: USER, executionId: prepared.executionId })).resolves.toEqual({
      generationId: generation.id, executionId: prepared.executionId, success: true, status: 'succeeded', screenshotPath: 'chrome-extension://wing/shot.png',
    });
    await expect(service.listLatest({ organizationId: ORG, generationIds: [generation.id] })).resolves.toEqual([{
      generationId: generation.id,
      executionId: prepared.executionId,
      status: 'succeeded',
      providerOutcome: 'succeeded',
      checkedAt: expect.any(String),
      error: null,
      screenshotPath: 'chrome-extension://wing/shot.png',
    }]);
  });

  it('refuses a second prepare while the first is live and creates one execution from two concurrent prepares', async () => {
    // listing 이 없는 실행이라 부분 unique index 가 아니라 생성별 advisory lock 만 막는다.
    await coupangAccount();
    const { generation } = await salesProductGeneration();
    const input = { organizationId: ORG, requestedByUserId: USER, generationId: generation.id };

    const settled = await Promise.allSettled([service.prepare(input), service.prepare(input)]);
    expect(settled.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    const refused = settled.find((result) => result.status === 'rejected') as PromiseRejectedResult;
    expect(refused.reason).toMatchObject({ kind: 'conflict', message: '이 썸네일은 이미 반영 중입니다' });
    expect(await rejection(service.prepare(input))).toEqual({ kind: 'conflict', message: '이 썸네일은 이미 반영 중입니다' });
    expect(await prisma.productRegistrationExecution.count({ where: { organizationId: ORG, executionKind: 'thumbnail_update' } })).toBe(1);
  });

  it('keeps an unknown outcome reconciling until a later report settles it, then refuses a report on the finished execution', async () => {
    const { generation } = await listingGeneration();
    const prepared = await service.prepare({ organizationId: ORG, requestedByUserId: USER, generationId: generation.id });
    const report = (body: Parameters<ThumbnailExecutionService['report']>[0]['report']) =>
      service.report({ organizationId: ORG, requestedByUserId: USER, executionId: prepared.executionId, report: body });

    await expect(report({ outcome: 'uncertain', error: 'port closed' })).resolves.toMatchObject({ success: false, error: 'port closed' });
    await expect(service.listLatest({ organizationId: ORG, generationIds: [generation.id] }))
      .resolves.toMatchObject([{ status: 'reconciling', providerOutcome: 'uncertain', error: 'port closed' }]);
    expect(await rejection(service.prepare({ organizationId: ORG, requestedByUserId: USER, generationId: generation.id })))
      .toEqual({ kind: 'conflict', message: '이 썸네일은 이미 반영 중입니다' });

    await expect(report({ outcome: 'uploaded_pending_save' })).resolves.toMatchObject({ success: false, status: 'reconciling' });
    await expect(service.confirmApplied({ organizationId: ORG, requestedByUserId: USER, executionId: prepared.executionId }))
      .resolves.toMatchObject({ success: true, status: 'succeeded' });
    await expect(service.listLatest({ organizationId: ORG, generationIds: [generation.id] }))
      .resolves.toMatchObject([{ status: 'succeeded', providerOutcome: 'succeeded', error: null }]);

    expect(await rejection(report({ outcome: 'definitive_failure', error: 'late' }))).toMatchObject({ kind: 'conflict' });
    expect(await rejection(service.report({
      organizationId: ORG, requestedByUserId: USER, executionId: randomUUID(), report: { outcome: 'uploaded_pending_save' },
    }))).toMatchObject({ kind: 'not_found' });
  });

  it('accepts the operator confirmation only after an upload is waiting for it', async () => {
    const { generation } = await listingGeneration();
    const prepared = await service.prepare({ organizationId: ORG, requestedByUserId: USER, generationId: generation.id });
    const confirm = () => service.confirmApplied({ organizationId: ORG, requestedByUserId: USER, executionId: prepared.executionId });

    expect(await rejection(confirm())).toMatchObject({ kind: 'conflict' });
    await service.report({ organizationId: ORG, requestedByUserId: USER, executionId: prepared.executionId, report: { outcome: 'definitive_failure', error: '로그인 필요' } });
    expect(await rejection(confirm())).toMatchObject({ kind: 'conflict' });
    expect(await prisma.productRegistrationExecution.findUniqueOrThrow({ where: { id: prepared.executionId } })).toMatchObject({ status: 'failed' });
  });

  it('records a definitive failure, lets the operator dismiss it from the latest list and keeps the row', async () => {
    const { generation } = await listingGeneration();
    const first = await service.prepare({ organizationId: ORG, requestedByUserId: USER, generationId: generation.id });
    await uploadAndConfirm(first.executionId);
    const second = await service.prepare({ organizationId: ORG, requestedByUserId: USER, generationId: generation.id });
    await expect(service.report({
      organizationId: ORG, requestedByUserId: USER, executionId: second.executionId, report: { outcome: 'definitive_failure', error: '로그인 필요' },
    })).resolves.toEqual({ generationId: generation.id, executionId: second.executionId, success: false, status: 'failed', screenshotPath: null, error: '로그인 필요' });
    await expect(service.listLatest({ organizationId: ORG, generationIds: [generation.id] }))
      .resolves.toMatchObject([{ executionId: second.executionId, status: 'failed', providerOutcome: 'definitive_failure', error: '로그인 필요' }]);

    await expect(service.dismissFailed({ organizationId: OTHER_ORGANIZATION_ID, generationId: generation.id })).resolves.toEqual({ dismissed: false });
    await expect(service.dismissFailed({ organizationId: ORG, generationId: generation.id })).resolves.toEqual({ dismissed: true });
    await expect(service.listLatest({ organizationId: ORG, generationIds: [generation.id] }))
      .resolves.toMatchObject([{ executionId: first.executionId, status: 'succeeded' }]);
    await expect(service.dismissFailed({ organizationId: ORG, generationId: generation.id })).resolves.toEqual({ dismissed: false });
    expect(await prisma.productRegistrationExecution.findUniqueOrThrow({ where: { id: second.executionId } }))
      .toMatchObject({ status: 'failed', resultJson: expect.objectContaining({ dismissedAt: expect.any(String) }) });
  });

  it('answers an Agent run with a pending receipt until the operator confirms, replays it by owner key and refuses a drifted request hash', async () => {
    const { generation } = await listingGeneration();
    const owner = { ownerIdempotencyKey: `capability-invocation:${randomUUID()}`, requestHash: canonicalOwnerInputHash({ generationId: generation.id }) };
    const input = { organizationId: ORG, requestedByUserId: USER, generationId: generation.id, owner };

    const first = await service.runOnServer(input);
    expect(first).toMatchObject({ success: false, status: 'reconciling', screenshotPath: '/tmp/wing.png', error: AWAITING });
    await expect(service.runOnServer(input)).resolves.toEqual(first);
    await service.confirmApplied({ organizationId: ORG, requestedByUserId: USER, executionId: first.executionId });
    await expect(service.runOnServer(input)).resolves.toMatchObject({ success: true, status: 'succeeded', screenshotPath: '/tmp/wing.png' });
    expect(runner.calls).toBe(1);
    expect(await prisma.productRegistrationExecution.findUniqueOrThrow({ where: { id: first.executionId } }))
      .toMatchObject({ ownerIdempotencyKey: owner.ownerIdempotencyKey, requestHash: owner.requestHash, idempotencyKey: `thumbnail_update:${owner.ownerIdempotencyKey}` });
    expect(await rejection(service.runOnServer({ ...input, owner: { ...owner, requestHash: 'b'.repeat(64) } }))).toMatchObject({ kind: 'conflict' });
  });

  it('answers an owner replay first: before the production block, the Content reads and the account and image checks', async () => {
    const { generation, workspace } = await listingGeneration();
    const owner = { ownerIdempotencyKey: `capability-invocation:${randomUUID()}`, requestHash: canonicalOwnerInputHash({ generationId: generation.id }) };
    const input = { organizationId: ORG, requestedByUserId: USER, generationId: generation.id, owner };
    const first = await service.runOnServer(input);

    runner.blocked = true;
    await prisma.contentWorkspace.update({ where: { id: workspace.id }, data: { status: 'archived', isDeleted: true } });
    await prisma.channelAccount.updateMany({ where: { organizationId: ORG }, data: { status: 'inactive' } });
    await expect(service.runOnServer(input)).resolves.toEqual(first);
    expect(runner.calls).toBe(1);
  });

  it('refuses the same owner key for a different generation without running the upload', async () => {
    const first = await listingGeneration();
    const second = await listingGeneration();
    const ownerIdempotencyKey = `capability-invocation:${randomUUID()}`;
    await service.runOnServer({
      organizationId: ORG, requestedByUserId: USER, generationId: first.generation.id,
      owner: { ownerIdempotencyKey, requestHash: canonicalOwnerInputHash({ generationId: first.generation.id }) },
    });

    expect(await rejection(service.runOnServer({
      organizationId: ORG, requestedByUserId: USER, generationId: second.generation.id,
      owner: { ownerIdempotencyKey, requestHash: canonicalOwnerInputHash({ generationId: second.generation.id }) },
    }))).toMatchObject({ kind: 'conflict' });
    expect(runner.calls).toBe(1);
    expect(await prisma.productRegistrationExecution.count({ where: { executionKind: 'thumbnail_update' } })).toBe(1);
  });

  it('turns a runner crash into an unknown outcome, rethrows it and answers the owner replay as pending reconciliation', async () => {
    const { generation } = await listingGeneration();
    const owner = { ownerIdempotencyKey: `capability-invocation:${randomUUID()}`, requestHash: canonicalOwnerInputHash({ generationId: generation.id }) };
    const input = { organizationId: ORG, requestedByUserId: USER, generationId: generation.id, owner };
    runner.next = () => Promise.reject(new Error('playwriter exited'));

    await expect(service.runOnServer(input)).rejects.toThrow('playwriter exited');
    await expect(service.listLatest({ organizationId: ORG, generationIds: [generation.id] }))
      .resolves.toMatchObject([{ status: 'reconciling', providerOutcome: 'uncertain', error: 'playwriter exited' }]);
    expect(await rejection(service.runOnServer(input))).toEqual({ kind: 'unavailable', message: 'representative_image_reconciliation_pending' });
    expect(runner.calls).toBe(1);
  });

  it('records a runner rejection as failed and blocks the server runner in production', async () => {
    const { generation } = await listingGeneration();
    runner.next = () => Promise.resolve({ outcome: 'definitive_failure', error: '상품을 찾을 수 없습니다' });
    await expect(service.runOnServer({ organizationId: ORG, requestedByUserId: null, generationId: generation.id, owner: null }))
      .resolves.toMatchObject({ success: false, error: '상품을 찾을 수 없습니다', screenshotPath: null });

    runner.blocked = true;
    expect(await rejection(service.runOnServer({ organizationId: ORG, requestedByUserId: null, generationId: generation.id, owner: null })))
      .toEqual({ kind: 'unavailable', message: '스테이징/운영에서는 대표이미지를 Chrome 확장 프로그램으로만 반영할 수 있습니다.' });
    expect(runner.calls).toBe(1);
  });

  it('keeps executions, reports and the latest list inside one organization', async () => {
    const mine = await listingGeneration();
    const theirs = await listingGeneration(OTHER_ORGANIZATION_ID);
    expect(await rejection(service.prepare({ organizationId: ORG, requestedByUserId: USER, generationId: theirs.generation.id }))).toMatchObject({ kind: '404' });
    const prepared = await service.prepare({ organizationId: OTHER_ORGANIZATION_ID, requestedByUserId: null, generationId: theirs.generation.id });

    expect(await rejection(service.report({ organizationId: ORG, requestedByUserId: USER, executionId: prepared.executionId, report: { outcome: 'uploaded_pending_save' } })))
      .toMatchObject({ kind: 'not_found' });
    await expect(service.listLatest({ organizationId: ORG, generationIds: [theirs.generation.id, mine.generation.id] })).resolves.toEqual([]);
    await expect(service.listLatest({ organizationId: OTHER_ORGANIZATION_ID, generationIds: [theirs.generation.id] }))
      .resolves.toMatchObject([{ executionId: prepared.executionId, status: 'executing' }]);
  });

  it('never takes the listing slot: a live thumbnail execution blocks neither a sold_out execution nor the stockout check', async () => {
    const { account, listing, generation } = await listingGeneration();
    await prisma.channelAccount.update({ where: { id: account.id }, data: { externalAccountId: 'vendor' } });
    const option = await prisma.channelListingOption.create({
      data: { organizationId: ORG, listingId: listing.id, externalOptionId: 'option-1', rawJson: { registrationType: 'NORMAL' }, status: 'active', safetyStock: 2 },
    });
    const component = await seedSourceProduct(prisma, { organizationId: ORG, code: randomUUID(), name: 'component', currentStock: 1 });
    await prisma.channelListingOptionInventoryComponent.create({ data: { organizationId: ORG, channelListingOptionId: option.id, masterProductId: component.id, quantity: 1 } });
    await service.prepare({ organizationId: ORG, requestedByUserId: USER, generationId: generation.id });

    const db = prisma as PrismaService;
    const [subject] = await new StockoutCheckPersistenceAdapter(db, new ProductTransactionalReadRepositoryAdapter()).readSubjects(ORG, [listing.id]);
    expect(subject?.activeExecutions).toEqual([]);
    await expect(new RegistrationExecutionRepositoryAdapter(db, {} as never, channelAdapters()).prepareListingAvailability({
      organizationId: ORG, requestedByUserId: USER,
      request: { channelAccountId: account.id, externalListingId: listing.externalId, kind: 'sold_out', optionCodes: ['option-1'], idempotencyKey: randomUUID() },
    })).resolves.toMatchObject({ status: 'prepared' });
  });

  it('keeps one live thumbnail upload per listing: a second generation of the workspace waits until the first is marked not applied', async () => {
    const { workspace, generation } = await listingGeneration();
    const second = await prisma.thumbnailGeneration.create({
      data: { organizationId: ORG, contentWorkspaceId: workspace.id, status: 'succeeded', selectedUrl: PNG_DATA_URL },
    });
    const first = await service.prepare({ organizationId: ORG, requestedByUserId: USER, generationId: generation.id });

    const concurrent = await Promise.allSettled([
      service.prepare({ organizationId: ORG, requestedByUserId: USER, generationId: second.id }),
      service.prepare({ organizationId: ORG, requestedByUserId: USER, generationId: second.id }),
    ]);
    expect(concurrent.map((result) => result.status)).toEqual(['rejected', 'rejected']);
    expect(await rejection(service.prepare({ organizationId: ORG, requestedByUserId: USER, generationId: second.id })))
      .toEqual({ kind: 'conflict', message: '이 listing 에 반영 중인 대표이미지가 있습니다' });

    await service.markNotApplied({ organizationId: ORG, requestedByUserId: USER, executionId: first.executionId });
    await expect(service.prepare({ organizationId: ORG, requestedByUserId: USER, generationId: second.id }))
      .resolves.toMatchObject({ generationId: second.id });
  });

  it('lets the operator mark an unknown outcome as not applied, which frees the generation for a new upload', async () => {
    const { generation } = await listingGeneration();
    const input = { organizationId: ORG, requestedByUserId: USER, generationId: generation.id };
    const prepared = await service.prepare(input);
    await service.report({ ...input, executionId: prepared.executionId, report: { outcome: 'uncertain', error: 'port closed' } });

    await expect(service.markNotApplied({ organizationId: ORG, requestedByUserId: USER, executionId: prepared.executionId }))
      .resolves.toEqual({ generationId: generation.id, executionId: prepared.executionId, success: false, status: 'failed', screenshotPath: null, error: '운영자가 반영되지 않았다고 표시함' });
    expect(await prisma.productRegistrationExecution.findUniqueOrThrow({ where: { id: prepared.executionId } }))
      .toMatchObject({ status: 'failed', providerOutcome: 'definitive_failure', lastErrorMessage: '운영자가 반영되지 않았다고 표시함' });
    await expect(service.prepare(input)).resolves.toMatchObject({ generationId: generation.id });
  });

  it('refuses to mark a finished execution as not applied', async () => {
    const { generation } = await listingGeneration();
    const prepared = await service.prepare({ organizationId: ORG, requestedByUserId: USER, generationId: generation.id });
    await uploadAndConfirm(prepared.executionId);
    expect(await rejection(service.markNotApplied({ organizationId: ORG, requestedByUserId: USER, executionId: prepared.executionId })))
      .toMatchObject({ kind: 'conflict' });
    expect(await prisma.productRegistrationExecution.findUniqueOrThrow({ where: { id: prepared.executionId } }))
      .toMatchObject({ status: 'succeeded' });
  });

  it('hands the frozen upload back for a resend while the outcome is unknown, and only then', async () => {
    const { generation } = await listingGeneration();
    const prepared = await service.prepare({ organizationId: ORG, requestedByUserId: USER, generationId: generation.id });
    await service.report({ organizationId: ORG, requestedByUserId: USER, executionId: prepared.executionId, report: { outcome: 'uncertain', error: 'port closed' } });

    await expect(service.resend({ organizationId: ORG, executionId: prepared.executionId })).resolves.toEqual(prepared);
    await uploadAndConfirm(prepared.executionId);
    expect(await rejection(service.resend({ organizationId: ORG, executionId: prepared.executionId }))).toMatchObject({ kind: 'conflict' });
    expect(await rejection(service.resend({ organizationId: OTHER_ORGANIZATION_ID, executionId: prepared.executionId }))).toMatchObject({ kind: 'not_found' });
  });

  describe('account resolution', () => {
    it('uses the listing a sales product has on Coupang, or the one the operator picks', async () => {
      const single = await salesProductGeneration({ listings: 1 });
      const prepared = await service.prepare({ organizationId: ORG, requestedByUserId: USER, generationId: single.generation.id });
      expect(await prisma.productRegistrationExecution.findUniqueOrThrow({ where: { id: prepared.executionId } }))
        .toMatchObject({ channelAccountId: single.listings[0]!.channelAccountId, channelListingId: null, submissionPayloadJson: expect.objectContaining({ channelListingId: single.listings[0]!.id }) });

      const many = await salesProductGeneration({ listings: 2 });
      expect(await rejection(service.prepare({ organizationId: ORG, requestedByUserId: USER, generationId: many.generation.id })))
        .toEqual({ kind: 'invalid', message: '대표이미지를 반영할 listing 이 여럿입니다 — listing을 고르세요' });
      const picked = await service.prepare({ organizationId: ORG, requestedByUserId: USER, generationId: many.generation.id, channelListingId: many.listings[1]!.id });
      expect(await prisma.productRegistrationExecution.findUniqueOrThrow({ where: { id: picked.executionId } }))
        .toMatchObject({ channelAccountId: many.listings[1]!.channelAccountId, channelListingId: null, submissionPayloadJson: expect.objectContaining({ channelListingId: many.listings[1]!.id }) });
    });

    it('names the upload by the Coupang listing, else the workspace, and refuses when neither has a name', async () => {
      const encoded = await listingGeneration();
      await prisma.channelListing.update({ where: { id: encoded.listing.id }, data: { channelName: encodeURIComponent('인코딩 이름') } });
      await expect(service.prepare({ organizationId: ORG, requestedByUserId: USER, generationId: encoded.generation.id }))
        .resolves.toMatchObject({ productName: '인코딩 이름' });

      const product = await salesProductGeneration({ listings: 1 });
      await expect(service.prepare({ organizationId: ORG, requestedByUserId: USER, generationId: product.generation.id }))
        .resolves.toMatchObject({ productName: '판매상품 작업공간' });

      const unnamed = await listingGeneration();
      await prisma.channelListing.update({ where: { id: unnamed.listing.id }, data: { channelName: null } });
      await prisma.contentWorkspace.update({ where: { id: unnamed.workspace.id }, data: { displayName: '  ' } });
      expect(await rejection(service.prepare({ organizationId: ORG, requestedByUserId: USER, generationId: unnamed.generation.id })))
        .toEqual({ kind: 'invalid', message: '몰 등록 상품명을 찾을 수 없습니다' });
    });

    it('names the choice with a machine code and lists the product Coupang listings the operator can pick', async () => {
      const product = await salesProductGeneration({ listings: 2 });
      await prisma.channelListing.update({ where: { id: product.listings[0]!.id }, data: { channelName: '첫 listing' } });
      await prisma.channelListing.create({
        data: { organizationId: ORG, channelAccountId: product.listings[0]!.channelAccountId, externalId: randomUUID(), salesProductId: product.product.id, isActive: false },
      });

      await expect(service.prepare({ organizationId: ORG, requestedByUserId: USER, generationId: product.generation.id }))
        .rejects.toMatchObject({ kind: 'invalid', details: { code: 'ambiguous_listing' } });
      const choices = await service.listingChoices({ organizationId: ORG, generationId: product.generation.id });
      expect(choices.map((choice) => choice.channelListingId).sort()).toEqual(product.listings.map((listing) => listing.id).sort());
      expect(choices.find((choice) => choice.channelListingId === product.listings[0]!.id)).toMatchObject({
        channelListingId: product.listings[0]!.id, channelName: '첫 listing', channelAccountName: expect.stringMatching(/^Wing /), externalId: product.listings[0]!.externalId,
      });
      await expect(service.listingChoices({ organizationId: OTHER_ORGANIZATION_ID, generationId: product.generation.id })).rejects.toBeTruthy();
    });

    it('refuses two Coupang listings of the product on one account instead of picking one', async () => {
      const product = await salesProductGeneration({ listings: 1 });
      await prisma.channelListing.create({
        data: { organizationId: ORG, channelAccountId: product.listings[0]!.channelAccountId, externalId: randomUUID(), salesProductId: product.product.id },
      });
      expect(await rejection(service.prepare({ organizationId: ORG, requestedByUserId: USER, generationId: product.generation.id })))
        .toEqual({ kind: 'invalid', message: '대표이미지를 반영할 listing 이 여럿입니다 — listing을 고르세요' });
      expect(await prisma.productRegistrationExecution.count({ where: { executionKind: 'thumbnail_update' } })).toBe(0);
    });

    it('falls back to the single active Coupang account and refuses none or several', async () => {
      const none = await salesProductGeneration();
      expect(await rejection(service.prepare({ organizationId: ORG, requestedByUserId: USER, generationId: none.generation.id })))
        .toEqual({ kind: 'invalid', message: '대표이미지를 반영할 수 있는 계정이 없습니다' });

      await prisma.channelAccount.create({ data: { organizationId: ORG, channel: 'coupang', name: 'inactive', status: 'inactive' } });
      await prisma.channelAccount.create({ data: { organizationId: ORG, channel: 'rocket', name: 'rocket', status: 'active' } });
      await coupangAccount(OTHER_ORGANIZATION_ID);
      expect(await rejection(service.prepare({ organizationId: ORG, requestedByUserId: USER, generationId: none.generation.id })))
        .toEqual({ kind: 'invalid', message: '대표이미지를 반영할 수 있는 계정이 없습니다' });

      const only = await coupangAccount();
      const prepared = await service.prepare({ organizationId: ORG, requestedByUserId: USER, generationId: none.generation.id });
      expect(await prisma.productRegistrationExecution.findUniqueOrThrow({ where: { id: prepared.executionId } }))
        .toMatchObject({ channelAccountId: only.id, channelListingId: null });
      await uploadAndConfirm(prepared.executionId);

      await coupangAccount();
      expect(await rejection(service.prepare({ organizationId: ORG, requestedByUserId: USER, generationId: none.generation.id })))
        .toEqual({ kind: 'invalid', message: '대표이미지를 반영할 수 있는 계정이 여럿입니다 — listing을 고르세요' });
    });

    /** KID-321: 계정 결정은 채널 키가 아니라 registry `representativeImage` 능력을 읽는다. */
    it('counts only listings and accounts of channels that support representative images', async () => {
      const product = await salesProductGeneration({ listings: 1 });
      const kakao = await prisma.channelAccount.create({ data: { organizationId: ORG, channel: 'kakao', name: 'kakao', status: 'active' } });
      await prisma.channelListing.create({
        data: { organizationId: ORG, channelAccountId: kakao.id, externalId: randomUUID(), salesProductId: product.product.id },
      });
      const prepared = await service.prepare({ organizationId: ORG, requestedByUserId: USER, generationId: product.generation.id });
      expect(await prisma.productRegistrationExecution.findUniqueOrThrow({ where: { id: prepared.executionId } }))
        .toMatchObject({ channelAccountId: product.listings[0]!.channelAccountId });
      const choices = await service.listingChoices({ organizationId: ORG, generationId: product.generation.id });
      expect(choices.map((choice) => choice.channelListingId)).toEqual([product.listings[0]!.id]);

      const bare = await salesProductGeneration();
      await prisma.channelAccount.updateMany({ where: { organizationId: ORG, channel: 'coupang' }, data: { status: 'inactive' } });
      await expect(service.prepare({ organizationId: ORG, requestedByUserId: USER, generationId: bare.generation.id }))
        .rejects.toMatchObject({ kind: 'invalid', message: '대표이미지를 반영할 수 있는 계정이 없습니다', details: { code: 'no_account' } });
    });

    it('accepts a picked listing only when it is an active Coupang listing of this product or the workspace itself', async () => {
      const product = await salesProductGeneration({ listings: 1 });
      const other = await salesProductGeneration({ listings: 1 });
      const theirs = await listingGeneration(OTHER_ORGANIZATION_ID);
      const inactive = await prisma.channelListing.create({
        data: { organizationId: ORG, channelAccountId: product.listings[0]!.channelAccountId, externalId: randomUUID(), salesProductId: product.product.id, isActive: false },
      });
      const pick = (generationId: string, channelListingId: string) =>
        rejection(service.prepare({ organizationId: ORG, requestedByUserId: USER, generationId, channelListingId }));

      expect(await pick(product.generation.id, other.listings[0]!.id)).toMatchObject({ kind: 'invalid' });
      expect(await pick(product.generation.id, theirs.listing.id)).toMatchObject({ kind: 'invalid' });
      expect(await pick(product.generation.id, inactive.id)).toMatchObject({ kind: 'invalid' });

      const workspace = await listingGeneration();
      await expect(service.prepare({ organizationId: ORG, requestedByUserId: USER, generationId: workspace.generation.id, channelListingId: workspace.listing.id }))
        .resolves.toMatchObject({ generationId: workspace.generation.id });
      expect(await pick(workspace.generation.id, product.listings[0]!.id)).toMatchObject({ kind: 'invalid' });
    });
  });
});
