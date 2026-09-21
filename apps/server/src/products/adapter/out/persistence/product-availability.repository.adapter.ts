import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../../prisma/prisma.service';
import {
  readProductSourceAvailability,
  readProductAvailabilityCandidates,
} from './read/product-source-availability';
import { lockProductSource } from './transaction/product-source-lock';
import type { InventoryAvailabilityBatch } from '@kiditem/shared/inventory-availability';
import type { ProductAvailabilityCandidate } from '../../../application/port/in/product-availability.port';
import type { ProductAvailabilityRepositoryPort } from '../../../application/port/out/persistence/product-availability.repository.port';

const TRANSACTION_OPTIONS = { maxWait: 10_000, timeout: 30_000 } as const;

@Injectable()
export class ProductAvailabilityRepositoryAdapter
implements ProductAvailabilityRepositoryPort {
  constructor(private readonly prisma: PrismaService) {}

  findAvailability(input: {
    organizationId: string;
    masterProductIds: string[];
  }): Promise<InventoryAvailabilityBatch> {
    return this.prisma.$transaction(async (tx) => {
      const inventoryLock = await lockProductSource(tx, input.organizationId);
      return readProductSourceAvailability(tx, inventoryLock, input);
    }, TRANSACTION_OPTIONS);
  }


  searchAvailabilityCandidates(input: {
    organizationId: string;
    query: string;
    limit: number;
    stockStatus: 'in_stock' | 'all';
  }): Promise<ProductAvailabilityCandidate[]> {
    return this.prisma.$transaction(async (tx) => {
      const inventoryLock = await lockProductSource(tx, input.organizationId);
      return readProductAvailabilityCandidates(tx, inventoryLock, input);
    }, TRANSACTION_OPTIONS);
  }
}
