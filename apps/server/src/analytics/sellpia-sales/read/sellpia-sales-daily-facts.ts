import { Prisma } from '@prisma/client';
import { SELLPIA_SALES_KIND } from '@kiditem/shared/sellpia-operations';
import { FactInputError } from '../../../common/errors/fact-errors';
import { businessDateKey, datesInclusive, parseBusinessDate } from '../../../common/kst';
import { readSucceededOperationWindows } from '../../../common/operation/transaction/succeeded-operation-windows';

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

/**
 * 셀피아 매출 사실(KID-361 J2). 날짜가 덮였다 = 성공한 `analytics.sellpia_sales` 실행의 창이 그 날을 덮었다(실행 창이
 * 옛 가짜 판매처 줄 대신 커버리지다). 창 바꿔 쓰기라 덮인 날의 실행 줄(`operationId` 있음)이 곧 그날의 사실이고, 옛 run
 * 줄은 읽지 않는다. 호출자 트랜잭션 안에서 도는 평범한 함수다.
 */
export async function readSellpiaSalesDailyFacts(
  tx: Prisma.TransactionClient,
  input: Readonly<{ organizationId: string; from: string; to: string }>,
): Promise<SellpiaSalesDailyFacts> {
  const from = parseBusinessDate(input.from);
  const to = parseBusinessDate(input.to);
  if (!from || !to || from > to) throw new FactInputError('INVALID_DATE_RANGE');

  const windows = await readSucceededOperationWindows(tx, {
    organizationId: input.organizationId,
    kinds: [SELLPIA_SALES_KIND],
    firstDate: input.from,
    lastDate: input.to,
  });
  if (windows.length === 0) return emptyFacts();
  const covered = new Set<string>();
  let latestFinishedAt: Date | null = null;
  for (const window of windows) {
    const start = window.windowStart > from ? window.windowStart : from;
    const end = window.windowEnd < to ? window.windowEnd : to;
    if (start > end) continue;
    for (const date of datesInclusive(start, end)) covered.add(businessDateKey(date));
    if (window.finishedAt && (!latestFinishedAt || window.finishedAt > latestFinishedAt)) latestFinishedAt = window.finishedAt;
  }

  const rows = await tx.sellpiaSalesDailySnapshot.findMany({
    where: {
      organizationId: input.organizationId,
      operationId: { not: null },
      businessDate: { gte: from, lte: to },
    },
    select: {
      businessDate: true,
      sellerId: true,
      sellerName: true,
      channelGroup: true,
      revenueKrw: true,
      qty: true,
      costKrw: true,
      capturedAt: true,
    },
    orderBy: [{ businessDate: 'asc' }, { sellerId: 'asc' }],
  });

  const rowsByDate = new Map<string, SellpiaSalesDailyFact[]>();
  for (const row of rows) {
    const date = businessDateKey(row.businessDate);
    if (!covered.has(date)) continue;
    const group = rowsByDate.get(date) ?? [];
    group.push(row);
    rowsByDate.set(date, group);
  }

  const facts: SellpiaSalesDailyFact[] = [];
  const includedDates: string[] = [];
  const invalidDates: string[] = [];
  let latestCapturedAt: Date | null = null;
  for (const date of [...covered].sort()) {
    const dayRows = rowsByDate.get(date) ?? [];
    if (dayRows.some((row) => !validRow(row))) {
      invalidDates.push(date);
      continue;
    }
    includedDates.push(date);
    for (const row of dayRows) {
      if (!latestCapturedAt || row.capturedAt > latestCapturedAt) latestCapturedAt = row.capturedAt;
      facts.push(row);
    }
  }

  // 줄이 없는 창(빈 판매현황)은 그 창을 덮은 실행이 끝난 시각이 마지막 수집 시각이다.
  return { facts, coverage: { includedDates, invalidDates }, latestCapturedAt: latestCapturedAt ?? latestFinishedAt };
}

function validRow(row: SellpiaSalesDailyFact): boolean {
  return [row.revenueKrw, row.qty, row.costKrw].every((value) => Number.isFinite(value) && value >= 0);
}

function emptyFacts(): SellpiaSalesDailyFacts {
  return {
    facts: [],
    coverage: { includedDates: [], invalidDates: [] },
    latestCapturedAt: null,
  };
}
