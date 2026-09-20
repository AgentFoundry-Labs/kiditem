import { InvalidInventoryItemError } from '../../domain/exception/invalid-inventory-item.error';
import { Inject, Injectable } from '@nestjs/common';
import type { InventoryAvailabilityBatch } from '@kiditem/shared/inventory-availability';
import type {
  InventoryAvailabilityCandidate,
  InventoryAvailabilityPort,
} from '../port/in/stock/inventory-availability.port';
import {
  INVENTORY_AVAILABILITY_REPOSITORY_PORT,
  type InventoryAvailabilityRepositoryPort,
} from '../port/out/persistence/inventory-availability.repository.port';

@Injectable()
export class InventoryAvailabilityService implements InventoryAvailabilityPort {
  constructor(
    @Inject(INVENTORY_AVAILABILITY_REPOSITORY_PORT)
    private readonly repository: InventoryAvailabilityRepositoryPort,
  ) {}

  findBySkuIds(input: {
    organizationId: string;
    sellpiaInventorySkuIds: string[];
  }): Promise<InventoryAvailabilityBatch> {
    const sellpiaInventorySkuIds = normalizeInput(input);
    return this.repository.findAvailability({
      organizationId: input.organizationId,
      sellpiaInventorySkuIds,
    });
  }

  searchCandidates(input: {
    organizationId: string;
    query: string;
    limit: number;
    stockStatus: 'in_stock' | 'all';
  }): Promise<InventoryAvailabilityCandidate[]> {
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
  sellpiaInventorySkuIds: string[];
}): string[] {
  assertUuid(input.organizationId, 'organizationId');
  input.sellpiaInventorySkuIds.forEach((value) =>
    assertUuid(value, 'sellpiaInventorySkuIds'));
  return [...new Set(input.sellpiaInventorySkuIds)]
    .sort((left, right) => left.localeCompare(right));
}

function assertUuid(value: string, field: string): void {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) {
    throw new InvalidInventoryItemError(`${field} must be a UUID`);
  }
}
