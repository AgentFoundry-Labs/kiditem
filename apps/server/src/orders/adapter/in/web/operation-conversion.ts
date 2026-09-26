import { StreamableFile } from '@nestjs/common';
import { KiditemInvalidValueError } from '@kiditem/shared/errors';
import type { Response } from 'express';
import type { MallOrdersOperationConversion } from '../../../application/service/mall-orders-operation.service';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * 변환 라우트 본문의 `operationId`(KID-359 H3). 없으면 null — 옛 attempt 헤더 경로다. 있으면 UUID여야 하고, 경로에
 * id가 있는 재생 라우트는 그 id와 같아야 한다.
 */
export function operationIdOf(raw: unknown, pathId?: string): string | null {
  if (raw === undefined || raw === null) return null;
  if (typeof raw !== 'string' || !UUID.test(raw)) {
    throw new KiditemInvalidValueError('VALIDATION_FAILED', { details: { reason: 'invalid_operation_id' } });
  }
  const operationId = raw.toLowerCase();
  if (pathId !== undefined && pathId.toLowerCase() !== operationId) {
    throw new KiditemInvalidValueError('VALIDATION_FAILED', { details: { reason: 'operation_path_mismatch', operationId } });
  }
  return operationId;
}

/**
 * 실행 id로 다시 변환한 파일을 옛 변환 응답과 같은 머리로 돌려준다. 주문이 없던 수집은 204와 0건 머리.
 */
export function conversionFile(response: Response, converted: MallOrdersOperationConversion): StreamableFile {
  response.setHeader('Cache-Control', 'private, no-store');
  response.setHeader('X-Order-Collection-Artifact-Id', converted.artifactId);
  const { conversion } = converted;
  if (!conversion) {
    for (const name of ['Source-Rows', 'Product-Rows', 'Output-Rows', 'Skipped-Rows']) {
      response.setHeader(`X-Order-Collection-${name}`, '0');
    }
    response.status(204);
    return new StreamableFile(Buffer.alloc(0));
  }
  const asciiFallback = conversion.fileName.replace(/[^\x20-\x7E]/g, '_');
  response.setHeader(
    'Content-Disposition',
    `attachment; filename="${asciiFallback}"; filename*=UTF-8''${encodeURIComponent(conversion.fileName)}`,
  );
  response.setHeader('Content-Type', converted.mallKey === 'art09' ? 'text/csv;charset=utf-8' : 'application/vnd.ms-excel');
  response.setHeader('X-Order-Collection-Source-Rows', String(conversion.sourceRows));
  response.setHeader('X-Order-Collection-Product-Rows', String(conversion.productRows));
  response.setHeader('X-Order-Collection-Output-Rows', String(conversion.outputRows));
  response.setHeader('X-Order-Collection-Skipped-Rows', String(conversion.skippedRows));
  return new StreamableFile(conversion.buffer);
}
