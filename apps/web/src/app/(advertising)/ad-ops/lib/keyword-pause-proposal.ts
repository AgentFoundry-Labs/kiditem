import type {
  AdKeywordPauseProposal,
  AdKeywordSnapshot,
} from '@kiditem/shared/advertising';

/**
 * A review request the keyword tab sends for pause proposals. `close` ends an
 * approved proposal once the operator is done with it; it is sent as a
 * rejection.
 */
export type PauseProposalReview = 'approve' | 'reject' | 'close';

export interface PauseProposalReviewAction {
  review: PauseProposalReview;
  /** The button text. */
  label: string;
}

export interface PauseProposalState {
  label: string;
  /** What the operator does next, shown in the chip; null when nothing is left to do. */
  note: string | null;
  /** The review requests the proposal offers, in button order. */
  actions: PauseProposalReviewAction[];
}

const APPROVE: PauseProposalReviewAction = { review: 'approve', label: '승인' };
const REJECT: PauseProposalReviewAction = { review: 'reject', label: '거절' };
const CLOSE: PauseProposalReviewAction = { review: 'close', label: '닫기' };

/**
 * What a keyword's pause proposal shows and which review requests it offers.
 * Approval decides first: a proposal awaiting review reads `queued` only
 * because it has no attempt yet.
 *
 * The extension never pauses a keyword (KID-138 decision A). Approving one
 * records the operator's confirmation, and the operator pauses the keyword in
 * the ad center, so an approved proposal offers no way to run it: its attempt
 * reads failed with the reason the server recorded, or queued when it was
 * approved before that decision. The operator closes it when done. A running
 * or done attempt comes from an extension before that decision and may
 * already have changed Coupang, so it offers nothing.
 */
export function pauseProposalState(proposal: AdKeywordPauseProposal): PauseProposalState {
  if (proposal.approvalStatus === 'pending_review') {
    return { label: '승인 대기', note: null, actions: [APPROVE, REJECT] };
  }
  switch (proposal.executeStatus) {
    case 'queued':
    case 'failed':
      return { label: '승인함', note: '광고센터에서 직접 꺼 주세요', actions: [CLOSE] };
    case 'running':
      return { label: '실행 중', note: null, actions: [] };
    case 'done':
      return { label: '완료', note: null, actions: [] };
  }
}

/**
 * Distinct action ids of these keywords' proposals that a product-wide
 * `review` covers. A keyword served in several ad groups shows a chip per group
 * for one proposal, which counts once. Both product-wide requests cover only
 * proposals awaiting review: an approved proposal is an operator's
 * confirmation, so a product-wide rejection never undoes it, and it is closed
 * one at a time.
 */
export function proposalIdsFor(
  keywords: readonly AdKeywordSnapshot[],
  review: 'approve' | 'reject',
): string[] {
  const ids = new Set<string>();
  for (const { pauseProposal } of keywords) {
    if (!pauseProposal || pauseProposal.approvalStatus !== 'pending_review') continue;
    const offered = pauseProposalState(pauseProposal).actions.some(
      (action) => action.review === review,
    );
    if (offered) ids.add(pauseProposal.actionId);
  }
  return [...ids];
}

/** The status message after the server counted `updated` proposals. */
export function pauseProposalReviewMessage(review: PauseProposalReview, updated: number): string {
  switch (review) {
    case 'approve':
      return `제안 ${updated}개를 승인했습니다. 키워드 끄기는 자동으로 실행하지 않으니 광고센터에서 직접 꺼 주세요.`;
    case 'reject':
      return `제안 ${updated}개를 거절했습니다.`;
    case 'close':
      return `제안 ${updated}개를 닫았습니다.`;
  }
}
