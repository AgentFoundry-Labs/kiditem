import type {
  AdKeywordPauseProposal,
  AdKeywordSnapshot,
} from '@kiditem/shared/advertising';

/** A review request the keyword tab sends for pause proposals. */
export type PauseProposalReview = 'approve' | 'retry' | 'reject';

export interface PauseProposalState {
  label: string;
  /** `retry` approves a failed proposal again, which queues a new attempt. */
  approve: 'approve' | 'retry' | null;
  /** Rejecting cancels a proposal before it runs, or closes a failed one. */
  reject: boolean;
}

/**
 * What a keyword's pause proposal shows and which review requests it offers.
 * Approval decides first: a proposal awaiting review reads `queued` only
 * because it has no attempt yet. A running attempt may already be changing
 * Coupang and a done one already did, so neither offers a request.
 */
export function pauseProposalState(proposal: AdKeywordPauseProposal): PauseProposalState {
  if (proposal.approvalStatus === 'pending_review') {
    return { label: '승인 대기', approve: 'approve', reject: true };
  }
  switch (proposal.executeStatus) {
    case 'queued':
      return { label: '실행 대기', approve: null, reject: true };
    case 'running':
      return { label: '실행 중', approve: null, reject: false };
    case 'failed':
      return { label: '실패', approve: 'retry', reject: true };
    case 'done':
      return { label: '완료', approve: null, reject: false };
  }
}

/**
 * Distinct action ids of these keywords' proposals that a product-wide request
 * covers. A keyword served in several ad groups shows a chip per group for one
 * proposal, which counts once. Approving covers only proposals awaiting review:
 * running a failure again changes Coupang again, so that stays a per-keyword
 * decision. Rejecting covers every proposal that offers it.
 */
export function proposalIdsFor(
  keywords: readonly AdKeywordSnapshot[],
  review: 'approve' | 'reject',
): string[] {
  const ids = new Set<string>();
  for (const { pauseProposal } of keywords) {
    if (!pauseProposal) continue;
    const state = pauseProposalState(pauseProposal);
    if (review === 'approve' ? state.approve === 'approve' : state.reject) {
      ids.add(pauseProposal.actionId);
    }
  }
  return [...ids];
}

/** The status message after the server counted `updated` proposals. */
export function pauseProposalReviewMessage(review: PauseProposalReview, updated: number): string {
  switch (review) {
    case 'approve':
      return `제안 ${updated}개를 승인했습니다. 확장 프로그램에서 승인 액션을 실행하면 광고센터에 반영됩니다.`;
    case 'retry':
      return `제안 ${updated}개를 다시 실행 대기로 올렸습니다. 확장 프로그램에서 승인 액션을 실행해 주세요.`;
    case 'reject':
      return `제안 ${updated}개를 거절했습니다.`;
  }
}
