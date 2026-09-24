import { Inject, Injectable } from '@nestjs/common';
import type {
  AiWorkspaceArchivePort,
  AiWorkspaceArchiveScope,
  ArchiveSalesProductWorkspaceInput,
  ArchiveSalesProductWorkspaceResult,
} from '../port/in/workspace/sales-product-workspace-archive.port';
import {
  SALES_PRODUCT_WORKSPACE_ARCHIVE_REPOSITORY_PORT,
  type SalesProductWorkspaceArchiveRepositoryPort,
} from '../port/out/repository/sales-product-workspace-archive.repository.port';

@Injectable()
export class SalesProductWorkspaceArchiveService implements AiWorkspaceArchivePort {
  constructor(
    @Inject(SALES_PRODUCT_WORKSPACE_ARCHIVE_REPOSITORY_PORT)
    private readonly repository: SalesProductWorkspaceArchiveRepositoryPort,
  ) {}

  archiveSalesProductWorkspace(
    scope: AiWorkspaceArchiveScope,
    input: ArchiveSalesProductWorkspaceInput,
  ): Promise<ArchiveSalesProductWorkspaceResult> {
    return this.repository.archiveSalesProductWorkspace(scope, input);
  }
}
