import { z } from 'zod';
import { zIsoDate } from './common.js';

/**
 * 상세 페이지 계약(KID-313 W3b). 옛 `content_generations`(생성) · `detail_page_artifacts`(편집 그릇)가
 * `detail_pages` 한 표로 합쳐졌다. 웹 편집기 · 허브 · 몰 등록이 같은 id(상세 페이지 id)로 읽고 쓴다.
 */

export const DETAIL_PAGE_SOURCES = ['generated', 'manual', 'uploaded', 'imported'] as const;
export const DetailPageSourceSchema = z.enum(DETAIL_PAGE_SOURCES);
export type DetailPageSource = z.infer<typeof DetailPageSourceSchema>;

export const DETAIL_PAGE_STATUSES = ['pending', 'processing', 'ready', 'failed'] as const;
export const DetailPageStatusSchema = z.enum(DETAIL_PAGE_STATUSES);
export type DetailPageStatus = z.infer<typeof DetailPageStatusSchema>;

export const DETAIL_PAGE_REVISION_TYPES = ['generated', 'manual_edit', 'duplicate', 'imported'] as const;
export const DetailPageRevisionTypeSchema = z.enum(DETAIL_PAGE_REVISION_TYPES);
export type DetailPageRevisionType = z.infer<typeof DetailPageRevisionTypeSchema>;

export const DetailPageRevisionSchema = z.object({
  id: z.string().uuid(),
  detailPageId: z.string().uuid(),
  revisionType: DetailPageRevisionTypeSchema,
  imageUrls: z.array(z.string()),
  /** 가져온 revision 의 원천(`sabangnet`). 사람이 만든 revision 은 null. */
  source: z.string().nullable(),
  createdByUserId: z.string().uuid().nullable(),
  createdAt: zIsoDate,
}).strict();
export type DetailPageRevision = z.infer<typeof DetailPageRevisionSchema>;

export const DetailPageSchema = z.object({
  id: z.string().uuid(),
  contentWorkspaceId: z.string().uuid(),
  source: DetailPageSourceSchema,
  templateId: z.string().nullable(),
  title: z.string().nullable(),
  status: DetailPageStatusSchema,
  errorMessage: z.string().nullable(),
  currentRevisionId: z.string().uuid().nullable(),
  /** 이 상세 페이지의 현재 revision 이 워크스페이스의 현재(몰로 가는 것)인가. */
  isWorkspaceCurrent: z.boolean(),
  createdAt: zIsoDate,
  updatedAt: zIsoDate,
}).strict();
export type DetailPage = z.infer<typeof DetailPageSchema>;

export const DetailPageWithRevisionsSchema = DetailPageSchema.extend({
  revisions: z.array(DetailPageRevisionSchema),
}).strict();
export type DetailPageWithRevisions = z.infer<typeof DetailPageWithRevisionsSchema>;
