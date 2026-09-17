import type { ChannelsRepositoryTransaction } from '../transaction/repository-transaction';

export const REGISTRATION_DRAFT_PORT = Symbol('REGISTRATION_DRAFT_PORT');

/**
 * 등록 울타리가 초안(`ProductPreparation`)에 닿는 유일한 통로.
 *
 * 울타리는 Channels 것이고 초안은 Sourcing 것이다([ADR-0014](../../../../../../../docs/adr/0014-channels-owns-the-registration-execution-fence.md)).
 * 그런데 "이 초안을 이 계정에 한 번만 보낸다"는 보장은 실행 행과 초안 전이가 **같은
 * 트랜잭션에서** 끝나야 성립한다. 그래서 울타리가 트랜잭션을 열고, 초안 쪽 작업은
 * 그 트랜잭션 핸들을 들고 이 소유자 인터페이스로 넘긴다 — Channels 는 초안 행을
 * 직접 쓰지 않는다.
 */

/** 울타리가 판단에 쓰는 초안 한 줄. 내용 칸이 아니라 제출 상태만 담는다. */
export interface RegistrationDraftRow {
  preparationId: string;
  organizationId: string;
  sourceCandidateId: string;
  channelAccountId: string;
  sourceContentWorkspaceId: string;
  displayName: string;
  status: string;
  isDeleted: boolean;
  submissionKey: string | null;
  submissionPayloadHash: string | null;
  hasSubmissionPayload: boolean;
  providerOutcome: string | null;
  providerSubmissionId: string | null;
  hasRegistrationResult: boolean;
  channelListingId: string | null;
  submissionLeaseToken: string | null;
  submissionLeaseClaimedAt: Date | null;
  approvedByUserId: string | null;
}

/** 실행이 동결한 제출본을 되읽을 때 필요한 초안 내용. */
export interface FrozenRegistrationDraft extends RegistrationDraftRow {
  /** Sourcing 이 초안 칸들에서 정리해 준 공급자 결과. 울타리가 다시 계산하지 않는다. */
  resolvedProviderOutcome: string;
  submissionPayloadJson: unknown;
  registrationResult: unknown;
  lastError: string | null;
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
  submissionKey: string;
  frozenPayload: unknown;
  frozenHash: string;
  requestedByUserId: string | null;
}

/** 실행 전이를 초안에 반영할 때의 비교-후-쓰기 조건과 값. */
export interface ApplyRegistrationDraftStateInput {
  organizationId: string;
  preparationId: string;
  sourceCandidateId?: string;
  expect?: {
    status?: string;
    providerOutcome?: string | null;
    submissionLeaseToken?: string | null;
    submissionLeaseClaimedAt?: Date | null;
    noProviderIdentity?: boolean;
  };
  set: {
    status?: string;
    providerOutcome?: string | null;
    submissionLeaseToken?: string | null;
    submissionLeaseClaimedAt?: Date | null;
    lastError?: string | null;
    providerSubmissionId?: string | null;
    registrationResult?: unknown;
    channelListingId?: string | null;
    isDeleted?: boolean;
    deletedAt?: Date | null;
  };
}

export interface ClaimRegistrationDraftInput {
  organizationId: string;
  preparationId: string;
  userId: string | null;
  submissionLeaseToken: string;
  now: Date;
  /** 실행 장부가 이미 있는 재청구. 내용을 다시 동결하지 않는다. */
  reuseFrozenSubmission: boolean;
  providerOutcome?: string | null;
}

export interface ClaimedRegistrationDraft {
  draft: FrozenRegistrationDraft;
  /** 새로 동결한 제출본. `reuseFrozenSubmission` 이면 `null`. */
  frozen: { payload: unknown; hash: string; submissionKey: string } | null;
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
  applyExecutionState(
    tx: ChannelsRepositoryTransaction,
    input: ApplyRegistrationDraftStateInput,
  ): Promise<number>;

  /** Open API 제출 경로의 리스 청구. 필요하면 내용을 다시 동결한다. */
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

  /** 후보에 살아 있는 초안이 등록을 막는지 본다. 막으면 던진다. */
  assertNoBlockingDraft(
    tx: ChannelsRepositoryTransaction,
    input: { organizationId: string; sourceCandidateId: string },
  ): Promise<void>;
}
