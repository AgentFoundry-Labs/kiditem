/**
 * Real-Postgres integration test for sourcing-candidate promotion (issue #192
 * Phase 3). Covers contract surface required by docs/TESTING.md Tier 3:
 *   - Promotion atomicity (master + options + images + status flip commit as
 *     one transaction; failure mid-transaction rolls back everything).
 *   - Cross-organization IDOR — promote with the wrong organizationId returns
 *     404, not the row.
 *   - Concurrent promote race — two callers, exactly one master is created.
 *   - Reject happy-path and state-transition guards (already-promoted,
 *     promote-after-reject).
 *
 * Wiring strategy: instantiate the real `SourcingPromotionService`, its local
 * products adapter, and `ProductsModule` against the test Prisma client so the
 * test exercises the same owner-side products port boundary as production. The
 * agent gateway is replaced with a stub that records calls but never throws —
 * Phase 4's AI trigger has its own integration coverage and is fire-and-forget
 * here.
 */
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
} from 'vitest';
import type { PrismaClient } from '@prisma/client';
import {
  BadRequestException,
  ConflictException,
  Global,
  Module,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import { PrismaModule } from '../../prisma/prisma.module';
import { PrismaService } from '../../prisma/prisma.service';
import { StorageService } from '../../common/storage/storage.service';
import { ProductsModule } from '../../products/products.module';
import { SourcingPromotionService } from '../application/service/sourcing-promotion.service';
import { SourcingProductsCatalogAdapter } from '../adapter/out/products/products-catalog.adapter';
import { SourcingCandidateRepositoryAdapter } from '../adapter/out/repository/sourcing-candidate.repository.adapter';
import {
  SOURCING_AGENT_GATEWAY_PORT,
  type SourcingAgentGatewayPort,
} from '../application/port/out/runtime/sourcing-agent.gateway.port';
import { SOURCING_PRODUCTS_CATALOG_PORT } from '../application/port/out/cross-domain/products-catalog.port';
import { SOURCING_CANDIDATE_REPOSITORY_PORT } from '../application/port/out/repository/sourcing-candidate.repository.port';
import {
  makeTestPrisma,
  resetDb,
  seedBaseFixture,
  TEST_ORGANIZATION_ID,
  OTHER_ORGANIZATION_ID,
  TEST_USER_ID,
} from '../../test-helpers/real-prisma';

interface GatewayStub extends SourcingAgentGatewayPort {
  notifyCalls: Array<{ organizationId: string; masterId: string }>;
}

function makeGatewayStub(): GatewayStub {
  const notifyCalls: Array<{ organizationId: string; masterId: string }> = [];
  return {
    notifyCalls,
    scrapeUrl: async () => ({ taskId: 'unused' }),
    notifyPromoted: async (req) => {
      notifyCalls.push(req);
    },
    startProductGeneration: async (req) => ({
      candidateId: req.candidateId,
      parentOperationKey: `sourcing:candidate:${req.candidateId}`,
      detailGenerationId: null,
      thumbnailGenerationId: null,
      contentWorkspaceId: null,
      href: `/sourcing/candidates/${req.candidateId}`,
    }),
  };
}

@Global()
@Module({
  providers: [{ provide: StorageService, useValue: {} as unknown as StorageService }],
  exports: [StorageService],
})
class StubStorageModule {}

interface CandidateSeed {
  sourceUrl?: string;
  organizationId?: string;
  name?: string;
  status?: string;
  images?: Array<{ url: string; sortOrder: number; isPrimary: boolean }>;
}

async function seedCandidate(
  prisma: PrismaClient,
  seed: CandidateSeed = {},
): Promise<{ id: string; organizationId: string }> {
  const organizationId = seed.organizationId ?? TEST_ORGANIZATION_ID;
  const candidate = await prisma.sourcingCandidate.create({
    data: {
      organizationId,
      sourceUrl: seed.sourceUrl ?? `https://1688.com/item/${Date.now()}-${Math.random()}`,
      sourcePlatform: 'ALIBABA_1688',
      rawData: {},
      name: seed.name ?? 'Toy Candidate',
      description: 'A nice toy.',
      category: 'Toys',
      tags: ['plastic'],
      thumbnailUrl: 'https://example.com/t.jpg',
      imageUrl: 'https://example.com/t.jpg',
      status: seed.status ?? 'sourced',
    },
  });
  const images = seed.images ?? [
    { url: 'https://example.com/0.jpg', sortOrder: 0, isPrimary: true },
    { url: 'https://example.com/1.jpg', sortOrder: 1, isPrimary: false },
  ];
  if (images.length > 0) {
    await prisma.candidateImage.createMany({
      data: images.map((img) => ({
        organizationId,
        candidateId: candidate.id,
        url: img.url,
        role: 'product',
        label: null,
        sortOrder: img.sortOrder,
        source: 'sourcing-extension',
        isPrimary: img.isPrimary,
      })),
    });
  }
  return { id: candidate.id, organizationId };
}

async function seedDetailPageArtifact(
  prisma: PrismaClient,
  seed: {
    candidateId: string;
    organizationId: string;
    generationSourceCandidateId?: string | null;
    artifactSourceCandidateId?: string | null;
  },
): Promise<{ contentGenerationId: string; artifactId: string; revisionId: string }> {
  const group = await prisma.contentGenerationGroup.create({
    data: {
      organizationId: seed.organizationId,
      groupType: 'input_variation',
      title: 'Candidate detail page',
    },
    select: { id: true },
  });
  const generation = await prisma.contentGeneration.create({
    data: {
      organizationId: seed.organizationId,
      generationGroupId: group.id,
      sourceCandidateId: seed.generationSourceCandidateId === undefined
        ? seed.candidateId
        : seed.generationSourceCandidateId,
      contentType: 'detail_page',
      generatedTitle: 'Generated detail page',
      status: 'READY',
    },
    select: { id: true },
  });
  const artifact = await prisma.detailPageArtifact.create({
    data: {
      organizationId: seed.organizationId,
      sourceCandidateId: seed.artifactSourceCandidateId === undefined
        ? seed.candidateId
        : seed.artifactSourceCandidateId,
      sourceContentGenerationId: generation.id,
      title: 'Generated detail page',
      status: 'draft',
    },
    select: { id: true },
  });
  const revision = await prisma.detailPageRevision.create({
    data: {
      organizationId: seed.organizationId,
      artifactId: artifact.id,
      contentGenerationId: generation.id,
      revisionType: 'manual_edit',
      html: '<main>selected detail page</main>',
    },
    select: { id: true },
  });
  await prisma.detailPageArtifact.update({
    where: { id: artifact.id },
    data: { currentRevisionId: revision.id },
  });
  await prisma.contentGeneration.update({
    where: { id: generation.id },
    data: { detailPageArtifactId: artifact.id },
  });
  return {
    contentGenerationId: generation.id,
    artifactId: artifact.id,
    revisionId: revision.id,
  };
}

describe('SourcingPromotionService (PG integration)', () => {
  let prisma: PrismaClient;
  let moduleRef: TestingModule | undefined;
  let service: SourcingPromotionService;
  let gateway: GatewayStub;

  beforeAll(async () => {
    prisma = makeTestPrisma();
    await prisma.$connect();
    gateway = makeGatewayStub();
    moduleRef = await Test.createTestingModule({
      imports: [PrismaModule, StubStorageModule, ProductsModule],
      providers: [
        SourcingPromotionService,
        SourcingProductsCatalogAdapter,
        SourcingCandidateRepositoryAdapter,
        {
          provide: SOURCING_PRODUCTS_CATALOG_PORT,
          useExisting: SourcingProductsCatalogAdapter,
        },
        {
          provide: SOURCING_CANDIDATE_REPOSITORY_PORT,
          useExisting: SourcingCandidateRepositoryAdapter,
        },
        {
          provide: SOURCING_AGENT_GATEWAY_PORT,
          useValue: gateway,
        },
      ],
    })
      .overrideProvider(PrismaService)
      .useValue(prisma)
      .compile();

    service = moduleRef.get(SourcingPromotionService);
  });

  afterAll(async () => {
    await moduleRef?.close();
    await prisma?.$disconnect();
  });

  beforeEach(async () => {
    await resetDb(prisma);
    await seedBaseFixture(prisma);
    gateway.notifyCalls.length = 0;
  });

  it('promotion is atomic: master, options, images, status flip all commit together', async () => {
    const { id: candidateId, organizationId } = await seedCandidate(prisma);

    const result = await service.promote(candidateId, organizationId, {
      options: [
        { optionName: 'Red' },
        { optionName: 'Blue', legacyCode: 'LC-2' },
      ],
    });

    expect(result.masterId).toBeDefined();
    expect(result.masterCode).toMatch(/^M-\d{8}$/);

    const master = await prisma.masterProduct.findFirst({
      where: { id: result.masterId, organizationId },
    });
    expect(master).not.toBeNull();
    expect(master!.lifecycleState).toBe('active');
    expect(master!.organizationId).toBe(organizationId);

    const options = await prisma.productOption.findMany({
      where: { masterId: result.masterId, organizationId },
      orderBy: { sku: 'asc' },
    });
    expect(options).toHaveLength(2);
    for (const opt of options) {
      expect(opt.sku).toMatch(new RegExp(`^${master!.code}-\\d{2}$`));
      expect(opt.organizationId).toBe(organizationId);
    }

    const images = await prisma.masterProductImage.findMany({
      where: { masterId: result.masterId, organizationId },
      orderBy: { sortOrder: 'asc' },
    });
    expect(images).toHaveLength(2);
    expect(images[0].url).toBe('https://example.com/0.jpg');
    expect(images[0].isPrimary).toBe(true);
    expect(images[1].url).toBe('https://example.com/1.jpg');

    const candidate = await prisma.sourcingCandidate.findFirst({
      where: { id: candidateId, organizationId },
    });
    expect(candidate!.status).toBe('promoted');
    expect(candidate!.promotedMasterId).toBe(result.masterId);

    expect(gateway.notifyCalls).toHaveLength(1);
    expect(gateway.notifyCalls[0]).toEqual({
      organizationId,
      masterId: result.masterId,
    });
  });

  it('promotion uses the operator-selected thumbnail as the promoted master primary image', async () => {
    const { id: candidateId, organizationId } = await seedCandidate(prisma);

    const result = await service.promote(candidateId, organizationId, {
      options: [{ optionName: 'Red' }],
      selectedThumbnailUrl: 'https://example.com/1.jpg',
    });

    const master = await prisma.masterProduct.findFirst({
      where: { id: result.masterId, organizationId },
      select: { thumbnailUrl: true, imageUrl: true },
    });
    expect(master).toEqual({
      thumbnailUrl: 'https://example.com/1.jpg',
      imageUrl: 'https://example.com/1.jpg',
    });

    const images = await prisma.masterProductImage.findMany({
      where: { masterId: result.masterId, organizationId },
      orderBy: { sortOrder: 'asc' },
    });
    expect(images.map((img) => ({ url: img.url, isPrimary: img.isPrimary }))).toEqual([
      { url: 'https://example.com/1.jpg', isPrimary: true },
      { url: 'https://example.com/0.jpg', isPrimary: false },
    ]);
  });

  it('promotion copies the selected candidate-bound thumbnail generation output into the master gallery', async () => {
    const { id: candidateId, organizationId } = await seedCandidate(prisma);
    const generation = await prisma.thumbnailGeneration.create({
      data: {
        organizationId,
        masterId: null,
        sourceCandidateId: candidateId,
        originalUrl: 'https://example.com/0.jpg',
        method: 'generate',
        status: 'succeeded',
        phase: 'ready',
      },
    });
    const generated = await prisma.thumbnailGenerationCandidate.create({
      data: {
        organizationId,
        generationId: generation.id,
        url: 'http://storage.local/kiditem/thumbnail-generations/generated.png',
        storageKey: 'thumbnail-generations/generated.png',
        filename: 'generated.png',
        sortOrder: 0,
        mimeType: 'image/png',
        width: 1024,
        height: 1024,
        fileSize: 123456,
      },
    });

    const result = await service.promote(candidateId, organizationId, {
      options: [{ optionName: 'Red' }],
      selectedThumbnailGenerationCandidateId: generated.id,
    });

    const master = await prisma.masterProduct.findFirst({
      where: { id: result.masterId, organizationId },
      select: { thumbnailUrl: true, imageUrl: true },
    });
    expect(master).toEqual({
      thumbnailUrl: generated.url,
      imageUrl: generated.url,
    });

    const images = await prisma.masterProductImage.findMany({
      where: { masterId: result.masterId, organizationId },
      orderBy: { sortOrder: 'asc' },
    });
    expect(images[0]).toMatchObject({
      url: generated.url,
      storageKey: 'thumbnail-generations/generated.png',
      source: 'thumbnail_generation',
      role: 'product',
      label: 'AI thumbnail',
      isPrimary: true,
      mimeType: 'image/png',
      width: 1024,
      height: 1024,
      fileSize: 123456,
    });
  });

  it('promotion links the selected detail-page generation artifact to the promoted master', async () => {
    const { id: candidateId, organizationId } = await seedCandidate(prisma);
    const detail = await seedDetailPageArtifact(prisma, { candidateId, organizationId });

    const result = await service.promote(candidateId, organizationId, {
      options: [{ optionName: 'Red' }],
      selectedDetailPageGenerationId: detail.contentGenerationId,
    });

    const artifact = await prisma.detailPageArtifact.findFirst({
      where: { id: detail.artifactId, organizationId },
      select: { targetMasterId: true, currentRevisionId: true },
    });
    expect(artifact).toEqual({
      targetMasterId: result.masterId,
      currentRevisionId: detail.revisionId,
    });
  });

  it('promotion creates the current product preparation with selected registration assets', async () => {
    const { id: candidateId, organizationId } = await seedCandidate(prisma);
    const generation = await prisma.thumbnailGeneration.create({
      data: {
        organizationId,
        masterId: null,
        sourceCandidateId: candidateId,
        originalUrl: 'https://example.com/0.jpg',
        method: 'generate',
        status: 'succeeded',
        phase: 'ready',
      },
    });
    const thumbnailCandidate = await prisma.thumbnailGenerationCandidate.create({
      data: {
        organizationId,
        generationId: generation.id,
        url: 'http://storage.local/kiditem/thumbnail-generations/generated.png',
        storageKey: 'thumbnail-generations/generated.png',
        filename: 'generated.png',
        sortOrder: 0,
      },
    });
    const detail = await seedDetailPageArtifact(prisma, { candidateId, organizationId });

    const result = await service.promote(candidateId, organizationId, {
      options: [{ optionName: 'Red' }],
      selectedThumbnailGenerationCandidateId: thumbnailCandidate.id,
      selectedDetailPageGenerationId: detail.contentGenerationId,
    });

    const preparation = await prisma.productPreparation.findFirst({
      where: { organizationId, sourceCandidateId: candidateId, isDeleted: false },
    });
    expect(preparation).toMatchObject({
      organizationId,
      sourceCandidateId: candidateId,
      masterId: result.masterId,
      displayName: 'Toy Candidate',
      status: 'product_registered',
      isCurrentForMaster: true,
      selectedThumbnailUrl: thumbnailCandidate.url,
      selectedThumbnailGenerationId: generation.id,
      selectedThumbnailGenerationCandidateId: thumbnailCandidate.id,
      selectedDetailPageGenerationId: detail.contentGenerationId,
      selectedDetailPageArtifactId: detail.artifactId,
      selectedDetailPageRevisionId: detail.revisionId,
    });
    expect(preparation!.appliedToMasterAt).toBeInstanceOf(Date);
  });

  it('promotion accepts a selected detail-page generation linked to the candidate through its artifact', async () => {
    const { id: candidateId, organizationId } = await seedCandidate(prisma);
    const detail = await seedDetailPageArtifact(prisma, {
      candidateId,
      organizationId,
      generationSourceCandidateId: null,
    });

    const result = await service.promote(candidateId, organizationId, {
      options: [{ optionName: 'Red' }],
      selectedDetailPageGenerationId: detail.contentGenerationId,
    });

    const artifact = await prisma.detailPageArtifact.findFirst({
      where: { id: detail.artifactId, organizationId },
      select: { targetMasterId: true, currentRevisionId: true },
    });
    expect(artifact).toEqual({
      targetMasterId: result.masterId,
      currentRevisionId: detail.revisionId,
    });
  });

  it('promotion rejects a selected detail-page generation from another candidate', async () => {
    const { id: candidateId, organizationId } = await seedCandidate(prisma);
    const { id: otherCandidateId } = await seedCandidate(prisma, {
      sourceUrl: 'https://1688.com/item/other-candidate',
      name: 'Other candidate',
    });
    const detail = await seedDetailPageArtifact(prisma, {
      candidateId: otherCandidateId,
      organizationId,
    });

    await expect(
      service.promote(candidateId, organizationId, {
        options: [{ optionName: 'Red' }],
        selectedDetailPageGenerationId: detail.contentGenerationId,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);

    const candidate = await prisma.sourcingCandidate.findFirst({
      where: { id: candidateId, organizationId },
      select: { status: true, promotedMasterId: true },
    });
    expect(candidate).toEqual({ status: 'sourced', promotedMasterId: null });
  });

  it('mid-transaction failure (duplicate legacy code in options) rolls back master + candidate', async () => {
    const { id: candidateId, organizationId } = await seedCandidate(prisma);

    // Seed an existing legacyCode on a different master so the second option
    // collides via the products partial-unique index.
    const conflictMaster = await prisma.masterProduct.create({
      data: { organizationId, code: 'M-99000001', name: 'Existing', optionCounter: 1 },
    });
    await prisma.productOption.create({
      data: {
        organizationId,
        masterId: conflictMaster.id,
        sku: `${conflictMaster.code}-01`,
        optionName: 'Existing',
        legacyCode: 'DUPLICATE',
      },
    });

    await expect(
      service.promote(candidateId, organizationId, {
        options: [
          { optionName: 'A', legacyCode: 'OK-1' },
          { optionName: 'B', legacyCode: 'DUPLICATE' },
        ],
      }),
    ).rejects.toThrow();

    // No new master persisted from the failed promotion (only the conflict seed remains).
    const masters = await prisma.masterProduct.findMany({
      where: { organizationId, code: { not: conflictMaster.code } },
    });
    expect(masters).toHaveLength(0);

    // Candidate row untouched — still sourced, no promotedMasterId, no images on phantom master.
    const candidate = await prisma.sourcingCandidate.findFirst({
      where: { id: candidateId, organizationId },
    });
    expect(candidate!.status).toBe('sourced');
    expect(candidate!.promotedMasterId).toBeNull();

    expect(gateway.notifyCalls).toHaveLength(0);
  });

  it('cross-org IDOR: promote with wrong organizationId returns 404', async () => {
    const { id: candidateId, organizationId } = await seedCandidate(prisma, {
      organizationId: TEST_ORGANIZATION_ID,
    });

    await expect(
      service.promote(candidateId, OTHER_ORGANIZATION_ID, {
        options: [{ optionName: 'Red' }],
      }),
    ).rejects.toBeInstanceOf(NotFoundException);

    // Candidate untouched
    const candidate = await prisma.sourcingCandidate.findFirst({
      where: { id: candidateId, organizationId },
    });
    expect(candidate!.status).toBe('sourced');
    expect(candidate!.promotedMasterId).toBeNull();

    // No master created for either org
    const masters = await prisma.masterProduct.findMany({});
    expect(masters).toHaveLength(0);
  });

  it('concurrent promote race: exactly one wins, the other gets Conflict; only one master exists', async () => {
    const { id: candidateId, organizationId } = await seedCandidate(prisma);

    const results = await Promise.allSettled([
      service.promote(candidateId, organizationId, {
        options: [{ optionName: 'A' }],
      }),
      service.promote(candidateId, organizationId, {
        options: [{ optionName: 'B' }],
      }),
    ]);

    const fulfilled = results.filter((r) => r.status === 'fulfilled');
    const rejected = results.filter((r) => r.status === 'rejected');
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);

    const rejection = (rejected[0] as PromiseRejectedResult).reason;
    // Either a ConflictException (lock-aware loser) or UnprocessableEntityException
    // (loser saw status='promoted' on the post-commit pre-check). Both are valid
    // race outcomes; the contract is "exactly one master, loser doesn't double-write".
    expect([ConflictException.name, UnprocessableEntityException.name]).toContain(
      rejection?.constructor?.name,
    );

    const masters = await prisma.masterProduct.findMany({ where: { organizationId } });
    expect(masters).toHaveLength(1);

    const candidate = await prisma.sourcingCandidate.findFirst({
      where: { id: candidateId, organizationId },
    });
    expect(candidate!.status).toBe('promoted');
    expect(candidate!.promotedMasterId).toBe(masters[0].id);
  });

  it('reject: status="sourced" → rejected with audit fields populated', async () => {
    const { id: candidateId, organizationId } = await seedCandidate(prisma);

    const result = await service.reject(
      candidateId,
      organizationId,
      { reason: 'No supplier match' },
      TEST_USER_ID,
    );

    expect(result.status).toBe('rejected');
    const candidate = await prisma.sourcingCandidate.findFirst({
      where: { id: candidateId, organizationId },
    });
    expect(candidate!.status).toBe('rejected');
    expect(candidate!.rejectedReason).toBe('No supplier match');
    expect(candidate!.rejectedAt).not.toBeNull();
    expect(candidate!.rejectedByUserId).toBe(TEST_USER_ID);
    expect(candidate!.promotedMasterId).toBeNull();
  });

  it('reject of cross-org candidate is 404 (IDOR)', async () => {
    const { id: candidateId } = await seedCandidate(prisma, {
      organizationId: TEST_ORGANIZATION_ID,
    });

    await expect(
      service.reject(candidateId, OTHER_ORGANIZATION_ID, { reason: 'leak attempt' }, TEST_USER_ID),
    ).rejects.toBeInstanceOf(NotFoundException);

    const candidate = await prisma.sourcingCandidate.findFirst({
      where: { id: candidateId, organizationId: TEST_ORGANIZATION_ID },
    });
    expect(candidate!.status).toBe('sourced');
    expect(candidate!.rejectedAt).toBeNull();
  });

  it('reject of already-promoted candidate is 422', async () => {
    const { id: candidateId, organizationId } = await seedCandidate(prisma);
    await service.promote(candidateId, organizationId, {
      options: [{ optionName: 'Red' }],
    });

    await expect(
      service.reject(candidateId, organizationId, { reason: 'late' }, TEST_USER_ID),
    ).rejects.toBeInstanceOf(UnprocessableEntityException);
  });

  it('promote-after-reject is 422', async () => {
    const { id: candidateId, organizationId } = await seedCandidate(prisma);
    await service.reject(candidateId, organizationId, { reason: 'no' }, TEST_USER_ID);

    await expect(
      service.promote(candidateId, organizationId, {
        options: [{ optionName: 'Red' }],
      }),
    ).rejects.toBeInstanceOf(UnprocessableEntityException);

    const masters = await prisma.masterProduct.findMany({});
    expect(masters).toHaveLength(0);
  });

  it('skipPostPromotionHooks=true bypasses notifyPromoted', async () => {
    const { id: candidateId, organizationId } = await seedCandidate(prisma);

    await service.promote(candidateId, organizationId, {
      options: [{ optionName: 'Red' }],
      skipPostPromotionHooks: true,
    });

    expect(gateway.notifyCalls).toHaveLength(0);
  });
});
