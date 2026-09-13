import { Injectable } from '@nestjs/common';
import type {
  MasterProductMonthlyProfitFact,
  MasterProductProfitFactEvidence,
  MasterProductProfitFactReadPort,
  MasterProductProfitFactSnapshot,
  OrphanSellpiaProductProfitFact,
} from '../application/port/in/master-product-profit-fact-read.port';
import { PrismaService } from '../../prisma/prisma.service';
import { datesInclusive } from '../../common/kst';

type SourceFactRow = Readonly<{
  masterProductId: string | null;
  productCode: string;
  optionCode: string;
  barcode: string | null;
  yearMonth: string;
  orderAmount: number;
  inAmount: number;
  coverageStartDate: Date | null;
  coverageEndDate: Date | null;
  capturedAt: Date;
}>;

@Injectable()
export class SellpiaMasterProductProfitFactReader
  implements MasterProductProfitFactReadPort
{
  constructor(private readonly prisma: PrismaService) {}

  async readProfitFacts(input: {
    organizationId: string;
    masterProductIds: readonly string[];
    range: { from: Date; to: Date };
  }): Promise<MasterProductProfitFactSnapshot> {
    const masterProductIds = [...new Set(input.masterProductIds)];
    const requestedMasterProductIds = new Set(masterProductIds);
    if (masterProductIds.length === 0) return { evidence: [], orphanFacts: [] };
    const months = yearMonthsIntersecting(input.range);
    const generation = await this.prisma.sourceImportRun.findFirst({
      where: {
        organizationId: input.organizationId,
        sourceType: 'sellpia_product_profitability',
        status: 'completed',
        publicationSequence: { not: null },
      },
      orderBy: { publicationSequence: 'desc' },
      select: { id: true, mappingGeneration: true, importedAt: true },
    });
    const facts = generation
      ? await this.prisma.sellpiaProductMonthlySales.findMany({
        where: {
          organizationId: input.organizationId,
          sourceImportRunId: generation.id,
          yearMonth: { in: months },
        },
        select: {
          masterProductId: true,
          productCode: true,
          optionCode: true,
          barcode: true,
          yearMonth: true,
          orderAmount: true,
          inAmount: true,
          coverageStartDate: true,
          coverageEndDate: true,
          capturedAt: true,
        },
      })
      : [];

    const mappedRows = new Map<string, SourceFactRow[]>();
    const orphanFacts: OrphanSellpiaProductProfitFact[] = [];
    for (const sourceFact of facts as SourceFactRow[]) {
      if (!sourceFact.masterProductId) {
        orphanFacts.push(toOrphan(sourceFact, 'SOURCE_UNMAPPED'));
        continue;
      }
      if (!requestedMasterProductIds.has(sourceFact.masterProductId)) continue;
      if (!sourceFact.coverageStartDate || !sourceFact.coverageEndDate) {
        orphanFacts.push(toOrphan(sourceFact, 'LEGACY_COVERAGE_MISSING'));
        continue;
      }
      const masterProductId = sourceFact.masterProductId;
      const key = `${masterProductId}\u0000${sourceFact.yearMonth}`;
      const rows = mappedRows.get(key) ?? [];
      rows.push(sourceFact);
      mappedRows.set(key, rows);
    }

    const factsByMaster = new Map(masterProductIds.map((id) => [id, [] as MasterProductMonthlyProfitFact[]]));
    for (const [key, sourceRows] of mappedRows) {
      if (!hasMatchingCoverage(sourceRows)) {
        for (const sourceRow of sourceRows) orphanFacts.push(toOrphan(sourceRow, 'COVERAGE_MISMATCH'));
        continue;
      }
      const [masterProductId, yearMonth] = key.split('\u0000');
      const first = sourceRows[0]!;
      factsByMaster.get(masterProductId)?.push({
        masterProductId,
        yearMonth,
        coverageStartDate: first.coverageStartDate!,
        coverageEndDate: first.coverageEndDate!,
        coveredDays: calendarDaysInclusive(first.coverageStartDate!, first.coverageEndDate!),
        revenue: sourceRows.reduce((sum, row) => sum + row.orderAmount, 0),
        sellpiaInAmount: sourceRows.reduce((sum, row) => sum + row.inAmount, 0),
        sourceProductCodes: [...new Set(sourceRows.map((row) => row.productCode))].sort(),
        sourceOptionCodes: [...new Set(sourceRows.map((row) => row.optionCode))].sort(),
        capturedAt: sourceRows.reduce((latest, row) =>
          row.capturedAt > latest ? row.capturedAt : latest, first.capturedAt),
      });
    }

    const evidence: MasterProductProfitFactEvidence[] = masterProductIds.map((masterProductId) => ({
      masterProductId,
      mappingStatus: (facts as SourceFactRow[]).some((fact) => fact.masterProductId === masterProductId)
        ? 'MAPPED'
        : 'UNMAPPED',
      mappingInventoryGeneration: generation?.mappingGeneration?.toString() ?? null,
      mappingVerifiedAt: generation?.importedAt ?? null,
      monthlyFacts: (factsByMaster.get(masterProductId) ?? []).sort((left, right) =>
        left.yearMonth.localeCompare(right.yearMonth)),
    }));
    return { evidence, orphanFacts };
  }
}

function toOrphan(
  sourceFact: SourceFactRow,
  reason: OrphanSellpiaProductProfitFact['reason'],
): OrphanSellpiaProductProfitFact {
  return {
    productCode: sourceFact.productCode,
    optionCode: sourceFact.optionCode,
    barcode: sourceFact.barcode,
    yearMonth: sourceFact.yearMonth,
    reason,
  };
}

function hasMatchingCoverage(rows: readonly SourceFactRow[]): boolean {
  const first = rows[0];
  return Boolean(first?.coverageStartDate && first.coverageEndDate)
    && rows.every((row) =>
      row.coverageStartDate?.getTime() === first.coverageStartDate?.getTime()
      && row.coverageEndDate?.getTime() === first.coverageEndDate?.getTime());
}

function calendarDaysInclusive(start: Date, end: Date): number {
  return datesInclusive(start, end).length;
}

function yearMonthsIntersecting(range: { from: Date; to: Date }): string[] {
  const from = new Date(Date.UTC(range.from.getUTCFullYear(), range.from.getUTCMonth(), 1));
  const to = new Date(Date.UTC(range.to.getUTCFullYear(), range.to.getUTCMonth(), 1));
  const values: string[] = [];
  for (let cursor = from; cursor <= to; cursor = new Date(Date.UTC(
    cursor.getUTCFullYear(), cursor.getUTCMonth() + 1, 1,
  ))) {
    values.push(`${cursor.getUTCFullYear()}-${String(cursor.getUTCMonth() + 1).padStart(2, '0')}`);
  }
  return values;
}
