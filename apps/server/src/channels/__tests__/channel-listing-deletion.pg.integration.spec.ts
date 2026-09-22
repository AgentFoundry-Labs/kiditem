import { randomUUID } from 'node:crypto';
import { ChannelUnsupportedError } from '../domain/exception/channel-business-error';
import type { PrismaClient } from '@prisma/client';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { PrismaService } from '../../prisma/prisma.service';
import {
  makeTestPrisma,
  resetDb,
  seedBaseFixture,
  OTHER_ORGANIZATION_ID,
  OTHER_USER_ID,
  TEST_ORGANIZATION_ID,
  TEST_USER_ID,
} from '../../test-helpers/real-prisma';
import { ChannelListingDeletionService } from '../application/service/listing/channel-listing-deletion.service';
import { ChannelListingRepositoryAdapter } from '../adapter/out/repository/channel-listing.repository.adapter';

const ACCOUNT = '11111111-1111-4111-8111-111111111111';

describe('ChannelListingDeletionOperation (PG integration)', () => {
  let prisma: PrismaClient;
  let repository: ChannelListingRepositoryAdapter;
  let deletion: ChannelListingDeletionService;
  let listingId: string;

  beforeAll(async () => {
    prisma = makeTestPrisma();
    await prisma.$connect();
    repository = new ChannelListingRepositoryAdapter(
      prisma as unknown as PrismaService,
    );
    deletion = new ChannelListingDeletionService(repository);
  });

  afterAll(async () => prisma?.$disconnect());

  beforeEach(async () => {
    await resetDb(prisma);
    await seedBaseFixture(prisma);
    await prisma.channelAccount.create({
      data: {
        id: ACCOUNT,
        organizationId: TEST_ORGANIZATION_ID,
        channel: 'coupang',
        name: 'Wing',
        status: 'active',
        vendorId: 'A00012345',
      },
    });
    // 리스팅은 그 판매상품 초안을 거쳐 원천에 닿는다(KID-310).
    const candidate = await prisma.sourcingCandidate.create({
      data: {
        organizationId: TEST_ORGANIZATION_ID,
        sourceUrl: `https://example.test/${randomUUID()}`,
        sourcePlatform: 'ALIBABA_1688',
        rawData: {},
        name: 'Test product',
        status: 'sourced',
      },
    });
    const draft = await prisma.salesProduct.create({
      data: { organizationId: TEST_ORGANIZATION_ID, name: 'Test product', sourceCandidateId: candidate.id },
    });
    listingId = (
      await prisma.channelListing.create({
        data: {
          organizationId: TEST_ORGANIZATION_ID,
          channelAccountId: ACCOUNT,
          salesProductId: draft.id,
          externalId: '16311428128',
          displayName: 'Test product',
          status: 'active',
          isActive: true,
        },
      })
    ).id;
  });

  it('reads a succeeded receipt only for the owning organization and actor', async () => {
    const operation = await seedOperation({
      status: 'succeeded',
      providerOutcome: 'succeeded',
      resultJson: {
        externalListingId: '16311428128',
        providerAccountId: 'A00012345',
      },
    });

    await expect(repository.getDeletionOperation({
      organizationId: TEST_ORGANIZATION_ID,
      userId: TEST_USER_ID,
      listingId,
      operationId: operation.id,
    })).resolves.toMatchObject({
      operationId: operation.id,
      listingId,
      channelAccountId: ACCOUNT,
      expectedVendorId: 'A00012345',
      externalId: '16311428128',
      status: 'succeeded',
      providerOutcome: 'succeeded',
    });
    await expect(repository.getDeletionOperation({
      organizationId: TEST_ORGANIZATION_ID,
      userId: OTHER_USER_ID,
      listingId,
      operationId: operation.id,
    })).resolves.toBeNull();
    await expect(repository.getDeletionOperation({
      organizationId: OTHER_ORGANIZATION_ID,
      userId: TEST_USER_ID,
      listingId,
      operationId: operation.id,
    })).resolves.toBeNull();
  });

  it('replays a succeeded receipt without provider IO or fresh mutation', async () => {
    const operation = await seedOperation({
      status: 'succeeded',
      providerOutcome: 'succeeded',
      resultJson: {
        externalListingId: '16311428128',
        providerAccountId: 'A00012345',
      },
    });

    await expect(deletion.reconcileObservedDeletion({
      organizationId: TEST_ORGANIZATION_ID,
      userId: TEST_USER_ID,
      listingId,
      operationId: operation.id,
    })).resolves.toEqual({
      operationId: operation.id,
      status: 'succeeded',
      providerOutcome: 'succeeded',
    });
    await expect(prisma.channelListing.findUniqueOrThrow({
      where: { id: listingId },
    })).resolves.toMatchObject({ isActive: true, status: 'active' });
    await expect(prisma.channelListingDeletionOperation.findUniqueOrThrow({
      where: { id: operation.id },
    })).resolves.toMatchObject({
      status: 'succeeded',
      providerOutcome: 'succeeded',
    });
  });

  it('marks an unknown browser result unresolved while preserving the active listing', async () => {
    const operation = await seedOperation({
      status: 'executing',
      providerOutcome: 'uncertain',
    });

    await expect(repository.markDeletionUnresolved({
      organizationId: TEST_ORGANIZATION_ID,
      userId: TEST_USER_ID,
      listingId,
      operationId: operation.id,
      reason: 'extension_timeout',
    })).resolves.toEqual({
      operationId: operation.id,
      status: 'reconciling',
      providerOutcome: 'uncertain',
    });
    await expect(deletion.getStatus({
      organizationId: TEST_ORGANIZATION_ID,
      userId: TEST_USER_ID,
      listingId,
      operationId: operation.id,
    })).resolves.toMatchObject({
      operationId: operation.id,
      status: 'reconciling',
      providerOutcome: 'uncertain',
      lastErrorCode: 'extension_timeout',
    });
    await expect(prisma.channelListing.findUniqueOrThrow({
      where: { id: listingId },
    })).resolves.toMatchObject({ isActive: true, status: 'active' });
  });

  it('keeps new authorize, claim, and pending reconciliation unsupported without mutation', async () => {
    const operation = await seedOperation({
      status: 'executing',
      providerOutcome: 'uncertain',
    });
    const before = await prisma.channelListingDeletionOperation.findUniqueOrThrow({
      where: { id: operation.id },
    });

    const authorizeError = capture(() => deletion.authorize({
      organizationId: TEST_ORGANIZATION_ID,
      userId: TEST_USER_ID,
      listingId,
      password: 'unused',
      idempotencyKey: randomUUID(),
    }));
    expect(authorizeError).toBeInstanceOf(ChannelUnsupportedError);

    const claimError = capture(() => deletion.claimExecution({
      organizationId: TEST_ORGANIZATION_ID,
      userId: TEST_USER_ID,
      listingId,
      operationId: operation.id,
    }));
    expect(claimError).toBeInstanceOf(ChannelUnsupportedError);

    await expect(deletion.reconcileObservedDeletion({
      organizationId: TEST_ORGANIZATION_ID,
      userId: TEST_USER_ID,
      listingId,
      operationId: operation.id,
    })).rejects.toBeInstanceOf(ChannelUnsupportedError);
    await expect(prisma.channelListingDeletionOperation.findUniqueOrThrow({
      where: { id: operation.id },
    })).resolves.toMatchObject({
      status: before.status,
      providerOutcome: before.providerOutcome,
      resultJson: before.resultJson,
    });
    await expect(prisma.channelListing.findUniqueOrThrow({
      where: { id: listingId },
    })).resolves.toMatchObject({ isActive: true, status: 'active' });
  });

  async function seedOperation(input: {
    status: string;
    providerOutcome: string;
    resultJson?: object;
  }) {
    return prisma.channelListingDeletionOperation.create({
      data: {
        organizationId: TEST_ORGANIZATION_ID,
        channelAccountId: ACCOUNT,
        channelListingId: listingId,
        idempotencyKey: randomUUID(),
        requestHash: 'a'.repeat(64),
        externalListingId: '16311428128',
        expectedProviderAccountId: 'A00012345',
        status: input.status,
        providerOutcome: input.providerOutcome,
        resultJson: input.resultJson,
        requestedByUserId: TEST_USER_ID,
        ...(input.status === 'succeeded'
          ? { completedAt: new Date('2026-01-01T00:00:00.000Z') }
          : {}),
      },
    });
  }

  function capture(action: () => unknown): unknown {
    try {
      action();
    } catch (error) {
      return error;
    }
    throw new Error('Expected unsupported action to throw.');
  }
});
