import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import {
  makeTestPrisma,
  OTHER_ORGANIZATION_ID as OTHER_ORG,
  resetDb,
  seedBaseFixture,
  TEST_ORGANIZATION_ID as ORG,
} from '../../test-helpers/real-prisma';
import { seedSellpiaTransferOperation } from '../../test-helpers/__tests__/sellpia-transfer-operation';
import { SellpiaTransferOutcomePersistenceAdapter } from '../adapter/out/persistence/sellpia-transfer-outcome.repository';

// 셀피아 전송 결과 capability(KID-388): 원천 파일마다 가장 최근 전송 실행 하나의 상태를 실제 PG의 실행 표에서 읽는다.
const NONE_SOURCE = '11111111-1111-4111-8111-111111111111';
const RUNNING_SOURCE = '22222222-2222-4222-8222-222222222222';
const SENT_SOURCE = '33333333-3333-4333-8333-333333333333';

describe('SellpiaTransferOutcomePersistenceAdapter', () => {
  let prisma: PrismaClient;
  let adapter: SellpiaTransferOutcomePersistenceAdapter;

  beforeAll(async () => {
    prisma = makeTestPrisma();
    adapter = new SellpiaTransferOutcomePersistenceAdapter(prisma as never);
  });
  afterAll(async () => prisma.$disconnect());
  beforeEach(async () => {
    await resetDb(prisma);
    await seedBaseFixture(prisma);
  });

  it('answers each source in input order: none, in progress, succeeded', async () => {
    const now = Date.now();
    await seedSellpiaTransferOperation(prisma, {
      organizationId: ORG, sourceOperationId: RUNNING_SOURCE, transport: 'SHIPMENT', status: 'executing', startedAt: new Date(now - 60_000),
    });
    const sentId = await seedSellpiaTransferOperation(prisma, {
      organizationId: ORG, sourceOperationId: SENT_SOURCE, transport: 'MILKRUN', status: 'succeeded', startedAt: new Date(now - 120_000),
    });

    const outcomes = await adapter.readLatestOutcomes({
      organizationId: ORG,
      sources: [
        { sourceOperationId: NONE_SOURCE, transport: 'SHIPMENT' },
        { sourceOperationId: RUNNING_SOURCE, transport: 'SHIPMENT' },
        { sourceOperationId: SENT_SOURCE, transport: 'MILKRUN' },
      ],
    });

    expect(outcomes.map(({ source, status }) => [source.sourceOperationId, status])).toEqual([
      [NONE_SOURCE, 'none'],
      [RUNNING_SOURCE, 'in_progress'],
      [SENT_SOURCE, 'succeeded'],
    ]);
    expect(outcomes[0]).toMatchObject({ operationId: null, finishedAt: null });
    expect(outcomes[2]).toMatchObject({ operationId: sentId, finishedAt: expect.any(Date) });
  });

  it('keeps transports and organizations apart, and a file that ever reached Sellpia stays succeeded after a failed resend', async () => {
    const now = Date.now();
    const sentId = await seedSellpiaTransferOperation(prisma, {
      organizationId: ORG, sourceOperationId: SENT_SOURCE, transport: 'SHIPMENT', status: 'succeeded', startedAt: new Date(now - 300_000),
    });
    await seedSellpiaTransferOperation(prisma, {
      organizationId: ORG, sourceOperationId: SENT_SOURCE, transport: 'SHIPMENT', status: 'cancelled', startedAt: new Date(now - 60_000),
    });
    await seedSellpiaTransferOperation(prisma, {
      organizationId: ORG, sourceOperationId: SENT_SOURCE, transport: 'MILKRUN', status: 'reconciling', startedAt: new Date(now - 60_000),
    });
    await seedSellpiaTransferOperation(prisma, {
      organizationId: OTHER_ORG, sourceOperationId: RUNNING_SOURCE, transport: null, status: 'succeeded', startedAt: new Date(now - 60_000),
    });

    const outcomes = await adapter.readLatestOutcomes({
      organizationId: ORG,
      sources: [
        { sourceOperationId: SENT_SOURCE, transport: 'SHIPMENT' },
        { sourceOperationId: SENT_SOURCE, transport: 'MILKRUN' },
        { sourceOperationId: RUNNING_SOURCE, transport: null },
      ],
    });

    expect(outcomes.map(({ status }) => status)).toEqual(['succeeded', 'reconciling', 'none']);
    expect(outcomes[0]).toMatchObject({ operationId: sentId, finishedAt: expect.any(Date) });
  });

  it('answers the latest transfer of a file that never succeeded', async () => {
    const now = Date.now();
    await seedSellpiaTransferOperation(prisma, {
      organizationId: ORG, sourceOperationId: RUNNING_SOURCE, transport: 'MILKRUN', status: 'executing', startedAt: new Date(now - 300_000),
    });
    const closedId = await seedSellpiaTransferOperation(prisma, {
      organizationId: ORG, sourceOperationId: RUNNING_SOURCE, transport: 'MILKRUN', status: 'cancelled', startedAt: new Date(now - 60_000),
    });

    await expect(adapter.readLatestOutcomes({ organizationId: ORG, sources: [{ sourceOperationId: RUNNING_SOURCE, transport: 'MILKRUN' }] }))
      .resolves.toMatchObject([{ status: 'failed', operationId: closedId }]);
  });
});
