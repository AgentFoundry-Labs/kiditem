import type { ChannelsRepositoryTransaction } from '../transaction/repository-transaction';

export const REGISTRATION_DRAFT_PORT = Symbol('REGISTRATION_DRAFT_PORT');

/**
 * Channels 등록 실행이 재사용 등록 설정과 승인 상태를 같은 트랜잭션에서 읽고 고치는 계약.
 * ProductPreparation과 실행 울타리는 모두 Channels 소유다(ADR-0020).
 * 후보·콘텐츠 provenance는 Sourcing의 공개 계약으로만 검증한다.
 */

/** Draft identity and approval; provider facts belong only to the execution. */
export interface RegistrationDraftRow {
  preparationId: string;
  organizationId: string;
  /** 등록 설정의 주인. 초안 · 판매상품 하나가 곧 등록 대상이다. */
  salesProductId: string;
  /** 그 판매상품을 만든 원천 기록. 직접 만든 상품이면 null. */
  sourceCandidateId: string | null;
  channelAccountId: string;
  /** AI 콘텐츠 작업공간. 등록 설정 줄에 저장하지 않고 필요할 때 AI 계약에 묻는다. */
  sourceContentWorkspaceId: string | null;
  displayName: string;
  status: string;
  closedAt: Date | null;
  isDeleted: boolean;
  channelListingId: string | null;
  approvedByUserId: string | null;
  reviewPayloadHash: string | null;
}

/** 실행이 동결한 제출본을 되읽을 때 필요한 초안 내용. */
export interface FrozenRegistrationDraft extends RegistrationDraftRow {
  updatedAt: Date;
  selectedThumbnailUrl: string | null;
  selectedThumbnailGenerationId: string | null;
  selectedThumbnailGenerationCandidateId: string | null;
  selectedDetailPageArtifactId: string | null;
  selectedDetailPageRevisionId: string | null;
  selectedDetailPageGenerationId: string | null;
}

/** `freezeForSubmission` 이 만들거나 갱신할 제출 동결본. */
export interface FreezeRegistrationDraftInput {
  organizationId: string;
  sourceCandidateId: string;
  channelAccountId: string;
  displayName: string;
  registrationInput: Record<string, unknown>;
  frozenHash: string;
  requestedByUserId: string | null;
}

/** Close the editable draft atomically with its execution; no execution facts are mirrored. */
export interface CloseRegistrationDraftInput {
  organizationId: string;
  preparationId: string;
  sourceCandidateId?: string;
  closedAt: Date;
  archive?: boolean;
}

export interface ClaimRegistrationDraftInput {
  organizationId: string;
  preparationId: string;
  userId: string | null;
  now: Date;
  /** 실행 장부가 이미 있는 재청구. 내용을 다시 동결하지 않는다. */
  reuseFrozenSubmission: boolean;
}

export interface ClaimedRegistrationDraft {
  draft: FrozenRegistrationDraft;
  /** 새로 동결한 제출본. `reuseFrozenSubmission` 이면 `null`. */
  frozen: { payload: unknown; hash: string } | null;
}

export interface RegistrationDraftPort {
  /** 후보 행을 잠근다. 울타리 트랜잭션의 첫 단계. */
  lockCandidate(
    tx: ChannelsRepositoryTransaction,
    input: { organizationId: string; sourceCandidateId: string },
  ): Promise<void>;

  /** 등록을 받을 수 있는 후보인지 확인한다. 아니면 던진다. */
  requireActiveCandidate(
    tx: ChannelsRepositoryTransaction,
    input: { organizationId: string; sourceCandidateId: string },
  ): Promise<void>;

  lockDraft(
    tx: ChannelsRepositoryTransaction,
    input: { organizationId: string; preparationId: string },
  ): Promise<void>;

  loadDraft(
    tx: ChannelsRepositoryTransaction,
    input: { organizationId: string; preparationId: string },
  ): Promise<FrozenRegistrationDraft | null>;

  /** 후보에 달린 초안 id. 실행을 좁힐 때 쓴다(owner 를 넘는 join 이 없다). */
  findDraftIds(
    tx: ChannelsRepositoryTransaction,
    input: {
      organizationId: string;
      sourceCandidateId: string;
      isDeleted?: boolean;
      /** 제출 흔적이 전혀 없는 초안만. 후보 삭제 준비가 쓴다. */
      fenceIdle?: boolean;
    },
  ): Promise<string[]>;

  /** 같은 계정에 걸린 초안 한 줄. `status` 를 주면 그 상태만 본다. */
  findAccountDraft(
    tx: ChannelsRepositoryTransaction,
    input: {
      organizationId: string;
      sourceCandidateId: string;
      channelAccountId: string;
      status?: string;
    },
  ): Promise<FrozenRegistrationDraft | null>;

  /** 제출용 동결. 초안이 없으면 만들고, 있으면 같은 payload 로 갱신한다. */
  freezeForSubmission(
    tx: ChannelsRepositoryTransaction,
    input: FreezeRegistrationDraftInput,
  ): Promise<FrozenRegistrationDraft>;

  /** 실행 전이를 초안에 반영한다. 조건이 안 맞으면 0 을 돌려준다. */
  closeDraft(
    tx: ChannelsRepositoryTransaction,
    input: CloseRegistrationDraftInput,
  ): Promise<number>;

  /** Resolve and approve submission content; Channels alone claims execution leases. */
  claimForSubmission(
    tx: ChannelsRepositoryTransaction,
    input: ClaimRegistrationDraftInput,
  ): Promise<ClaimedRegistrationDraft>;

  /**
   * 확정된 리스팅으로 콘텐츠 작업공간을 분기한다. 등록 확정 트랜잭션 안에서 함께
   * 커밋돼야 해서 울타리가 부르지만, 만드는 것은 Sourcing 쪽 행이다.
   */
  branchContentToListing(
    tx: ChannelsRepositoryTransaction,
    input: {
      organizationId: string;
      salesProductId: string;
      sourceWorkspaceId: string;
      listingId: string;
      displayName: string;
      createdByUserId: string | null;
      selectedThumbnailUrl: string | null;
      selectedThumbnailGenerationId: string | null;
      selectedThumbnailGenerationCandidateId: string | null;
      selectedDetailPageArtifactId: string | null;
      selectedDetailPageRevisionId: string | null;
      selectedDetailPageGenerationId: string | null;
    },
  ): Promise<{ workspaceId: string }>;
}
