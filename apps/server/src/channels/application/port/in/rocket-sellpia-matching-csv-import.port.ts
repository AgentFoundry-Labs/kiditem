import type { CoupangRocketMatchingCsvImportResponse } from '@kiditem/shared/source-import';

export const ROCKET_SELLPIA_MATCHING_CSV_IMPORT_PORT = Symbol(
  'ROCKET_SELLPIA_MATCHING_CSV_IMPORT_PORT',
);

export type ImportRocketSellpiaMatchingCsvInput = {
  bytes: Uint8Array;
  organizationId: string;
  userId: string;
  channelAccountId: string;
  fileName: string;
  fileHash: string;
};

export interface RocketSellpiaMatchingCsvImportPort {
  importMatchingCsv(
    input: ImportRocketSellpiaMatchingCsvInput,
  ): Promise<CoupangRocketMatchingCsvImportResponse>;
}
