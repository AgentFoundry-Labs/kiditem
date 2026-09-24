import { Injectable } from '@nestjs/common';
import type {
  CoupangDirectPoSnapshotEntry,
  CoupangDirectPoSnapshotResponse,
} from '@kiditem/shared/coupang-direct-order';
import { PrismaService } from '../../../prisma/prisma.service';

/**
 * 쿠팡직배송 발주 스냅샷. 입고예정일 달력이 매번 쿠팡을 다시 긁지 않도록 마지막 수집분을
 * 계정 범위로 보관한다. 조회 편의용 캐시이며 주문 진실은 Order/OrderLineItem 이 갖는다.
 */
@Injectable()
export class CoupangDirectPoSnapshotService {
  constructor(private readonly prisma: PrismaService) {}

  /** 계정의 마지막 수집분을 그대로 돌려준다. 없으면 빈 배열. */
  async read(
    organizationId: string,
    channelAccountId: string,
  ): Promise<CoupangDirectPoSnapshotResponse> {
    const rows = await this.prisma.coupangDirectPoSnapshot.findMany({
      where: { organizationId, channelAccountId },
      orderBy: [{ deliveryDate: 'asc' }, { purchaseOrderSeq: 'asc' }],
    });
    const collectedAt = rows.reduce<Date | null>((latest, row) => (
      !latest || row.collectedAt > latest ? row.collectedAt : latest
    ), null);
    return {
      channelAccountId,
      collectedAt: collectedAt ? collectedAt.toISOString() : null,
      entries: rows.map((row) => ({
        purchaseOrderSeq: row.purchaseOrderSeq,
        centerName: row.centerName,
        transport: row.transport === 'MILKRUN' ? 'MILKRUN' : 'SHIPMENT',
        deliveryDate: row.deliveryDate,
        orderedDate: row.orderedDate,
        isUrgent: row.isUrgent,
        skuCount: row.skuCount,
        orderQuantity: row.orderQuantity,
        orderAmount: row.orderAmount,
        items: Array.isArray(row.itemsJson)
          ? (row.itemsJson as CoupangDirectPoSnapshotEntry['items'])
          : [],
      })),
    };
  }

  /**
   * 계정의 스냅샷을 이번 수집분으로 통째로 교체한다. 쿠팡에서 사라진 발주가 남지 않도록
   * 삭제 후 삽입을 한 트랜잭션으로 처리한다.
   */
  async replace(
    organizationId: string,
    channelAccountId: string,
    entries: CoupangDirectPoSnapshotEntry[],
  ): Promise<CoupangDirectPoSnapshotResponse> {
    const collectedAt = new Date();
    await this.prisma.$transaction(async (tx) => {
      await tx.coupangDirectPoSnapshot.deleteMany({
        where: { organizationId, channelAccountId },
      });
      if (entries.length === 0) return;
      await tx.coupangDirectPoSnapshot.createMany({
        data: entries.map((entry) => ({
          organizationId,
          channelAccountId,
          purchaseOrderSeq: entry.purchaseOrderSeq,
          centerName: entry.centerName,
          transport: entry.transport,
          deliveryDate: entry.deliveryDate,
          orderedDate: entry.orderedDate,
          isUrgent: entry.isUrgent,
          skuCount: entry.skuCount,
          orderQuantity: entry.orderQuantity,
          orderAmount: entry.orderAmount,
          itemsJson: entry.items,
          collectedAt,
        })),
      });
    });
    return this.read(organizationId, channelAccountId);
  }
}
