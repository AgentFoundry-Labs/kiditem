import { randomUUID } from 'node:crypto';
import {
  ConflictException,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import type { PrismaClient } from '@prisma/client';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { PrismaService } from '../../prisma/prisma.service';
import {
  makeTestPrisma,
  OTHER_ORGANIZATION_ID,
  resetDb,
  seedBaseFixture,
  TEST_ORGANIZATION_ID,
  TEST_USER_ID,
} from '../../test-helpers/real-prisma';
import { ProductPreparationRepositoryAdapter } from '../adapter/out/repository/product-preparation.repository.adapter';
import { SourcingCandidateRepositoryAdapter } from '../adapter/out/repository/sourcing-candidate.repository.adapter';
import { SourcingPromotionService } from '../application/service/sourcing-promotion.service';

describe('SourcingPromotionService candidate rejection (PG integration)', () => {
  let prisma: PrismaClient;
  let service: SourcingPromotionService;

  beforeAll(async () => {
    prisma = makeTestPrisma();
    await prisma.$connect();
    service = new SourcingPromotionService(
      new SourcingCandidateRepositoryAdapter(prisma as unknown as PrismaService),
      new ProductPreparationRepositoryAdapter(prisma as unknown as PrismaService),
    );
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
    )).resolves.toEqual({ status: 'rejected' });

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
    const workspace = await prisma.contentWorkspace.create({
      data: {
        organizationId: TEST_ORGANIZATION_ID,
        ownerType: 'sourcing_candidate',
        sourceCandidateId: candidateId,
        displayName: 'Active registration candidate',
        normalizedTitle: 'activeregistrationcandidate',
      },
    });
    await prisma.productPreparation.create({
      data: {
        organizationId: TEST_ORGANIZATION_ID,
        sourceCandidateId: candidateId,
        channelAccountId: account.id,
        sourceContentWorkspaceId: workspace.id,
        displayName: 'Active registration candidate',
        status: 'draft',
        submissionKey: randomUUID(),
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
