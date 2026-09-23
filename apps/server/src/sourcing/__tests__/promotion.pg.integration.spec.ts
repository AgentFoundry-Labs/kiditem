import { realSalesProductDraftPort } from '../../test-helpers/sales-product-draft-port';
import { randomUUID } from 'node:crypto';
import {
  ConflictException,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  makeTestPrisma,
  OTHER_ORGANIZATION_ID,
  resetDb,
  seedBaseFixture,
  TEST_ORGANIZATION_ID,
  TEST_USER_ID,
} from '../../test-helpers/real-prisma';
import { ProductPreparationRepositoryAdapter } from '../../channels/adapter/out/persistence/candidate-registration.repository.adapter';
import { SourcingCandidateRepositoryAdapter } from '../adapter/out/repository/sourcing-candidate.repository.adapter';
import { SourcingPromotionService } from '../application/service/sourcing-promotion.service';
import type { SalesProductDraftPort } from '../application/port/out/cross-domain/sales-product-draft.port';
import type { PrismaService } from '../../prisma/prisma.service';
import type { PrismaClient } from '@prisma/client';

describe('SourcingPromotionService candidate rejection (PG integration)', () => {
  let prisma: PrismaClient;
  let service: SourcingPromotionService;

  function promotionService(drafts?: SalesProductDraftPort): SourcingPromotionService {
    return new SourcingPromotionService(
      new SourcingCandidateRepositoryAdapter(prisma as unknown as PrismaService, realSalesProductDraftPort(prisma)),
      new ProductPreparationRepositoryAdapter(prisma as unknown as PrismaService, {
        lock: async () => undefined,
        requireActive: async () => undefined,
      }, { findSalesProductWorkspaceId: async () => null } as never,
      { listGeneratedThumbnailUrls: async () => [] , findRepresentativeThumbnailUrls: async () => new Map<string, string>()}),
      drafts ?? realSalesProductDraftPort(prisma),
    );
  }

  beforeAll(async () => {
    prisma = makeTestPrisma();
    await prisma.$connect();
    service = promotionService();
  });

  afterAll(async () => prisma?.$disconnect());

  beforeEach(async () => {
    await resetDb(prisma);
    await seedBaseFixture(prisma);
  });

  it('rejects a sourced candidate and records the operator reason', async () => {
    const candidateId = await seedCandidate(prisma, TEST_ORGANIZATION_ID);

    await expect(service.reject(
      candidateId,
      TEST_ORGANIZATION_ID,
      { reason: 'Not commercially viable' },
      TEST_USER_ID,
    )).resolves.toEqual({ status: 'rejected', draftRetired: false });

    await expect(prisma.sourcingCandidate.findUniqueOrThrow({
      where: { id: candidateId },
      select: {
        status: true,
        rejectedReason: true,
        rejectedByUserId: true,
        rejectedAt: true,
      },
    })).resolves.toEqual({
      status: 'rejected',
      rejectedReason: 'Not commercially viable',
      rejectedByUserId: TEST_USER_ID,
      rejectedAt: expect.any(Date),
    });
  });

  it('does not expose another organization candidate', async () => {
    const candidateId = await seedCandidate(prisma, OTHER_ORGANIZATION_ID);

    await expect(service.reject(
      candidateId,
      TEST_ORGANIZATION_ID,
      { reason: 'Wrong tenant' },
      TEST_USER_ID,
    )).rejects.toBeInstanceOf(NotFoundException);

    await expect(prisma.sourcingCandidate.findUniqueOrThrow({
      where: { id: candidateId },
      select: { status: true, rejectedAt: true },
    })).resolves.toEqual({ status: 'sourced', rejectedAt: null });
  });

  it('keeps a candidate sourced while an active registration preparation exists', async () => {
    const candidateId = await seedCandidate(prisma, TEST_ORGANIZATION_ID);
    const account = await prisma.channelAccount.create({
      data: {
        organizationId: TEST_ORGANIZATION_ID,
        channel: 'coupang',
        externalAccountId: randomUUID(),
        name: 'Registration account',
        status: 'active',
      },
    });
    const salesProduct = await prisma.salesProduct.create({
      data: {
        organizationId: TEST_ORGANIZATION_ID,
        sourceCandidateId: candidateId,
        code: 'PROMOTION-ACTIVE-REGISTRATION',
        name: 'Active registration candidate',
      },
    });
    // 작업공간은 그 초안이 가진다(KID-310).
    await prisma.contentWorkspace.create({
      data: {
        organizationId: TEST_ORGANIZATION_ID,
        ownerType: 'sales_product',
        salesProductId: salesProduct.id,
        displayName: 'Active registration candidate',
        normalizedTitle: 'activeregistrationcandidate',
      },
    });
    await prisma.salesProductOption.create({
      data: {
        organizationId: TEST_ORGANIZATION_ID,
        salesProductId: salesProduct.id,
        optionCode: 'PROMOTION-ACTIVE-REGISTRATION-1',
        values: ['단품'],
        optionKey: '단품',
        salePrice: 1000,
      },
    });
    await prisma.registrationTarget.create({
      data: {
        organizationId: TEST_ORGANIZATION_ID,
        salesProductId: salesProduct.id,
        channelAccountId: account.id,
        displayName: 'Active registration candidate',
        registrationInput: {},
      },
    });

    await expect(service.reject(
      candidateId,
      TEST_ORGANIZATION_ID,
      { reason: 'Blocked while registering' },
      TEST_USER_ID,
    )).rejects.toBeInstanceOf(ConflictException);

    await expect(prisma.sourcingCandidate.findUniqueOrThrow({
      where: { id: candidateId },
      select: { status: true, rejectedAt: true },
    })).resolves.toEqual({ status: 'sourced', rejectedAt: null });
  });

  /**
   * 초안 내리기가 거절과 한 커밋인지 본다.
   *
   * 두 트랜잭션이면 거절만 커밋되고 초안이 살아 있는 중간 상태가 남는데, 그 어긋남은 어느
   * 화면에도 보이지 않는다 — 수집상품 목록에서 사라진 상품이 판매상품 목록에 그대로 있다.
   */
  it('⭐ 초안을 내리지 못하면 후보 거절도 커밋되지 않는다', async () => {
    const candidateId = await seedCandidate(prisma, TEST_ORGANIZATION_ID);
    const failing = {
      ...realSalesProductDraftPort(prisma),
      retireForSource: async () => { throw new Error('draft retirement failed'); },
    } as unknown as SalesProductDraftPort;

    await expect(promotionService(failing).reject(
      candidateId,
      TEST_ORGANIZATION_ID,
      { reason: 'Not commercially viable' },
      TEST_USER_ID,
    )).rejects.toThrow('draft retirement failed');

    await expect(prisma.sourcingCandidate.findUniqueOrThrow({
      where: { id: candidateId },
      select: { status: true, rejectedAt: true },
    })).resolves.toEqual({ status: 'sourced', rejectedAt: null });
  });

  it('serializes concurrent rejection attempts so only one transition commits', async () => {
    const candidateId = await seedCandidate(prisma, TEST_ORGANIZATION_ID);

    const results = await Promise.allSettled([
      service.reject(candidateId, TEST_ORGANIZATION_ID, { reason: 'Duplicate' }, TEST_USER_ID),
      service.reject(candidateId, TEST_ORGANIZATION_ID, { reason: 'Duplicate' }, TEST_USER_ID),
    ]);

    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    const rejected = results.find((result) => result.status === 'rejected');
    expect(rejected).toMatchObject({
      status: 'rejected',
      reason: expect.any(UnprocessableEntityException),
    });
    await expect(prisma.sourcingCandidate.findUniqueOrThrow({
      where: { id: candidateId },
      select: { status: true },
    })).resolves.toEqual({ status: 'rejected' });
  });
});

async function seedCandidate(
  prisma: PrismaClient,
  organizationId: string,
): Promise<string> {
  return (await prisma.sourcingCandidate.create({
    data: {
      organizationId,
      sourceUrl: `https://1688.com/item/${randomUUID()}`,
      sourcePlatform: 'ALIBABA_1688',
      rawData: {},
      name: 'Kids rain boots',
      status: 'sourced',
    },
    select: { id: true },
  })).id;
}
