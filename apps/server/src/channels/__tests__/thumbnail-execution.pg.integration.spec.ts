import { randomUUID } from 'node:crypto';
import type { PrismaClient } from '@prisma/client';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  makeTestPrisma,
  OTHER_ORGANIZATION_ID,
  resetDb,
  seedBaseFixture,
  TEST_ORGANIZATION_ID as ORG,
} from '../../test-helpers/real-prisma';
import type { PrismaService } from '../../prisma/prisma.service';
import { RegistrableThumbnailRepositoryAdapter } from '../../content/adapter/out/persistence/registrable-thumbnail.repository';
import { RegistrableThumbnailService } from '../../content/application/service/registrable-thumbnail.service';
import { fakeStorageImageFetch } from '../../content/__tests__/helpers/fake-storage-image-fetch';
import { mapException, toEnvelope } from '../../common/filters/global-exception.filter';
import { RegistrableThumbnailAdapter } from '../adapter/out/content/registrable-thumbnail.adapter';
import { ThumbnailExecutionPersistenceAdapter } from '../adapter/out/persistence/thumbnail-execution.repository';
import { ThumbnailExecutionService } from '../application/service/registration/thumbnail-execution.service';

const PNG_DATA_URL = `data:image/png;base64,${Buffer.from('89504e470d0a1a0a', 'hex').toString('base64')}`;

/** 거절을 HTTP 봉투의 code · details.reason 으로 읽는다(main.ts 와 같은 전역 필터 매핑, KID-342). */
async function rejection(promise: Promise<unknown>): Promise<{ code: string; reason?: unknown }> {
  try { await promise; } catch (error) {
    const envelope = toEnvelope(mapException(error));
    return { code: envelope.code, ...(envelope.details?.reason !== undefined ? { reason: envelope.details.reason } : {}) };
  }
  throw new Error('expected a rejection');
}

/**
 * 대표이미지 반영 plan 의 계정 · listing 해석과 자산 선택(옛 `thumbnail-execution.pg` 스펙의 회귀 케이스를 등록 실행의
 * thumbnail_update plan seam 으로 옮김, KID-364). Content 는 실제 서비스이고 저장소 HTTP 만 바꾼다.
 */
describe('representative image plan (PostgreSQL, KID-364)', () => {
  let prisma: PrismaClient;
  let service: ThumbnailExecutionService;

  beforeAll(async () => {
    prisma = makeTestPrisma();
    await prisma.$connect();
    const db = prisma as PrismaService;
    const content = new RegistrableThumbnailAdapter(new RegistrableThumbnailService(new RegistrableThumbnailRepositoryAdapter(db), fakeStorageImageFetch(new Map())));
    service = new ThumbnailExecutionService(content, new ThumbnailExecutionPersistenceAdapter(db));
  });
  afterAll(async () => prisma?.$disconnect());
  beforeEach(async () => {
    await resetDb(prisma);
    await seedBaseFixture(prisma);
  });

  const coupangAccount = (organizationId = ORG) =>
    prisma.channelAccount.create({ data: { organizationId, channel: 'coupang', name: `Wing ${randomUUID()}`, status: 'active' } });

  /** 판매 상품과 작업공간의 대표이미지 자산. `listings` 개의 대표이미지 지원 listing 을 붙인다 — 첫 listing 에는 몰 상품명이 있다. */
  async function productAsset(input: { organizationId?: string; listings?: number } = {}) {
    const organizationId = input.organizationId ?? ORG;
    const product = await prisma.salesProduct.create({ data: { organizationId, name: '판매상품' } });
    const listings = [];
    for (let index = 0; index < (input.listings ?? 0); index += 1) {
      const account = await coupangAccount(organizationId);
      listings.push(await prisma.channelListing.create({ data: {
        organizationId, channelAccountId: account.id, externalId: randomUUID(), salesProductId: product.id, ...(index === 0 ? { channelName: '쿠팡 상품명' } : {}),
      } }));
    }
    const workspace = await prisma.contentWorkspace.create({ data: { organizationId, ownerType: 'sales_product', salesProductId: product.id } });
    const asset = await prisma.contentAsset.create({ data: {
      organizationId, contentWorkspaceId: workspace.id, source: 'upload', assetKey: `asset:${randomUUID()}`, url: PNG_DATA_URL, role: 'thumbnail',
    } });
    await prisma.contentWorkspace.update({ where: { id: workspace.id }, data: { currentThumbnailAssetId: asset.id } });
    return { product, listings, workspace, asset };
  }

  it('uses the listing a sales product has on the representative-image channel, or the one the operator picks', async () => {
    const single = await productAsset({ listings: 1 });
    await expect(service.plan({ organizationId: ORG, salesProductId: single.product.id })).resolves.toMatchObject({
      channelAccountId: single.listings[0]!.channelAccountId,
      payload: { channelListingId: single.listings[0]!.id, externalListingId: single.listings[0]!.externalId, productName: '쿠팡 상품명', assetId: single.asset.id, dataUrl: PNG_DATA_URL },
    });

    const many = await productAsset({ listings: 2 });
    expect(await rejection(service.plan({ organizationId: ORG, salesProductId: many.product.id }))).toMatchObject({ code: 'VALIDATION_FAILED', reason: 'ambiguous_listing' });
    await expect(service.plan({ organizationId: ORG, salesProductId: many.product.id, channelListingId: many.listings[1]!.id }))
      .resolves.toMatchObject({ channelAccountId: many.listings[1]!.channelAccountId, payload: { channelListingId: many.listings[1]!.id } });
  });

  it('names the upload by the decoded listing name, else the sales product, and refuses when neither has a name', async () => {
    const encoded = await productAsset({ listings: 1 });
    await prisma.channelListing.update({ where: { id: encoded.listings[0]!.id }, data: { channelName: encodeURIComponent('인코딩 이름') } });
    await expect(service.plan({ organizationId: ORG, salesProductId: encoded.product.id })).resolves.toMatchObject({ payload: { productName: '인코딩 이름' } });

    const unnamed = await productAsset({ listings: 1 });
    await prisma.channelListing.update({ where: { id: unnamed.listings[0]!.id }, data: { channelName: null } });
    await expect(service.plan({ organizationId: ORG, salesProductId: unnamed.product.id })).resolves.toMatchObject({ payload: { productName: '판매상품' } });
    await prisma.salesProduct.update({ where: { id: unnamed.product.id }, data: { name: '  ' } });
    expect(await rejection(service.plan({ organizationId: ORG, salesProductId: unnamed.product.id }))).toMatchObject({ code: 'CHANNELS_PREFLIGHT_FAILED', reason: 'PRODUCT_NAME_MISSING' });
  });

  it('falls back to the single active representative-image account and refuses none or several', async () => {
    const bare = await productAsset();
    expect(await rejection(service.plan({ organizationId: ORG, salesProductId: bare.product.id }))).toMatchObject({ code: 'VALIDATION_FAILED', reason: 'no_account' });
    await prisma.channelAccount.create({ data: { organizationId: ORG, channel: 'coupang', name: 'inactive', status: 'inactive' } });
    await prisma.channelAccount.create({ data: { organizationId: ORG, channel: 'kakao', name: 'kakao', status: 'active' } });
    await coupangAccount(OTHER_ORGANIZATION_ID);
    expect(await rejection(service.plan({ organizationId: ORG, salesProductId: bare.product.id }))).toMatchObject({ code: 'VALIDATION_FAILED', reason: 'no_account' });
    const only = await coupangAccount();
    await expect(service.plan({ organizationId: ORG, salesProductId: bare.product.id })).resolves.toMatchObject({ channelAccountId: only.id, payload: { channelListingId: null, externalListingId: null } });
    await coupangAccount();
    expect(await rejection(service.plan({ organizationId: ORG, salesProductId: bare.product.id }))).toMatchObject({ code: 'VALIDATION_FAILED', reason: 'ambiguous_account' });
  });

  it('accepts a picked listing only when it is an active representative-image listing of this product, and lists those choices', async () => {
    const product = await productAsset({ listings: 1 });
    const other = await productAsset({ listings: 1 });
    const inactive = await prisma.channelListing.create({ data: {
      organizationId: ORG, channelAccountId: product.listings[0]!.channelAccountId, externalId: randomUUID(), salesProductId: product.product.id, isActive: false,
    } });
    for (const picked of [other.listings[0]!.id, inactive.id]) {
      expect(await rejection(service.plan({ organizationId: ORG, salesProductId: product.product.id, channelListingId: picked }))).toMatchObject({ code: 'VALIDATION_FAILED' });
    }
    const choices = await service.listingChoices({ organizationId: ORG, salesProductId: product.product.id });
    expect(choices.map((choice) => choice.channelListingId)).toEqual([product.listings[0]!.id]);
    await expect(service.listingChoices({ organizationId: OTHER_ORGANIZATION_ID, salesProductId: product.product.id })).resolves.toEqual([]);
  });

  it('uses the asset the registration target chose for that account before the workspace representative image, and refuses a foreign asset', async () => {
    const { product, workspace, listings } = await productAsset({ listings: 1 });
    const chosen = await prisma.contentAsset.create({ data: {
      organizationId: ORG, contentWorkspaceId: workspace.id, source: 'upload', assetKey: `chosen:${randomUUID()}`, url: PNG_DATA_URL, role: 'thumbnail',
    } });
    await prisma.registrationTarget.create({ data: {
      organizationId: ORG, salesProductId: product.id, channelAccountId: listings[0]!.channelAccountId, registrationInput: {}, selectedThumbnailAssetId: chosen.id,
    } });
    await expect(service.plan({ organizationId: ORG, salesProductId: product.id })).resolves.toMatchObject({ payload: { assetId: chosen.id } });
    const foreign = await productAsset();
    expect(await rejection(service.plan({ organizationId: ORG, salesProductId: product.id, assetId: foreign.asset.id }))).toMatchObject({ code: 'CONTENT_SELECTION_INVALID' });
  });

  it('refuses a product with no representative image and nothing chosen', async () => {
    const { product, workspace } = await productAsset({ listings: 1 });
    await prisma.contentWorkspace.update({ where: { id: workspace.id }, data: { currentThumbnailAssetId: null } });
    expect(await rejection(service.plan({ organizationId: ORG, salesProductId: product.id }))).toMatchObject({ code: 'CONTENT_NOT_FOUND' });
  });
});
