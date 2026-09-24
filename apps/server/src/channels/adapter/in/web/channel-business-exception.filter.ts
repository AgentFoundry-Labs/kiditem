import { ArgumentsHost, Catch, type ExceptionFilter } from '@nestjs/common';
import { KiditemError, resolveErrorCode, type KiditemErrorCode } from '@kiditem/shared/errors';
import { ListingException } from '../../../application/exception/listing.exception';
import { GlobalExceptionFilter } from '../../../../common/filters/global-exception.filter';
import { ChannelBusinessError, type ChannelErrorKind } from '../../../domain/exception/channel-business-error';


const KIND_CODES: Record<ChannelErrorKind, KiditemErrorCode> = {
  invalid: 'VALIDATION_FAILED',
  not_found: 'NOT_FOUND',
  conflict: 'DB_CONFLICT',
  unsupported: 'CHANNELS_MALL_UNSUPPORTED',
  unavailable: 'SERVICE_UNAVAILABLE',
  forbidden: 'FORBIDDEN',
};

/** 수집 catalog identity(KID-338)가 아직 던지는 ListingException의 대응표. */
const LISTING_CODES: Record<'invalid' | 'not_found' | 'conflict', KiditemErrorCode> = {
  invalid: 'VALIDATION_FAILED', not_found: 'CHANNELS_LISTING_NOT_FOUND', conflict: 'DB_CONFLICT',
};

const HANGUL = /[가-힣]/;
const koreanOnly = (message: string) => (HANGUL.test(message) ? message : undefined);

/**
 * 채널 예외 → `KiditemError`로 바꿔 `GlobalExceptionFilter`에 위임한다(ADR-0023). 한글 문장은 그대로,
 * 영어 문장은 레지스트리 문장으로. `details.code`가 등록 코드로 풀리면 그 코드, 아니면 kind 기본 코드에
 * 원래 코드를 `details.reason`으로 남긴다.
 */
@Catch(ListingException, ChannelBusinessError)
export class ChannelBusinessExceptionFilter implements ExceptionFilter {
  catch(error: ListingException | ChannelBusinessError, host: ArgumentsHost) {
    new GlobalExceptionFilter().catch(toKiditemError(error), host);
  }
}

export function toKiditemError(error: ListingException | ChannelBusinessError): KiditemError {
  if (error instanceof ChannelBusinessError) {
    const { code: rawCode, message: _message, ...rest } = error.details;
    const resolved = resolveErrorCode(rawCode);
    const reason = !resolved && typeof rawCode === 'string' ? rawCode : rest.reason;
    return new KiditemError(resolved ?? KIND_CODES[error.kind], {
      message: koreanOnly(error.message),
      details: { ...rest, ...(reason !== undefined ? { reason } : {}) },
      cause: error,
    });
  }
  return new KiditemError(LISTING_CODES[error.code], { message: koreanOnly(error.message), cause: error });
}
