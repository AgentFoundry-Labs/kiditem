import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import { makeTestPrisma, resetDb, seedBaseFixture, TEST_ORGANIZATION_ID as ORG } from '../../test-helpers/real-prisma';
import { seedSellpiaTransferOperation } from '../../test-helpers/__tests__/sellpia-transfer-operation';
import { SellpiaTransferOutcomePersistenceAdapter } from '../../orders/adapter/out/persistence/sellpia-transfer-outcome.persistence.adapter';
import { RocketWorkbookProgressRepositoryAdapter } from '../adapter/out/persistence/rocket-workbook-progress.repository.adapter';
import { RocketWorkbookProgressService } from '../application/usecase/rocket-workbook-progress.service';

// 로켓 워크북 진행(KID-388): 수집된 파일마다 Orders 전송 결과 capability가 비춘 최근 전송 실행 상태로 정한다.
// succeeded → completed, 진행·reconciling → sellpia_transmitting, 없음·실패 → orders_collected(재전송 가능).
const SHIPMENT_SOURCE = { sourceOperationId: '31000000-0000-4000-8000-000000000001', transport: 'SHIPMENT' as const };
const MILKRUN_SOURCE = { sourceOperationId: '31000000-0000-4000-8000-000000000001', transport: 'MILKRUN' as const };

describe('RocketWorkbookProgressService (PG)', () => {
  let prisma: PrismaClient;
  let service: RocketWorkbookProgressService;

  beforeAll(async () => {
    prisma = makeTestPrisma();
    service = new RocketWorkbookProgressService(
      new RocketWorkbookProgressRepositoryAdapter(new SellpiaTransferOutcomePersistenceAdapter(prisma as never)),
    );
  });
  afterAll(async () => prisma.$disconnect());
  beforeEach(async () => {
    await resetDb(prisma);
    await seedBaseFixture(prisma);
    await prisma.sellpiaInventoryState.create({
      data: { organizationId: ORG, lastVerifiedAt: new Date(), requestedGeneration: 9n, verifiedGeneration: 9n },
    });
  });

  const read = (sources: Array<typeof SHIPMENT_SOURCE | typeof MILKRUN_SOURCE>, allPositiveLinesCollected = true) =>
    prisma.$transaction((tx) => service.read({
      transaction: tx,
      organizationId: ORG,
      exportGeneration: 8n,
      allPositiveLinesCollected,
      transmissionSources: sources,
    }));
  const transfer = (source: typeof SHIPMENT_SOURCE | typeof MILKRUN_SOURCE, status: 'executing' | 'reconciling' | 'succeeded' | 'failed' | 'cancelled', ageMs = 60_000) =>
    seedSellpiaTransferOperation(prisma, { organizationId: ORG, ...source, status, startedAt: new Date(Date.now() - ageMs) });

  it('waits for Coupang confirmation until every positive line is collected', async () => {
    await transfer(SHIPMENT_SOURCE, 'succeeded');
    await expect(read([SHIPMENT_SOURCE], false)).resolves.toEqual({ status: 'awaiting_coupang_confirmation', verifiedGeneration: 8n });
  });

  it('is orders_collected with no collected file or no transfer yet', async () => {
    await expect(read([])).resolves.toEqual({ status: 'orders_collected', verifiedGeneration: 9n });
    await expect(read([SHIPMENT_SOURCE])).resolves.toEqual({ status: 'orders_collected', verifiedGeneration: 9n });
  });

  it('is sellpia_transmitting while the transfer runs or awaits operator reconciliation', async () => {
    await transfer(SHIPMENT_SOURCE, 'executing');
    await expect(read([SHIPMENT_SOURCE])).resolves.toMatchObject({ status: 'sellpia_transmitting' });
    await transfer(SHIPMENT_SOURCE, 'reconciling', 1_000);
    await expect(read([SHIPMENT_SOURCE])).resolves.toMatchObject({ status: 'sellpia_transmitting' });
  });

  it('falls back to orders_collected after a failed or closed transfer so the file can be sent again', async () => {
    await transfer(SHIPMENT_SOURCE, 'failed', 120_000);
    await transfer(SHIPMENT_SOURCE, 'cancelled');
    await expect(read([SHIPMENT_SOURCE])).resolves.toMatchObject({ status: 'orders_collected' });
  });

  it('stays completed when a resend of a file that already reached Sellpia fails', async () => {
    await transfer(SHIPMENT_SOURCE, 'succeeded', 120_000);
    await transfer(SHIPMENT_SOURCE, 'failed');
    await expect(read([SHIPMENT_SOURCE])).resolves.toMatchObject({ status: 'completed' });
  });

  it('completes only when the latest transfer of every collected file succeeded', async () => {
    await transfer(SHIPMENT_SOURCE, 'succeeded');
    await expect(read([SHIPMENT_SOURCE, MILKRUN_SOURCE])).resolves.toMatchObject({ status: 'orders_collected' });
    await transfer(MILKRUN_SOURCE, 'executing');
    await expect(read([SHIPMENT_SOURCE, MILKRUN_SOURCE])).resolves.toMatchObject({ status: 'sellpia_transmitting' });
    await transfer(MILKRUN_SOURCE, 'succeeded', 1_000);
    await expect(read([SHIPMENT_SOURCE, MILKRUN_SOURCE])).resolves.toEqual({ status: 'completed', verifiedGeneration: 9n });
  });
});
