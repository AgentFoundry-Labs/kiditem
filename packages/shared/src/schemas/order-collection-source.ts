import { z } from 'zod';
import { zIsoDate } from './common.js';

/**
 * 주문 쪽 수집 원천의 현재 상태. KID-147 공용 시작 컨트롤이 원천마다 같은 모양으로
 * 읽으므로 몰 주문·쿠팡 직배송·셀피아 배송 추적이 이 한 계약을 함께 쓴다.
 *
 * 시도 토큰은 절대 담지 않는다. fence 토큰은 확장이 부르는 제어 읽기
 * (`…/attempts/:id` · `…/attempts/:id/control`)에만 나간다.
 */
export const CollectionSourceRunningSchema = z.object({
  attemptId: z.string().uuid(),
  /** 몰 주문은 browser|manual-upload, 직배송은 browser, 원천에 모드가 없으면 null. */
  collectionMode: z.string().min(1).max(40).nullable(),
  startedAt: zIsoDate,
  expiresAt: zIsoDate.nullable(),
}).strict();
export type CollectionSourceRunning = z.infer<typeof CollectionSourceRunningSchema>;

export const CollectionSourceLastCompleteSchema = z.object({
  attemptId: z.string().uuid(),
  completedAt: zIsoDate.nullable(),
  /** 발행 번호를 매기는 owner만 채운다. 주문 쪽 owner 3개는 아직 null이다. */
  publicationSequence: z.string().regex(/^\d+$/).nullable(),
}).strict();
export type CollectionSourceLastComplete = z.infer<typeof CollectionSourceLastCompleteSchema>;

export const CollectionSourceLastAttemptSchema = z.object({
  attemptId: z.string().uuid(),
  state: z.enum(['RUNNING', 'COMPLETE', 'FAILED']),
  errorCode: z.string().max(100).nullable(),
  errorMessage: z.string().max(500).nullable(),
  endedAt: zIsoDate.nullable(),
}).strict();
export type CollectionSourceLastAttempt = z.infer<typeof CollectionSourceLastAttemptSchema>;

/**
 * 범위 필드(`mallKey`·`channelAccountId`)는 세 원천 모두 같은 자리에 두고, 그 원천에
 * 없는 범위는 null이다. 화면 어댑터가 원천마다 다른 모양을 분기하지 않게 한다.
 *
 * `GET /api/orders/collection/sources`가 돌려주는 몰 칸 중 `channelAccountId`가 null인
 * 것은 이 조직이 아직 설정하지 않은 레지스트리 몰(ChannelAccount 행이 없다)이라, 화면이
 * 그 몰의 시작을 부르지 않고 설정 안내로 거절한다. 나머지 두 원천은 이 모양을 내지 않는다.
 */
export const OrderCollectionSourceStatusSchema = z.object({
  mallKey: z.string().min(1).max(100).nullable(),
  channelAccountId: z.string().uuid().nullable(),
  running: CollectionSourceRunningSchema.nullable(),
  lastComplete: CollectionSourceLastCompleteSchema.nullable(),
  lastAttempt: CollectionSourceLastAttemptSchema.nullable(),
}).strict();
export type OrderCollectionSourceStatus = z.infer<typeof OrderCollectionSourceStatusSchema>;

/**
 * 한 수집이 실어 온 **주문 건수**. 셀피아 양식은 주문 한 건에 주문 줄 하나와 상품 줄 여럿을
 * 쓰므로, 출력 줄에서 상품 줄을 뺀 것이 주문 수다(아이스크림몰 실측 2026-09-22: 출력 32 ·
 * 상품 17 · 주문 15).
 *
 * 주문수집 화면과 대시보드의 '오늘 주문'이 같은 수를 말하려면 둘 다 이 규칙을 읽어야 한다.
 * 출력 줄을 그대로 주문 수로 쓰면 상품 줄만큼 부풀어 오른다(사장님 2026-09-22: 63 대 82).
 *
 * 둘 중 하나라도 모르면 `null` — 0 은 "걷었는데 없었다"이지 "모른다"가 아니다.
 */
export function orderCollectionOrderCount(
  rows: Readonly<{ outputRows: number | null; productRows: number | null }>,
): number | null {
  if (rows.outputRows === null || rows.productRows === null) return null;
  const orders = rows.outputRows - rows.productRows;
  return orders >= 0 ? orders : null;
}

/**
 * 오늘 수집이 실어 온 주문 수 — **서버 기록**이다. 브라우저에 남은 변환 파일이 아니라서 어느
 * PC 에서 열어도 같고, 대시보드의 '오늘 주문' 과 같은 사실을 읽는다(사장님 2026-09-22).
 *
 * 몰마다 **마지막 수집 한 번만** 센다. 같은 몰을 두 번 걷어도 주문이 불어나지 않는다.
 * 오늘 완료된 수집이 하나도 없으면 `total` 은 `null` — 0 은 "걷었는데 없었다"이다.
 */
export const OrderCollectionTodayOrdersSchema = z.object({
  total: z.number().int().nonnegative().nullable(),
  /** 몰 키 → 그 몰이 오늘 실어 온 주문 수. 오늘 안 걷은 몰은 칸이 없다. */
  byMall: z.record(z.string(), z.number().int().nonnegative()),
}).strict();
export type OrderCollectionTodayOrders = z.infer<typeof OrderCollectionTodayOrdersSchema>;
