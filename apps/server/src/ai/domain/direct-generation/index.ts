/**
 * AI domain fixed-generation schemas — barrel.
 *
 * Pure domain layer — no Nest/Prisma/HTTP dependencies.
 */
export {
  DetailPageGenerateDirectInputSchema,
  DetailPageGenerateDirectOutputSchema,
  type DetailPageGenerateDirectInput,
  type DetailPageGenerateDirectOutput,
} from './detail-page-generate.schema';
export {
  ThumbnailCandidateSchema,
  ThumbnailGenerateDirectInputImageSchema,
  ThumbnailGenerateDirectInputSchema,
  ThumbnailGenerateDirectOutputSchema,
  type ThumbnailCandidate,
  type ThumbnailGenerateDirectInput,
  type ThumbnailGenerateDirectInputImage,
  type ThumbnailGenerateDirectOutput,
} from './thumbnail-generate.schema';
export {
  ImageEditDirectInputSchema,
  ImageEditDirectOutputSchema,
  type ImageEditDirectInput,
  type ImageEditDirectOutput,
} from './image-edit.schema';

/**
 * Source-type strings written to operation-alert / panel rows. Keep these
 * stable for historical filtering even though fixed AI jobs no longer create
 * Agent OS requests.
 */
export const AI_JOB_SOURCE_TYPES = {
  DETAIL_PAGE_GENERATE: 'ai.detail_page_generate' as const,
  THUMBNAIL_GENERATE: 'ai.thumbnail_generate' as const,
  /**
   * Post-promotion fire-and-forget triggers. The source distinguishes the
   * trigger origin so operators / panel filters can tell auto-fire apart from
   * user-initiated generation.
   */
  POST_PROMOTION_DETAIL_PAGE: 'post_promotion.detail_page' as const,
  POST_PROMOTION_THUMBNAIL: 'post_promotion.thumbnail' as const,
};
