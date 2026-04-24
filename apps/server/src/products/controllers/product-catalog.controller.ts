import { Controller, Get, Param, Query } from '@nestjs/common';
import { CurrentCompany } from '../../auth/decorators/current-company.decorator';
import {
  ProductCatalogCountsSchema,
  ProductCatalogDetailSchema,
  ProductCatalogListResponseSchema,
  type ProductCatalogCounts,
  type ProductCatalogDetail,
  type ProductCatalogListResponse,
} from '@kiditem/shared';
import { ProductCatalogService } from '../services/product-catalog.service';
import { ListProductCatalogQuery } from '../dto/list-product-catalog.query';

@Controller('products/catalog')
export class ProductCatalogController {
  constructor(private readonly catalog: ProductCatalogService) {}

  @Get()
  async list(
    @CurrentCompany() companyId: string,
    @Query() q: ListProductCatalogQuery,
  ): Promise<ProductCatalogListResponse> {
    return ProductCatalogListResponseSchema.parse(await this.catalog.list(companyId, q));
  }

  @Get('counts')
  async counts(
    @CurrentCompany() companyId: string,
    @Query() q: ListProductCatalogQuery,
  ): Promise<ProductCatalogCounts> {
    return ProductCatalogCountsSchema.parse(await this.catalog.counts(companyId, q));
  }

  @Get(':id')
  async detail(
    @CurrentCompany() companyId: string,
    @Param('id') id: string,
  ): Promise<ProductCatalogDetail> {
    return ProductCatalogDetailSchema.parse(await this.catalog.detail(companyId, id));
  }
}
