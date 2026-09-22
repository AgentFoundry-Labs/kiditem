import { CHANNEL_DOCUMENTS_PORT, type ChannelDocumentsPort } from '../../port/out/documents/channel-documents.port';
import { ChannelInputError as BadRequestException } from '../../../domain/exception/channel-business-error';
import type { CoupangRocketMatchingCsvImportResponse } from '@kiditem/shared/source-import';
import {
  ROCKET_SELLPIA_MATCHING_CSV_IMPORT_PORT,
  type ImportRocketSellpiaMatchingCsvInput,
  type RocketSellpiaMatchingCsvImportPort,
} from '../../port/in/rocket-sellpia-matching-csv-import.port';
import {
  ROCKET_SELLPIA_MATCHING_CSV_IMPORT_REPOSITORY_PORT,
  type RocketSellpiaMatchingCsvImportRepositoryPort,
} from '../../port/out/repository/rocket-sellpia-matching-csv-import.repository.port';


export class RocketSellpiaMatchingCsvImportService
implements RocketSellpiaMatchingCsvImportPort {
  constructor(

    private readonly repository: RocketSellpiaMatchingCsvImportRepositoryPort,
     private readonly documents: ChannelDocumentsPort,
  ) {}

  async importMatchingCsv(
    input: ImportRocketSellpiaMatchingCsvInput,
  ): Promise<CoupangRocketMatchingCsvImportResponse> {
    const { bytes, ...metadata } = input;
    const parsed = this.documents.parseRocketMatchingCsv(bytes);
    if (parsed.rows.length === 0) {
      throw new BadRequestException('로켓-셀피아 매칭 CSV에 가져올 상품이 없습니다.');
    }
    return this.repository.importMatchingCsv({ ...metadata, ...parsed });
  }
}
