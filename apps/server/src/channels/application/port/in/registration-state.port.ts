import type { RegistrationSubmissionJson as JsonValue } from '../../../domain/registration/registration-submission-payload';

export const REGISTRATION_STATE_PORT = Symbol('REGISTRATION_STATE_PORT');

/**
 * 판매상품마다 등록 설정과 울타리가 말하는 등록 상태(KID-313). `GET …/registration/state` 가 쓴다.
 *
 * 등록 설정을 만들고 고치는 길은 `channels/registration-targets`(resolve · update · archive)
 * 하나다 — 여기에는 그 길이 없다. 제출 울타리도 Channels 것이라
 * ([ADR-0014](../../../../../../../docs/adr/0014-channels-owns-the-registration-execution-fence.md))
 * 실행 행을 쓰는 방법도 없다.
 */
export interface RegistrationStatePort {
  /**
   * 판매상품마다 등록 설정과 울타리가 말하는 등록 상태. 원본 기록이 없는 상품(직접 작성 · 사방넷)도
   * 같은 모양으로 읽는다. 없는 상품이나 다른 조직의 id 는 맵에 없다.
   */
  readForSalesProducts(organizationId: string, salesProductIds: readonly string[]): Promise<Map<string, SalesProductRegistrationView>>;
}

export interface SalesProductRegistrationView {
  preparations: ProductPreparationRow[];
  registrationState: 'none' | 'preparing' | 'confirming' | 'registered' | 'failed';
}

export interface ProductPreparationRow {
  id: string;
  /** 등록 설정의 주인. 판매상품 하나가 곧 등록 대상이다. */
  salesProductId: string;
  /** 상품을 만든 원본 기록. 직접 작성 · 사방넷 상품은 없다. */
  sourceRecordId: string | null;
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
