import type { CoupangWingCatalogImportResponse } from '@kiditem/shared/source-import';
import type {
  ParsedWingCatalogRow,
  ParsedWingCatalogSkippedRow,
} from '../documents/channel-document.models';

export type ChannelCatalogImportClaim =
  | { kind: 'started'; runId: string; attemptToken: string }
  | { kind: 'duplicate'; response: CoupangWingCatalogImportResponse }
  /** The account already has a live Wing catalog attempt, from a workbook or the browser. */
  | { kind: 'running'; attemptId: string };

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
    skippedRows: ParsedWingCatalogSkippedRow[];
    /** 엑셀 값이 가리키는 시각(내보내기 요청 시각). `catalogExcel.observedAt`으로 저장한다. */
    observedAt: string;
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
