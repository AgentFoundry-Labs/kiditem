import { Inject, Injectable } from '@nestjs/common';
import {
  INVENTORY_SKU_READ_REPOSITORY_PORT,
  type InventorySkuReadRepositoryPort,
} from '../port/out/repository/inventory-sku-read.repository.port';
import type {
  InventorySkuReadModel,
  InventorySkuReadPort,
} from '../port/in/stock/inventory-sku-read.port';

@Injectable()
export class InventorySkuReadService implements InventorySkuReadPort {
  constructor(
    @Inject(INVENTORY_SKU_READ_REPOSITORY_PORT)
    private readonly repository: InventorySkuReadRepositoryPort,
  ) {}

  findByIds(organizationId: string, ids: string[]): Promise<InventorySkuReadModel[]> {
    return this.readIdentifiers(ids, (values) =>
      this.repository.findByIds(organizationId, values));
  }

  findBySellpiaCodes(
    organizationId: string,
    codes: string[],
  ): Promise<InventorySkuReadModel[]> {
    return this.readIdentifiers(codes, (values) =>
      this.repository.findBySellpiaCodes(organizationId, values));
  }

  findByBarcodes(
    organizationId: string,
    barcodes: string[],
  ): Promise<InventorySkuReadModel[]> {
    return this.readIdentifiers(barcodes, (values) =>
      this.repository.findByBarcodes(organizationId, values));
  }

  search(
    organizationId: string,
    query: string,
    limit: number,
  ): Promise<InventorySkuReadModel[]> {
    const trimmedQuery = query.trim();
    if (!trimmedQuery) return Promise.resolve([]);
    const cappedLimit = Number.isFinite(limit)
      ? Math.min(100, Math.max(1, Math.trunc(limit)))
      : 100;
    return this.repository.search(organizationId, trimmedQuery, cappedLimit);
  }

  private readIdentifiers(
    values: string[],
    read: (normalized: string[]) => Promise<InventorySkuReadModel[]>,
  ): Promise<InventorySkuReadModel[]> {
    const normalized = [...new Set(values.map((value) => value.trim()).filter(Boolean))];
    if (normalized.length === 0) return Promise.resolve([]);
    return read(normalized);
  }
}
