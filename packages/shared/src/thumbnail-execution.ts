import { z } from 'zod';
import { OperationStatusSchema, ProviderOutcomeSchema } from './operation-lifecycle.js';
import { zIsoDate } from './schemas/common.js';

/**
 * 대표이미지를 몰에 반영하는 일은 Channels 등록 실행 하나다(`executionKind = 'thumbnail_update'`).
 * Content 는 승인된 사진만 준다 — 사진을 만든 것은 몰에 반영된 것이 아니다.
 */
export const THUMBNAIL_UPDATE_EXECUTION_KIND = 'thumbnail_update' as const;

export const ThumbnailExecutionPrepareRequestSchema = z.object({
  generationId: z.string().uuid(),
  /** 판매상품에 쿠팡 listing 이 여럿일 때만 고른다. */
  channelListingId: z.string().uuid().optional(),
}).strict();
export type ThumbnailExecutionPrepareRequest = z.infer<typeof ThumbnailExecutionPrepareRequestSchema>;

export const ThumbnailExecutionImageSchema = z.object({
  dataUrl: z.string().min(1),
  filename: z.string().min(1),
  mimeType: z.string().min(1),
}).strict();

/** 확장에 넘길 것. 이 응답을 받은 순간 실행은 `executing` 이다. */
export const ThumbnailExecutionPrepareResponseSchema = z.object({
  executionId: z.string().uuid(),
  generationId: z.string().uuid(),
  productName: z.string().min(1),
  image: ThumbnailExecutionImageSchema,
}).strict();
export type ThumbnailExecutionPrepareResponse = z.infer<typeof ThumbnailExecutionPrepareResponseSchema>;

/**
 * 확장이 돌려준 결과. 확장이 실패라고 답하면 `definitive_failure`(아무것도 올라가지 않음),
 * 확장과의 통신 자체가 끊기면 `uncertain`(올라갔는지 모름)이다.
 */
export const ThumbnailExecutionReportRequestSchema = z.discriminatedUnion('outcome', [
  z.object({
    outcome: z.literal('succeeded'),
    screenshotUrl: z.string().trim().min(1).max(2048).optional(),
    externalId: z.string().trim().min(1).max(120).optional(),
  }).strict(),
  z.object({ outcome: z.literal('definitive_failure'), error: z.string().trim().min(1).max(2000) }).strict(),
  z.object({ outcome: z.literal('uncertain'), error: z.string().trim().min(1).max(2000) }).strict(),
]);
export type ThumbnailExecutionReportRequest = z.infer<typeof ThumbnailExecutionReportRequestSchema>;

export const ThumbnailExecutionResultSchema = z.object({
  generationId: z.string().uuid(),
  executionId: z.string().uuid(),
  success: z.boolean(),
  screenshotPath: z.string().nullable(),
  error: z.string().optional(),
}).strict();
export type ThumbnailExecutionResult = z.infer<typeof ThumbnailExecutionResultSchema>;

export const ThumbnailExecutionStatusQuerySchema = z.object({
  generationIds: z.array(z.string().uuid()).min(1).max(200),
}).strict();

/** 생성 하나의 가장 최근 반영 실행. 운영자가 치운 실패는 빠진다. */
export const ThumbnailExecutionStatusSchema = z.object({
  generationId: z.string().uuid(),
  executionId: z.string().uuid(),
  status: OperationStatusSchema,
  providerOutcome: ProviderOutcomeSchema,
  checkedAt: zIsoDate.nullable(),
  error: z.string().nullable(),
  screenshotPath: z.string().nullable(),
}).strict();
export type ThumbnailExecutionStatus = z.infer<typeof ThumbnailExecutionStatusSchema>;

export const ThumbnailExecutionStatusListSchema = z.object({
  items: z.array(ThumbnailExecutionStatusSchema),
}).strict();
