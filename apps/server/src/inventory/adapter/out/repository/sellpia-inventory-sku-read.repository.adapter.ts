import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../../prisma/prisma.service';
import type {
  SellpiaInventorySkuReadModel,
  SellpiaInventorySkuReadRepositoryPort,
} from '../../../application/port/out/repository/sellpia-inventory-sku-read.repository.port';
import { readInventorySkuIdentities } from '../../../read/inventory-availability';

@Injectable()
export class SellpiaInventorySkuReadRepositoryAdapter
implements SellpiaInventorySkuReadRepositoryPort {
  constructor(private readonly prisma: PrismaService) {}

  async listActiveForMatching(
    organizationId: string,
  ): Promise<SellpiaInventorySkuReadModel[]> {
    return readInventorySkuIdentities(this.prisma, {
      organizationId,
      selector: { kind: 'active' },
    });
  }

  async findByIds(
    organizationId: string,
    ids: string[],
  ): Promise<SellpiaInventorySkuReadModel[]> {
    return readInventorySkuIdentities(this.prisma, {
      organizationId,
      selector: { kind: 'ids', values: ids },
    });
  }

  async findByCodes(
    organizationId: string,
    codes: string[],
  ): Promise<SellpiaInventorySkuReadModel[]> {
    return readInventorySkuIdentities(this.prisma, {
      organizationId,
      selector: { kind: 'codes', values: codes },
    });
  }

  async findByBarcodes(
    organizationId: string,
    barcodes: string[],
  ): Promise<SellpiaInventorySkuReadModel[]> {
    return readInventorySkuIdentities(this.prisma, {
      organizationId,
      selector: { kind: 'barcodes', values: barcodes },
    });
  }

  async findByNormalizedBarcodes(
    organizationId: string,
    normalizedBarcodes: string[],
  ): Promise<SellpiaInventorySkuReadModel[]> {
    return readInventorySkuIdentities(this.prisma, {
      organizationId,
      selector: { kind: 'normalized_barcodes', values: normalizedBarcodes },
    });
  }

  async findByNormalizedNames(
    organizationId: string,
    normalizedNames: string[],
  ): Promise<SellpiaInventorySkuReadModel[]> {
    return readInventorySkuIdentities(this.prisma, {
      organizationId,
      selector: { kind: 'normalized_names', values: normalizedNames },
    });
  }

  async search(
    organizationId: string,
    query: string,
    limit: number,
  ): Promise<SellpiaInventorySkuReadModel[]> {
    return readInventorySkuIdentities(this.prisma, {
      organizationId,
      selector: { kind: 'search', query, limit },
    });
  }
}
