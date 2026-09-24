import { Inject, Injectable } from '@nestjs/common';
import { UpdateMasterProductInputSchema } from '@kiditem/shared/product-operations';
import { ProductInputException } from '../exception/product-input.exception';
import { type ProductMetadataPort } from '../port/in/product-metadata.port';
import { PRODUCT_QUERY_PORT, type ProductQueryPort } from '../port/in/product-query.port';
import { PRODUCT_OPERATIONS_REPOSITORY_PORT, type ProductOperationsRepositoryPort } from '../port/out/persistence/product-operations.repository.port';

@Injectable()
export class UpdateProductMetadataUseCase implements ProductMetadataPort {
  constructor(
    @Inject(PRODUCT_OPERATIONS_REPOSITORY_PORT) private readonly repository: ProductOperationsRepositoryPort,
    @Inject(PRODUCT_QUERY_PORT) private readonly products: ProductQueryPort,
  ) {}

  async updateProduct(organizationId: string, masterProductId: string, rawInput: unknown) {
    const parsed = UpdateMasterProductInputSchema.safeParse(rawInput);
    if (!parsed.success) throw new ProductInputException('Only product images can be edited.');
    await this.repository.updateProduct(organizationId, masterProductId, parsed.data);
    return this.products.getProduct(organizationId, masterProductId);
  }
}
