export const CONTENT_WORKSPACE_THUMBNAIL_SELECTION_REPOSITORY_PORT = Symbol(
  'CONTENT_WORKSPACE_THUMBNAIL_SELECTION_REPOSITORY_PORT',
);

export type ContentWorkspaceThumbnailSelectionSource =
  | { kind: 'content_asset'; contentAssetId: string }
  | {
      kind: 'generation_candidate';
      sourceThumbnailGenerationId: string;
      sourceThumbnailCandidateId: string;
    }
  | {
      kind: 'external';
      url: string;
      storageKey: string | null;
      mimeType: string;
      fileSize: number;
    };

export interface ContentWorkspaceThumbnailSelectionRepositoryPort {
  assertActiveWorkspace(input: {
    organizationId: string;
    workspaceId: string;
  }): Promise<void>;
  /**
   * 이미 우리가 소유한 `ContentAsset` 의 id. 없으면 `null`.
   *
   * 조직이 이미 가진 URL 이면 그건 외부 이미지가 아니라 **우리 스토리지 자산**이다.
   * 다시 내려받아 새 키로 저장할 이유가 없고, 애초에 아웃바운드 요청 자체가
   * 필요 없다(= SSRF 가드가 관여할 일이 아니다).
   */
  findOwnedAssetIdByUrl(input: {
    organizationId: string;
    url: string;
  }): Promise<string | null>;
  selectCurrent(input: {
    organizationId: string;
    workspaceId: string;
    userId: string | null;
    selection: ContentWorkspaceThumbnailSelectionSource;
  }): Promise<{ selectionId: string; contentAssetId: string; url: string }>;
}
