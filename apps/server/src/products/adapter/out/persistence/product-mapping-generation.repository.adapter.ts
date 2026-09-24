import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { advanceProductMappingGeneration } from './product-mapping-generation';
import type {
  ProductMappingGenerationPort,
} from '../../../application/port/in/product-mapping-generation.port';
import type { ProductTransactionContext } from '../../../application/port/in/product-transactional-read.port';

@Injectable()
export class ProductMappingGenerationRepositoryAdapter
implements ProductMappingGenerationPort {
  advanceMappingGeneration<TClient>(
    context: ProductTransactionContext<TClient>,
    organizationId: string,
  ): Promise<bigint> {
    return advanceProductMappingGeneration(
      context.client as Prisma.TransactionClient,
      organizationId,
    );
  }
}
