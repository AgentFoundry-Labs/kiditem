import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  makeTestPrisma,
  resetDb,
  seedBaseFixture,
  TEST_ORGANIZATION_ID,
  TEST_USER_ID,
} from '../../test-helpers/real-prisma';
import { ProductPreparationRepositoryAdapter } from '../../channels/adapter/out/persistence/candidate-registration.repository.adapter';
import { SourcingCandidateRepositoryAdapter } from '../adapter/out/repository/sourcing-candidate.repository.adapter';
import type { PrismaClient } from '@prisma/client';
import type { PrismaService } from '../../prisma/prisma.service';

const ACCOUNT_ID = '11111111-1111-4111-8111-111111111111';

/**
 * 수집후보와 초안의 공개 등록 상태는 초안의 `closedAt`과 Channels 실행 장부에서
 * 계산한다(ADR-0014). 원시 초안에는 제출 결과를 복제하지 않고, 이 사례들은 장부의
 * uncertain/succeeded/failed 전이가 읽기 모델에 반영되는지를 본다.
 */
describe('candidate registration state (PG integration)', () => {
  let prisma: PrismaClient;
  let candidates: SourcingCandidateRepositoryAdapter;
  let candidateId: string;
  let workspaceId: string;
  let salesProductId: string;

  beforeAll(async () => {
    prisma = makeTestPrisma();
    await prisma.$connect();
    const registrations = new ProductPreparationRepositoryAdapter(
      prisma as unknown as PrismaService,
      { lock: async () => undefined, requireActive: async () => undefined },
    );
    candidates = new SourcingCandidateRepositoryAdapter(
      prisma as unknown as PrismaService,
      registrations,
    );
  });

  afterAll(async () => prisma?.$disconnect());

  beforeEach(async () => {
    await resetDb(prisma);
    await seedBaseFixture(prisma);
    await prisma.channelAccount.create({
      data: {
        id: ACCOUNT_ID,
        organizationId: TEST_ORGANIZATION_ID,
        channel: 'coupang',
        externalAccountId: 'account-0',
        name: 'Account 0',
        status: 'active',
        vendorId: 'A00012345',
      },
    });
    candidateId = (await prisma.sourcingCandidate.create({
      data: {
        organizationId: TEST_ORGANIZATION_ID,
        sourceUrl: `https://1688.com/item/${randomUUID()}`,
        sourcePlatform: 'ALIBABA_1688',
        rawData: {},
        name: 'Kids rain boots',
        status: 'sourced',
      },
    })).id;
    const salesProduct = await prisma.salesProduct.create({
      data: {
        organizationId: TEST_ORGANIZATION_ID,
        sourceCandidateId: candidateId,
        code: 'CANDIDATE-REGISTRATION-STATE',
        name: 'Kids rain boots',
      },
    });
    salesProductId = salesProduct.id;
    await prisma.salesProductOption.create({
      data: {
        organizationId: TEST_ORGANIZATION_ID,
        salesProductId,
        optionCode: 'CANDIDATE-REGISTRATION-STATE-1',
        values: ['단품'],
        optionKey: '단품',
        salePrice: 1000,
      },
    });
    workspaceId = (await prisma.contentWorkspace.create({
      data: {
        organizationId: TEST_ORGANIZATION_ID,
        ownerType: 'sourcing_candidate',
        sourceCandidateId: candidateId,
        displayName: 'Kids rain boots',
        normalizedTitle: 'kids rain boots',
        createdByUserId: TEST_USER_ID,
      },
    })).id;
  });

  it('reports no registration state for a candidate whose draft never reached the fence', async () => {
    await createDraft();

    const row = await candidates.findById(candidateId, TEST_ORGANIZATION_ID);

    expect(row?.registrationState).toBe('none');
  });

  it('reports confirming while the fence is reconciling an uncertain submission', async () => {
    // 제출 여부를 모르는 상태는 Channels 실행 장부에서만 읽는다.
    const preparationId = await createDraft();
    await createExecution(preparationId, { status: 'reconciling', providerOutcome: 'uncertain' });

    const row = await candidates.findById(candidateId, TEST_ORGANIZATION_ID);

    expect(row?.registrationState).toBe('confirming');
  });

  it('projects registered from the succeeded execution while the raw draft remains open', async () => {
    const preparationId = await createDraft();
    await createExecution(preparationId, {
      status: 'succeeded',
      providerOutcome: 'succeeded',
      externalListingId: '427011919',
    });

    const row = await candidates.findById(candidateId, TEST_ORGANIZATION_ID);

    expect(row?.productPreparation?.status).toBe('registered');
    expect(row?.registrationState).toBe('registered');
  });

  it('projects failed from a definitively failed execution while the raw draft remains open', async () => {
    const preparationId = await createDraft();
    await createExecution(preparationId, {
      status: 'failed',
      providerOutcome: 'definitive_failure',
    });

    const row = await candidates.findById(candidateId, TEST_ORGANIZATION_ID);

    expect(row?.productPreparation?.status).toBe('failed');
    expect(row?.registrationState).toBe('failed');
  });

  it('carries the same fence-derived state into the sourced list', async () => {
    const preparationId = await createDraft();
    await createExecution(preparationId, { status: 'reconciling', providerOutcome: 'uncertain' });

    const listed = await candidates.listSourced({
      organizationId: TEST_ORGANIZATION_ID,
      page: 1,
      limit: 20,
      sort: 'newest',
    });

    expect(listed.items.find((item) => item.id === candidateId)?.registrationState)
      .toBe('confirming');
  });

  async function createDraft(): Promise<string> {
    return (await prisma.productPreparation.create({
      data: {
        organizationId: TEST_ORGANIZATION_ID,
        salesProductId,
        sourceCandidateId: candidateId,
        channelAccountId: ACCOUNT_ID,
        sourceContentWorkspaceId: workspaceId,
        displayName: 'Kids rain boots',
        closedAt: null,
        registrationInput: {},
        createdByUserId: TEST_USER_ID,
      },
    })).id;
  }

  async function createExecution(
    productPreparationId: string,
    overrides: {
      status: string;
      providerOutcome: string;
      externalListingId?: string;
    },
  ): Promise<void> {
    await prisma.productRegistrationExecution.create({
      data: {
        organizationId: TEST_ORGANIZATION_ID,
        productPreparationId,
        channelAccountId: ACCOUNT_ID,
        executionKind: 'external_wing',
        expectedProviderAccountId: 'A00012345',
        idempotencyKey: randomUUID(),
        requestHash: 'a'.repeat(64),
        requestedByUserId: TEST_USER_ID,
        ...overrides,
      },
    });
  }
});
