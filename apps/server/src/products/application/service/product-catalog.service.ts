import { Injectable, NotFoundException } from '@nestjs/common';
import type {
  ProductCatalogCounts,
  ProductCatalogDetail,
  ProductCatalogListResponse,
} from '@kiditem/shared/product';
import { PrismaService } from '../../../prisma/prisma.service';
import {
  findCatalogCountsRows,
  findCatalogDetail,
  findCatalogPage,
} from '../../adapter/out/prisma/product-catalog.query';
import {
  mapCatalogCounts,
  mapCatalogDetail,
  mapCatalogListItem,
} from '../../mapper/product-catalog.mapper';
import { ListProductCatalogQuery } from '../../dto/list-product-catalog.query';

@Injectable()
export class ProductCatalogService {
  constructor(private readonly prisma: PrismaService) {}

  async list(organizationId: string, q: ListProductCatalogQuery): Promise<ProductCatalogListResponse> {
    const { rows, total, page, limit } = await findCatalogPage(this.prisma, organizationId, q);
    return {
      items: rows.map(mapCatalogListItem),
      total,
      page,
      limit,
    } satisfies ProductCatalogListResponse;
  }

  async detail(organizationId: string, id: string): Promise<ProductCatalogDetail> {
    const row = await findCatalogDetail(this.prisma, organizationId, id);
    if (!row) throw new NotFoundException('master not found');
    return mapCatalogDetail(row);
  }

  async counts(
    organizationId: string,
    q: Pick<ListProductCatalogQuery, 'status' | 'pipelineStep'> = {},
  ): Promise<ProductCatalogCounts> {
    const rows = await findCatalogCountsRows(this.prisma, organizationId, q);
    return mapCatalogCounts(rows);
  }
}
