import { Controller, Get, Param, Query } from '@nestjs/common';
import { CurrentOrganization } from '../../../../auth/decorators/current-organization.decorator';
import { ProductCatalogCountsSchema, ProductCatalogDetailSchema, ProductCatalogListResponseSchema, type ProductCatalogCounts, type ProductCatalogDetail, type ProductCatalogListResponse } from '@kiditem/shared/product';
import { ProductCatalogService } from '../../../application/service/product-catalog.service';
import { ListProductCatalogQuery } from '../../../dto/list-product-catalog.query';

@Controller('products/catalog')
export class ProductCatalogController {
  constructor(private readonly catalog: ProductCatalogService) {}

  @Get()
  async list(
    @CurrentOrganization() organizationId: string,
    @Query() q: ListProductCatalogQuery,
  ): Promise<ProductCatalogListResponse> {
    return ProductCatalogListResponseSchema.parse(await this.catalog.list(organizationId, q));
  }

  @Get('counts')
  async counts(
    @CurrentOrganization() organizationId: string,
    @Query() q: ListProductCatalogQuery,
  ): Promise<ProductCatalogCounts> {
    return ProductCatalogCountsSchema.parse(await this.catalog.counts(organizationId, q));
  }

  @Get(':id')
  async detail(
    @CurrentOrganization() organizationId: string,
    @Param('id') id: string,
  ): Promise<ProductCatalogDetail> {
    return ProductCatalogDetailSchema.parse(await this.catalog.detail(organizationId, id));
  }
}
