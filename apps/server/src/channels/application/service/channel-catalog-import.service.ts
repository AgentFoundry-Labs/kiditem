import { ConflictException, Inject, Injectable } from '@nestjs/common';
import type { CoupangWingCatalogImportResponse } from '@kiditem/shared/source-import';
import {
  type ChannelCatalogImportPort,
  type ImportCoupangWingCatalogInput,
} from '../port/in/channel-catalog-import.port';
import {
  CHANNEL_CATALOG_IMPORT_REPOSITORY_PORT,
  type ChannelCatalogImportRepositoryPort,
} from '../port/out/repository/channel-catalog-import.repository.port';

@Injectable()
export class ChannelCatalogImportService implements ChannelCatalogImportPort {
  constructor(
    @Inject(CHANNEL_CATALOG_IMPORT_REPOSITORY_PORT)
    private readonly repository: ChannelCatalogImportRepositoryPort,
  ) {}

  async importCoupangWing(
    input: ImportCoupangWingCatalogInput,
  ): Promise<CoupangWingCatalogImportResponse> {
    const claim = await this.repository.claimCoupangWingImport({
      organizationId: input.organizationId,
      userId: input.userId,
      channelAccountId: input.channelAccountId,
      fileName: input.fileName,
      fileHash: input.fileHash,
      rowCount: input.rows.length,
    });

    if (claim.kind === 'duplicate') return claim.response;
    if (claim.kind === 'running') {
      throw new ConflictException(
        'This Coupang Wing catalog file is already being imported for this account',
      );
    }

    try {
      return await this.repository.upsertCoupangWingCatalog({
        organizationId: input.organizationId,
        channelAccountId: input.channelAccountId,
        runId: claim.runId,
        attemptToken: claim.attemptToken,
        rows: input.rows,
        skippedRowCount: input.skippedRows.length,
      });
    } catch (error) {
      try {
        await this.repository.markImportFailed(
          input.organizationId,
          input.channelAccountId,
          claim.runId,
          claim.attemptToken,
        );
      } catch {
        // A completed or reclaimed run owns the state now. Preserve the write error.
      }
      throw error;
    }
  }
}
