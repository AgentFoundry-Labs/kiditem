import { ArgumentsHost, Catch, type ExceptionFilter } from '@nestjs/common';
import { KiditemConflictError } from '@kiditem/shared/errors';
import { SourceRecordDuplicateError } from '../../../domain/source-record-admission';
import { GlobalExceptionFilter } from '../../../../common/filters/global-exception.filter';

/**
 * 같은 원본의 두 번째 수집 → 409 `SOURCING_DUPLICATE_RECORD`(KID-313, ADR-0023). `details.existing`이
 * 운영자가 갈 곳이다 — 초안이면 수집상품, 판매 상품이면 등록 상품. 입장 규칙의 거절과 동시 수집이
 * 유일키에 부딪힌 경우가 모두 이 오류로 온다. 문장은 거절 이유별 한국어 문장 그대로.
 */
@Catch(SourceRecordDuplicateError)
export class SourceRecordDuplicateFilter implements ExceptionFilter {
  catch(error: SourceRecordDuplicateError, host: ArgumentsHost) {
    new GlobalExceptionFilter().catch(new KiditemConflictError('SOURCING_DUPLICATE_RECORD', {
      message: error.message,
      details: { reason: error.refusal.reason, existing: error.refusal.existing },
      cause: error,
    }), host);
  }
}
