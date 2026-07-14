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
  selectCurrent(input: {
    organizationId: string;
    workspaceId: string;
    userId: string | null;
    selection: ContentWorkspaceThumbnailSelectionSource;
  }): Promise<{ selectionId: string; contentAssetId: string; url: string }>;
}
