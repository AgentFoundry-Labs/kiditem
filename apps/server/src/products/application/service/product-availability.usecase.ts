import { InvalidProductSourceError } from '../exception/product-source.error';
import { Inject, Injectable } from '@nestjs/common';
import type { InventoryAvailabilityBatch } from '@kiditem/shared/inventory-availability';
import type {
  ProductAvailabilityCandidate,
  ProductAvailabilityPort,
} from '../port/in/product-availability.port';
import {
  PRODUCT_AVAILABILITY_REPOSITORY_PORT,
  type ProductAvailabilityRepositoryPort,
} from '../port/out/persistence/product-availability.repository.port';

@Injectable()
export class ProductAvailabilityUseCase implements ProductAvailabilityPort {
  constructor(
    @Inject(PRODUCT_AVAILABILITY_REPOSITORY_PORT)
    private readonly repository: ProductAvailabilityRepositoryPort,
  ) {}

  findByMasterProductIds(input: {
    organizationId: string;
    masterProductIds: string[];
  }): Promise<InventoryAvailabilityBatch> {
    const masterProductIds = normalizeInput(input);
    return this.repository.findAvailability({
      organizationId: input.organizationId,
      masterProductIds,
    });
  }

  searchCandidates(input: {
    organizationId: string;
    query: string;
    limit: number;
    stockStatus: 'in_stock' | 'all';
  }): Promise<ProductAvailabilityCandidate[]> {
    assertUuid(input.organizationId, 'organizationId');
    const query = input.query.trim();
    if (!query) return Promise.resolve([]);
    const limit = Number.isFinite(input.limit)
      ? Math.min(50, Math.max(1, Math.trunc(input.limit)))
      : 20;
    return this.repository.searchAvailabilityCandidates({
      ...input,
      query,
      limit,
    });
  }

}

function normalizeInput(input: {
  organizationId: string;
  masterProductIds: string[];
}): string[] {
  assertUuid(input.organizationId, 'organizationId');
  input.masterProductIds.forEach((value) =>
    assertUuid(value, 'masterProductIds'));
  return [...new Set(input.masterProductIds)]
    .sort((left, right) => left.localeCompare(right));
}

function assertUuid(value: string, field: string): void {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) {
    throw new InvalidProductSourceError(`${field} must be a UUID`);
  }
}
