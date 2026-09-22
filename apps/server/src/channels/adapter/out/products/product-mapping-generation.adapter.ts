import { Inject, Injectable } from '@nestjs/common';
import {
  PRODUCT_MAPPING_GENERATION_PORT,
  type ProductMappingGenerationPort,
} from '../../../../products/application/port/in/product-mapping-generation.port';
import type { ChannelsProductMappingGenerationPort } from '../../../application/port/out/cross-domain/product-mapping-generation.port';

@Injectable()
export class ChannelsProductMappingGenerationAdapter
implements ChannelsProductMappingGenerationPort {
  constructor(
    @Inject(PRODUCT_MAPPING_GENERATION_PORT)
    private readonly products: ProductMappingGenerationPort,
  ) {}

  advance<TClient>(tx: TClient, organizationId: string): Promise<bigint> {
    return this.products.advanceMappingGeneration({ client: tx }, organizationId);
  }
}
