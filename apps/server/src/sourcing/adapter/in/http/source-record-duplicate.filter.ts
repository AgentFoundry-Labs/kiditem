import { ArgumentsHost, Catch, type ExceptionFilter } from '@nestjs/common';
import type { Response } from 'express';
import { SourceRecordDuplicateError } from '../../../domain/source-record-admission';

/**
 * 같은 원본의 두 번째 수집 → 409(KID-313). 본문의 `existing` 이 운영자가 갈 곳이다 — 초안이면
 * 수집상품, 판매 상품이면 등록 상품. 입장 규칙의 거절과 동시 수집이 유일키에 부딪힌 경우가 모두
 * 이 오류로 온다.
 */
@Catch(SourceRecordDuplicateError)
export class SourceRecordDuplicateFilter implements ExceptionFilter {
  catch(error: SourceRecordDuplicateError, host: ArgumentsHost) {
    host.switchToHttp().getResponse<Response>().status(409).json({
      statusCode: 409,
      message: error.message,
      reason: error.refusal.reason,
      existing: error.refusal.existing,
    });
  }
}
