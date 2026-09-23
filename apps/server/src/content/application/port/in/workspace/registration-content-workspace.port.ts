import type { OwnerTransaction } from '../../../../../common/owner-transaction';
export const REGISTRATION_CONTENT_WORKSPACE_PORT = Symbol(
  'REGISTRATION_CONTENT_WORKSPACE_PORT',
);

export interface EnsureSalesProductContentWorkspaceInput {
  organizationId: string;
  salesProductId: string;
  displayName: string;
  createdByUserId: string | null;
}

/**
 * 등록 대상이 고른 콘텐츠(KID-313 W2). 둘 다 Content 가 소유한 행의 id 이고, 비어 있으면
 * 워크스페이스의 현재 값(현재 썸네일 자산 · 현재 상세 revision)을 뜻한다. URL 이나 생성 job id 를
 * 복사해 두지 않는다 — 이미지와 HTML 의 자리는 하나다.
 */
export interface RegistrationContentSelectionInput {
  organizationId: string;
  sourceWorkspaceId: string;
  selectedThumbnailAssetId: string | null;
  selectedDetailPageRevisionId: string | null;
}

export type ResolvedRegistrationContentSelections = Pick<
  RegistrationContentSelectionInput,
  'selectedThumbnailAssetId' | 'selectedDetailPageRevisionId'
>;

/** 몰에 보낼 상세 — 현재 revision 또는 등록 대상이 고른 revision. */
export interface RegistrableDetailPage {
  workspaceId: string;
  revisionId: string;
  revisionType: 'manual_edit' | 'duplicate' | 'legacy_edited_html_backfill' | 'imported';
  html: string;
  /** 몰이 따로 받는 추가 상세(사방넷 추가상품상세설명). 없으면 빈 배열. */
  extraHtml: readonly string[];
  imageUrls: readonly string[];
}

export interface ImportDetailPageInput {
  organizationId: string;
  salesProductId: string;
  /** 어느 원천에서 왔는가. 지금은 사방넷 하나. */
  source: 'sabangnet';
  html: string;
  extraHtml: readonly string[];
  /** 원천이 준 내용의 digest(KID-304). 같으면 revision 을 만들지 않는다. */
  digest: string;
  createdByUserId: string | null;
}

export type ImportDetailPageResult =
  | { kind: 'skipped'; reason: 'unchanged'; workspaceId: string; currentRevisionId: string | null }
  | { kind: 'appended'; workspaceId: string; revisionId: string; becameCurrent: boolean };

export interface AttachContentWorkspaceToListingInput {
  organizationId: string;
  salesProductId: string;
  listingId: string;
}

export interface FindSalesProductContentWorkspaceInput {
  organizationId: string;
  salesProductId: string;
}

export interface RegistrationContentWorkspacePort {
  /**
   * 몰 시트 · 등록 동결 · 상세 이미지 렌더가 상세 HTML 을 읽는 유일한 길(KID-313 W2).
   * `revisionId` 를 주면 그 revision, 없으면 워크스페이스의 현재 revision. 상세가 없으면 null.
   */
  readRegistrableDetailPage(input: {
    organizationId: string;
    salesProductId: string;
    revisionId: string | null;
  }): Promise<RegistrableDetailPage | null>;
  /**
   * 가져온 상세 HTML 을 `imported` revision 으로 쌓는다. 워크스페이스가 없으면 만든다.
   * 현재 포인터 이동은 `detail-page-import-rule` 이 정한다(사람이 고친 revision 은 덮지 않음).
   * caller 의 트랜잭션 안에서 실행된다 — 사방넷 가져오기가 상품 저장과 함께 커밋한다.
   */
  importDetailPage(transaction: OwnerTransaction, input: ImportDetailPageInput): Promise<ImportDetailPageResult>;
  /**
   * Read-only lookup of the active workspace a sales-product draft already owns.
   *
   * `ensureSalesProductWorkspace` is the write path and runs inside
   * registration. The draft screen only needs to know whether a workspace
   * exists, so it must not create one as a side effect of a GET.
   */
  findSalesProductWorkspaceId(
    input: FindSalesProductContentWorkspaceInput,
  ): Promise<string | null>;
  /**
   * Fills in what the operator left implicit (an artifact's current revision, a
   * generation's artifact) and adopts a plain thumbnail URL into managed
   * content. Channels owns the draft's image list, so it — not AI — is the
   * authority for whether a plain URL belongs to the draft; AI only enforces
   * that every id-bearing selection is owned by this workspace.
   */
  resolveSourceSelections(
    transaction: OwnerTransaction,
    input: RegistrationContentSelectionInput,
  ): Promise<ResolvedRegistrationContentSelections>;
  validateSourceSelections(
    transaction: OwnerTransaction | null,
    input: RegistrationContentSelectionInput,
  ): Promise<void>;
  ensureSalesProductWorkspace(
    transaction: OwnerTransaction,
    input: EnsureSalesProductContentWorkspaceInput,
  ): Promise<{ workspaceId: string }>;
  /**
   * Points the draft's own workspace at the listing registration produced.
   * There is one workspace per draft and it keeps its content, so registration
   * records the listing instead of cloning artifacts into a second workspace.
   */
  attachToListing(
    transaction: OwnerTransaction,
    input: AttachContentWorkspaceToListingInput,
  ): Promise<{ workspaceId: string }>;
}
