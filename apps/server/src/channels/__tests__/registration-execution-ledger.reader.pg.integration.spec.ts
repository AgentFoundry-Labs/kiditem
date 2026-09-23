import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import {
  makeTestPrisma,
  OTHER_ORGANIZATION_ID,
  resetDb,
  seedBaseFixture,
  TEST_ORGANIZATION_ID,
} from '../../test-helpers/real-prisma';
import {
  readRegistrationFailureCounts,
  readUnresolvedCompositionOptionIds,
} from '../adapter/out/repository/registration-execution-ledger.reader';

const ACCOUNT_ID = '11111111-1111-4111-8111-111111111111';
const SECOND_ACCOUNT_ID = '22222222-2222-4222-8222-222222222222';
const OTHER_ACCOUNT_ID = '33333333-3333-4333-8333-333333333333';
const SAME_CHANNEL_ACCOUNT_ID = '44444444-4444-4444-8444-444444444444';
const SALES_PRODUCT_ID = '60000000-0000-4000-8000-000000000001';
const OTHER_SALES_PRODUCT_ID = '60000000-0000-4000-8000-000000000002';
// 상품 × 몰 계정당 등록 설정은 하나다(KID-310). 한 계정의 설정 셋은 서로 다른 판매상품이다.
const SECOND_SALES_PRODUCT_ID = '60000000-0000-4000-8000-000000000003';
const THIRD_SALES_PRODUCT_ID = '60000000-0000-4000-8000-000000000004';
const COMPOSITION_LISTING_ID = '70000000-0000-4000-8000-000000000001';
const SECOND_COMPOSITION_LISTING_ID = '70000000-0000-4000-8000-000000000002';
const PREPARING_LISTING_ID = '70000000-0000-4000-8000-000000000003';
const NOT_STARTED_LISTING_ID = '70000000-0000-4000-8000-000000000004';

const EXECUTION_IDS = [
  '40000000-0000-4000-8000-000000000001',
  '40000000-0000-4000-8000-000000000002',
  '40000000-0000-4000-8000-000000000003',
  '40000000-0000-4000-8000-000000000004',
  '40000000-0000-4000-8000-000000000005',
  '40000000-0000-4000-8000-000000000006',
] as const;

describe('registration execution reader (PostgreSQL)', () => {
  let prisma: PrismaClient;

  beforeAll(async () => {
    prisma = makeTestPrisma();
    await prisma.$connect();
  });

  afterAll(async () => {
    await prisma?.$disconnect();
  });

  beforeEach(async () => {
    await resetDb(prisma);
    await seedBaseFixture(prisma);
    await prisma.channelAccount.createMany({
      data: [
        {
          id: ACCOUNT_ID,
          organizationId: TEST_ORGANIZATION_ID,
          channel: 'kidkids',
          name: 'First Kidkids Mall',
          externalAccountId: 'reader-kidkids-first',
          status: 'active',
        },
        {
          id: SECOND_ACCOUNT_ID,
          organizationId: TEST_ORGANIZATION_ID,
          channel: 'coupang',
          name: 'Coupang Mall',
          externalAccountId: 'reader-coupang',
          status: 'active',
        },
        {
          id: OTHER_ACCOUNT_ID,
          organizationId: OTHER_ORGANIZATION_ID,
          channel: 'kidkids',
          name: 'Other Kidkids Mall',
          externalAccountId: 'reader-other-kidkids',
          status: 'active',
        },
        {
          id: SAME_CHANNEL_ACCOUNT_ID,
          organizationId: TEST_ORGANIZATION_ID,
          channel: 'kidkids',
          name: 'Second Kidkids Mall',
          externalAccountId: 'reader-kidkids-second',
          status: 'active',
        },
      ],
    });
    await prisma.salesProduct.createMany({
      data: [
        {
          id: SALES_PRODUCT_ID,
          organizationId: TEST_ORGANIZATION_ID,
          code: 'READER-TEST',
          name: 'Reader fixture product',
        },
        {
          id: SECOND_SALES_PRODUCT_ID,
          organizationId: TEST_ORGANIZATION_ID,
          code: 'READER-TEST-2',
          name: 'Reader fixture product 2',
        },
        {
          id: THIRD_SALES_PRODUCT_ID,
          organizationId: TEST_ORGANIZATION_ID,
          code: 'READER-TEST-3',
          name: 'Reader fixture product 3',
        },
        {
          id: OTHER_SALES_PRODUCT_ID,
          organizationId: OTHER_ORGANIZATION_ID,
          code: 'READER-OTHER',
          name: 'Other reader fixture product',
        },
      ],
    });
    await prisma.registrationTarget.createMany({
      data: [
        preparation('50000000-0000-4000-8000-000000000001', ACCOUNT_ID, SALES_PRODUCT_ID),
        preparation('50000000-0000-4000-8000-000000000002', ACCOUNT_ID, SECOND_SALES_PRODUCT_ID),
        preparation('50000000-0000-4000-8000-000000000003', ACCOUNT_ID, THIRD_SALES_PRODUCT_ID),
        preparation('50000000-0000-4000-8000-000000000004', SECOND_ACCOUNT_ID, SALES_PRODUCT_ID),
        preparation('50000000-0000-4000-8000-000000000005', SAME_CHANNEL_ACCOUNT_ID, SALES_PRODUCT_ID),
        preparation('50000000-0000-4000-8000-000000000006', OTHER_ACCOUNT_ID, OTHER_SALES_PRODUCT_ID, OTHER_ORGANIZATION_ID),
      ],
    });
    await prisma.channelListing.createMany({
      data: [
        {
          id: COMPOSITION_LISTING_ID,
          organizationId: TEST_ORGANIZATION_ID,
          channelAccountId: ACCOUNT_ID,
          externalId: 'reader-composition-listing',
        },
        {
          id: SECOND_COMPOSITION_LISTING_ID,
          organizationId: TEST_ORGANIZATION_ID,
          channelAccountId: SECOND_ACCOUNT_ID,
          externalId: 'reader-composition-listing-2',
        },
        {
          id: PREPARING_LISTING_ID,
          organizationId: TEST_ORGANIZATION_ID,
          channelAccountId: ACCOUNT_ID,
          externalId: 'reader-composition-listing-preparing',
        },
        {
          id: NOT_STARTED_LISTING_ID,
          organizationId: TEST_ORGANIZATION_ID,
          channelAccountId: ACCOUNT_ID,
          externalId: 'reader-composition-listing-not-started',
        },
      ],
    });
  });

  it('counts current failed executions, excludes a later success, and fences organizations', async () => {
    await prisma.productRegistrationExecution.createMany({
      data: [
        execution(EXECUTION_IDS[0], '50000000-0000-4000-8000-000000000001', ACCOUNT_ID, 'failed', '2026-09-01T00:00:00.000Z'),
        execution(EXECUTION_IDS[1], '50000000-0000-4000-8000-000000000002', ACCOUNT_ID, 'failed', '2026-09-03T00:00:00.000Z'),
        execution(EXECUTION_IDS[2], '50000000-0000-4000-8000-000000000003', ACCOUNT_ID, 'failed', '2026-09-04T00:00:00.000Z'),
        execution(EXECUTION_IDS[3], '50000000-0000-4000-8000-000000000004', SECOND_ACCOUNT_ID, 'failed', '2026-09-05T00:00:00.000Z'),
        execution(EXECUTION_IDS[4], '50000000-0000-4000-8000-000000000005', SAME_CHANNEL_ACCOUNT_ID, 'failed', '2026-09-06T00:00:00.000Z'),
        execution(EXECUTION_IDS[5], '50000000-0000-4000-8000-000000000006', OTHER_ACCOUNT_ID, 'failed', '2026-09-07T00:00:00.000Z', OTHER_ORGANIZATION_ID),
      ],
    });

    await expect(
      prisma.$transaction((tx) => readRegistrationFailureCounts(tx, {
        organizationId: TEST_ORGANIZATION_ID,
      })),
    ).resolves.toEqual([
      { channel: 'kidkids', mallName: '키드키즈', count: 4 },
      { channel: 'coupang', mallName: '쿠팡 WING', count: 1 },
    ]);

    await prisma.productRegistrationExecution.update({
      where: { id: EXECUTION_IDS[0] },
      data: { status: 'succeeded', providerOutcome: 'succeeded' },
    });

    await expect(
      prisma.$transaction((tx) => readRegistrationFailureCounts(tx, {
        organizationId: TEST_ORGANIZATION_ID,
      })),
    ).resolves.toEqual([
      { channel: 'kidkids', mallName: '키드키즈', count: 3 },
      { channel: 'coupang', mallName: '쿠팡 WING', count: 1 },
    ]);
  });

  it('does not count a failed thumbnail upload as a registration failure', async () => {
    await prisma.productRegistrationExecution.createMany({
      data: [
        execution(EXECUTION_IDS[0], '50000000-0000-4000-8000-000000000004', SECOND_ACCOUNT_ID, 'failed', '2026-09-01T00:00:00.000Z'),
        {
          id: EXECUTION_IDS[1], organizationId: TEST_ORGANIZATION_ID, channelAccountId: SECOND_ACCOUNT_ID,
          executionKind: 'thumbnail_update', idempotencyKey: 'reader-thumbnail', requestHash: 'a'.repeat(64),
          submissionPayloadJson: { kind: 'thumbnail_update', generationId: '60000000-0000-4000-8000-000000000001' },
          status: 'failed', providerOutcome: 'definitive_failure',
        },
      ],
    });

    await expect(
      prisma.$transaction((tx) => readRegistrationFailureCounts(tx, { organizationId: TEST_ORGANIZATION_ID })),
    ).resolves.toEqual([{ channel: 'coupang', mallName: '쿠팡 WING', count: 1 }]);
  });

  it('holds only live uncertain composition transitions and releases them after success or failure', async () => {
    const executionRows = [
      compositionExecution(
        '40000000-0000-4000-8000-000000000007',
        '50000000-0000-4000-8000-000000000007',
        COMPOSITION_LISTING_ID,
        ACCOUNT_ID,
        'executing',
        'uncertain',
        [{ channelListingOptionId: 'option-selected-a' }, { channelListingOptionId: 'option-selected-b' }],
      ),
      compositionExecution(
        '40000000-0000-4000-8000-000000000008',
        '50000000-0000-4000-8000-000000000008',
        PREPARING_LISTING_ID,
        ACCOUNT_ID,
        'prepared',
        'not_attempted',
        [{ channelListingOptionId: 'option-preparing' }],
      ),
      compositionExecution(
        '40000000-0000-4000-8000-000000000009',
        '50000000-0000-4000-8000-000000000009',
        NOT_STARTED_LISTING_ID,
        ACCOUNT_ID,
        'not_started',
        'not_attempted',
        [{ channelListingOptionId: 'option-not-started' }],
      ),
      compositionExecution(
        '40000000-0000-4000-8000-000000000010',
        '50000000-0000-4000-8000-000000000010',
        SECOND_COMPOSITION_LISTING_ID,
        SECOND_ACCOUNT_ID,
        'reconciling',
        'uncertain',
        [{ channelListingOptionId: 'option-selected-c' }],
      ),
      compositionExecution(
        '40000000-0000-4000-8000-000000000011',
        '50000000-0000-4000-8000-000000000011',
        COMPOSITION_LISTING_ID,
        ACCOUNT_ID,
        'succeeded',
        'succeeded',
        [{ channelListingOptionId: 'option-terminal-success' }],
      ),
      compositionExecution(
        '40000000-0000-4000-8000-000000000012',
        '50000000-0000-4000-8000-000000000012',
        COMPOSITION_LISTING_ID,
        ACCOUNT_ID,
        'failed',
        'definitive_failure',
        [{ channelListingOptionId: 'option-terminal-failure' }],
      ),
    ];
    // 설정 하나에 판매상품 하나다(KID-310) — 같은 계정의 설정이 여럿이면 상품도 여럿이다.
    const targetProducts = executionRows.map((executionRow, index) => ({
      id: `61000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`,
      organizationId: TEST_ORGANIZATION_ID,
      code: `READER-COMPOSITION-${index + 1}`,
      name: `Reader composition product ${index + 1}`,
      registrationTargetId: executionRow.registrationTargetId,
      channelAccountId: executionRow.channelAccountId,
    }));
    await prisma.salesProduct.createMany({
      data: targetProducts.map(({ registrationTargetId: _target, channelAccountId: _account, ...product }) => product),
    });
    await prisma.registrationTarget.createMany({
      data: targetProducts.map((product) => preparation(
        product.registrationTargetId,
        product.channelAccountId,
        product.id,
      )),
    });
    await prisma.productRegistrationExecution.createMany({ data: executionRows });

    const read = () => prisma.$transaction((tx) => readUnresolvedCompositionOptionIds(tx, {
      organizationId: TEST_ORGANIZATION_ID,
      channelListingIds: [
        COMPOSITION_LISTING_ID,
        SECOND_COMPOSITION_LISTING_ID,
        PREPARING_LISTING_ID,
        NOT_STARTED_LISTING_ID,
      ],
    }));

    await expect(read()).resolves.toEqual(new Set([
      'option-selected-a', 'option-selected-b', 'option-selected-c',
    ]));

    await prisma.productRegistrationExecution.update({
      where: { id: '40000000-0000-4000-8000-000000000007' },
      data: { status: 'succeeded', providerOutcome: 'succeeded' },
    });
    await expect(read()).resolves.toEqual(new Set(['option-selected-c']));

    await prisma.productRegistrationExecution.update({
      where: { id: '40000000-0000-4000-8000-000000000010' },
      data: { status: 'failed', providerOutcome: 'definitive_failure' },
    });
    await expect(read()).resolves.toEqual(new Set());
  });
});

function preparation(
  id: string,
  channelAccountId: string,
  salesProductId: string,
  organizationId = TEST_ORGANIZATION_ID,
) {
  return {
    id,
    organizationId,
    salesProductId,
    channelAccountId,
    registrationInput: {},
  };
}

function compositionExecution(
  id: string,
  registrationTargetId: string,
  channelListingId: string,
  channelAccountId: string,
  status: string,
  providerOutcome: string,
  optionTransitions: readonly { channelListingOptionId: string }[],
) {
  return {
    id,
    organizationId: TEST_ORGANIZATION_ID,
    registrationTargetId,
    channelAccountId,
    channelListingId,
    executionKind: 'composition_change',
    idempotencyKey: `composition-${id}`,
    requestHash: 'b'.repeat(64),
    submissionPayloadJson: { optionTransitions },
    status,
    providerOutcome,
  };
}

function execution(
  id: string,
  registrationTargetId: string,
  channelAccountId: string,
  status: 'failed' | 'succeeded',
  createdAt: string,
  organizationId = TEST_ORGANIZATION_ID,
) {
  return {
    id,
    organizationId,
    registrationTargetId,
    channelAccountId,
    executionKind: 'register',
    idempotencyKey: `reader-${id}`,
    requestHash: 'a'.repeat(64),
    status,
    providerOutcome: status === 'succeeded' ? 'succeeded' : 'definitive_failure',
    createdAt: new Date(createdAt),
    updatedAt: new Date(createdAt),
  };
}
