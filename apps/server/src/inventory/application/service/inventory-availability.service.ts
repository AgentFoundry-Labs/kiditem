import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import type { InventoryAvailabilityBatch } from '@kiditem/shared/inventory-availability';
import type { InventoryAvailabilityPort } from '../port/in/stock/inventory-availability.port';
import {
  INVENTORY_AVAILABILITY_REPOSITORY_PORT,
  type InventoryAvailabilityRepositoryPort,
} from '../port/out/repository/inventory-availability.repository.port';

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
    assertUuid(input.organizationId, 'organizationId');
    input.sellpiaInventorySkuIds.forEach((value) =>
      assertUuid(value, 'sellpiaInventorySkuIds'));
    const sellpiaInventorySkuIds = [...new Set(input.sellpiaInventorySkuIds)]
      .sort((left, right) => left.localeCompare(right));
    return this.repository.findAvailability({
      organizationId: input.organizationId,
      sellpiaInventorySkuIds,
    });
  }
}

function assertUuid(value: string, field: string): void {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) {
    throw new BadRequestException(`${field} must be a UUID`);
  }
}
