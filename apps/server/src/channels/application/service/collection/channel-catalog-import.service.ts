import { CHANNEL_DOCUMENTS_PORT, type ChannelDocumentsPort } from '../../port/out/documents/channel-documents.port';
import { ChannelInputError as BadRequestException, ChannelConflictError as ConflictException } from '../../../domain/exception/channel-business-error';
import type { CoupangWingCatalogImportResponse } from '@kiditem/shared/source-import';
import { KiditemInvalidValueError } from '@kiditem/shared/errors';
import { z } from 'zod';
import {
  type ChannelCatalogImportPort,
  type ImportCoupangWingCatalogInput,
} from '../../port/in/channel-catalog-import.port';
import {
  CHANNEL_CATALOG_IMPORT_REPOSITORY_PORT,
  type ChannelCatalogImportRepositoryPort,
} from '../../port/out/repository/channel-catalog-import.repository.port';


export class ChannelCatalogImportService implements ChannelCatalogImportPort {
  constructor(

    private readonly repository: ChannelCatalogImportRepositoryPort,
     private readonly documents: ChannelDocumentsPort,
  ) {}

  async importCoupangWing(
    input: ImportCoupangWingCatalogInput,
  ): Promise<CoupangWingCatalogImportResponse> {
    const observedAt = excelObservedAt(input.observedAt);
    const parsed = this.documents.parseWingWorkbook(input.bytes);
    if (parsed.rows.length === 0) {
      throw new BadRequestException(
        'Coupang Wing catalog import contains no valid product/SKU rows.',
      );
    }
    const claim = await this.repository.claimCoupangWingImport({
      organizationId: input.organizationId,
      userId: input.userId,
      channelAccountId: input.channelAccountId,
      fileName: input.fileName,
      fileHash: input.fileHash,
      rowCount: parsed.rows.length,
    });

    if (claim.kind === 'duplicate') return claim.response;
    if (claim.kind === 'running') {
      throw new ConflictException({
        code: 'ATTEMPT_IN_PROGRESS',
        attemptId: claim.attemptId,
        message: '이 계정의 쿠팡 상품 목록을 이미 가져오는 중입니다. 끝난 뒤 다시 시도해 주세요.',
      });
    }

    try {
      return await this.repository.upsertCoupangWingCatalog({
        organizationId: input.organizationId,
        channelAccountId: input.channelAccountId,
        runId: claim.runId,
        attemptToken: claim.attemptToken,
        rows: parsed.rows,
        skippedRows: parsed.skippedRows,
        observedAt,
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

const ObservedAtSchema = z.string().datetime({ offset: true });

/** 엑셀 스냅샷 기준 시각. 미래 시각이나 ISO가 아닌 값은 받지 않는다. */
function excelObservedAt(value: string | undefined): string {
  if (value === undefined || value === '') return new Date().toISOString();
  const parsed = ObservedAtSchema.safeParse(value);
  if (!parsed.success || Date.parse(parsed.data) > Date.now() + 60_000) {
    throw new KiditemInvalidValueError('VALIDATION_FAILED', {
      details: { reason: 'CATALOG_EXCEL_OBSERVED_AT_INVALID', field: 'observedAt' },
    });
  }
  return new Date(parsed.data).toISOString();
}
