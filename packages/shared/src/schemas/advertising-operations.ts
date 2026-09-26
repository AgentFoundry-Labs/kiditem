import { z } from 'zod';
import { resourceLockKey, type OperationLockKey } from './operation.js';

/**
 * Advertising 실행 kind(ADR-0025, KID-362 wave3). owner는 Advertising이다(리더 결정 KID-362 2026-09-26 03:43).
 * 여기에는 wire에 함께 쓰는 이름·scope·청크·결과 모양만 둔다. 두 블록(K-a: K1–K5, K-b: K6·K7)은 서로 건드리지 않는다.
 */

// ── K-b: Wing 일별 사실 계열(트래픽 · 아이템위너) ──────────────────────────────────────

/**
 * Wing 일별 사실(`ChannelListingDailySnapshot` 트래픽·아이템위너 열)을 쓰는 kind는 계정마다 하나씩만 돈다.
 * 옛 advisory `lockListingTraffic`("listing-day 트래픽을 쓰는 쪽은 한 번에 하나")을 대신하는 잠금 키다 — K6·K7이 같은 키를 잡는다.
 */
export function wingDailyLockKey(channelAccountId: string): OperationLockKey {
  return resourceLockKey('wing-daily', channelAccountId);
}

// K7 — Wing 아이템위너(`seller-price-management/getProductList`, 읽기 전용)

export const WING_ITEMWINNER_KIND = 'advertising.wing_itemwinner' as const;

/** 시작은 계정만 고른다. 페이지·업무일은 owner plan이 정한다. */
export const WingItemwinnerScopeSchema = z.object({
  channelAccountId: z.string().uuid(),
}).strict();
export type WingItemwinnerScope = z.infer<typeof WingItemwinnerScopeSchema>;

/** 한 번에 읽는 상한(옛 `ITEMWINNER_MAX_ITEMS`). 넘으면 잘린 목록을 완결로 보지 않고 실패한다. */
export const WING_ITEMWINNER_MAX_ITEMS = 1_000;

/** 행 청크(확장 → owner finalize). */
export const WING_ITEMWINNER_CHUNK_KIND = 'itemwinner_rows' as const;
/** 응답 하나의 표식 {totalSize, observedAt}. finalize가 행 수와 대조해 완결을 판정한다. */
export const WING_ITEMWINNER_PAGE_CHUNK_KIND = 'itemwinner_page' as const;

/** Wing 아이템위너 한 행(옛 `normalizeItemwinnerRow`). `isWinner`는 노출제한이 아닌 위너만 true. */
export const WingItemwinnerRowSchema = z.object({
  vendorItemId: z.string().regex(/^\d+$/),
  productName: z.string().min(1).max(80),
  isWinner: z.boolean(),
  myPrice: z.number().int(),
  winnerPrice: z.number().int(),
  salesQty: z.number().int().nonnegative(),
  suppressed: z.boolean(),
  providerWinnerStatus: z.boolean(),
}).strict();
export type WingItemwinnerRow = z.infer<typeof WingItemwinnerRowSchema>;

export const WingItemwinnerPageSchema = z.object({
  totalSize: z.number().int().min(0).max(WING_ITEMWINNER_MAX_ITEMS),
  observedAt: z.string().datetime({ offset: true }),
}).strict();
export type WingItemwinnerPage = z.infer<typeof WingItemwinnerPageSchema>;

/** 한 listing이 이 실행에서 관측된 위너 상태(상태 카드가 읽는다 — 매일 바뀌는 일별 행을 다시 읽지 않는다). */
export const WingItemwinnerListingObservationSchema = z.object({
  listingId: z.string().uuid(),
  isOfferWinner: z.boolean().nullable(),
  lastObservedAt: z.string().datetime({ offset: true }),
}).strict();
export type WingItemwinnerListingObservation = z.infer<typeof WingItemwinnerListingObservationSchema>;

/** owner가 행에서 센 KPI(옛 확장 `itemwinnerKpis`의 세 칸). */
export const WingItemwinnerKpisSchema = z.object({
  winners: z.number().int().nonnegative(),
  suppressed: z.number().int().nonnegative(),
  losers: z.number().int().nonnegative(),
}).strict();
export type WingItemwinnerKpis = z.infer<typeof WingItemwinnerKpisSchema>;

export const WingItemwinnerResultSchema = z.object({
  channelAccountId: z.string().uuid(),
  businessDate: z.string().date(),
  observedAt: z.string().datetime({ offset: true }),
  rowCount: z.number().int().nonnegative(),
  matchedCount: z.number().int().nonnegative(),
  unmatchedCount: z.number().int().nonnegative(),
  kpis: WingItemwinnerKpisSchema,
  listingObservations: z.array(WingItemwinnerListingObservationSchema),
}).strict();
export type WingItemwinnerResult = z.infer<typeof WingItemwinnerResultSchema>;

