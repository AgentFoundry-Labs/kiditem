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
import { channelFactTestPorts } from '../../test-helpers/channel-fact-ports';
import type { PrismaService } from '../../prisma/prisma.service';
import { canonicalOwnerInputHash } from '../../common/owner-idempotency-key';
import { RegistrableThumbnailRepositoryAdapter } from '../../content/adapter/out/repository/registrable-thumbnail.repository.adapter';
import { RegistrableThumbnailService } from '../../content/application/service/registrable-thumbnail.service';
import { fakeStorageImageFetch } from '../../content/__tests__/helpers/fake-storage-image-fetch';
import { RegistrableThumbnailAdapter } from '../adapter/out/content/registrable-thumbnail.adapter';
import { ChannelIntegrityAdapter } from '../adapter/out/integrity/channel-integrity.adapter';
import { ThumbnailExecutionPersistenceAdapter } from '../adapter/out/persistence/thumbnail-execution.persistence.adapter';
import { ThumbnailExecutionService } from '../application/service/registration/thumbnail-execution.service';
import type { WingThumbnailRunnerPort } from '../application/port/out/automation/wing-thumbnail-runner.port';
import { ChannelBusinessError } from '../domain/exception/channel-business-error';

const PNG_DATA_URL = `data:image/png;base64,${Buffer.from('89504e470d0a1a0a', 'hex').toString('base64')}`;

/** Playwright runner 는 외부 경계라 여기서만 바꾼다. */
function fakeRunner() {
  const runner = {
    blocked: false,
    calls: 0,
    next: (): ReturnType<WingThumbnailRunnerPort['upload']> => Promise.resolve({ outcome: 'succeeded', screenshotPath: '/tmp/wing.png' }),
    isBlocked: () => runner.blocked,
    upload: (_input: Parameters<WingThumbnailRunnerPort['upload']>[0]) => { runner.calls += 1; return runner.next(); },
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
      new RegistrableThumbnailRepositoryAdapter(db, channelFactTestPorts(db).listings),
      fakeStorageImageFetch(new Map()),
    );
    service = new ThumbnailExecutionService(
      new RegistrableThumbnailAdapter(content),
      new ThumbnailExecutionPersistenceAdapter(db),
      runner,
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

  it('prepares an executing thumbnail_update execution, records the extension success and lists it as the latest', async () => {
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
      channelListingId: listing.id,
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
      report: { outcome: 'succeeded', screenshotUrl: 'chrome-extension://wing/shot.png', externalId: 'seller-1' },
    })).resolves.toEqual({
      generationId: generation.id, executionId: prepared.executionId, success: true, screenshotPath: 'chrome-extension://wing/shot.png',
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

    await expect(report({ outcome: 'succeeded' })).resolves.toMatchObject({ success: true });
    await expect(service.listLatest({ organizationId: ORG, generationIds: [generation.id] }))
      .resolves.toMatchObject([{ status: 'succeeded', providerOutcome: 'succeeded', error: null }]);

    expect(await rejection(report({ outcome: 'definitive_failure', error: 'late' }))).toMatchObject({ kind: 'conflict' });
    expect(await rejection(service.report({
      organizationId: ORG, requestedByUserId: USER, executionId: randomUUID(), report: { outcome: 'succeeded' },
    }))).toMatchObject({ kind: 'not_found' });
  });

  it('records a definitive failure, lets the operator dismiss it from the latest list and keeps the row', async () => {
    const { generation } = await listingGeneration();
    const first = await service.prepare({ organizationId: ORG, requestedByUserId: USER, generationId: generation.id });
    await service.report({ organizationId: ORG, requestedByUserId: USER, executionId: first.executionId, report: { outcome: 'succeeded' } });
    const second = await service.prepare({ organizationId: ORG, requestedByUserId: USER, generationId: generation.id });
    await expect(service.report({
      organizationId: ORG, requestedByUserId: USER, executionId: second.executionId, report: { outcome: 'definitive_failure', error: '로그인 필요' },
    })).resolves.toEqual({ generationId: generation.id, executionId: second.executionId, success: false, screenshotPath: null, error: '로그인 필요' });
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

  it('replays an Agent owner key without another upload and refuses a drifted request hash', async () => {
    const { generation } = await listingGeneration();
    const owner = { ownerIdempotencyKey: `capability-invocation:${randomUUID()}`, requestHash: canonicalOwnerInputHash({ generationId: generation.id }) };
    const input = { organizationId: ORG, requestedByUserId: USER, generationId: generation.id, owner };

    const first = await service.runOnServer(input);
    expect(first).toMatchObject({ success: true, screenshotPath: '/tmp/wing.png' });
    await expect(service.runOnServer(input)).resolves.toEqual(first);
    expect(runner.calls).toBe(1);
    expect(await prisma.productRegistrationExecution.findUniqueOrThrow({ where: { id: first.executionId } }))
      .toMatchObject({ ownerIdempotencyKey: owner.ownerIdempotencyKey, requestHash: owner.requestHash, idempotencyKey: `thumbnail_update:${owner.ownerIdempotencyKey}` });
    expect(await rejection(service.runOnServer({ ...input, owner: { ...owner, requestHash: 'b'.repeat(64) } }))).toMatchObject({ kind: '409' });
  });

  it('turns a runner crash into an unknown outcome, rethrows it and answers the owner replay as pending reconciliation', async () => {
    const { generation } = await listingGeneration();
    const owner = { ownerIdempotencyKey: `capability-invocation:${randomUUID()}`, requestHash: canonicalOwnerInputHash({ generationId: generation.id }) };
    const input = { organizationId: ORG, requestedByUserId: USER, generationId: generation.id, owner };
    runner.next = () => Promise.reject(new Error('playwriter exited'));

    await expect(service.runOnServer(input)).rejects.toThrow('playwriter exited');
    await expect(service.listLatest({ organizationId: ORG, generationIds: [generation.id] }))
      .resolves.toMatchObject([{ status: 'reconciling', providerOutcome: 'uncertain', error: 'playwriter exited' }]);
    expect(await rejection(service.runOnServer(input))).toEqual({ kind: 'unavailable', message: 'wing_registration_reconciliation_pending' });
    expect(runner.calls).toBe(1);
  });

  it('records a runner rejection as failed and blocks the server runner in production', async () => {
    const { generation } = await listingGeneration();
    runner.next = () => Promise.resolve({ outcome: 'definitive_failure', error: '상품을 찾을 수 없습니다' });
    await expect(service.runOnServer({ organizationId: ORG, requestedByUserId: null, generationId: generation.id, owner: null }))
      .resolves.toMatchObject({ success: false, error: '상품을 찾을 수 없습니다', screenshotPath: null });

    runner.blocked = true;
    expect(await rejection(service.runOnServer({ organizationId: ORG, requestedByUserId: null, generationId: generation.id, owner: null })))
      .toEqual({ kind: 'unavailable', message: '스테이징/운영 Wing 등록은 Chrome 확장 프로그램으로만 실행할 수 있습니다.' });
    expect(runner.calls).toBe(1);
  });

  it('keeps executions, reports and the latest list inside one organization', async () => {
    const mine = await listingGeneration();
    const theirs = await listingGeneration(OTHER_ORGANIZATION_ID);
    expect(await rejection(service.prepare({ organizationId: ORG, requestedByUserId: USER, generationId: theirs.generation.id }))).toMatchObject({ kind: '404' });
    const prepared = await service.prepare({ organizationId: OTHER_ORGANIZATION_ID, requestedByUserId: null, generationId: theirs.generation.id });

    expect(await rejection(service.report({ organizationId: ORG, requestedByUserId: USER, executionId: prepared.executionId, report: { outcome: 'succeeded' } })))
      .toMatchObject({ kind: 'not_found' });
    await expect(service.listLatest({ organizationId: ORG, generationIds: [theirs.generation.id, mine.generation.id] })).resolves.toEqual([]);
    await expect(service.listLatest({ organizationId: OTHER_ORGANIZATION_ID, generationIds: [theirs.generation.id] }))
      .resolves.toMatchObject([{ executionId: prepared.executionId, status: 'executing' }]);
  });

  describe('account resolution', () => {
    it('uses the listing a sales product has on Coupang, or the one the operator picks', async () => {
      const single = await salesProductGeneration({ listings: 1 });
      const prepared = await service.prepare({ organizationId: ORG, requestedByUserId: USER, generationId: single.generation.id });
      expect(await prisma.productRegistrationExecution.findUniqueOrThrow({ where: { id: prepared.executionId } }))
        .toMatchObject({ channelAccountId: single.listings[0]!.channelAccountId, channelListingId: single.listings[0]!.id });

      const many = await salesProductGeneration({ listings: 2 });
      expect(await rejection(service.prepare({ organizationId: ORG, requestedByUserId: USER, generationId: many.generation.id })))
        .toEqual({ kind: 'invalid', message: '쿠팡 계정이 여럿입니다 — listing을 고르세요' });
      const picked = await service.prepare({ organizationId: ORG, requestedByUserId: USER, generationId: many.generation.id, channelListingId: many.listings[1]!.id });
      expect(await prisma.productRegistrationExecution.findUniqueOrThrow({ where: { id: picked.executionId } }))
        .toMatchObject({ channelAccountId: many.listings[1]!.channelAccountId, channelListingId: many.listings[1]!.id });
    });

    it('falls back to the single active Coupang account and refuses none or several', async () => {
      const none = await salesProductGeneration();
      expect(await rejection(service.prepare({ organizationId: ORG, requestedByUserId: USER, generationId: none.generation.id })))
        .toEqual({ kind: 'invalid', message: '쿠팡 계정이 없습니다' });

      await prisma.channelAccount.create({ data: { organizationId: ORG, channel: 'coupang', name: 'inactive', status: 'inactive' } });
      await prisma.channelAccount.create({ data: { organizationId: ORG, channel: 'rocket', name: 'rocket', status: 'active' } });
      await coupangAccount(OTHER_ORGANIZATION_ID);
      expect(await rejection(service.prepare({ organizationId: ORG, requestedByUserId: USER, generationId: none.generation.id })))
        .toEqual({ kind: 'invalid', message: '쿠팡 계정이 없습니다' });

      const only = await coupangAccount();
      const prepared = await service.prepare({ organizationId: ORG, requestedByUserId: USER, generationId: none.generation.id });
      expect(await prisma.productRegistrationExecution.findUniqueOrThrow({ where: { id: prepared.executionId } }))
        .toMatchObject({ channelAccountId: only.id, channelListingId: null });
      await service.report({ organizationId: ORG, requestedByUserId: USER, executionId: prepared.executionId, report: { outcome: 'succeeded' } });

      await coupangAccount();
      expect(await rejection(service.prepare({ organizationId: ORG, requestedByUserId: USER, generationId: none.generation.id })))
        .toEqual({ kind: 'invalid', message: '쿠팡 계정이 여럿입니다 — listing을 고르세요' });
    });

    it('refuses a picked listing that is not an active Coupang listing of the organization', async () => {
      const product = await salesProductGeneration();
      const theirs = await listingGeneration(OTHER_ORGANIZATION_ID);
      expect(await rejection(service.prepare({ organizationId: ORG, requestedByUserId: USER, generationId: product.generation.id, channelListingId: theirs.listing.id })))
        .toMatchObject({ kind: '404' });
    });
  });
});
