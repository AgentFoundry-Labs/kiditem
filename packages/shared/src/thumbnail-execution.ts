import { z } from 'zod';
import { OperationStatusSchema, ProviderOutcomeSchema } from './operation-lifecycle.js';
import { zIsoDate } from './schemas/common.js';

/**
 * 대표이미지를 몰에 반영하는 일은 Channels 등록 실행 하나다(`executionKind = 'thumbnail_update'`).
 * 실행은 판매 상품의 대표이미지 자산 하나를 얼린다(KID-313 W3a): 요청이 자산을 고르면 그것, 아니면 등록 대상이
 * 고른 자산, 아니면 작업공간의 현재 대표이미지. 업로드본과 AI 후보가 같은 `content_assets` 행이다.
 * Content 는 사진만 준다 — 사진을 만든 것은 몰에 반영된 것이 아니다.
 */
export const THUMBNAIL_UPDATE_EXECUTION_KIND = 'thumbnail_update' as const;

export const ThumbnailExecutionPrepareRequestSchema = z.object({
  salesProductId: z.string().uuid(),
  /** 올릴 자산. 없으면 등록 대상이 고른 자산, 그것도 없으면 작업공간의 현재 대표이미지. */
  assetId: z.string().uuid().optional(),
  /** 판매상품에 쿠팡 listing 이 여럿일 때만 고른다. */
  channelListingId: z.string().uuid().optional(),
}).strict();

export const ThumbnailExecutionImageSchema = z.object({
  dataUrl: z.string().min(1),
  filename: z.string().min(1),
  mimeType: z.string().min(1),
}).strict();

/** 확장에 넘길 것. 이 응답을 받은 순간 실행은 `executing` 이다. */
export const ThumbnailExecutionPrepareResponseSchema = z.object({
  executionId: z.string().uuid(),
  salesProductId: z.string().uuid(),
  assetId: z.string().uuid(),
  productName: z.string().min(1),
  image: ThumbnailExecutionImageSchema,
}).strict();
export type ThumbnailExecutionPrepareResponse = z.infer<typeof ThumbnailExecutionPrepareResponseSchema>;

/**
 * 확장(또는 개발 서버 runner)이 돌려준 결과.
 *
 * - `uploaded_pending_save`: Wing 상품 수정 화면의 대표이미지 칸에 사진을 넣었다. 저장 · 수정요청은
 *   누르지 않으므로 몰 반영이 아니다 — 실행은 `reconciling` 으로 남고, 운영자가 Wing 에서 저장한 뒤
 *   "반영됨으로 표시"(`/applied`) 해야 `succeeded` 가 된다.
 * - `definitive_failure`: 확장이 실패라고 답했다(아무것도 올라가지 않음).
 * - `uncertain`: 확장과의 통신 자체가 끊겼다(올라갔는지 모름).
 */
export const ThumbnailExecutionReportRequestSchema = z.discriminatedUnion('outcome', [
  z.object({
    outcome: z.literal('uploaded_pending_save'),
    screenshotUrl: z.string().trim().min(1).max(2048).optional(),
    externalId: z.string().trim().min(1).max(120).optional(),
  }).strict(),
  z.object({ outcome: z.literal('definitive_failure'), error: z.string().trim().min(1).max(2000) }).strict(),
  z.object({ outcome: z.literal('uncertain'), error: z.string().trim().min(1).max(2000) }).strict(),
]);
export type ThumbnailExecutionReportRequest = z.infer<typeof ThumbnailExecutionReportRequestSchema>;

/**
 * 실행 결과. `success` 는 운영자가 반영을 확인한 `succeeded` 일 때만 참이다. 올리기만 한 실행은
 * `status: 'reconciling'` 이고 `error` 가 운영자에게 할 일을 말한다.
 */
export const ThumbnailExecutionResultSchema = z.object({
  salesProductId: z.string().uuid(),
  assetId: z.string().uuid(),
  executionId: z.string().uuid(),
  success: z.boolean(),
  status: OperationStatusSchema,
  screenshotPath: z.string().nullable(),
  error: z.string().optional(),
}).strict();
export type ThumbnailExecutionResult = z.infer<typeof ThumbnailExecutionResultSchema>;

/**
 * 판매상품에 대표이미지 반영을 지원하는 채널의 listing 이 여럿이면 준비가 `code: 'ambiguous_listing'`
 * 400 으로 답한다(KID-321, 몰 중립). 화면은 이 목록에서 하나를 골라 `channelListingId` 와 함께 다시 준비한다.
 */
export const THUMBNAIL_LISTING_CHOICE_REQUIRED_CODE = 'ambiguous_listing' as const;
/** 대표이미지 반영 계정을 정하지 못한 까닭 — 채널 이름이 들어가지 않는다. */
export const THUMBNAIL_ACCOUNT_RESOLUTION_REASONS = ['no_account', 'ambiguous_account', 'ambiguous_listing'] as const;
export type ThumbnailAccountResolutionReason = (typeof THUMBNAIL_ACCOUNT_RESOLUTION_REASONS)[number];

export const ThumbnailExecutionListingChoiceSchema = z.object({
  channelListingId: z.string().uuid(),
  channelName: z.string().nullable(),
  channelAccountName: z.string(),
  externalId: z.string(),
}).strict();
export type ThumbnailExecutionListingChoice = z.infer<typeof ThumbnailExecutionListingChoiceSchema>;

export const ThumbnailExecutionStatusQuerySchema = z.object({
  salesProductIds: z.array(z.string().uuid()).min(1).max(200),
}).strict();

/** 판매 상품 하나의 가장 최근 대표이미지 반영 실행. 운영자가 치운 실패는 빠진다. */
export const ThumbnailExecutionStatusSchema = z.object({
  salesProductId: z.string().uuid(),
  assetId: z.string().uuid(),
  executionId: z.string().uuid(),
  status: OperationStatusSchema,
  providerOutcome: ProviderOutcomeSchema,
  checkedAt: zIsoDate.nullable(),
  error: z.string().nullable(),
  screenshotPath: z.string().nullable(),
}).strict();
export type ThumbnailExecutionStatus = z.infer<typeof ThumbnailExecutionStatusSchema>;
