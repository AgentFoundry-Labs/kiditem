import { ArgumentsHost, Catch, type ExceptionFilter } from '@nestjs/common';
import type { Response } from 'express';
import { ProductInputException } from '../../../application/exception/product-input.exception';
import { ProductStateException } from '../../../application/exception/product-state.exception';
import { ProductRuleException } from '../../../domain/exception/product-rule.exception';

@Catch(ProductInputException, ProductStateException, ProductRuleException)
export class ProductErrorFilter implements ExceptionFilter {
  catch(error: ProductInputException | ProductStateException | ProductRuleException, host: ArgumentsHost) {
    const status = error instanceof ProductStateException ? (error.code === 'NOT_FOUND' ? 404 : 409) : 400;
    host.switchToHttp().getResponse<Response>().status(status).json({ statusCode: status, message: error.message });
  }
}
