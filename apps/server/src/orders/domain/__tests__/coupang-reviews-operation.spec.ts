import { describe, expect, it } from 'vitest';
import { KiditemInvalidValueError } from '@kiditem/shared/errors';
import type { CoupangReviewsChunkItem, CoupangReviewsWindowDone } from '@kiditem/shared/reviews';
import {
  completeCoupangReviews,
  coupangReviewMonthWindows,
  coupangReviewOperationWindow,
  readCoupangReviewChunks,
} from '../coupang-reviews-operation';

describe('쿠팡 상품평 월 창', () => {
  it('KST 오늘 기준 최신 달부터: 이번 달은 오늘까지, 지난 달은 말일까지(연 경계 포함)', () => {
    // UTC 1월 15일 16시 = KST 1월 16일 01시
    const windows = coupangReviewMonthWindows(3, new Date('2026-01-15T16:00:00.000Z'));
    expect(windows).toEqual([
      { index: 0, label: '2026-01', start: '2026-01-01T00:00:00+09:00', end: '2026-01-16T23:59:59+09:00' },
      { index: 1, label: '2025-12', start: '2025-12-01T00:00:00+09:00', end: '2025-12-31T23:59:59+09:00' },
      { index: 2, label: '2025-11', start: '2025-11-01T00:00:00+09:00', end: '2025-11-30T23:59:59+09:00' },
    ]);
    expect(coupangReviewOperationWindow(windows)).toEqual({ start: '2025-11-01', end: '2026-01-16' });
  });
});

const WINDOWS = coupangReviewMonthWindows(2, new Date('2026-09-25T03:00:00.000Z'));

function item(externalReviewId: string, windowIndex: number, content = externalReviewId): CoupangReviewsChunkItem {
  return {
    externalReviewId, externalOptionId: null, externalProductId: null, itemName: null, rating: 5, title: null,
    content, reviewerName: null, reviewedAt: 1_756_700_000_000, imageCount: 0, videoCount: 0, isDeleted: false,
    isBlinded: false, windowIndex,
  };
}

function reason(run: () => unknown): unknown {
  try {
    run();
  } catch (error) {
    expect(error).toBeInstanceOf(KiditemInvalidValueError);
    return (error as KiditemInvalidValueError).details?.reason;
  }
  throw new Error('did not throw');
}

describe('쿠팡 상품평 창 완결 판정', () => {
  const complete = (reviews: CoupangReviewsChunkItem[], windowDones: CoupangReviewsWindowDone[], maxPagesPerWindow = 40) =>
    completeCoupangReviews({ windows: WINDOWS, maxPagesPerWindow, reviews, windowDones });
  const bothDone = (first: number, second: number): CoupangReviewsWindowDone[] => [
    { index: 0, pages: 1, items: first },
    { index: 1, pages: 1, items: second },
  ];

  it('창마다 표식 하나, 표식 items = 그 창 리뷰 수면 통과하고 같은 리뷰는 마지막 값 하나', () => {
    const items = complete([item('a', 0, 'old'), item('b', 1), item('a', 0, 'new')], bothDone(2, 1));
    expect(items.map((review) => [review.externalReviewId, review.content])).toEqual([['a', 'new'], ['b', 'b']]);
  });

  it.each([
    ['계획에 없는 창의 리뷰', () => complete([item('a', 2)], bothDone(0, 0))],
    ['계획에 없는 창의 표식', () => complete([], [...bothDone(0, 0), { index: 2, pages: 1, items: 0 }])],
    ['같은 창 표식 중복', () => complete([], [...bothDone(0, 0), { index: 0, pages: 1, items: 0 }])],
    ['쪽 상한을 넘은 표식', () => complete([], [{ index: 0, pages: 3, items: 0 }, { index: 1, pages: 1, items: 0 }], 2)],
    ['빠진 표식', () => complete([item('a', 0)], [{ index: 0, pages: 1, items: 1 }])],
    ['표식 items와 리뷰 수 불일치', () => complete([item('a', 0)], bothDone(2, 0))],
  ])('%s → review_window_incomplete', (_name, run) => {
    expect(reason(run)).toBe('review_window_incomplete');
  });
});

describe('쿠팡 상품평 청크 읽기', () => {
  const chunk = (chunkKind: string, payload: unknown[], sequence = 1) => ({ chunkKind, sequence, itemCount: payload.length, payload });

  it('reviews 청크 항목과 review_windows 표식을 나눠 읽는다', () => {
    const read = readCoupangReviewChunks([
      chunk('reviews', [item('a', 0)]),
      chunk('review_windows', [{ index: 0, pages: 1, items: 1 }]),
    ]);
    expect(read.reviews.map((review) => review.externalReviewId)).toEqual(['a']);
    expect(read.windowDones).toEqual([{ index: 0, pages: 1, items: 1 }]);
  });

  it('알 수 없는 chunkKind → unknown_chunk_kind', () => {
    expect(reason(() => readCoupangReviewChunks([chunk('echo', [{}])]))).toBe('unknown_chunk_kind');
  });

  it('스키마에 맞지 않는 항목 → invalid_chunk_item', () => {
    expect(reason(() => readCoupangReviewChunks([chunk('reviews', [{ ...item('a', 0), rating: 9 }])]))).toBe('invalid_chunk_item');
    expect(reason(() => readCoupangReviewChunks([chunk('review_windows', [{ index: 0, pages: 1 }])]))).toBe('invalid_chunk_item');
  });
});
