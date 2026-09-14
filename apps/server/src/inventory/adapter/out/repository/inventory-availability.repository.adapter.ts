import { Injectable } from '@nestjs/common';
import type { InventoryAvailabilityBatch } from '@kiditem/shared/inventory-availability';
import type { InventoryAvailabilityCandidate } from '../../../application/port/in/stock/inventory-availability.port';
import { PrismaService } from '../../../../prisma/prisma.service';
import type { InventoryAvailabilityRepositoryPort } from '../../../application/port/out/repository/inventory-availability.repository.port';
import {
  readInventoryAvailability,
  readInventoryAvailabilityCandidates,
} from '../../../read/inventory-availability';

const TRANSACTION_OPTIONS = { maxWait: 10_000, timeout: 30_000 } as const;

@Injectable()
export class InventoryAvailabilityRepositoryAdapter
implements InventoryAvailabilityRepositoryPort {
  constructor(private readonly prisma: PrismaService) {}

  findAvailability(input: {
    organizationId: string;
    sellpiaInventorySkuIds: string[];
  }): Promise<InventoryAvailabilityBatch> {
    return this.prisma.$transaction(
      (tx) => readInventoryAvailability(tx, input),
      TRANSACTION_OPTIONS,
    );
  }


  searchAvailabilityCandidates(input: {
    organizationId: string;
    query: string;
    limit: number;
    stockStatus: 'in_stock' | 'all';
  }): Promise<InventoryAvailabilityCandidate[]> {
    return this.prisma.$transaction(
      (tx) => readInventoryAvailabilityCandidates(tx, input),
      TRANSACTION_OPTIONS,
    );
  }
}
