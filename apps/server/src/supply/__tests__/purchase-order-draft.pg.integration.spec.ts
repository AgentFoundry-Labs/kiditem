import type { PrismaClient } from '@prisma/client';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { PrismaService } from '../../prisma/prisma.service';
import {
  makeTestPrisma,
  resetDb,
  seedBaseFixture,
  TEST_ORGANIZATION_ID,
} from '../../test-helpers/real-prisma';
import { seedActiveSellpiaInventorySku } from '../../test-helpers/inventory-seeds';
import { ProcurementRepositoryAdapter } from '../adapter/out/repository/procurement.repository.adapter';

const SELLPIA_SKU_ID = '21000000-0000-4000-8000-000000000001';

describe('purchase-order draft idempotency (PG integration)', () => {
  let prisma: PrismaClient;
  let otherPrisma: PrismaClient;
  let first: ProcurementRepositoryAdapter;
  let second: ProcurementRepositoryAdapter;

  beforeAll(async () => {
    prisma = makeTestPrisma();
    otherPrisma = makeTestPrisma();
    await Promise.all([prisma.$connect(), otherPrisma.$connect()]);
    first = new ProcurementRepositoryAdapter(prisma as unknown as PrismaService);
    second = new ProcurementRepositoryAdapter(otherPrisma as unknown as PrismaService);
  });

  afterAll(async () => {
    await Promise.all([prisma?.$disconnect(), otherPrisma?.$disconnect()]);
  });

  beforeEach(async () => {
    await resetDb(prisma);
    await seedBaseFixture(prisma);
    await seedActiveSellpiaInventorySku(prisma, {
      id: SELLPIA_SKU_ID,
      organizationId: TEST_ORGANIZATION_ID,
      code: 'SP-DRAFT-1',
      name: 'Draft SKU',
      currentStock: 10,
    });
  });

  it('returns one immutable draft for concurrent identical requests and rejects payload drift', async () => {
    const command = {
      supplierName: '1688 Kids Tableware Factory',
      items: [{
        sellpiaInventorySkuId: SELLPIA_SKU_ID,
        productName: '실리콘 식판 흡착형 신제품',
        quantity: 6,
        unitPriceCny: 22.8,
      }],
      idempotencyKey: 'operation-1:supply.create_purchase_order_draft:item-1',
      requestHash: 'a'.repeat(64),
    };

    const [left, right] = await Promise.all([
      first.createDraft(TEST_ORGANIZATION_ID, command),
      second.createDraft(TEST_ORGANIZATION_ID, command),
    ]);

    expect(left.ok).toBe(true);
    expect(right.ok).toBe(true);
    if (!left.ok || !right.ok) throw new Error('expected successful drafts');
    expect(left.order.id).toBe(right.order.id);
    expect(await prisma.purchaseOrder.count({
      where: {
        organizationId: TEST_ORGANIZATION_ID,
        idempotencyKey: command.idempotencyKey,
      },
    })).toBe(1);
    expect(await prisma.purchaseOrderItem.count({
      where: { orderId: left.order.id },
    })).toBe(1);

    await expect(first.createDraft(TEST_ORGANIZATION_ID, {
      ...command,
      requestHash: 'b'.repeat(64),
    })).rejects.toThrow('purchase_order_draft_idempotency_conflict');
  });
});
