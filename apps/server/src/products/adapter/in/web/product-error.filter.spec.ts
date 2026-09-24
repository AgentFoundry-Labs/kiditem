import { type ArgumentsHost, Logger } from '@nestjs/common';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ERROR_DEFINITIONS } from '@kiditem/shared/errors';
import { ProductInputException } from '../../../application/exception/product-input.exception';
import { ProductStateException } from '../../../application/exception/product-state.exception';
import { ProductRuleException } from '../../../domain/exception/product-rule.exception';
import { ProductErrorFilter } from './product-error.filter';

function responseHost() {
  const json = vi.fn();
  const status = vi.fn().mockReturnValue({ json });
  const host = {
    switchToHttp: () => ({
      getRequest: () => ({ method: 'PATCH', url: '/api/products/1' }),
      getResponse: () => ({ status }),
    }),
  } as unknown as ArgumentsHost;
  return { host, status, json };
}

describe('ProductErrorFilter → ADR-0023 envelope', () => {
  beforeEach(() => vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined));
  afterEach(() => vi.restoreAllMocks());

  it.each([
    [new ProductStateException('NOT_FOUND', 'Product not found'), 404, 'PRODUCTS_NOT_FOUND'],
    [new ProductStateException('SOURCE_CONFLICT', 'The source identity already belongs to another product.'), 409, 'PRODUCTS_STATE_CONFLICT'],
    [new ProductInputException('Only product images can be edited.'), 400, 'VALIDATION_FAILED'],
    [new ProductRuleException('INVALID_STOCK', 'Source stock must be a bounded nonnegative integer.'), 400, 'VALIDATION_FAILED'],
  ] as const)('maps case %# to its registered code and Korean sentence', (error, statusCode, code) => {
    const { host, status, json } = responseHost();
    new ProductErrorFilter().catch(error, host);
    expect(status).toHaveBeenCalledWith(statusCode);
    expect(json).toHaveBeenCalledWith({
      statusCode,
      code,
      kind: ERROR_DEFINITIONS[code].kind,
      message: ERROR_DEFINITIONS[code].text,
      errors: [],
      ...(error instanceof ProductRuleException ? { details: { reason: 'INVALID_STOCK' } } : {}),
    });
  });
});
