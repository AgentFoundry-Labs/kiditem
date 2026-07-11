import type { CoupangWingCatalogImportResponse } from '@kiditem/shared/source-import';
import type { ParsedWingCatalogRow } from '../../../service/coupang-wing-workbook.parser';

export type ChannelCatalogImportClaim =
  | { kind: 'started'; runId: string; attemptToken: string }
  | { kind: 'duplicate'; response: CoupangWingCatalogImportResponse }
  | { kind: 'running' };

export interface ChannelCatalogImportRepositoryPort {
  claimCoupangWingImport(input: {
    organizationId: string;
    userId: string;
    channelAccountId: string;
    fileName: string;
    fileHash: string;
    rowCount: number;
  }): Promise<ChannelCatalogImportClaim>;

  upsertCoupangWingCatalog(input: {
    organizationId: string;
    channelAccountId: string;
    runId: string;
    attemptToken: string;
    rows: ParsedWingCatalogRow[];
    skippedRowCount: number;
  }): Promise<CoupangWingCatalogImportResponse>;

  markImportFailed(
    organizationId: string,
    channelAccountId: string,
    runId: string,
    attemptToken: string,
  ): Promise<void>;
}

export const CHANNEL_CATALOG_IMPORT_REPOSITORY_PORT = Symbol(
  'CHANNEL_CATALOG_IMPORT_REPOSITORY_PORT',
);
