import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../../prisma/prisma.service';
import {
  readInventoryAvailability,
  readInventoryAvailabilityCandidates,
} from '../../../read/inventory-availability';
import { lockSellpiaInventory } from '../../../transaction/sellpia-inventory-lock';
import type { InventoryAvailabilityBatch } from '@kiditem/shared/inventory-availability';
import type { InventoryAvailabilityCandidate } from '../../../application/port/in/stock/inventory-availability.port';
import type { InventoryAvailabilityRepositoryPort } from '../../../application/port/out/repository/inventory-availability.repository.port';

const TRANSACTION_OPTIONS = { maxWait: 10_000, timeout: 30_000 } as const;

@Injectable()
export class InventoryAvailabilityRepositoryAdapter
implements InventoryAvailabilityRepositoryPort {
  constructor(private readonly prisma: PrismaService) {}

  findAvailability(input: {
    organizationId: string;
    sellpiaInventorySkuIds: string[];
  }): Promise<InventoryAvailabilityBatch> {
    return this.prisma.$transaction(async (tx) => {
      const inventoryLock = await lockSellpiaInventory(tx, input.organizationId);
      return readInventoryAvailability(tx, inventoryLock, input);
    }, TRANSACTION_OPTIONS);
  }


  searchAvailabilityCandidates(input: {
    organizationId: string;
    query: string;
    limit: number;
    stockStatus: 'in_stock' | 'all';
  }): Promise<InventoryAvailabilityCandidate[]> {
    return this.prisma.$transaction(async (tx) => {
      const inventoryLock = await lockSellpiaInventory(tx, input.organizationId);
      return readInventoryAvailabilityCandidates(tx, inventoryLock, input);
    }, TRANSACTION_OPTIONS);
  }
}
