import { Prisma } from '@prisma/client';
import { SOURCE_IMPORT_RUN_COMPLETED_STATUS } from '@kiditem/shared/source-import';
import { FactInputError } from '../../../common/errors/fact-errors';
import { businessDateKey, parseBusinessDate } from '../../../common/kst';
import { SELLPIA_SALES_COVERAGE_SELLER_ID } from '../domain/snapshot-coverage';
import { SELLPIA_SALES_SOURCE_TYPE } from '../domain/sellpia-sales-source';

export type SellpiaSalesDailyFact = Readonly<{
  businessDate: Date;
  sellerId: string;
  sellerName: string;
  channelGroup: string;
  revenueKrw: number;
  qty: number;
  costKrw: number;
  capturedAt: Date;
}>;

export type SellpiaSalesDailyFacts = Readonly<{
  facts: SellpiaSalesDailyFact[];
  coverage: Readonly<{
    includedDates: string[];
    invalidDates: string[];
  }>;
  latestCapturedAt: Date | null;
}>;

type SelectedRow = SellpiaSalesDailyFact & Readonly<{ sourceImportRunId: string | null }>;

export async function readSellpiaSalesDailyFacts(
  tx: Prisma.TransactionClient,
  input: Readonly<{ organizationId: string; from: string; to: string }>,
): Promise<SellpiaSalesDailyFacts> {
  const from = parseBusinessDate(input.from);
  const to = parseBusinessDate(input.to);
  if (!from || !to || from > to) throw new FactInputError('INVALID_DATE_RANGE');

  const runs = await tx.sourceImportRun.findMany({
    where: {
      organizationId: input.organizationId,
      sourceType: SELLPIA_SALES_SOURCE_TYPE,
      status: SOURCE_IMPORT_RUN_COMPLETED_STATUS,
      publicationSequence: { not: null },
    },
    orderBy: { publicationSequence: 'desc' },
    select: { id: true },
  });
  if (runs.length === 0) return emptyFacts();

  const rows: SelectedRow[] = await tx.sellpiaSalesDailySnapshot.findMany({
    where: {
      organizationId: input.organizationId,
      sourceImportRunId: { in: runs.map((run) => run.id) },
      businessDate: { gte: from, lte: to },
    },
    select: {
      sourceImportRunId: true,
      businessDate: true,
      sellerId: true,
      sellerName: true,
      channelGroup: true,
      revenueKrw: true,
      qty: true,
      costKrw: true,
      capturedAt: true,
    },
    orderBy: { businessDate: 'asc' },
  });

  const rowsByRunAndDate = new Map<string, SelectedRow[]>();
  for (const row of rows) {
    if (!row.sourceImportRunId) continue;
    const date = businessDateKey(row.businessDate);
    const key = `${row.sourceImportRunId}\u0000${date}`;
    const group = rowsByRunAndDate.get(key) ?? [];
    group.push(row);
    rowsByRunAndDate.set(key, group);
  }

  const facts: SellpiaSalesDailyFact[] = [];
  const includedDates: string[] = [];
  const invalidDates: string[] = [];
  let latestCapturedAt: Date | null = null;
  const dates = [...new Set(rows.map((row) => businessDateKey(row.businessDate)))].sort();
  for (const date of dates) {
    const selectedRun = runs.find((run) =>
      rowsByRunAndDate.get(`${run.id}\u0000${date}`)?.some(
        (row) => row.sellerId === SELLPIA_SALES_COVERAGE_SELLER_ID,
      ));
    if (!selectedRun) continue;
    const selectedRows = rowsByRunAndDate.get(`${selectedRun.id}\u0000${date}`) ?? [];
    if (selectedRows.some((row) => !validRow(row))) {
      invalidDates.push(date);
      continue;
    }
    includedDates.push(date);
    for (const row of selectedRows) {
      if (!latestCapturedAt || row.capturedAt > latestCapturedAt) latestCapturedAt = row.capturedAt;
      if (row.sellerId === SELLPIA_SALES_COVERAGE_SELLER_ID) continue;
      const { sourceImportRunId: _sourceImportRunId, ...fact } = row;
      facts.push(fact);
    }
  }

  return { facts, coverage: { includedDates, invalidDates }, latestCapturedAt };
}

function validRow(row: SelectedRow): boolean {
  if (![row.revenueKrw, row.qty, row.costKrw].every((value) => Number.isFinite(value) && value >= 0)) {
    return false;
  }
  return row.sellerId !== SELLPIA_SALES_COVERAGE_SELLER_ID
    || (row.revenueKrw === 0 && row.qty === 0 && row.costKrw === 0);
}

function emptyFacts(): SellpiaSalesDailyFacts {
  return {
    facts: [],
    coverage: { includedDates: [], invalidDates: [] },
    latestCapturedAt: null,
  };
}
