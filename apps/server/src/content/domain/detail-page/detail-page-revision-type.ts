import { z } from 'zod';

/**
 * `DetailPageRevision.revisionType` 의 값 전부 — 이 목록 밖의 값은 어느 writer 도 쓰지 않는다.
 *
 * - `manual_edit`: 편집기 저장, `ContentGeneration.editedHtml` 을 옮긴 이관(v0.1.31:025), 스키마 기본값.
 * - `duplicate`: 상세페이지 버전 복제가 원본의 현재 revision 을 복사한 것.
 * - `legacy_edited_html_backfill`: v0.1.1:002 이관이 남긴 옛 줄. 새로 쓰지 않지만 읽을 수 있어야 한다.
 */
export const DETAIL_PAGE_REVISION_TYPES = ['manual_edit', 'duplicate', 'legacy_edited_html_backfill'] as const;

export const DetailPageRevisionTypeSchema = z.enum(DETAIL_PAGE_REVISION_TYPES);

export type DetailPageRevisionType = z.infer<typeof DetailPageRevisionTypeSchema>;

/** writer 는 문자열 대신 이 키로 값을 고른다. */
export const DETAIL_PAGE_REVISION_TYPE = DetailPageRevisionTypeSchema.enum;
