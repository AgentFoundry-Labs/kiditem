import { z } from 'zod';
import { zIsoDate } from './common.js';

/**
 * 대표이미지 · 콘텐츠 자산 계약(KID-313 W3a). 운영자 업로드와 AI 후보가 같은 `content_assets` 행이고,
 * 대표이미지는 워크스페이스의 `currentThumbnailAssetId` 하나다. 옛 썸네일 생성 항목(selectedUrl · phase ·
 * grade · score · editAnalysis)과 추적 · 분석 스키마는 이 계약이 대신한다.
 */

export const CONTENT_ASSET_SOURCES = ['upload', 'ai', 'detail_generation', 'catalog'] as const;
export const ContentAssetSourceSchema = z.enum(CONTENT_ASSET_SOURCES);
export type ContentAssetSource = z.infer<typeof ContentAssetSourceSchema>;

export const ContentAssetItemSchema = z.object({
  id: z.string().uuid(),
  contentWorkspaceId: z.string().uuid(),
  source: ContentAssetSourceSchema,
  role: z.string().nullable(),
  url: z.string(),
  label: z.string().nullable(),
  sortOrder: z.number().int(),
  width: z.number().int().nullable(),
  height: z.number().int().nullable(),
  /** AI 후보이면 그 job id. */
  thumbnailGenerationId: z.string().uuid().nullable(),
  /** 워크스페이스의 현재 대표이미지인가. */
  isCurrentThumbnail: z.boolean(),
  createdAt: zIsoDate,
}).strict();
export type ContentAssetItem = z.infer<typeof ContentAssetItemSchema>;

export const THUMBNAIL_JOB_STATUSES = ['pending', 'running', 'succeeded', 'failed', 'cancelled'] as const;
export const ThumbnailJobStatusSchema = z.enum(THUMBNAIL_JOB_STATUSES);
export const THUMBNAIL_JOB_METHODS = ['generate', 'creative', 'auto', 'edit'] as const;
export const ThumbnailJobMethodSchema = z.enum(THUMBNAIL_JOB_METHODS);

/** 대표이미지 생성 job — 후보는 `ContentAssetItem`(`thumbnailGenerationId` 가 이 id) 으로 따로 읽는다. */
export const ThumbnailJobSchema = z.object({
  id: z.string().uuid(),
  contentWorkspaceId: z.string().uuid(),
  status: ThumbnailJobStatusSchema,
  method: ThumbnailJobMethodSchema,
  prompt: z.string().nullable(),
  errorMessage: z.string().nullable(),
  attemptCount: z.number().int(),
  createdAt: zIsoDate,
  updatedAt: zIsoDate,
}).strict();
export type ThumbnailJob = z.infer<typeof ThumbnailJobSchema>;

export const LISTING_THUMBNAIL_GRADES = ['S', 'A', 'B', 'C', 'D', 'F'] as const;
export const ListingThumbnailGradeSchema = z.enum(LISTING_THUMBNAIL_GRADES);

export const ListingThumbnailEvaluationSchema = z.object({
  id: z.string().uuid(),
  channelListingId: z.string().uuid(),
  imageUrl: z.string(),
  grade: ListingThumbnailGradeSchema,
  score: z.number().int().min(0).max(100),
  details: z.record(z.string(), z.unknown()),
  method: z.enum(['vision_model', 'rule']),
  modelId: z.string().nullable(),
  evaluatedAt: zIsoDate,
}).strict();
export type ListingThumbnailEvaluation = z.infer<typeof ListingThumbnailEvaluationSchema>;

export const ListingThumbnailEvaluationSummarySchema = z.object({
  evaluated: z.number().int(),
  unevaluated: z.number().int(),
  byGrade: z.record(ListingThumbnailGradeSchema, z.number().int()),
}).strict();
export type ListingThumbnailEvaluationSummary = z.infer<typeof ListingThumbnailEvaluationSummarySchema>;
