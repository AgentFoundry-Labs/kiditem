import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CoupangDirectPoSnapshotService } from '../coupang-direct-po-snapshot.service';

const ORG = '11111111-1111-4111-8111-111111111111';
const ACC = '22222222-2222-4222-8222-222222222222';

function entry(seq: string, transport: string, deliveryDate: string, urgent = false) {
  return {
    purchaseOrderSeq: seq, centerName: '인천36', transport, deliveryDate,
    orderedDate: '2026-07-30', isUrgent: urgent, skuCount: 1,
    orderQuantity: 3, orderAmount: 300,
    items: [{ barcode: 'B', name: '상품', qty: 3, amount: 300 }],
  } as never;
}

describe('CoupangDirectPoSnapshotService', () => {
  let deleteMany: ReturnType<typeof vi.fn>;
  let createMany: ReturnType<typeof vi.fn>;
  let findMany: ReturnType<typeof vi.fn>;
  let prisma: { coupangDirectPoSnapshot: Record<string, unknown>; $transaction: unknown };
  let service: CoupangDirectPoSnapshotService;

  beforeEach(() => {
    deleteMany = vi.fn().mockResolvedValue({ count: 0 });
    createMany = vi.fn().mockResolvedValue({ count: 0 });
    findMany = vi.fn().mockResolvedValue([]);
    const model = { deleteMany, createMany, findMany };
    prisma = {
      coupangDirectPoSnapshot: model,
      $transaction: (fn: (tx: unknown) => Promise<unknown>) =>
        fn({ coupangDirectPoSnapshot: model }),
    };
    service = new CoupangDirectPoSnapshotService(prisma as never);
  });

  it('replaces the account snapshot in one transaction (delete then insert)', async () => {
    await service.replace(ORG, ACC, [entry('PO-1', 'SHIPMENT', '2026-08-04', true)]);

    expect(deleteMany).toHaveBeenCalledWith({
      where: { organizationId: ORG, channelAccountId: ACC },
    });
    expect(createMany).toHaveBeenCalledTimes(1);
    const rows = createMany.mock.calls[0][0].data;
    expect(rows[0]).toMatchObject({
      organizationId: ORG,
      channelAccountId: ACC,
      purchaseOrderSeq: 'PO-1',
      isUrgent: true,
    });
  });

  it('clears the snapshot without inserting when there are no orders', async () => {
    await service.replace(ORG, ACC, []);
    expect(deleteMany).toHaveBeenCalledOnce();
    expect(createMany).not.toHaveBeenCalled();
  });

  it('reads back entries scoped to the account', async () => {
    findMany.mockResolvedValue([{
      purchaseOrderSeq: 'PO-9', centerName: '인천36', transport: 'MILKRUN',
      deliveryDate: '2026-08-04', orderedDate: '2026-07-30', isUrgent: false,
      skuCount: 2, orderQuantity: 5, orderAmount: 500,
      itemsJson: [{ barcode: 'B', name: '상품', qty: 5, amount: 500 }],
      collectedAt: new Date('2026-07-31T04:00:00Z'),
    }]);

    const res = await service.read(ORG, ACC);
    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { organizationId: ORG, channelAccountId: ACC },
    }));
    expect(res.entries).toHaveLength(1);
    expect(res.entries[0]).toMatchObject({ purchaseOrderSeq: 'PO-9', transport: 'MILKRUN' });
    expect(res.collectedAt).toBe('2026-07-31T04:00:00.000Z');
  });
});
