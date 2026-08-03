import type { CoupangRocketMatchingCsvImportResponse } from '@kiditem/shared/source-import';
import type { ParsedRocketSellpiaMatchingCsv } from '../../service/rocket-sellpia-matching-csv.parser';

export const ROCKET_SELLPIA_MATCHING_CSV_IMPORT_PORT = Symbol(
  'ROCKET_SELLPIA_MATCHING_CSV_IMPORT_PORT',
);

export type ImportRocketSellpiaMatchingCsvInput = ParsedRocketSellpiaMatchingCsv & {
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
