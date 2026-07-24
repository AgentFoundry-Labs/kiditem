import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../../prisma/prisma.service';
import type {
  CoupangShipmentDateSummaryRecord,
  CoupangShipmentDateSummaryRepositoryPort,
} from '../../../application/port/out/repository/coupang-shipment-date-summary.repository.port';

type SummaryRow = {
  shipmentDate: string;
  count: number;
  boxes: number;
  capturedAt: Date;
};

@Injectable()
export class CoupangShipmentDateSummaryRepositoryAdapter
implements CoupangShipmentDateSummaryRepositoryPort {
  constructor(private readonly prisma: PrismaService) {}

  async listDateSummary(
    organizationId: string,
  ): Promise<CoupangShipmentDateSummaryRecord[]> {
    const rows = await this.prisma.coupangShipmentDateSummary.findMany({
      where: { organizationId },
      orderBy: { shipmentDate: 'desc' },
      select: { shipmentDate: true, count: true, boxes: true, capturedAt: true },
    });
    return rows.map(toRecord);
  }

  async upsertDateSummary(
    organizationId: string,
    items: Array<{ date: string; count: number; boxes: number }>,
  ): Promise<CoupangShipmentDateSummaryRecord[]> {
    const capturedAt = new Date();
    // Dedupe by date (last write wins) so one transaction never touches a row twice.
    const byDate = new Map<string, { count: number; boxes: number }>();
    for (const item of items) {
      byDate.set(item.date, { count: item.count, boxes: item.boxes });
    }

    if (byDate.size > 0) {
      await this.prisma.$transaction(
        [...byDate.entries()].map(([shipmentDate, value]) =>
          this.prisma.coupangShipmentDateSummary.upsert({
            where: { organizationId_shipmentDate: { organizationId, shipmentDate } },
            create: {
              organizationId,
              shipmentDate,
              count: value.count,
              boxes: value.boxes,
              capturedAt,
            },
            update: { count: value.count, boxes: value.boxes, capturedAt },
          }),
        ),
      );
    }

    return this.listDateSummary(organizationId);
  }
}

function toRecord(row: SummaryRow): CoupangShipmentDateSummaryRecord {
  return {
    date: row.shipmentDate,
    count: row.count,
    boxes: row.boxes,
    capturedAt: row.capturedAt.toISOString(),
  };
}
