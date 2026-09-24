import { Inject, Injectable } from '@nestjs/common';
import { z } from 'zod';
import { validateProductSourceChange } from '../../domain/product-source-change';
import { ProductInputException } from '../exception/product-input.exception';
import type { ProductSourceBindingPort } from '../port/in/product-source-binding.port';
import { PRODUCT_QUERY_PORT, type ProductQueryPort } from '../port/in/product-query.port';
import { PRODUCT_OPERATIONS_REPOSITORY_PORT, type ProductOperationsRepositoryPort } from '../port/out/persistence/product-operations.repository.port';

const SourceChangeInput = z.object({ sourceProductCode: z.string(), sourceOptionCode: z.string() }).strict();

@Injectable()
export class CorrectProductSourceBindingUseCase implements ProductSourceBindingPort {
  constructor(
    @Inject(PRODUCT_OPERATIONS_REPOSITORY_PORT) private readonly repository: ProductOperationsRepositoryPort,
    @Inject(PRODUCT_QUERY_PORT) private readonly products: ProductQueryPort,
  ) {}
  async correctSourceBinding(organizationId: string, masterProductId: string, input: unknown) {
    const parsed = SourceChangeInput.safeParse(input);
    if (!parsed.success) throw new ProductInputException('A source product code and option code are required.');
    const change = validateProductSourceChange(parsed.data);
    await this.repository.correctSourceBinding(organizationId, masterProductId, change);
    return this.products.getProduct(organizationId, masterProductId);
  }
}
