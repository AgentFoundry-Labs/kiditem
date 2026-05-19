export const CONTENT_WORKSPACE_ATTACHMENT_REPOSITORY_PORT = Symbol(
  'CONTENT_WORKSPACE_ATTACHMENT_REPOSITORY_PORT',
);

export interface ContentWorkspaceAttachmentPreflight {
  product: { id: string } | null;
  group: { id: string; targetMasterId: string | null } | null;
  generationCount: number;
  productWorkspace: { id: string } | null;
}

export interface ContentWorkspaceAttachmentRepositoryPort {
  loadAttachPreflight(input: {
    organizationId: string;
    groupId: string;
    productId: string;
  }): Promise<ContentWorkspaceAttachmentPreflight>;
  attachGroupToProduct(input: {
    organizationId: string;
    groupId: string;
    productId: string;
    productWorkspaceId: string | null;
  }): Promise<void>;
}
