import type {
  AiWorkspaceArchiveScope,
  ArchiveSalesProductWorkspaceInput,
  ArchiveSalesProductWorkspaceResult,
} from '../../in/workspace/sales-product-workspace-archive.port';

export const SALES_PRODUCT_WORKSPACE_ARCHIVE_REPOSITORY_PORT = Symbol(
  'SALES_PRODUCT_WORKSPACE_ARCHIVE_REPOSITORY_PORT',
);

export interface SalesProductWorkspaceArchiveRepositoryPort {
  archiveSalesProductWorkspace(
    scope: AiWorkspaceArchiveScope,
    input: ArchiveSalesProductWorkspaceInput,
  ): Promise<ArchiveSalesProductWorkspaceResult>;
}
