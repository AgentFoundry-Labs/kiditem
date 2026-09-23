import type { DetailPageRevisionType } from './detail-page-revision-type';

/**
 * 가져온 상세 HTML 을 revision 이력에 넣는 규칙 — 순수 함수(KID-313 W2).
 *
 * 사방넷 같은 미러 원천에서 온 상세 HTML 은 언제나 새 `imported` revision 으로 쌓인다. 그러나
 * 현재 포인터는 사람이 고친 revision 을 덮지 않는다: 현재 revision 이 사람의 편집(`manual_edit`)
 * 이나 복제(`duplicate`)이면 포인터를 두고, 가져온 것(`imported`)이거나 아직 아무것도 없으면
 * 새 revision 을 현재로 올린다. 그래서 재가져오기가 편집을 지우지 않으면서도 이력에는 남는다.
 * 같은 내용(digest 동일)이면 revision 을 만들지 않는다.
 */

export type DetailPageImportDecision =
  | { kind: 'skip'; reason: 'unchanged' }
  | { kind: 'append'; advancePointer: boolean };

export function decideDetailPageImport(input: {
  /** 현재 revision 의 종류. 워크스페이스에 상세가 아직 없으면 null. */
  currentRevisionType: DetailPageRevisionType | null;
  /** 마지막으로 가져온 revision 의 내용 digest. 없으면 null. */
  lastImportedDigest: string | null;
  incomingDigest: string;
}): DetailPageImportDecision {
  if (input.lastImportedDigest !== null && input.lastImportedDigest === input.incomingDigest) {
    return { kind: 'skip', reason: 'unchanged' };
  }
  const humanOwned = input.currentRevisionType === 'manual_edit' || input.currentRevisionType === 'duplicate';
  return { kind: 'append', advancePointer: !humanOwned };
}
