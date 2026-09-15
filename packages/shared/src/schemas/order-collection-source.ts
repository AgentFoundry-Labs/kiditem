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
 */
export const OrderCollectionSourceStatusSchema = z.object({
  mallKey: z.string().min(1).max(100).nullable(),
  channelAccountId: z.string().uuid().nullable(),
  running: CollectionSourceRunningSchema.nullable(),
  lastComplete: CollectionSourceLastCompleteSchema.nullable(),
  lastAttempt: CollectionSourceLastAttemptSchema.nullable(),
}).strict();
export type OrderCollectionSourceStatus = z.infer<typeof OrderCollectionSourceStatusSchema>;
