import { realSalesProductDraftPort } from '../../test-helpers/sales-product-draft-port';
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
import { ChannelListingQueryPersistenceAdapter } from '../../channels/adapter/out/persistence/channel-listing-query.persistence.adapter';
import { ChannelListingQueryService } from '../../channels/application/service/listing/channel-listing-query.service';
import { SourcingCandidateRepositoryAdapter } from '../adapter/out/repository/sourcing-candidate.repository.adapter';
import { ownerTransaction } from '../../prisma/owner-transaction';
import type { PrismaClient } from '@prisma/client';
import type { PrismaService } from '../../prisma/prisma.service';

const ACCOUNT_ID = '11111111-1111-4111-8111-111111111111';
const SECOND_ACCOUNT_ID = '22222222-2222-4222-8222-222222222222';

/**
 * 수집후보와 초안의 공개 등록 상태는 Channels 실행 장부에서 계산한다(ADR-0014).
 * 원시 초안에는 제출 결과를 복제하지 않고, 이 사례들은 장부의
 * uncertain/succeeded/failed 전이가 읽기 모델에 반영되는지를 본다.
 */
describe('candidate registration state (PG integration)', () => {
  let prisma: PrismaClient;
  let candidates: SourcingCandidateRepositoryAdapter;
  let channelListings: ChannelListingQueryService;
  let candidateId: string;
  let workspaceId: string;
  let salesProductId: string;

  beforeAll(async () => {
    prisma = makeTestPrisma();
    await prisma.$connect();
    const registrations = new ProductPreparationRepositoryAdapter(
      prisma as unknown as PrismaService,
      {
        lock: async () => undefined,
        requireActive: async () => undefined,
      },
      { findSalesProductWorkspaceId: async () => workspaceId } as never,
      { listGeneratedThumbnailUrls: async () => [] , findRepresentativeThumbnailUrls: async () => new Map<string, string>()},
    );
    channelListings = new ChannelListingQueryService(
      new ChannelListingQueryPersistenceAdapter(prisma as unknown as PrismaService),
      { findForListings: async () => [] },
    );
    candidates = new SourcingCandidateRepositoryAdapter(
      prisma as unknown as PrismaService,
      realSalesProductDraftPort(prisma),
      registrations,
      channelListings,
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
    // 작업공간은 그 후보의 판매상품 초안이 가진다(KID-310).
    workspaceId = (await prisma.contentWorkspace.create({
      data: {
        organizationId: TEST_ORGANIZATION_ID,
        ownerType: 'sales_product',
        salesProductId,
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

    expect(row?.registrationTarget?.status).toBe('registered');
    expect(row?.registrationState).toBe('registered');
  });

  it('projects failed from a definitively failed execution while the raw draft remains open', async () => {
    const preparationId = await createDraft();
    await createExecution(preparationId, {
      status: 'failed',
      providerOutcome: 'definitive_failure',
    });

    const row = await candidates.findById(candidateId, TEST_ORGANIZATION_ID);

    expect(row?.registrationTarget?.status).toBe('failed');
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

  it('excludes deduplicated active listing provenance before counting and paging sourced candidates', async () => {
    await prisma.channelAccount.create({
      data: {
        id: SECOND_ACCOUNT_ID,
        organizationId: TEST_ORGANIZATION_ID,
        channel: 'coupang',
        externalAccountId: 'account-1',
        name: 'Account 1',
        status: 'active',
        vendorId: 'A00012346',
      },
    });
    await prisma.channelListing.create({
      data: {
        organizationId: TEST_ORGANIZATION_ID,
        channelAccountId: ACCOUNT_ID,
        salesProductId,
        externalId: 'registered-source-candidate',
        displayName: 'Kids rain boots',
        status: 'active',
      },
    });
    await prisma.channelListing.create({
      data: {
        organizationId: TEST_ORGANIZATION_ID,
        channelAccountId: SECOND_ACCOUNT_ID,
        salesProductId,
        externalId: 'registered-sales-product',
        displayName: 'Kids rain boots',
        status: 'active',
      },
    });
    const standaloneSalesProduct = await prisma.salesProduct.create({
      data: {
        organizationId: TEST_ORGANIZATION_ID,
        code: 'DIRECT-SALES-WITHOUT-SOURCE',
        name: 'Direct sales product without sourcing provenance',
      },
    });
    await prisma.channelListing.create({
      data: {
        organizationId: TEST_ORGANIZATION_ID,
        channelAccountId: SECOND_ACCOUNT_ID,
        salesProductId: standaloneSalesProduct.id,
        externalId: 'direct-sales-without-source',
        displayName: 'Direct sales product',
        status: 'active',
      },
    });
    const unregisteredCandidateId = (await prisma.sourcingCandidate.create({
      data: {
        organizationId: TEST_ORGANIZATION_ID,
        sourceUrl: `https://1688.com/item/${randomUUID()}`,
        sourcePlatform: 'ALIBABA_1688',
        rawData: {},
        name: 'Unregistered candidate',
        status: 'sourced',
      },
    })).id;

    const registeredIds = await prisma.$transaction((tx) =>
      channelListings.readRegisteredCandidateIds(ownerTransaction(tx), {
        organizationId: TEST_ORGANIZATION_ID,
      }));
    expect(registeredIds).toEqual([candidateId]);

    const listed = await candidates.listSourced({
      organizationId: TEST_ORGANIZATION_ID,
      page: 1,
      limit: 1,
      sort: 'newest',
    });

    expect(listed.total).toBe(1);
    expect(listed.items.map((item) => item.id)).toEqual([unregisteredCandidateId]);
  });

  async function createDraft(): Promise<string> {
    return (await prisma.registrationTarget.create({
      data: {
        organizationId: TEST_ORGANIZATION_ID,
        salesProductId,
        channelAccountId: ACCOUNT_ID,
        displayName: 'Kids rain boots',
        registrationInput: {},
        createdByUserId: TEST_USER_ID,
      },
    })).id;
  }

  async function createExecution(
    registrationTargetId: string,
    overrides: {
      status: string;
      providerOutcome: string;
      externalListingId?: string;
    },
  ): Promise<void> {
    await prisma.productRegistrationExecution.create({
      data: {
        organizationId: TEST_ORGANIZATION_ID,
        registrationTargetId,
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
