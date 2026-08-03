import { Injectable } from '@nestjs/common';
import type {
  MasterProductMonthlyProfitFact,
  MasterProductProfitFactEvidence,
  MasterProductProfitFactReadPort,
  MasterProductProfitFactSnapshot,
  OrphanSellpiaProductProfitFact,
} from '../application/port/in/master-product-profit-fact-read.port';
import { PrismaService } from '../../prisma/prisma.service';
import { createSellpiaProductInventoryResolver } from './sellpia-product-inventory-resolver';

type SourceFactRow = Readonly<{
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
    if (masterProductIds.length === 0) return { evidence: [], orphanFacts: [] };
    const months = yearMonthsIntersecting(input.range);
    const [components, candidates, facts] = await Promise.all([
      this.prisma.channelListingOptionInventoryComponent.findMany({
        where: {
          organizationId: input.organizationId,
          channelListingOption: {
            organizationId: input.organizationId,
            isActive: true,
            listing: {
              organizationId: input.organizationId,
              isActive: true,
              masterProductId: { in: masterProductIds },
            },
          },
        },
        select: {
          sellpiaInventorySkuId: true,
          channelListingOption: {
            select: { listing: { select: { masterProductId: true } } },
          },
        },
      }),
      this.prisma.sellpiaInventorySku.findMany({
        where: { organizationId: input.organizationId },
        select: { id: true, code: true, barcode: true, isActive: true },
      }),
      this.prisma.sellpiaProductMonthlySales.findMany({
        where: {
          organizationId: input.organizationId,
          yearMonth: { in: months },
        },
        select: {
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
      }),
    ]);

    const ownersBySku = new Map<string, Set<string>>();
    for (const component of components) {
      const masterProductId = component.channelListingOption.listing.masterProductId;
      if (!masterProductId) continue;
      const owners = ownersBySku.get(component.sellpiaInventorySkuId) ?? new Set();
      owners.add(masterProductId);
      ownersBySku.set(component.sellpiaInventorySkuId, owners);
    }
    const candidateById = new Map(candidates.map((candidate) => [candidate.id, candidate]));
    const mappedSkuIdsByMaster = new Map(masterProductIds.map((id) => [id, new Set<string>()]));
    for (const [skuId, owners] of ownersBySku) {
      const candidate = candidateById.get(skuId);
      if (!candidate?.isActive || owners.size !== 1) continue;
      mappedSkuIdsByMaster.get([...owners][0]!)?.add(skuId);
    }

    const resolver = createSellpiaProductInventoryResolver(candidates);
    const mappedRows = new Map<string, SourceFactRow[]>();
    const orphanFacts: OrphanSellpiaProductProfitFact[] = [];
    for (const sourceFact of facts as SourceFactRow[]) {
      const resolution = resolver(sourceFact);
      if (resolution.status !== 'matched') {
        orphanFacts.push(toOrphan(sourceFact, 'SOURCE_UNMAPPED'));
        continue;
      }
      const owners = ownersBySku.get(resolution.sellpiaInventorySkuId);
      if (!owners || owners.size === 0) {
        orphanFacts.push(toOrphan(sourceFact, 'SOURCE_UNMAPPED'));
        continue;
      }
      if (owners.size !== 1) {
        orphanFacts.push(toOrphan(sourceFact, 'AMBIGUOUS_MASTER_PRODUCT'));
        continue;
      }
      if (!sourceFact.coverageStartDate || !sourceFact.coverageEndDate) {
        orphanFacts.push(toOrphan(sourceFact, 'LEGACY_COVERAGE_MISSING'));
        continue;
      }
      const masterProductId = [...owners][0]!;
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
      mappingStatus: (mappedSkuIdsByMaster.get(masterProductId)?.size ?? 0) > 0
        ? 'MAPPED'
        : 'UNMAPPED',
      mappingInventoryGeneration: null,
      mappingVerifiedAt: null,
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
  return Math.floor((end.getTime() - start.getTime()) / 86_400_000) + 1;
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
