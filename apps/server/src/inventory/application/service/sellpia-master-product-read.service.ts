import { Inject, Injectable } from '@nestjs/common';
import type {
  SellpiaMasterProductReadModel,
  SellpiaMasterProductReadPort,
} from '../port/in/stock/sellpia-master-product-read.port';
import {
  SELLPIA_MASTER_PRODUCT_READ_REPOSITORY_PORT,
  type SellpiaMasterProductReadRepositoryPort,
} from '../port/out/repository/sellpia-master-product-read.repository.port';

@Injectable()
export class SellpiaMasterProductReadService implements SellpiaMasterProductReadPort {
  constructor(
    @Inject(SELLPIA_MASTER_PRODUCT_READ_REPOSITORY_PORT)
    private readonly repository: SellpiaMasterProductReadRepositoryPort,
  ) {}

  findByIds(
    organizationId: string,
    ids: string[],
  ): Promise<SellpiaMasterProductReadModel[]> {
    return this.readIdentifiers(ids, (values) =>
      this.repository.findByIds(organizationId, values));
  }

  findByCodes(
    organizationId: string,
    codes: string[],
  ): Promise<SellpiaMasterProductReadModel[]> {
    return this.readIdentifiers(codes, (values) =>
      this.repository.findByCodes(organizationId, values));
  }

  findByBarcodes(
    organizationId: string,
    barcodes: string[],
  ): Promise<SellpiaMasterProductReadModel[]> {
    return this.readIdentifiers(barcodes, (values) =>
      this.repository.findByBarcodes(organizationId, values));
  }

  findByNormalizedNames(
    organizationId: string,
    normalizedNames: string[],
  ): Promise<SellpiaMasterProductReadModel[]> {
    return this.readIdentifiers(normalizedNames, (values) =>
      this.repository.findByNormalizedNames(organizationId, values));
  }

  search(
    organizationId: string,
    query: string,
    limit: number,
  ): Promise<SellpiaMasterProductReadModel[]> {
    const normalizedQuery = query.trim();
    if (!normalizedQuery) return Promise.resolve([]);
    const cappedLimit = Number.isFinite(limit)
      ? Math.min(100, Math.max(1, Math.trunc(limit)))
      : 100;
    return this.repository.search(organizationId, normalizedQuery, cappedLimit);
  }

  private readIdentifiers(
    values: string[],
    read: (normalized: string[]) => Promise<SellpiaMasterProductReadModel[]>,
  ): Promise<SellpiaMasterProductReadModel[]> {
    const normalized = [...new Set(
      values.map((value) => value.trim()).filter(Boolean),
    )];
    if (normalized.length === 0) return Promise.resolve([]);
    return read(normalized);
  }
}
