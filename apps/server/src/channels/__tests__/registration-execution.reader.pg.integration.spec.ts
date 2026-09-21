import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import {
  makeTestPrisma,
  OTHER_ORGANIZATION_ID,
  resetDb,
  seedBaseFixture,
  TEST_ORGANIZATION_ID,
} from '../../test-helpers/real-prisma';
import { readRegistrationFailureCounts } from '../read/registration-execution.reader';

const ACCOUNT_ID = '11111111-1111-4111-8111-111111111111';
const SECOND_ACCOUNT_ID = '22222222-2222-4222-8222-222222222222';
const OTHER_ACCOUNT_ID = '33333333-3333-4333-8333-333333333333';
const SAME_CHANNEL_ACCOUNT_ID = '44444444-4444-4444-8444-444444444444';

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
});

function execution(
  id: string,
  productPreparationId: string,
  channelAccountId: string,
  status: 'failed' | 'succeeded',
  createdAt: string,
  organizationId = TEST_ORGANIZATION_ID,
) {
  return {
    id,
    organizationId,
    productPreparationId,
    channelAccountId,
    executionKind: 'external_wing',
    idempotencyKey: `reader-${id}`,
    requestHash: 'a'.repeat(64),
    status,
    providerOutcome: status === 'succeeded' ? 'succeeded' : 'definitive_failure',
    createdAt: new Date(createdAt),
    updatedAt: new Date(createdAt),
  };
}
