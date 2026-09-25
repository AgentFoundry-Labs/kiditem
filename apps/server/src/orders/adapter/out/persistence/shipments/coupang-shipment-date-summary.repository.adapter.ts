import { Injectable } from "@nestjs/common";
import type { CoupangShipmentDateItem } from "@kiditem/shared/orders-operations";
import { PrismaService } from "../../../../../prisma/prisma.service";
import { ownerTransactionClient } from "../../../../../prisma/owner-transaction";
import type { OwnerTransaction } from "../../../../../common/owner-transaction";
import type { CoupangShipmentDateSummaryRepositoryPort } from "../../../../application/port/out/persistence/shipments/coupang-shipment-date-summary.repository.port";
import { readShipmentDateCalendar } from "../read/shipments/coupang-shipment-date-summary.reader";

/**
 * 쿠팡 쉽먼트 발송일 원장. 쓰기는 실행 `orders.coupang_shipment_summary`의 finish 트랜잭션에서만(ADR-0025) —
 * 실행·잠금·임대·멱등은 실행 계약이 맡는다.
 */
@Injectable()
export class CoupangShipmentDateSummaryRepositoryAdapter implements CoupangShipmentDateSummaryRepositoryPort {
  constructor(private readonly prisma: PrismaService) {}

  listDateSummary(organizationId: string) {
    return readShipmentDateCalendar(this.prisma, organizationId);
  }

  async publishOperation(
    transaction: OwnerTransaction,
    input: { organizationId: string; operationId: string; items: readonly CoupangShipmentDateItem[]; capturedAt: Date },
  ) {
    if (input.items.length === 0) return { dates: 0 };
    const written = await ownerTransactionClient(transaction).coupangShipmentDateSummary.createMany({
      data: input.items.map((item) => ({
        organizationId: input.organizationId,
        operationId: input.operationId,
        shipmentDate: item.date,
        count: item.count,
        boxes: item.boxes,
        capturedAt: input.capturedAt,
      })),
    });
    return { dates: written.count };
  }
}
