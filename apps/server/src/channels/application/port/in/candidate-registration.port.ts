import type { OwnerTransaction } from '../../../../common/owner-transaction';
import type { RegistrationSubmissionJson as JsonValue } from '../../../domain/registration/registration-submission-payload';

export const CANDIDATE_REGISTRATION_PORT = Symbol(
  'CANDIDATE_REGISTRATION_PORT',
);

/**
 * 후보에서 본 등록 설정 읽기와 종료 가능 판정.
 *
 * 등록 설정을 만들고 고치는 길은 `channels/registration-targets`(resolve · create · update)
 * 하나다(KID-310 · ADR-0022) — 여기에는 그 길이 없다. 제출 울타리도 Channels 것이라
 * ([ADR-0014](../../../../../../../docs/adr/0014-channels-owns-the-registration-execution-fence.md))
 * 실행 행을 읽고 쓰는 방법도 없다.
 */
export interface CandidateRegistrationPort {
  readForCandidates(organizationId: string, candidateIds: readonly string[]): Promise<Map<string, SalesProductRegistrationView>>;
  /**
   * 판매상품 초안마다 등록 설정과 울타리가 말하는 등록 상태. 후보가 없는 초안(직접 작성 · 사방넷)도
   * 같은 모양으로 읽는다. 없는 초안이나 다른 조직의 id 는 맵에 없다.
   */
  readForSalesProducts(organizationId: string, salesProductIds: readonly string[]): Promise<Map<string, SalesProductRegistrationView>>;
  /**
   * 후보를 종료(거절·삭제)해도 되는지 초안 쪽에서 본다. 살아 있는 초안이나 남아
   * 있는 공급자 식별자가 있으면 던진다. 실행 쪽 근거는 Channels 리더가 본다.
   */
  assertCandidateTerminalTransitionAllowed(
    tx: OwnerTransaction,
    input: { organizationId: string; sourceCandidateId: string },
  ): Promise<void>;

}

export interface SalesProductRegistrationView {
  preparations: ProductPreparationRow[];
  registrationState: 'none' | 'preparing' | 'confirming' | 'registered' | 'failed';
}

export interface ProductPreparationRow {
  id: string;
  /** 등록 설정의 주인. 초안 · 판매상품 하나가 곧 등록 대상이다. */
  salesProductId: string;
  /** 초안을 만든 원천 기록. 직접 작성 · 사방넷 초안은 없다. */
  sourceCandidateId: string | null;
  channelAccountId: string;
  channelListingId: string | null;
  displayName: string | null;
  status: string;
  selectedThumbnailUrl: string | null;
  selectedThumbnailGenerationId: string | null;
  selectedThumbnailGenerationCandidateId: string | null;
  selectedDetailPageArtifactId: string | null;
  selectedDetailPageRevisionId: string | null;
  selectedDetailPageGenerationId: string | null;
  registrationInput: JsonValue;
  createdAt: Date;
  updatedAt: Date;
}
