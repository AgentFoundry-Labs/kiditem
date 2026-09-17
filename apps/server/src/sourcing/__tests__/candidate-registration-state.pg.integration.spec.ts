import { randomUUID } from 'node:crypto';
import type { PrismaClient } from '@prisma/client';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  makeTestPrisma,
  resetDb,
  seedBaseFixture,
  TEST_ORGANIZATION_ID,
  TEST_USER_ID,
} from '../../test-helpers/real-prisma';
import type { PrismaService } from '../../prisma/prisma.service';
import { SourcingCandidateRepositoryAdapter } from '../adapter/out/repository/sourcing-candidate.repository.adapter';

const ACCOUNT_ID = '11111111-1111-4111-8111-111111111111';

/**
 * 수집후보가 보여 주는 등록 상태는 초안 행이 아니라 울타리가 근거다(ADR-0014).
 *
 * 초안의 제출 칸은 울타리가 함께 갱신하는 거울이라 드리프트가 가능하고, 실제로
 * 그 드리프트 때문에 "등록됐다는데 목록에 없다"가 나왔다. 그래서 각 사례는 초안
 * 쪽 값을 **일부러 다르게** 두고 울타리 쪽이 이기는지 본다.
 */
describe('candidate registration state (PG integration)', () => {
  let prisma: PrismaClient;
  let candidates: SourcingCandidateRepositoryAdapter;
  let candidateId: string;
  let workspaceId: string;

  beforeAll(async () => {
    prisma = makeTestPrisma();
    await prisma.$connect();
    candidates = new SourcingCandidateRepositoryAdapter(prisma as unknown as PrismaService);
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
    await createDraft('draft');

    const row = await candidates.findById(candidateId, TEST_ORGANIZATION_ID);

    expect(row?.registrationState).toBe('none');
  });

  it('reports confirming while the fence is reconciling an uncertain submission', async () => {
    // 초안은 아직 'submitting' 이지만 제출 여부를 모르는 것은 울타리만 안다.
    const preparationId = await createDraft('submitting');
    await createExecution(preparationId, { status: 'reconciling', providerOutcome: 'uncertain' });

    const row = await candidates.findById(candidateId, TEST_ORGANIZATION_ID);

    expect(row?.registrationState).toBe('confirming');
  });

  it('reports registered from the succeeded execution even when the draft row lags behind', async () => {
    const preparationId = await createDraft('submitting');
    await createExecution(preparationId, {
      status: 'succeeded',
      providerOutcome: 'succeeded',
      externalListingId: '427011919',
    });

    const row = await candidates.findById(candidateId, TEST_ORGANIZATION_ID);

    expect(row?.productPreparation?.status).toBe('submitting');
    expect(row?.registrationState).toBe('registered');
  });

  it('reports failed from a definitively failed execution even when the draft still reads submitting', async () => {
    const preparationId = await createDraft('submitting');
    await createExecution(preparationId, {
      status: 'failed',
      providerOutcome: 'definitive_failure',
    });

    const row = await candidates.findById(candidateId, TEST_ORGANIZATION_ID);

    expect(row?.productPreparation?.status).toBe('submitting');
    expect(row?.registrationState).toBe('failed');
  });

  it('carries the same fence-derived state into the sourced list', async () => {
    const preparationId = await createDraft('submitting');
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

  async function createDraft(status: string): Promise<string> {
    return (await prisma.productPreparation.create({
      data: {
        organizationId: TEST_ORGANIZATION_ID,
        sourceCandidateId: candidateId,
        channelAccountId: ACCOUNT_ID,
        sourceContentWorkspaceId: workspaceId,
        displayName: 'Kids rain boots',
        status,
        submissionKey: randomUUID(),
        registrationInput: {},
        providerOutcome: 'not_attempted',
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
