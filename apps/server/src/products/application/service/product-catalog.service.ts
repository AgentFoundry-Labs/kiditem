import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import type {
  ProductCatalogCounts,
  ProductCatalogDetail,
  ProductCatalogListResponse,
} from '@kiditem/shared/product';
import {
  mapCatalogCounts,
  mapCatalogDetail,
  mapCatalogListItem,
} from '../../mapper/product-catalog.mapper';
import { ListProductCatalogQuery } from '../../dto/list-product-catalog.query';
import {
  PRODUCT_CATALOG_REPOSITORY_PORT,
  type ProductCatalogRepositoryPort,
} from '../port/out/product-catalog.repository.port';

@Injectable()
export class ProductCatalogService {
  constructor(
    @Inject(PRODUCT_CATALOG_REPOSITORY_PORT)
    private readonly catalog: ProductCatalogRepositoryPort,
  ) {}

  async list(organizationId: string, q: ListProductCatalogQuery): Promise<ProductCatalogListResponse> {
    const { rows, total, page, limit } = await this.catalog.findCatalogPage(organizationId, q);
    return {
      items: rows.map(mapCatalogListItem),
      total,
      page,
      limit,
    } satisfies ProductCatalogListResponse;
  }

  async detail(organizationId: string, id: string): Promise<ProductCatalogDetail> {
    const row = await this.catalog.findCatalogDetail(organizationId, id);
    if (!row) throw new NotFoundException('master not found');
    return mapCatalogDetail(row);
  }

  async counts(
    organizationId: string,
    q: Pick<ListProductCatalogQuery, 'lifecycleState'> = {},
  ): Promise<ProductCatalogCounts> {
    const rows = await this.catalog.findCatalogCountsRows(organizationId, q);
    return mapCatalogCounts(rows);
  }
}
