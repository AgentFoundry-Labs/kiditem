import { Inject, Injectable } from '@nestjs/common';
import type {
  ProductSourceReadModel,
  ProductSourceReadPort,
} from '../port/in/product-source-read.port';
import {
  PRODUCT_SOURCE_READ_REPOSITORY_PORT,
  type ProductSourceReadRepositoryPort,
} from '../port/out/persistence/product-source-read.repository.port';

@Injectable()
export class ProductSourceReadUseCase implements ProductSourceReadPort {
  constructor(
    @Inject(PRODUCT_SOURCE_READ_REPOSITORY_PORT)
    private readonly repository: ProductSourceReadRepositoryPort,
  ) {}

  listActiveForMatching(
    organizationId: string,
  ): Promise<ProductSourceReadModel[]> {
    return this.repository.listActiveForMatching(organizationId);
  }

  findByIds(
    organizationId: string,
    ids: string[],
  ): Promise<ProductSourceReadModel[]> {
    return this.readIdentifiers(ids, (values) =>
      this.repository.findByIds(organizationId, values));
  }

  findByCodes(
    organizationId: string,
    codes: string[],
  ): Promise<ProductSourceReadModel[]> {
    return this.readIdentifiers(codes, (values) =>
      this.repository.findByCodes(organizationId, values));
  }

  findByBarcodes(
    organizationId: string,
    barcodes: string[],
  ): Promise<ProductSourceReadModel[]> {
    return this.readIdentifiers(barcodes, (values) =>
      this.repository.findByBarcodes(organizationId, values));
  }

  findByNormalizedBarcodes(
    organizationId: string,
    normalizedBarcodes: string[],
  ): Promise<ProductSourceReadModel[]> {
    const validBarcodes = [...new Set(normalizedBarcodes
      .map((value) => value.trim())
      .filter((value) => /^\d{8,14}$/.test(value)))];
    if (validBarcodes.length === 0) return Promise.resolve([]);
    return this.repository.findByNormalizedBarcodes(organizationId, validBarcodes);
  }

  findByNormalizedNames(
    organizationId: string,
    normalizedNames: string[],
  ): Promise<ProductSourceReadModel[]> {
    return this.readIdentifiers(normalizedNames, (values) =>
      this.repository.findByNormalizedNames(organizationId, values));
  }

  search(
    organizationId: string,
    query: string,
    limit: number,
  ): Promise<ProductSourceReadModel[]> {
    const normalizedQuery = query.trim();
    if (!normalizedQuery) return Promise.resolve([]);
    const cappedLimit = Number.isFinite(limit)
      ? Math.min(100, Math.max(1, Math.trunc(limit)))
      : 100;
    return this.repository.search(
      organizationId,
      normalizedQuery,
      cappedLimit,
    );
  }

  private readIdentifiers(
    values: string[],
    read: (normalized: string[]) => Promise<ProductSourceReadModel[]>,
  ): Promise<ProductSourceReadModel[]> {
    const normalized = [...new Set(
      values.map((value) => value.trim()).filter(Boolean),
    )];
    if (normalized.length === 0) return Promise.resolve([]);
    return read(normalized);
  }
}
