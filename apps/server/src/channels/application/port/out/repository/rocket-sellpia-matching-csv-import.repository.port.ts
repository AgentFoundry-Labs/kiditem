import type { CoupangRocketMatchingCsvImportResponse } from '@kiditem/shared/source-import';
import type { ImportRocketSellpiaMatchingCsvInput } from '../../in/rocket-sellpia-matching-csv-import.port';

export const ROCKET_SELLPIA_MATCHING_CSV_IMPORT_REPOSITORY_PORT = Symbol(
  'ROCKET_SELLPIA_MATCHING_CSV_IMPORT_REPOSITORY_PORT',
);

export interface RocketSellpiaMatchingCsvImportRepositoryPort {
  importMatchingCsv(
    input: ImportRocketSellpiaMatchingCsvInput,
  ): Promise<CoupangRocketMatchingCsvImportResponse>;
}
