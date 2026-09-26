import type { ReviewIngestItem } from '@kiditem/shared/reviews';
import { RuntimeError } from '../../core/errors';
import { SITE_REQUEST_FAILED, createSiteCaller, type SiteCaller, type SiteCallerOptions } from '../../core/site-caller';
import { registerSite } from '../registry';
import { wingCallerWithLogin } from './login';

/**
 * Wing 상품평 화면(`/tenants/cs/product/review`)이 쓰는 내부 검색 API. 쿠팡은 판매자 상품평을 Open API로
 * 주지 않는다. 읽기 전용이다.
 *
 * 라이브에서 확인한 Wing 제약(옛 `coupang-review-collector.js`):
 * - `startTime`~`endTime`은 1개월 이내여야 한다 → 월 창은 서버 owner가 나눈다.
 * - `pageSize` 상한은 50이다(100은 거절).
 * - `salesStatus: ""`가 판매중 + 판매중지 전체다(화면 기본값 "true"는 판매중지 상품을 빠뜨린다).
 * - XSRF 헤더는 필요 없다(쿠키만으로 200).
 *
 * 호출기 옵션(간격 350ms)이 카탈로그의 `wing`과 달라 사이트 이름 `wing-reviews`로 따로 등록한다(KID-355).
 */
export const WING_ORIGIN = 'https://wing.coupang.com';
export const WING_REVIEW_SEARCH_URL = `${WING_ORIGIN}/tenants/cs/product/review/search`;
export const WING_REVIEW_PAGE_SIZE = 50;
export const WING_REVIEW_CALLER: SiteCallerOptions = { minIntervalMs: 350 };
/** 요청 하나의 시간 상한(옛 수집기와 같음). 멈춘 응답이 heartbeat로 잠금을 끝없이 연장하지 않게 끊는다. */
export const WING_REVIEW_TIMEOUT_MS = 20_000;

export interface WingReviewPage {
  items: ReviewIngestItem[];
  totalPages: number;
}

interface WingReviewSearchBody {
  code?: unknown;
  message?: unknown;
  data?: { content?: unknown; pagination?: { totalPages?: unknown } };
}

/** 창(`start`·`end`, KST 날짜가 앞 10자) 안의 `pageIndex`쪽(0부터). */
export async function searchWingReviews(
  caller: SiteCaller,
  input: { start: string; end: string; pageIndex: number },
  options: { timeoutMs?: number } = {},
): Promise<WingReviewPage> {
  const body = await caller.json<WingReviewSearchBody>(WING_REVIEW_SEARCH_URL, {
    method: 'POST',
    signal: AbortSignal.timeout(options.timeoutMs ?? WING_REVIEW_TIMEOUT_MS),
    headers: { Accept: 'application/json, text/plain, */*', 'Content-Type': 'application/json' },
    body: JSON.stringify({
      startTime: input.start.slice(0, 10),
      endTime: input.end.slice(0, 10),
      rating: '',
      salesStatus: '',
      advancedType: 'productName',
      advancedInput: '',
      pageIndex: input.pageIndex,
      pageSize: WING_REVIEW_PAGE_SIZE,
      productName: '',
    }),
  });
  if (body?.code !== 'OK') {
    const message = typeof body?.message === 'string' && body.message ? body.message : '알 수 없는 응답';
    throw new RuntimeError(SITE_REQUEST_FAILED, `Wing 상품평 조회가 거절됐습니다: ${message}`, {
      reason: 'wing_review_rejected',
      url: WING_REVIEW_SEARCH_URL,
    });
  }
  const content = Array.isArray(body.data?.content) ? body.data.content : [];
  const items = content.map(normalizeWingReview).filter((item): item is ReviewIngestItem => item !== null);
  const totalPages = Number(body.data?.pagination?.totalPages);
  return { items, totalPages: Number.isSafeInteger(totalPages) && totalPages > 0 ? totalPages : 0 };
}

/** Wing 상품평 한 행 → ingest 항목. reviewId·별점(1~5)·작성 시각이 없으면 버린다. */
export function normalizeWingReview(value: unknown): ReviewIngestItem | null {
  if (!value || typeof value !== 'object') return null;
  const raw = value as Record<string, unknown>;
  if (raw.reviewId === null || raw.reviewId === undefined) return null;
  const rating = Number(raw.rating);
  if (!Number.isFinite(rating) || rating < 1 || rating > 5) return null;
  const reviewedAt = Number(raw.reviewAt || raw.createdAt || 0);
  if (!Number.isFinite(reviewedAt) || reviewedAt <= 0) return null;
  const attachment = attachmentCounts(raw.attachment);
  return {
    externalReviewId: String(raw.reviewId),
    externalOptionId: raw.vendorItemId === null || raw.vendorItemId === undefined ? null : String(raw.vendorItemId),
    externalProductId: raw.productId === null || raw.productId === undefined ? null : String(raw.productId),
    itemName: text(raw.itemName),
    rating: Math.round(rating),
    title: text(raw.reviewTitle),
    content: text(raw.reviewContent),
    reviewerName: text(raw.memberName),
    reviewedAt: Math.trunc(reviewedAt),
    imageCount: attachment.images,
    videoCount: attachment.videos,
    isDeleted: raw.deleted === true,
    isBlinded: raw.blinded === true,
  };
}

function attachmentCounts(value: unknown): { images: number; videos: number } {
  if (typeof value !== 'string' || !value) return { images: 0, videos: 0 };
  try {
    const parsed = JSON.parse(value) as { imageAttachments?: unknown; videoAttachments?: unknown };
    return {
      images: Array.isArray(parsed?.imageAttachments) ? parsed.imageAttachments.length : 0,
      videos: Array.isArray(parsed?.videoAttachments) ? parsed.videoAttachments.length : 0,
    };
  } catch {
    return { images: 0, videos: 0 };
  }
}

function text(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed || null;
}

/** 상품평 수집기(`collectors/orders.coupang_reviews`)에 넘길 핸들. 입구가 이 파일의 호출기 옵션으로 만든 호출기를 준다. */
export function createWingReviewsSite(caller: SiteCaller): {
  searchReviews(input: { start: string; end: string; pageIndex: number }): Promise<WingReviewPage>;
} {
  return { searchReviews: (input) => searchWingReviews(caller, input) };
}

// 상품평은 서비스워커에서 Wing 쿠키로 부른다(KID-359). `account:` 잠금은 윙 탭을 연다.
registerSite({
  name: 'wing-reviews',
  origin: WING_ORIGIN,
  create: (deps, lease) => createWingReviewsSite(wingCallerWithLogin(createSiteCaller(WING_REVIEW_CALLER, deps), deps, lease)),
});
