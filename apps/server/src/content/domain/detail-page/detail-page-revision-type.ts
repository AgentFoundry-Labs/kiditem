import { z } from 'zod';

/**
 * `DetailPageRevision.revisionType` 의 값 전부 — 이 목록 밖의 값은 어느 writer 도 쓰지 않는다(KID-313 W3b).
 *
 * - `generated`: AI 생성 결과. sink 가 이 revision 을 붙이며 상세 페이지가 `ready` 가 된다.
 * - `manual_edit`: 편집기 저장(첫 직접 작성 포함), 스키마 기본값.
 * - `duplicate`: 상세 페이지 복제가 원본의 현재 revision 을 복사한 것.
 * - `imported`: 사방넷 같은 미러 원천에서 가져온 상세 HTML(KID-313 W2). `source` · `sourceDigest` 를 가진다.
 *
 * 현재 포인터 이동은 `detail-page-lifecycle` 의 `decideRevisionPointer` 가 정한다 — 기계가 만든 revision 은
 * 사람이 고친 revision 을 덮지 않는다. 옛 `legacy_edited_html_backfill` 은 ADR-0010 데이터 폐기로 사라졌다.
 */
export const DETAIL_PAGE_REVISION_TYPES = ['generated', 'manual_edit', 'duplicate', 'imported'] as const;

export const DetailPageRevisionTypeSchema = z.enum(DETAIL_PAGE_REVISION_TYPES);

export type DetailPageRevisionType = z.infer<typeof DetailPageRevisionTypeSchema>;

/** writer 는 문자열 대신 이 키로 값을 고른다. */
export const DETAIL_PAGE_REVISION_TYPE = DetailPageRevisionTypeSchema.enum;
