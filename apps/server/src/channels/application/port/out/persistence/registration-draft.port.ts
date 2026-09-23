import type { ChannelsRepositoryTransaction } from '../transaction/repository-transaction';

export const REGISTRATION_DRAFT_PORT = Symbol('REGISTRATION_DRAFT_PORT');

/**
 * 등록 실행 울타리가 확인 트랜잭션 안에서 판매 상품의 콘텐츠를 몰 상품에 잇는 계약(KID-321). 작업공간은
 * Content 의 것이라 이 포트의 어댑터가 Content 공개 계약을 부른다. 등록 대상 · 실행 행은 울타리가 직접 쓴다.
 */
export interface RegistrationDraftPort {
  /**
   * 판매 상품의 콘텐츠 작업공간을 등록 확인이 만든 몰 상품에 붙인다. 확인 트랜잭션 안에서 함께 커밋된다.
   * 작업공간이 없는 상품은 null.
   */
  attachContentToListing(
    tx: ChannelsRepositoryTransaction,
    input: { organizationId: string; salesProductId: string; listingId: string },
  ): Promise<{ workspaceId: string } | null>;
}
