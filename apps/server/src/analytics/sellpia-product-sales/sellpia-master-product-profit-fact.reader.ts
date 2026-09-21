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
import {
  readCurrentSellpiaProductMonthlyFacts,
  type SellpiaProductMonthlyFact,
} from './read/sellpia-product-monthly-facts';

type SourceFactRow = SellpiaProductMonthlyFact;

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
    const { generation, facts } = await this.prisma.$transaction((tx) =>
      readCurrentSellpiaProductMonthlyFacts(tx, {
        organizationId: input.organizationId,
        scope: { yearMonths: months },
      }));

    const mappedRows = new Map<string, SourceFactRow[]>();
    const orphanFacts: OrphanSellpiaProductProfitFact[] = [];
    for (const sourceFact of facts) {
      if (!sourceFact.masterProductId) {
        orphanFacts.push(toOrphan(sourceFact, 'SOURCE_UNMAPPED'));
        continue;
      }
      if (!requestedMasterProductIds.has(sourceFact.masterProductId)) continue;
      const masterProductId = sourceFact.masterProductId;
      const key = `${masterProductId}\u0000${sourceFact.yearMonth}`;
      const rows = mappedRows.get(key) ?? [];
      rows.push(sourceFact);
      mappedRows.set(key, rows);
    }

    const factsByMaster = new Map(masterProductIds.map((id) => [id, [] as MasterProductMonthlyProfitFact[]]));
    for (const [key, sourceRows] of mappedRows) {
      if (sourceRows.some((row) => !row.coverageStartDate || !row.coverageEndDate)) {
        for (const sourceRow of sourceRows) orphanFacts.push(toOrphan(sourceRow, 'LEGACY_COVERAGE_MISSING'));
        continue;
      }
      if (sourceRows.some((row) => row.costBasis !== 'ORDER_TIME_SUPPLY_COST' || row.vatIncluded !== true)) {
        for (const sourceRow of sourceRows) orphanFacts.push(toOrphan(sourceRow, 'COST_PROVENANCE_MISSING'));
        continue;
      }
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
        orderQty: sourceRows.reduce((sum, row) => sum + row.orderQty, 0),
        soldCost: sourceRows.reduce((sum, row) => sum + row.orderQty * row.buyPrice, 0),
        // 팔린 줄은 전부 매입 단가가 있어야 원가를 안다고 말할 수 있다. 안 팔린 줄은 원가에
        // 보태는 것이 없으므로 따지지 않는다.
        soldCostComplete: sourceRows.every((row) => row.orderQty <= 0 || row.buyPrice > 0),
        sellpiaInAmount: sourceRows.reduce((sum, row) => sum + row.inAmount, 0),
        sourceProductCodes: [...new Set(sourceRows.map((row) => row.productCode))].sort(),
        sourceOptionCodes: [...new Set(sourceRows.map((row) => row.optionCode))].sort(),
        capturedAt: sourceRows.reduce((latest, row) =>
          row.capturedAt > latest ? row.capturedAt : latest, first.capturedAt),
      });
    }

    const evidence: MasterProductProfitFactEvidence[] = masterProductIds.map((masterProductId) => ({
      masterProductId,
      mappingStatus: facts.some((fact) => fact.masterProductId === masterProductId)
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
