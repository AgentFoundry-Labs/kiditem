import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
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
      const valueRows = [...byDate.entries()].map(([shipmentDate, value]) =>
        Prisma.sql`(
          gen_random_uuid(),
          ${organizationId}::uuid,
          ${shipmentDate},
          ${value.count},
          ${value.boxes},
          ${capturedAt},
          ${capturedAt}
        )`);
      await this.prisma.$executeRaw(Prisma.sql`
        INSERT INTO "coupang_shipment_date_summaries"
          ("id", "organization_id", "shipment_date", "count", "boxes", "captured_at", "updated_at")
        VALUES ${Prisma.join(valueRows)}
        ON CONFLICT ("organization_id", "shipment_date") DO UPDATE SET
          "count" = EXCLUDED."count",
          "boxes" = EXCLUDED."boxes",
          "captured_at" = EXCLUDED."captured_at",
          "updated_at" = EXCLUDED."updated_at"
      `);
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
