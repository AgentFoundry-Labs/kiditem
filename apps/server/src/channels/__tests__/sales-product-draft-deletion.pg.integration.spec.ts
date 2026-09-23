import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import type { PrismaService } from '../../prisma/prisma.service';
import { SalesProductRepositoryAdapter } from '../adapter/out/persistence/sales-product.repository.adapter';
import { RegistrationTargetRepositoryAdapter } from '../adapter/out/persistence/registration-target.repository.adapter';
import { SalesProductWorkspaceArchiveAdapter } from '../adapter/out/repository/sales-product-workspace-archive.adapter';
import { SourceRecordAdapter } from '../adapter/out/sourcing/source-record.adapter';
import { SalesProductUseCase } from '../application/service/sales-product/sales-product.usecase';
import { SalesProductWorkspaceArchiveService } from '../../content/application/service/sales-product-workspace-archive.service';
import { SalesProductWorkspaceArchiveRepositoryAdapter } from '../../content/adapter/out/repository/sales-product-workspace-archive.repository.adapter';
import { SourceRecordRepositoryAdapter } from '../../sourcing/adapter/out/repository/source-record.repository.adapter';
import { SalesProductDraftAdapter } from '../../sourcing/adapter/out/channels/sales-product-draft.adapter';
import { canonicalSourceRecordIdentity } from '../../sourcing/domain/source-record-identity';
import type { SourceRecordWrite } from '../../sourcing/application/port/out/repository/source-record.repository.port';
import { productTransactionalRead } from './product-transactional-read.fake';
import {
  makeTestPrisma,
  OTHER_ORGANIZATION_ID,
  resetDb,
  seedBaseFixture,
  TEST_ORGANIZATION_ID,
} from '../../test-helpers/real-prisma';

const SOURCE_URL = 'https://detail.1688.com/offer/5550001.html';

function sourceRecord(organizationId = TEST_ORGANIZATION_ID): SourceRecordWrite {
  return {
    organizationId,
    sourceUrl: SOURCE_URL,
    sourcePlatform: 'ALIBABA_1688',
    externalOfferId: '5550001',
    variantKeyNormalized: '',
    sourceIdentityHash: canonicalSourceRecordIdentity({
      sourcePlatform: 'ALIBABA_1688', sourceUrl: SOURCE_URL, validatedExternalOfferId: '5550001', variantKeyNormalized: '',
    }),
    rawData: {},
    name: '지울 초안',
    description: '',
    category: null,
    tags: [],
    thumbnailUrl: null,
    imageUrl: null,
    costCny: 3,
    triggeredByUserId: null,
    images: [{ url: 'https://cbu01.alicdn.com/del.jpg', role: 'product', label: null, sortOrder: 0, source: 'test', isPrimary: true }],
  };
}

/**
 * 초안 삭제(KID-313) — `DELETE /api/products/sales-products/:id` 의 use case. 초안만 지우고, 상품 ·
 * 옵션 · 구성 · 보관 설정 · 공개 사진과 그 원본 기록을 한 트랜잭션에서 지운다. 판매 상품은 보관한다.
 * 원본 기록 · 콘텐츠 작업공간은 실제 owner 어댑터로 엮는다.
 */
describe('sales product draft deletion (PostgreSQL)', () => {
  let prisma: PrismaClient;
  let records: SourceRecordRepositoryAdapter;
  let useCase: SalesProductUseCase;

  beforeAll(async () => {
    prisma = makeTestPrisma();
    await prisma.$connect();
    const service = prisma as unknown as PrismaService;
    const repository = new SalesProductRepositoryAdapter(
      service,
      productTransactionalRead(),
      new RegistrationTargetRepositoryAdapter(service, productTransactionalRead()),
    );
    records = new SourceRecordRepositoryAdapter(service);
    useCase = new SalesProductUseCase(
      repository,
      new SalesProductWorkspaceArchiveAdapter(
        new SalesProductWorkspaceArchiveService(new SalesProductWorkspaceArchiveRepositoryAdapter()),
      ),
      undefined,
      new SourceRecordAdapter(records),
    );
  });
  afterAll(async () => { await prisma?.$disconnect(); });
  beforeEach(async () => { await resetDb(prisma); await seedBaseFixture(prisma); });

  const drafts = () => new SalesProductDraftAdapter(useCase);

  it('deletes a collected draft with its options, public images, archived settings, workspace and source record in one commit', async () => {
    const admitted = await records.admit(sourceRecord(), drafts());
    await prisma.salesProduct.update({ where: { id: admitted.salesProductId }, data: { imageUrls: ['https://storage.example/mine.jpg'] } });
    await prisma.salesProductPublicImage.create({ data: {
      organizationId: TEST_ORGANIZATION_ID, sourceUrl: 'https://storage.example/mine.jpg', publicUrl: 'https://public.example/mine.jpg', host: 'kidsnote',
    } });
    const account = await prisma.channelAccount.create({ data: {
      organizationId: TEST_ORGANIZATION_ID, channel: 'coupang', externalAccountId: randomUUID(), name: '쿠팡', status: 'active',
    } });
    await prisma.registrationTarget.create({ data: {
      organizationId: TEST_ORGANIZATION_ID, salesProductId: admitted.salesProductId, channelAccountId: account.id,
      registrationInput: {}, archivedAt: new Date(),
    } });
    const workspace = await prisma.contentWorkspace.create({ data: {
      organizationId: TEST_ORGANIZATION_ID, ownerType: 'sales_product', salesProductId: admitted.salesProductId,
      displayName: '지울 초안', normalizedTitle: '지울초안',
    } });

    await expect(useCase.deleteDraft(TEST_ORGANIZATION_ID, admitted.salesProductId))
      .resolves.toEqual({ salesProductId: admitted.salesProductId, deleted: true });

    expect(await prisma.salesProduct.count()).toBe(0);
    expect(await prisma.salesProductOption.count()).toBe(0);
    expect(await prisma.registrationTarget.count()).toBe(0);
    expect(await prisma.salesProductPublicImage.count()).toBe(0);
    expect(await prisma.sourceRecord.count()).toBe(0);
    expect(await prisma.sourceRecordImage.count()).toBe(0);
    expect(await prisma.contentWorkspace.findUniqueOrThrow({ where: { id: workspace.id } }))
      .toMatchObject({ status: 'archived' });
  });

  it('makes a re-collection after deletion a fresh collection', async () => {
    const first = await records.admit(sourceRecord(), drafts());
    await useCase.deleteDraft(TEST_ORGANIZATION_ID, first.salesProductId);

    const again = await records.admit(sourceRecord(), drafts());

    expect(again.sourceRecordId).not.toBe(first.sourceRecordId);
    expect(await prisma.sourceRecord.count()).toBe(1);
    expect(await prisma.salesProduct.count()).toBe(1);
  });

  it('keeps a public image another product still shows', async () => {
    const admitted = await records.admit(sourceRecord(), drafts());
    await prisma.salesProduct.update({ where: { id: admitted.salesProductId }, data: { imageUrls: ['https://storage.example/shared.jpg'] } });
    await prisma.salesProduct.create({ data: {
      organizationId: TEST_ORGANIZATION_ID, code: 'KID00000100', status: 'active', name: '같은 사진을 쓰는 상품',
      imageUrls: ['https://storage.example/shared.jpg'],
    } });
    await prisma.salesProductPublicImage.create({ data: {
      organizationId: TEST_ORGANIZATION_ID, sourceUrl: 'https://storage.example/shared.jpg', publicUrl: 'https://public.example/shared.jpg', host: 'kidsnote',
    } });

    await useCase.deleteDraft(TEST_ORGANIZATION_ID, admitted.salesProductId);

    expect(await prisma.salesProductPublicImage.count()).toBe(1);
  });

  it('refuses a selling product — it is archived, not deleted — and a draft a mall already carries', async () => {
    const selling = await prisma.salesProduct.create({ data: {
      organizationId: TEST_ORGANIZATION_ID, code: 'KID00000200', status: 'active', name: '판매 상품',
    } });
    await expect(useCase.deleteDraft(TEST_ORGANIZATION_ID, selling.id)).rejects.toMatchObject({
      kind: 'conflict', details: { reason: 'not_draft', message: '판매 상품은 삭제하지 않고 보관합니다' },
    });

    const admitted = await records.admit(sourceRecord(), drafts());
    const account = await prisma.channelAccount.create({ data: {
      organizationId: TEST_ORGANIZATION_ID, channel: 'coupang', externalAccountId: randomUUID(), name: '쿠팡', status: 'active',
    } });
    await prisma.channelListing.create({ data: {
      organizationId: TEST_ORGANIZATION_ID, channelAccountId: account.id, salesProductId: admitted.salesProductId,
      externalId: `ext-${randomUUID()}`, isActive: true,
    } });
    await expect(useCase.deleteDraft(TEST_ORGANIZATION_ID, admitted.salesProductId)).rejects.toMatchObject({
      kind: 'conflict', details: { reason: 'active_listing' },
    });

    expect(await prisma.salesProduct.count()).toBe(2);
    expect(await prisma.sourceRecord.count()).toBe(1);
  });

  it('never deletes another organization draft or its source record', async () => {
    const theirs = await records.admit(sourceRecord(OTHER_ORGANIZATION_ID), drafts());

    await expect(useCase.deleteDraft(TEST_ORGANIZATION_ID, theirs.salesProductId)).rejects.toMatchObject({ kind: 'not_found' });

    expect(await prisma.salesProduct.count({ where: { organizationId: OTHER_ORGANIZATION_ID } })).toBe(1);
    expect(await prisma.sourceRecord.count({ where: { organizationId: OTHER_ORGANIZATION_ID } })).toBe(1);
  });
});
