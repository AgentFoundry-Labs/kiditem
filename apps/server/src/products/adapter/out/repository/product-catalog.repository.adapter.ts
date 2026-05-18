import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../../prisma/prisma.service';
import type { ListProductCatalogQuery } from '../../../dto/list-product-catalog.query';
import type { ProductCatalogRepositoryPort } from '../../../application/port/out/product-catalog.repository.port';
import {
  findCatalogCountsRows,
  findCatalogDetail,
  findCatalogPage,
} from './product-catalog.query';

@Injectable()
export class ProductCatalogRepositoryAdapter implements ProductCatalogRepositoryPort {
  constructor(private readonly prisma: PrismaService) {}

  findCatalogPage(organizationId: string, query: ListProductCatalogQuery) {
    return findCatalogPage(this.prisma, organizationId, query);
  }

  findCatalogDetail(organizationId: string, id: string) {
    return findCatalogDetail(this.prisma, organizationId, id);
  }

  findCatalogCountsRows(
    organizationId: string,
    query: Pick<ListProductCatalogQuery, 'lifecycleState'> = {},
  ) {
    return findCatalogCountsRows(this.prisma, organizationId, query);
  }
}
