import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import type { CoupangRocketMatchingCsvImportResponse } from '@kiditem/shared/source-import';
import {
  ROCKET_SELLPIA_MATCHING_CSV_IMPORT_PORT,
  type ImportRocketSellpiaMatchingCsvInput,
  type RocketSellpiaMatchingCsvImportPort,
} from '../port/in/rocket-sellpia-matching-csv-import.port';
import {
  ROCKET_SELLPIA_MATCHING_CSV_IMPORT_REPOSITORY_PORT,
  type RocketSellpiaMatchingCsvImportRepositoryPort,
} from '../port/out/repository/rocket-sellpia-matching-csv-import.repository.port';

@Injectable()
export class RocketSellpiaMatchingCsvImportService
implements RocketSellpiaMatchingCsvImportPort {
  constructor(
    @Inject(ROCKET_SELLPIA_MATCHING_CSV_IMPORT_REPOSITORY_PORT)
    private readonly repository: RocketSellpiaMatchingCsvImportRepositoryPort,
  ) {}

  async importMatchingCsv(
    input: ImportRocketSellpiaMatchingCsvInput,
  ): Promise<CoupangRocketMatchingCsvImportResponse> {
    if (input.rows.length === 0) {
      throw new BadRequestException('로켓-셀피아 매칭 CSV에 가져올 상품이 없습니다.');
    }
    return this.repository.importMatchingCsv(input);
  }
}
