import {
  COUPANG_REVIEWS_CHUNK_ITEMS,
  COUPANG_REVIEWS_CHUNK_KIND,
  COUPANG_REVIEWS_KIND,
  COUPANG_REVIEWS_WINDOW_CHUNK_KIND,
  CoupangReviewsWindowSchema,
  type CoupangReviewsChunkItem,
  type CoupangReviewsProgress,
  type CoupangReviewsWindowDone,
  type ReviewIngestItem,
} from '@kiditem/shared/reviews';
import { z } from 'zod';
import { RuntimeError } from '../../core/errors';
import type { CollectedChunk, Collector } from '../collector';
import { registerCollector } from '../index';

/** 이 수집기가 Wing에서 쓰는 것(`sites/wing/reviews.ts`의 `wing-reviews`가 구현, 입구가 넘긴다). */
export interface WingReviewsSite {
  /** 창(`start`·`end`) 안의 `pageIndex`쪽(0부터, 50건). `totalPages`는 Wing pagination 그대로. */
  searchReviews(input: { start: string; end: string; pageIndex: number }): Promise<{ items: ReviewIngestItem[]; totalPages: number }>;
}

const CoupangReviewsPlanSchema = z.object({
  channelAccountId: z.string().uuid(),
  windows: z.array(CoupangReviewsWindowSchema).min(1),
  maxPagesPerWindow: z.number().int().min(1),
});
export type CoupangReviewsPlan = z.infer<typeof CoupangReviewsPlanSchema>;

/** 한 창이 쪽 상한보다 길다 — 잘린 창을 완결로 보고하지 않고 실행을 실패시킨다. */
export const COUPANG_REVIEWS_PAGE_LIMIT_REACHED = 'RUNTIME_PAGE_LIMIT_REACHED' as const;
const RUNTIME_PLAN_INVALID = 'RUNTIME_PLAN_INVALID' as const;

/**
 * `orders.coupang_reviews`(KID-359): 서버 plan의 월 창을 차례로 Wing 상품평 검색으로 읽는다. 창마다 최대
 * `maxPagesPerWindow`쪽, 200개씩 `reviews` 청크(항목마다 windowIndex)를 내고, 창을 다 읽으면 `review_windows`
 * 표식 {index, pages, items}을 낸다. 완결 판정은 서버 finalize가 청크 합계와 표식을 대조해 한다.
 * progress `{current, windows[]}`는 화면·임대용이다.
 */
export const coupangReviewsCollector: Collector<CoupangReviewsPlan, Record<string, unknown>, WingReviewsSite> = {
  kind: COUPANG_REVIEWS_KIND,
  site: 'wing-reviews',
  async *collect(rawPlan, site, { signal }) {
    const parsed = CoupangReviewsPlanSchema.safeParse(rawPlan);
    if (!parsed.success) throw new RuntimeError(RUNTIME_PLAN_INVALID, '상품평 수집 계획이 올바르지 않습니다.', { kind: COUPANG_REVIEWS_KIND });
    if (!site) throw new RuntimeError(RUNTIME_PLAN_INVALID, 'Wing 사이트를 쓸 수 없습니다.', { kind: COUPANG_REVIEWS_KIND });
    const plan = parsed.data;
    const done: CoupangReviewsProgress['windows'] = [];
    for (const window of plan.windows) {
      const status = { index: window.index, pages: 0, items: 0, done: false };
      const progress = (current: string | null): CoupangReviewsProgress => ({ current, windows: [...done, { ...status }] });
      let buffer: CoupangReviewsChunkItem[] = [];
      for (let pageIndex = 0; ; pageIndex += 1) {
        if (signal.aborted) return;
        if (pageIndex >= plan.maxPagesPerWindow) {
          throw new RuntimeError(COUPANG_REVIEWS_PAGE_LIMIT_REACHED, `${window.label} 상품평이 ${plan.maxPagesPerWindow}쪽을 넘습니다.`, {
            windowIndex: window.index,
          });
        }
        const page = await site.searchReviews({ start: window.start, end: window.end, pageIndex });
        status.pages += 1;
        for (const item of page.items) {
          buffer.push({ ...item, windowIndex: window.index });
          status.items += 1;
          if (buffer.length === COUPANG_REVIEWS_CHUNK_ITEMS) {
            yield reviewsChunk(buffer, progress(window.label));
            buffer = [];
          }
        }
        if (pageIndex + 1 >= page.totalPages) break;
      }
      if (signal.aborted) return;
      if (buffer.length > 0) yield reviewsChunk(buffer, progress(window.label));
      status.done = true;
      done.push({ ...status });
      const last = window === plan.windows[plan.windows.length - 1];
      const marker: CoupangReviewsWindowDone = { index: status.index, pages: status.pages, items: status.items };
      yield { chunkKind: COUPANG_REVIEWS_WINDOW_CHUNK_KIND, payload: [marker], progress: { current: last ? null : window.label, windows: [...done] } };
    }
  },
};

function reviewsChunk(payload: CoupangReviewsChunkItem[], progress: CoupangReviewsProgress): CollectedChunk {
  return { chunkKind: COUPANG_REVIEWS_CHUNK_KIND, payload, progress };
}

registerCollector(coupangReviewsCollector);
