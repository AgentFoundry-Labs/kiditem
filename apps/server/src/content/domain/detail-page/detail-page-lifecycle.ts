import type { DetailPageRevisionType } from './detail-page-revision-type';

/**
 * 상세 페이지 생명주기 — 순수 규칙(KID-313 W3b).
 *
 * 상세 페이지는 어떻게 시작됐든(`source`) 한 표의 한 행이고, 그 이력은 revision 이다. 상태는 AI 생성에만
 * 뜻이 있다: `pending → processing → ready | failed`. 직접 작성 · 올린 파일 · 가져오기는 처음부터 `ready` 다.
 * `ready` 는 generated revision 과 함께만 온다 — sink 가 revision 없이 상태만 바꾸는 길은 없다.
 */

export const DETAIL_PAGE_SOURCES = ['generated', 'manual', 'uploaded', 'imported'] as const;
export type DetailPageSource = (typeof DETAIL_PAGE_SOURCES)[number];

export const DETAIL_PAGE_STATUSES = ['pending', 'processing', 'ready', 'failed'] as const;
export type DetailPageStatus = (typeof DETAIL_PAGE_STATUSES)[number];

const ALLOWED: Readonly<Record<DetailPageStatus, readonly DetailPageStatus[]>> = {
  pending: ['processing', 'failed'],
  processing: ['ready', 'failed'],
  ready: [],
  failed: ['pending'],
};

export function canTransitionDetailPage(from: DetailPageStatus, to: DetailPageStatus): boolean {
  return ALLOWED[from].includes(to);
}

export function initialDetailPageStatus(source: DetailPageSource): DetailPageStatus {
  return source === 'generated' ? 'pending' : 'ready';
}

/**
 * 새 revision 이 현재 포인터를 옮기는가. 사람이 만든 revision(`manual_edit` · `duplicate`)은 늘 현재가 된다 —
 * 사람이 방금 한 일이다. 기계가 만든 revision(`generated` · `imported`)은 현재가 사람의 것이 아닐 때만 현재가
 * 된다 — 재생성 · 재가져오기가 편집을 지우지 않으면서 이력에는 남는다(W2 `decideDetailPageImport` 의 일반화).
 */
export function decideRevisionPointer(input: {
  currentRevisionType: DetailPageRevisionType | null;
  incomingRevisionType: DetailPageRevisionType;
}): { advancePointer: boolean } {
  const humanIncoming = input.incomingRevisionType === 'manual_edit' || input.incomingRevisionType === 'duplicate';
  if (humanIncoming) return { advancePointer: true };
  const humanCurrent = input.currentRevisionType === 'manual_edit' || input.currentRevisionType === 'duplicate';
  return { advancePointer: !humanCurrent };
}
