import type { CoupangRocketMatchingCsvImportResponse } from '@kiditem/shared/source-import';
import type { ImportRocketSellpiaMatchingCsvInput } from '../../in/rocket-sellpia-matching-csv-import.port';
import type { ParsedRocketSellpiaMatchingCsv } from '../documents/channel-document.models';

export type PersistRocketSellpiaMatchingCsvInput = Omit<ImportRocketSellpiaMatchingCsvInput, 'bytes'> & ParsedRocketSellpiaMatchingCsv;

export const ROCKET_SELLPIA_MATCHING_CSV_IMPORT_REPOSITORY_PORT = Symbol(
  'ROCKET_SELLPIA_MATCHING_CSV_IMPORT_REPOSITORY_PORT',
);

export interface RocketSellpiaMatchingCsvImportRepositoryPort {
  importMatchingCsv(
    input: PersistRocketSellpiaMatchingCsvInput,
  ): Promise<CoupangRocketMatchingCsvImportResponse>;
}
