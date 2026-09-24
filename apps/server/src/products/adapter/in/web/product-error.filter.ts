import { ArgumentsHost, Catch, type ExceptionFilter } from '@nestjs/common';
import { KiditemError } from '@kiditem/shared/errors';
import { ProductInputException } from '../../../application/exception/product-input.exception';
import { ProductStateException } from '../../../application/exception/product-state.exception';
import { ProductRuleException } from '../../../domain/exception/product-rule.exception';
import { GlobalExceptionFilter } from '../../../../common/filters/global-exception.filter';

/** 상품 예외 → `KiditemError`로 바꿔 `GlobalExceptionFilter`에 위임한다(ADR-0023). 영어 원문은 로그로만. */
@Catch(ProductInputException, ProductStateException, ProductRuleException)
export class ProductErrorFilter implements ExceptionFilter {
  catch(error: ProductInputException | ProductStateException | ProductRuleException, host: ArgumentsHost) {
    const mapped = error instanceof ProductStateException
      ? new KiditemError(error.code === 'NOT_FOUND' ? 'PRODUCTS_NOT_FOUND' : 'PRODUCTS_STATE_CONFLICT', { cause: error })
      : new KiditemError('VALIDATION_FAILED', {
        cause: error,
        ...(error instanceof ProductRuleException ? { details: { reason: error.code } } : {}),
      });
    new GlobalExceptionFilter().catch(mapped, host);
  }
}
