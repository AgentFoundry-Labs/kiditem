import { KiditemInvalidValueError } from '@kiditem/shared/errors';
import { businessDateKey, kstBusinessDate } from '@kiditem/shared/common';
import type { OperationStagedChunk, OperationWindow } from '@kiditem/shared/operation';
import {
  COUPANG_REVIEWS_CHUNK_KIND,
  COUPANG_REVIEWS_WINDOW_CHUNK_KIND,
  CoupangReviewsChunkItemSchema,
  CoupangReviewsWindowDoneSchema,
  type CoupangReviewsChunkItem,
  type CoupangReviewsWindow,
  type CoupangReviewsWindowDone,
} from '@kiditem/shared/reviews';
import type { z } from 'zod';

/**
 * 쿠팡 상품평 수집의 월 창(KST 달력), 최신 달부터 `months`개. Wing 상품평 조회는 한 번에 1개월까지만
 * 받으므로 달마다 나눈다. 이번 달은 오늘까지, 지난 달은 말일까지.
 */
export function coupangReviewMonthWindows(months: number, now: Date): CoupangReviewsWindow[] {
  const [year, month, day] = businessDateKey(kstBusinessDate(now)).split('-').map(Number) as [number, number, number];
  return Array.from({ length: months }, (_, index) => {
    const cursor = new Date(Date.UTC(year, month - 1 - index, 1));
    const cursorYear = cursor.getUTCFullYear();
    const cursorMonth = cursor.getUTCMonth() + 1;
    const lastDay = new Date(Date.UTC(cursorYear, cursorMonth, 0)).getUTCDate();
    const endDay = index === 0 ? day : lastDay;
    const label = `${cursorYear}-${pad2(cursorMonth)}`;
    return {
      index,
      label,
      start: `${label}-01T00:00:00+09:00`,
      end: `${label}-${pad2(endDay)}T23:59:59+09:00`,
    };
  });
}

/** 실행이 다루는 업무일 범위: 가장 오래된 창의 시작 ~ 가장 최근 창의 끝. */
export function coupangReviewOperationWindow(windows: readonly CoupangReviewsWindow[]): OperationWindow {
  const oldest = windows[windows.length - 1]!;
  const latest = windows[0]!;
  return { start: oldest.start.slice(0, 10), end: latest.end.slice(0, 10) };
}

/**
 * 창별 완결 판정. 계획의 창마다 표식이 정확히 하나 있고, 표식의 `items`가 그 창에서 올린 리뷰 수와 같아야 한다.
 * 계획에 없는 창의 리뷰·표식, 페이지 상한을 넘은 표식도 미완결이다. 통과하면 리뷰를 externalReviewId로
 * 한 번씩만(마지막 값) 돌려준다.
 */
export function completeCoupangReviews(input: {
  windows: readonly CoupangReviewsWindow[];
  maxPagesPerWindow: number;
  reviews: readonly CoupangReviewsChunkItem[];
  windowDones: readonly CoupangReviewsWindowDone[];
}): CoupangReviewsChunkItem[] {
  const planned = new Set(input.windows.map((window) => window.index));
  const counts = new Map<number, number>();
  for (const item of input.reviews) {
    if (!planned.has(item.windowIndex)) throw incomplete({ windowIndex: item.windowIndex });
    counts.set(item.windowIndex, (counts.get(item.windowIndex) ?? 0) + 1);
  }
  const dones = new Map<number, CoupangReviewsWindowDone>();
  for (const done of input.windowDones) {
    if (!planned.has(done.index) || dones.has(done.index) || done.pages > input.maxPagesPerWindow) {
      throw incomplete({ windowIndex: done.index });
    }
    dones.set(done.index, done);
  }
  for (const window of input.windows) {
    const done = dones.get(window.index);
    if (!done || done.items !== (counts.get(window.index) ?? 0)) throw incomplete({ windowIndex: window.index });
  }
  const byId = new Map<string, CoupangReviewsChunkItem>();
  for (const item of input.reviews) byId.set(item.externalReviewId, item);
  return [...byId.values()];
}

/**
 * 실행 청크를 리뷰 항목과 창 표식으로 읽는다. 이 kind의 청크는 `reviews`·`review_windows` 둘뿐이고,
 * 항목은 shared 스키마를 통과해야 한다. 아니면 VALIDATION_FAILED(`unknown_chunk_kind`·`invalid_chunk_item`).
 */
export function readCoupangReviewChunks(chunks: readonly OperationStagedChunk[]): {
  reviews: CoupangReviewsChunkItem[];
  windowDones: CoupangReviewsWindowDone[];
} {
  const unknown = chunks.find((chunk) => chunk.chunkKind !== COUPANG_REVIEWS_CHUNK_KIND && chunk.chunkKind !== COUPANG_REVIEWS_WINDOW_CHUNK_KIND);
  if (unknown) throw invalid('unknown_chunk_kind', { chunkKind: unknown.chunkKind });
  return {
    reviews: chunkItems(chunks, COUPANG_REVIEWS_CHUNK_KIND, CoupangReviewsChunkItemSchema),
    windowDones: chunkItems(chunks, COUPANG_REVIEWS_WINDOW_CHUNK_KIND, CoupangReviewsWindowDoneSchema),
  };
}

function chunkItems<S extends z.ZodTypeAny>(chunks: readonly OperationStagedChunk[], chunkKind: string, schema: S): Array<z.output<S>> {
  const items: Array<z.output<S>> = [];
  for (const chunk of chunks) {
    if (chunk.chunkKind !== chunkKind) continue;
    for (const raw of chunk.payload) {
      const parsed = schema.safeParse(raw);
      if (!parsed.success) {
        throw invalid('invalid_chunk_item', {
          chunkKind,
          errors: parsed.error.issues.map((issue) => ({ field: issue.path.join('.'), reason: issue.message })),
        });
      }
      items.push(parsed.data);
    }
  }
  return items;
}

function invalid(reason: string, details: Record<string, unknown>): KiditemInvalidValueError {
  return new KiditemInvalidValueError('VALIDATION_FAILED', { details: { reason, ...details } });
}

function incomplete(details: { windowIndex: number }): KiditemInvalidValueError {
  return new KiditemInvalidValueError('VALIDATION_FAILED', { details: { reason: 'review_window_incomplete', ...details } });
}

function pad2(value: number): string {
  return String(value).padStart(2, '0');
}
