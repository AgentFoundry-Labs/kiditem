import type { OwnerTransaction } from '../../../../../common/owner-transaction';
import type { DetailPageRevisionType } from '../../../../domain/detail-page/detail-page-revision-type';
export const REGISTRATION_CONTENT_WORKSPACE_PORT = Symbol(
  'REGISTRATION_CONTENT_WORKSPACE_PORT',
);

/** 판매 상품 작업공간은 이름을 갖지 않는다 — 이름은 상품에서 읽는다(KID-313 W3). */
export interface EnsureSalesProductContentWorkspaceInput {
  organizationId: string;
  salesProductId: string;
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
  revisionType: DetailPageRevisionType;
  html: string;
  imageUrls: readonly string[];
}

/**
 * 가져온 상세는 `detail_page_revisions.source` · `source_digest` 를 가진 `imported` revision 이다(KID-313 W2).
 * 장부는 revision 행 자체다. 워크스페이스 · 원천마다 `source: 'imported'` 상세 페이지 하나가 그 revision 들을 모은다
 * (W3b). 사방넷 추가상품상세설명은 보내는 곳이 없어(기준 `df84ab399` 에서 몰 시트 · 등록 payload 모두 안 읽음)
 * 가져오지 않는다.
 */
export interface ImportDetailPageInput {
  organizationId: string;
  salesProductId: string;
  /** 어느 원천에서 왔는가. 지금은 사방넷 하나. */
  source: 'sabangnet';
  html: string;
  /** 원천이 준 상세 원문의 digest(KID-304 `#digest:상품상세설명`). 같은 원천의 마지막 imported revision 과 같으면 revision 을 만들지 않는다. */
  digest: string;
  createdByUserId: string | null;
}

export type ImportDetailPageResult =
  | { kind: 'skipped'; reason: 'unchanged'; workspaceId: string; currentRevisionId: string | null }
  | { kind: 'appended'; workspaceId: string; revisionId: string; becameCurrent: boolean };

/** 상세가 없는 판매상품 작업공간에 사람이 첫 상세를 직접 쓴다(허브). */
export interface CreateManualDetailPageInput {
  organizationId: string;
  salesProductId: string;
  html: string;
  createdByUserId: string | null;
}

export interface CreateManualDetailPageResult {
  workspaceId: string;
  revisionId: string;
  /** 허브가 상세를 읽고 고치는 상세 페이지 id(`/api/ai/detail-page/:id`). */
  detailPageId: string;
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
   * 여러 상품의 상세를 한 번에(몰 시트, 최대 1000 상품) — 상품 수만큼 쿼리하지 않는다. 상품마다 `revisionId`
   * 를 주면 그 revision(그 상품 워크스페이스의 것이 아니면 거절), 없으면 현재 revision. 상세 없는 상품은
   * map 에 없다.
   */
  readRegistrableDetailPages(input: {
    organizationId: string;
    requests: ReadonlyArray<{ salesProductId: string; revisionId: string | null }>;
  }): Promise<ReadonlyMap<string, RegistrableDetailPage>>;
  /**
   * 가져온 상세 HTML 을 `imported` revision 으로 쌓는다. 워크스페이스는 상품과 같은 트랜잭션에서
   * `ensureSalesProductWorkspace` 로 이미 만들어져 있어야 한다(여기서 만들지 않는다).
   * 현재 포인터 이동은 `decideRevisionPointer` 가 정한다(사람이 고친 revision 은 덮지 않음).
   * caller 의 트랜잭션 안에서 실행된다 — 사방넷 가져오기가 상품 저장과 함께 커밋한다.
   */
  importDetailPage(transaction: OwnerTransaction, input: ImportDetailPageInput): Promise<ImportDetailPageResult>;
  /**
   * 상세가 없는 판매상품 작업공간에 첫 상세를 만든다 — `source: 'manual'` 상세 페이지와 `manual_edit` revision 을
   * 만들고 현재로 삼는다. 이미 상세가 있으면 Conflict: 그때는 허브가 그 상세 페이지의 저장(edited-html)으로
   * 고친다. 작업공간이 없으면 NotFound.
   */
  createManualDetailPage(input: CreateManualDetailPageInput): Promise<CreateManualDetailPageResult>;
  /**
   * 가져온(`source` 가 있는) revision 들이 쓰는 사진 주소 — 판매 상품별(KID-319). Channels 사진 옮기기가 대표 ·
   * 추가 사진과 함께 옮길 원천 사진을 찾는 데 쓴다. 가져온 상세가 없는 상품은 map 에 없다.
   */
  readImportedDetailImageUrls(input: { organizationId: string }): Promise<ReadonlyMap<string, readonly string[]>>;
  /**
   * 옮긴 사진 주소로 그 판매 상품의 가져온 revision 들(HTML · `image_urls`)을 바꿔 쓴다(KID-319). `source_digest` 는
   * 원문의 것이라 그대로 — 같은 파일을 다시 가져와도 새 revision 이 생기지 않는다. 작업공간이 없으면 0.
   */
  rewriteImportedDetailImageUrls(input: {
    organizationId: string;
    salesProductId: string;
    replacements: ReadonlyMap<string, string>;
  }): Promise<{ revisionsUpdated: number }>;
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
   * 등록 대상이 비워 둔 선택을 워크스페이스의 현재 값(현재 썸네일 자산 · 현재 상세 revision)으로
   * 채우고, 고른 자산 · revision 이 이 워크스페이스의 것인지 본다. 동결에 쓰는 자산은 잠근다.
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
}
