import { untouchedRegistrationStates } from '../../test-helpers/sales-product-draft-port';
import { realRegistrableDetailPages, realRegistrationContentWorkspace } from '../../test-helpers/registration-content-workspace';
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
import { DetailPageRepositoryAdapter } from '../../content/adapter/out/repository/detail-page.repository.adapter';
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
  TEST_USER_ID,
} from '../../test-helpers/real-prisma';

const SOURCE_URL = 'https://detail.1688.com/offer/5550001.html';

const hash = () => randomUUID().replace(/-/g, '').padEnd(64, '0');

/** 원본 기록을 근거로 든 출시 후보 하나. 공급 제안 스냅숏 · 증거 관측 · 수집 실행을 최소 칸으로 만든다. */
async function seedLaunchCandidate(prisma: PrismaClient, sourceRecordId: string): Promise<string> {
  const capturedAt = new Date('2026-09-01T00:00:00.000Z');
  const run = await prisma.sourcingEvidenceIngestionRun.create({ data: {
    organizationId: TEST_ORGANIZATION_ID, sourceKey: '1688.offer', scopeKey: 'default', targetKey: 'toys',
    idempotencyKey: randomUUID(), requestHash: hash(), collectorKey: 'draft-deletion-test', collectorVersion: 'v1',
    triggerKind: 'manual', triggeredByUserId: TEST_USER_ID, status: 'COMPLETE', isCurrentComplete: true,
    generation: 1, discoveredCount: 1, acceptedCount: 1, coverageNumerator: 1, coverageDenominator: 1, completedAt: capturedAt,
  } });
  const observation = await prisma.sourcingEvidenceObservation.create({ data: {
    organizationId: TEST_ORGANIZATION_ID, ingestionRunId: run.id, sourceKey: '1688.offer', platform: '1688',
    evidenceFamily: 'supplier_offer', signalRole: 'supply', conceptKey: 'toys', supportsCandidate: true,
    observationKey: hash(), revision: 1, sourceEntityType: 'supplier_offer_sku', sourceEntityKey: 'sku-1',
    observationType: 'offer_snapshot', schemaVersion: '1688-offer/v1', evidenceClass: 'measured',
    eventAt: capturedAt, observedAt: capturedAt, availableAt: capturedAt, sourceUrl: SOURCE_URL,
    payloadHash: hash(), envelopeHash: hash(), payload: {}, ingestedAt: capturedAt,
  } });
  const snapshot = await prisma.supplierOfferSkuSnapshot.create({ data: {
    organizationId: TEST_ORGANIZATION_ID, evidenceObservationId: observation.id, identityStatus: 'exact_variant',
    sourcePlatform: '1688', externalOfferId: '5550001', productName: '지울 초안', currency: 'CNY',
    capturedAt, snapshotHash: hash(),
  } });
  const account = await prisma.channelAccount.create({ data: {
    organizationId: TEST_ORGANIZATION_ID, channel: 'coupang', externalAccountId: randomUUID(), name: '출시 계정', status: 'active',
  } });
  const candidate = await prisma.sourcingLaunchCandidate.create({ data: {
    organizationId: TEST_ORGANIZATION_ID, sourceRecordId, supplierOfferSkuSnapshotId: snapshot.id,
    targetChannelAccountId: account.id, candidateSeriesKey: hash(), revision: 1, identityHash: hash(), name: '출시 후보',
    productConceptVersionKey: 'concept-v1', koreanSellableBundleVersionKey: 'bundle-v1', launchPlanVersionKey: 'launch-v1',
    complianceAssessmentVersionKey: 'compliance-v1', ipClearanceVersionKey: 'ip-v1', qualitySpecVersionKey: 'quality-v1',
    intendedUse: 'kids toy', materialProfileKey: 'material-v1', labelingProfileKey: 'label-v1',
    unitsPerSellableBundle: 1, initialOrderQuantity: 10, targetSalePriceKrw: 19_900, fulfillmentMode: 'rocket',
    createdByUserId: TEST_USER_ID,
  } });
  return candidate.id;
}

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
      new RegistrationTargetRepositoryAdapter(service, productTransactionalRead(), realRegistrationContentWorkspace(service)),
    realRegistrationContentWorkspace(service),
      realRegistrableDetailPages(service),
    );
    records = new SourceRecordRepositoryAdapter(service);
    useCase = new SalesProductUseCase(
      repository,
      new SalesProductWorkspaceArchiveAdapter(
        new SalesProductWorkspaceArchiveService(new SalesProductWorkspaceArchiveRepositoryAdapter(
          new DetailPageRepositoryAdapter(prisma as unknown as PrismaService),
        )),
      ),
      new SourceRecordAdapter(records),
      untouchedRegistrationStates,
    );
  });
  afterAll(async () => { await prisma?.$disconnect(); });
  beforeEach(async () => { await resetDb(prisma); await seedBaseFixture(prisma); });

  const drafts = () => new SalesProductDraftAdapter(useCase);

  it('deletes a collected draft with its options, public images, archived settings, workspace and source record in one commit', async () => {
    const admitted = await records.admit(sourceRecord(), drafts());
    await prisma.salesProduct.update({ where: { id: admitted.salesProductId }, data: { imageUrls: ['https://storage.example/mine.jpg'] } });
    const [option] = await prisma.salesProductOption.findMany({ where: { salesProductId: admitted.salesProductId } });
    await prisma.salesProductOptionComponent.create({ data: {
      organizationId: TEST_ORGANIZATION_ID, salesProductOptionId: option!.id, masterProductId: randomUUID(), quantity: 2,
    } });
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
    // 초안을 만든 트랜잭션이 작업공간도 만들었다(KID-313 W2) — 지울 때 그것이 보관된다.
    const workspace = await prisma.contentWorkspace.findFirstOrThrow({ where: {
      organizationId: TEST_ORGANIZATION_ID, ownerType: 'sales_product', salesProductId: admitted.salesProductId,
      status: 'active', isDeleted: false,
    } });

    await expect(useCase.deleteDraft(TEST_ORGANIZATION_ID, admitted.salesProductId))
      .resolves.toEqual({ salesProductId: admitted.salesProductId, deleted: true });

    expect(await prisma.salesProduct.count()).toBe(0);
    expect(await prisma.salesProductOption.count()).toBe(0);
    expect(await prisma.salesProductOptionComponent.count()).toBe(0);
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
      kind: 'conflict', details: { reason: 'not_draft', message: '판매 중인 상품이라 지우지 않고 보관합니다.' },
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
      kind: 'conflict', details: { reason: 'listing', message: '몰 상품과 이어져 있어 초안을 지우지 않았습니다.' },
    });

    expect(await prisma.salesProduct.count()).toBe(2);
    expect(await prisma.sourceRecord.count()).toBe(1);
  });

  it('refuses a draft a mall listing still points at even after the listing was deactivated', async () => {
    const admitted = await records.admit(sourceRecord(), drafts());
    const account = await prisma.channelAccount.create({ data: {
      organizationId: TEST_ORGANIZATION_ID, channel: 'coupang', externalAccountId: randomUUID(), name: '쿠팡', status: 'active',
    } });
    await prisma.channelListing.create({ data: {
      organizationId: TEST_ORGANIZATION_ID, channelAccountId: account.id, salesProductId: admitted.salesProductId,
      externalId: `ext-${randomUUID()}`, isActive: false,
    } });

    await expect(useCase.deleteDraft(TEST_ORGANIZATION_ID, admitted.salesProductId)).rejects.toMatchObject({
      kind: 'conflict', details: { reason: 'listing', message: '몰 상품과 이어져 있어 초안을 지우지 않았습니다.' },
    });
    expect(await prisma.salesProduct.count({ where: { id: admitted.salesProductId } })).toBe(1);
    expect(await prisma.sourceRecord.count()).toBe(1);
  });

  it('refuses a draft with a registration execution still in flight and leaves it whole', async () => {
    const admitted = await records.admit(sourceRecord(), drafts());
    const account = await prisma.channelAccount.create({ data: {
      organizationId: TEST_ORGANIZATION_ID, channel: 'coupang', externalAccountId: randomUUID(), name: '쿠팡', status: 'active',
    } });
    const target = await prisma.registrationTarget.create({ data: {
      organizationId: TEST_ORGANIZATION_ID, salesProductId: admitted.salesProductId, channelAccountId: account.id, registrationInput: {},
    } });
    await prisma.productRegistrationExecution.create({ data: {
      organizationId: TEST_ORGANIZATION_ID, registrationTargetId: target.id, channelAccountId: account.id,
      executionKind: 'register', idempotencyKey: randomUUID(), requestHash: 'hash', status: 'executing',
    } });

    await expect(useCase.deleteDraft(TEST_ORGANIZATION_ID, admitted.salesProductId)).rejects.toMatchObject({
      kind: 'conflict', details: { reason: 'live_execution', message: '등록 실행이 남아 있어 초안을 지우지 않았습니다.' },
    });

    expect(await prisma.salesProduct.findUniqueOrThrow({ where: { id: admitted.salesProductId } })).toMatchObject({ status: 'draft' });
    expect(await prisma.salesProductOption.count({ where: { salesProductId: admitted.salesProductId } })).toBeGreaterThan(0);
    expect(await prisma.sourceRecord.count()).toBe(1);
  });

  it('refuses a legacy draft row that carries a KID and leaves it and its options in place', async () => {
    const legacy = await prisma.salesProduct.create({ data: {
      organizationId: TEST_ORGANIZATION_ID, code: 'KID00000077', status: 'active', name: '사방넷 판매 상품',
    } });
    await prisma.salesProductOption.create({ data: {
      organizationId: TEST_ORGANIZATION_ID, salesProductId: legacy.id, optionCode: 'KID00000078', optionKey: '', salePrice: 1000,
    } });
    // KID-313 이전 사방넷 매핑은 코드를 쓴 채 `draft` 를 남겼다. 상태만 믿으면 초안으로 지운다.
    await prisma.$executeRaw`UPDATE sales_products SET status = 'draft' WHERE id = ${legacy.id}::uuid`;

    await expect(useCase.deleteDraft(TEST_ORGANIZATION_ID, legacy.id)).rejects.toMatchObject({
      kind: 'conflict', details: { reason: 'not_draft' },
    });

    expect(await prisma.salesProduct.findUniqueOrThrow({ where: { id: legacy.id } })).toMatchObject({ code: 'KID00000077' });
    expect(await prisma.salesProductOption.count({ where: { salesProductId: legacy.id } })).toBe(1);
  });

  it('refuses with 409 while a launch candidate holds the source record, and leaves the draft whole', async () => {
    const admitted = await records.admit(sourceRecord(), drafts());
    const candidateId = await seedLaunchCandidate(prisma, admitted.sourceRecordId);

    await expect(useCase.deleteDraft(TEST_ORGANIZATION_ID, admitted.salesProductId)).rejects.toMatchObject({
      status: 409, message: '출시 후보가 이 원본 기록을 근거로 들고 있어 초안을 지울 수 없습니다.',
    });

    expect(await prisma.salesProduct.findUniqueOrThrow({ where: { id: admitted.salesProductId } }))
      .toMatchObject({ status: 'draft', sourceRecordId: admitted.sourceRecordId });
    expect(await prisma.salesProductOption.count({ where: { salesProductId: admitted.salesProductId } })).toBeGreaterThan(0);
    expect(await prisma.sourceRecord.count()).toBe(1);
    expect(await prisma.sourcingLaunchCandidate.findUniqueOrThrow({ where: { id: candidateId } }))
      .toMatchObject({ sourceRecordId: admitted.sourceRecordId });
  });

  it('never deletes another organization draft or its source record', async () => {
    const theirs = await records.admit(sourceRecord(OTHER_ORGANIZATION_ID), drafts());

    await expect(useCase.deleteDraft(TEST_ORGANIZATION_ID, theirs.salesProductId)).rejects.toMatchObject({ kind: 'not_found' });

    expect(await prisma.salesProduct.count({ where: { organizationId: OTHER_ORGANIZATION_ID } })).toBe(1);
    expect(await prisma.sourceRecord.count({ where: { organizationId: OTHER_ORGANIZATION_ID } })).toBe(1);
  });
});
