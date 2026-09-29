import { randomUUID } from 'node:crypto';
import type { PrismaClient } from '@prisma/client';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  makeTestPrisma,
  resetDb,
  seedBaseFixture,
  TEST_ORGANIZATION_ID as ORG,
} from '../../test-helpers/real-prisma';
import { ownerTransaction } from '../../prisma/owner-transaction';
import { ProductSourcePublicationRepositoryAdapter } from '../adapter/out/persistence/product-source-publication.repository';
import { lockProductSource } from '../adapter/out/persistence/transaction/product-source-lock';
import type { ParsedProductSourceRow } from '../application/port/out/source/sellpia-payload-decoder.port';

const row = (code: string, currentStock: number): ParsedProductSourceRow => ({
  rowNumber: 1,
  sellpiaProductCode: code,
  sourceProductCode: code,
  sourceOptionCode: '',
  name: `상품 ${code}`,
  optionName: null,
  barcode: null,
  currentStock,
  purchasePrice: 1_000,
});

/**
 * 셀피아 재고 발행은 조직마다 한 번에 하나다: finish 트랜잭션이 상품 원천 잠금(`lockProductSource`)과 상태 줄 잠금을
 * 잡으므로 겹친 발행은 줄을 서고, 세대는 앞 발행 다음 번호가 된다(KID-365: 옛 `source_import_runs` 발행 순번 없이).
 */
describe('Sellpia snapshot publication serializes per organization (PostgreSQL)', () => {
  let prisma: PrismaClient;
  const publication = new ProductSourcePublicationRepositoryAdapter();

  beforeAll(async () => {
    prisma = makeTestPrisma();
    await prisma.$connect();
  });

  afterAll(async () => prisma?.$disconnect());

  beforeEach(async () => {
    await resetDb(prisma);
    await seedBaseFixture(prisma);
    await prisma.sellpiaInventoryState.create({
      data: {
        organizationId: ORG,
        sourceOrigin: 'https://kiditem.sellpia.com',
        sourceAccountKey: 'kiditem',
        freshnessFence: randomUUID(),
      },
    });
  });

  const publish = (operationId: string, rows: ParsedProductSourceRow[]) => prisma.$transaction(
    (tx) => publication.publishSnapshot(ownerTransaction(tx), { organizationId: ORG, operationId, trigger: null, rows }),
    { maxWait: 10_000, timeout: 30_000 },
  );

  it('waits for a transaction holding the product source lock, then publishes on top of it', async () => {
    let lockAcquired!: () => void;
    const lockReady = new Promise<void>((resolve) => { lockAcquired = resolve; });
    let releaseLock!: () => void;
    const lockRelease = new Promise<void>((resolve) => { releaseLock = resolve; });
    const events: string[] = [];
    const holder = prisma.$transaction(async (tx) => {
      await lockProductSource(tx, ORG);
      lockAcquired();
      await lockRelease;
      events.push('holder committed');
    }, { maxWait: 10_000, timeout: 30_000 });
    await lockReady;

    const operationId = randomUUID();
    const published = publish(operationId, [row('P-1', 3)]).then(() => { events.push('published'); });
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(events).toEqual([]);
    releaseLock();
    await Promise.all([holder, published]);

    expect(events).toEqual(['holder committed', 'published']);
    await expect(prisma.sellpiaInventoryState.findUniqueOrThrow({ where: { organizationId: ORG } }))
      .resolves.toMatchObject({ lastCompletedOperationId: operationId, verifiedGeneration: 1n });
  });

  it('gives two overlapping publications consecutive generations, the later one current', async () => {
    const first = randomUUID();
    const second = randomUUID();
    await Promise.all([publish(first, [row('P-1', 3)]), publish(second, [row('P-1', 7)])]);

    const state = await prisma.sellpiaInventoryState.findUniqueOrThrow({ where: { organizationId: ORG } });
    expect(state.verifiedGeneration).toBe(2n);
    const product = await prisma.masterProduct.findFirstOrThrow({ where: { organizationId: ORG, sourceProductCode: 'P-1' } });
    expect(product.currentStock).toBe(state.lastCompletedOperationId === second ? 7 : 3);
  });
});
