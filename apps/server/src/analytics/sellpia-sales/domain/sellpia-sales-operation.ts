import { KiditemInvalidValueError } from '@kiditem/shared/errors';
import type { OperationStagedChunk, OperationWindow } from '@kiditem/shared/operation';
import {
  SELLPIA_SALES_CHUNK_KIND,
  SellpiaSalesRowSchema,
  SellpiaSalesScopeSchema,
} from '@kiditem/shared/sellpia-operations';
import { z } from 'zod';
import {
  addDays,
  businessDateKey,
  datesInclusive,
  kstBusinessDate,
  parseBusinessDate,
} from '../../../common/kst';
import { classifySellpiaChannelGroup } from './channel-group';

/** 셀피아 판매현황 화면(수집기가 여는 주소). 옛 plan의 `sourcePath` 그대로. */
export const SELLPIA_SALES_SOURCE_PATH = '/sale_summary.html?mode=main_link';
/** 범위를 비우면 오늘(KST)까지 93일(양 끝 포함), 한 번에 100일까지 — 옛 `buildSellpiaSalesSourcePlan` 규칙. */
export const SELLPIA_SALES_DEFAULT_DAYS = 93;
export const SELLPIA_SALES_MAX_DAYS = 100;
const INT4_MAX = 2_147_483_647;

export interface SellpiaSalesPlan {
  sourceOrigin: 'https://kiditem.sellpia.com';
  sourcePath: typeof SELLPIA_SALES_SOURCE_PATH;
  range: { from: string; to: string };
}

const PlanSchema = z.object({
  sourceOrigin: z.literal('https://kiditem.sellpia.com'),
  sourcePath: z.literal(SELLPIA_SALES_SOURCE_PATH),
  range: z.object({ from: z.string(), to: z.string() }).strict(),
}).strict();

/** 원장에 넣는 판매처·일 한 줄(0 이상의 정수로 자른 값). */
export interface SellpiaSalesLedgerRow {
  businessDate: string;
  sellerId: string;
  sellerName: string;
  channelGroup: string;
  revenueKrw: number;
  qty: number;
  costKrw: number;
}

/** scope → plan. `now`는 기본 범위의 끝(오늘 KST)을 정한다. */
export function sellpiaSalesPlan(scope: unknown, now: Date): SellpiaSalesPlan {
  const parsed = SellpiaSalesScopeSchema.safeParse(scope);
  if (!parsed.success) throw invalid('invalid_scope', { errors: issues(parsed.error) });
  const to = parsed.data.endDate ?? businessDateKey(kstBusinessDate(now));
  const toDate = parseBusinessDate(to);
  if (!toDate) throw invalid('invalid_date', { endDate: to });
  const from = parsed.data.startDate ?? businessDateKey(addDays(toDate, -(SELLPIA_SALES_DEFAULT_DAYS - 1)));
  const fromDate = parseBusinessDate(from);
  if (!fromDate || fromDate > toDate) throw invalid('invalid_date', { startDate: from, endDate: to });
  const days = datesInclusive(fromDate, toDate).length;
  if (days > SELLPIA_SALES_MAX_DAYS) throw invalid('window_too_long', { startDate: from, endDate: to, maxDays: SELLPIA_SALES_MAX_DAYS });
  return { sourceOrigin: 'https://kiditem.sellpia.com', sourcePath: SELLPIA_SALES_SOURCE_PATH, range: { from, to } };
}

export function storedSellpiaSalesPlan(plan: unknown): SellpiaSalesPlan {
  const parsed = PlanSchema.safeParse(plan);
  if (!parsed.success) throw invalid('invalid_plan', { errors: issues(parsed.error) });
  return parsed.data;
}

/**
 * 청크 → 바꿔 쓸 창과 원장 줄. 확장이 보낸 조회 창(`window`)은 계획 범위 안이어야 하고, 없으면 계획 범위가 창이다.
 * 줄의 일자는 창 안이어야 하며, 같은 판매처·일은 마지막 값이 남는다(옛 규칙). 빈 줄은 셀피아가 빈 판매현황을 준
 * 것이다 — 수집기는 응답 형식이 맞을 때만 성공으로 끝낸다.
 */
export function sellpiaSalesPublication(
  chunks: readonly OperationStagedChunk[],
  window: OperationWindow | null,
  plan: SellpiaSalesPlan,
): { window: { start: string; end: string }; days: number; rows: SellpiaSalesLedgerRow[] } {
  const range = window ?? { start: plan.range.from, end: plan.range.to };
  if (range.start < plan.range.from || range.end > plan.range.to || range.start > range.end) {
    throw invalid('window_outside_plan', { window: range, plan: plan.range });
  }
  const byKey = new Map<string, SellpiaSalesLedgerRow>();
  for (const chunk of [...chunks].sort((left, right) => left.sequence - right.sequence)) {
    if (chunk.chunkKind !== SELLPIA_SALES_CHUNK_KIND) throw invalid('unexpected_chunk_kind', { chunkKind: chunk.chunkKind });
    const parsed = SellpiaSalesRowSchema.array().safeParse(chunk.payload);
    if (!parsed.success) throw invalid('invalid_sales_rows', { sequence: chunk.sequence, errors: issues(parsed.error) });
    for (const row of parsed.data) {
      if (!parseBusinessDate(row.date)) throw invalid('invalid_date', { date: row.date });
      if (row.date < range.start || row.date > range.end) throw invalid('date_outside_window', { date: row.date, window: range });
      byKey.set(`${row.sellerId}\u0000${row.date}`, {
        businessDate: row.date,
        sellerId: row.sellerId,
        sellerName: row.sellerName,
        channelGroup: classifySellpiaChannelGroup(row.sellerName),
        revenueKrw: boundedInt(row.price),
        qty: boundedInt(row.amount),
        costKrw: boundedInt(row.buyPrice),
      });
    }
  }
  const startDate = parseBusinessDate(range.start)!;
  const endDate = parseBusinessDate(range.end)!;
  return { window: range, days: datesInclusive(startDate, endDate).length, rows: [...byKey.values()] };
}

function boundedInt(value: number): number {
  const rounded = Math.round(value);
  if (rounded <= 0) return 0;
  return Math.min(rounded, INT4_MAX);
}

function issues(error: z.ZodError) {
  return error.issues.slice(0, 5).map((issue) => ({ field: issue.path.join('.'), reason: issue.message }));
}

function invalid(reason: string, details: Record<string, unknown>): KiditemInvalidValueError {
  return new KiditemInvalidValueError('VALIDATION_FAILED', { details: { reason, ...details } });
}
