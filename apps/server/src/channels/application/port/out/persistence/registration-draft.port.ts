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
  sourceRecordId: string | null;
  channelAccountId: string;
  /** AI 콘텐츠 작업공간. 등록 설정 줄에 저장하지 않고 필요할 때 AI 계약에 묻는다. */
  sourceContentWorkspaceId: string | null;
  /** 판매 상품 이름. 등록 설정은 이름을 갖지 않는다(KID-313 W2). */
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
  /**
   * 고른 대표이미지 자산 · 상세 revision. 설정에 저장된 값이고, 제출 동결은 비어 있는 선택을 워크스페이스의
   * 현재 값으로 채워 돌려준다 — 설정에는 다시 쓰지 않는다(비어 있으면 늘 현재를 뜻한다).
   */
  selectedThumbnailAssetId: string | null;
  selectedDetailPageRevisionId: string | null;
}

/** `freezeForSubmission` 이 만들거나 갱신할 제출 동결본. */
export interface FreezeRegistrationDraftInput {
  organizationId: string;
  salesProductId: string;
  channelAccountId: string;
  displayName: string;
  /**
   * 이 실행이 동결하는 제출 값. 실행 시점 사실(셀피아 연결 · 몰 상품 · KID)은 실행 payload 에만 남고,
   * 설정에는 쿠팡 어댑터 값(`wingCategoryKey` · `wingProduct`)만 `registrationInput.adapter.coupang` 으로 남긴다.
   */
  registrationInput: Record<string, unknown>;
  frozenHash: string;
  requestedByUserId: string | null;
}

/** Close the editable draft atomically with its execution; no execution facts are mirrored. */
export interface CloseRegistrationDraftInput {
  organizationId: string;
  preparationId: string;
  salesProductId?: string;
  closedAt: Date;
  archive?: boolean;
}

export interface RegistrationDraftPort {
  /**
   * 판매상품 행을 잠근다. 울타리 트랜잭션의 첫 단계.
   */
  lockProduct(
    tx: ChannelsRepositoryTransaction,
    input: { organizationId: string; salesProductId: string },
  ): Promise<void>;

  /**
   * 등록을 받을 수 있는 판매상품인지 확인한다. 아니면 던진다. KID 를 받은 판매 상품(active)만
   * 받는다 — 초안과 보관 상품을 막는다(KID-313).
   */
  requireActiveProduct(
    tx: ChannelsRepositoryTransaction,
    input: { organizationId: string; salesProductId: string },
  ): Promise<void>;

  lockDraft(
    tx: ChannelsRepositoryTransaction,
    input: { organizationId: string; preparationId: string },
  ): Promise<void>;

  loadDraft(
    tx: ChannelsRepositoryTransaction,
    input: { organizationId: string; preparationId: string },
  ): Promise<FrozenRegistrationDraft | null>;

  /** 판매상품에 달린 등록 설정 id. 실행을 좁힐 때 쓴다. */
  findDraftIds(
    tx: ChannelsRepositoryTransaction,
    input: {
      organizationId: string;
      salesProductId: string;
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
      salesProductId: string;
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
    },
  ): Promise<{ workspaceId: string }>;
}
