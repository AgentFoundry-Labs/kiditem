import { Inject, Injectable } from '@nestjs/common';
import type {
  SellpiaInventorySkuReadModel,
  SellpiaInventorySkuReadPort,
} from '../port/in/stock/sellpia-inventory-sku-read.port';
import {
  SELLPIA_INVENTORY_SKU_READ_REPOSITORY_PORT,
  type SellpiaInventorySkuReadRepositoryPort,
} from '../port/out/repository/sellpia-inventory-sku-read.repository.port';

@Injectable()
export class SellpiaInventorySkuReadService implements SellpiaInventorySkuReadPort {
  constructor(
    @Inject(SELLPIA_INVENTORY_SKU_READ_REPOSITORY_PORT)
    private readonly repository: SellpiaInventorySkuReadRepositoryPort,
  ) {}

  findByIds(
    organizationId: string,
    ids: string[],
  ): Promise<SellpiaInventorySkuReadModel[]> {
    return this.readIdentifiers(ids, (values) =>
      this.repository.findByIds(organizationId, values));
  }

  findByCodes(
    organizationId: string,
    codes: string[],
  ): Promise<SellpiaInventorySkuReadModel[]> {
    return this.readIdentifiers(codes, (values) =>
      this.repository.findByCodes(organizationId, values));
  }

  findByBarcodes(
    organizationId: string,
    barcodes: string[],
  ): Promise<SellpiaInventorySkuReadModel[]> {
    return this.readIdentifiers(barcodes, (values) =>
      this.repository.findByBarcodes(organizationId, values));
  }

  findByNormalizedNames(
    organizationId: string,
    normalizedNames: string[],
  ): Promise<SellpiaInventorySkuReadModel[]> {
    return this.readIdentifiers(normalizedNames, (values) =>
      this.repository.findByNormalizedNames(organizationId, values));
  }

  search(
    organizationId: string,
    query: string,
    limit: number,
  ): Promise<SellpiaInventorySkuReadModel[]> {
    const normalizedQuery = query.trim();
    if (!normalizedQuery) return Promise.resolve([]);
    const cappedLimit = Number.isFinite(limit)
      ? Math.min(100, Math.max(1, Math.trunc(limit)))
      : 100;
    return this.repository.search(organizationId, normalizedQuery, cappedLimit);
  }

  private readIdentifiers(
    values: string[],
    read: (normalized: string[]) => Promise<SellpiaInventorySkuReadModel[]>,
  ): Promise<SellpiaInventorySkuReadModel[]> {
    const normalized = [...new Set(
      values.map((value) => value.trim()).filter(Boolean),
    )];
    if (normalized.length === 0) return Promise.resolve([]);
    return read(normalized);
  }
}
