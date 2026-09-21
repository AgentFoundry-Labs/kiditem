import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../../prisma/prisma.service';
import type {
  ProductSourceReadModel,
  ProductSourceReadRepositoryPort,
} from '../../../application/port/out/persistence/product-source-read.repository.port';
import { readProductSourceIdentities } from './read/product-source-availability';

@Injectable()
export class ProductSourceReadRepositoryAdapter
implements ProductSourceReadRepositoryPort {
  constructor(private readonly prisma: PrismaService) {}

  async listActiveForMatching(
    organizationId: string,
  ): Promise<ProductSourceReadModel[]> {
    return readProductSourceIdentities(this.prisma, {
      organizationId,
      selector: { kind: 'all' },
    });
  }

  async findByIds(
    organizationId: string,
    ids: string[],
  ): Promise<ProductSourceReadModel[]> {
    return readProductSourceIdentities(this.prisma, {
      organizationId,
      selector: { kind: 'ids', values: ids },
    });
  }

  async findByCodes(
    organizationId: string,
    codes: string[],
  ): Promise<ProductSourceReadModel[]> {
    return readProductSourceIdentities(this.prisma, {
      organizationId,
      selector: { kind: 'codes', values: codes },
    });
  }

  async findByBarcodes(
    organizationId: string,
    barcodes: string[],
  ): Promise<ProductSourceReadModel[]> {
    return readProductSourceIdentities(this.prisma, {
      organizationId,
      selector: { kind: 'barcodes', values: barcodes },
    });
  }

  async findByNormalizedBarcodes(
    organizationId: string,
    normalizedBarcodes: string[],
  ): Promise<ProductSourceReadModel[]> {
    return readProductSourceIdentities(this.prisma, {
      organizationId,
      selector: { kind: 'normalized_barcodes', values: normalizedBarcodes },
    });
  }

  async findByNormalizedNames(
    organizationId: string,
    normalizedNames: string[],
  ): Promise<ProductSourceReadModel[]> {
    return readProductSourceIdentities(this.prisma, {
      organizationId,
      selector: { kind: 'normalized_names', values: normalizedNames },
    });
  }

  async search(
    organizationId: string,
    query: string,
    limit: number,
  ): Promise<ProductSourceReadModel[]> {
    return readProductSourceIdentities(this.prisma, {
      organizationId,
      selector: { kind: 'search', query, limit },
    });
  }
}
