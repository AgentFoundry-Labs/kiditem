import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../../../../prisma/prisma.service';
import type { CreateOptionDto } from '../../../dto/create-option.dto';
import type { ListOptionsQuery } from '../../../dto/list-options.query';
import type {
  OptionsListPage,
  ProductOptionRepositoryPort,
  ProductOptionRow,
} from '../../../application/port/out/product-option.repository.port';
import type { ProductsRepositoryTransaction } from '../../../application/port/out/products-transaction.port';
import {
  applyOptionPatch,
  assertNoBundleComponents,
  assertNotUsedAsComponent,
  createOptionWithSku,
  findBundleIdsUsingComponent,
  findCurrentOption,
  incrementMasterOptionCounter,
  restoreOptionRow,
  softDeleteOptionRow,
} from './product-option.persistence';
import {
  findOptionByBarcode,
  findOptionById,
  findOptionBySku,
  listOptions,
} from './product-option.query';

function tx(value: ProductsRepositoryTransaction): Prisma.TransactionClient {
  return value as Prisma.TransactionClient;
}

@Injectable()
export class ProductOptionRepositoryAdapter implements ProductOptionRepositoryPort {
  constructor(private readonly prisma: PrismaService) {}

  incrementMasterOptionCounter(
    repositoryTx: ProductsRepositoryTransaction,
    organizationId: string,
    masterId: string,
  ): Promise<{ code: string; optionCounter: number }> {
    return incrementMasterOptionCounter(tx(repositoryTx), organizationId, masterId);
  }

  createOptionWithSku(
    repositoryTx: ProductsRepositoryTransaction,
    organizationId: string,
    masterId: string,
    sku: string,
    data: Partial<CreateOptionDto>,
  ): Promise<ProductOptionRow> {
    return createOptionWithSku(tx(repositoryTx), organizationId, masterId, sku, data);
  }

  list(organizationId: string, query: ListOptionsQuery): Promise<OptionsListPage> {
    return listOptions(this.prisma, organizationId, query);
  }

  findById(
    organizationId: string,
    id: string,
    opts: { includeDeleted?: boolean },
  ): Promise<ProductOptionRow> {
    return findOptionById(this.prisma, organizationId, id, opts);
  }

  findBySku(organizationId: string, sku: string): Promise<ProductOptionRow> {
    return findOptionBySku(this.prisma, organizationId, sku);
  }

  findByBarcode(organizationId: string, barcode: string): Promise<ProductOptionRow> {
    return findOptionByBarcode(this.prisma, organizationId, barcode);
  }

  findCurrentOption(
    repositoryTx: ProductsRepositoryTransaction,
    organizationId: string,
    id: string,
  ): Promise<ProductOptionRow> {
    return findCurrentOption(tx(repositoryTx), organizationId, id);
  }

  assertNoBundleComponents(
    repositoryTx: ProductsRepositoryTransaction,
    organizationId: string,
    bundleOptionId: string,
  ): Promise<void> {
    return assertNoBundleComponents(tx(repositoryTx), organizationId, bundleOptionId);
  }

  assertNotUsedAsComponent(
    repositoryTx: ProductsRepositoryTransaction,
    organizationId: string,
    componentOptionId: string,
  ): Promise<void> {
    return assertNotUsedAsComponent(tx(repositoryTx), organizationId, componentOptionId);
  }

  applyOptionPatch(
    repositoryTx: ProductsRepositoryTransaction,
    organizationId: string,
    id: string,
    data: Record<string, unknown>,
  ): Promise<ProductOptionRow> {
    return applyOptionPatch(
      tx(repositoryTx),
      organizationId,
      id,
      data as Prisma.ProductOptionUncheckedUpdateInput,
    );
  }

  softDeleteOptionRow(
    repositoryTx: ProductsRepositoryTransaction,
    organizationId: string,
    id: string,
  ): Promise<void> {
    return softDeleteOptionRow(tx(repositoryTx), organizationId, id);
  }

  restoreOptionRow(
    organizationId: string,
    id: string,
    repositoryTx?: ProductsRepositoryTransaction,
  ): Promise<void> {
    return restoreOptionRow(repositoryTx ? tx(repositoryTx) : this.prisma, organizationId, id);
  }

  findBundleIdsUsingComponent(
    repositoryTx: ProductsRepositoryTransaction,
    organizationId: string,
    componentOptionId: string,
  ): Promise<string[]> {
    return findBundleIdsUsingComponent(tx(repositoryTx), organizationId, componentOptionId);
  }
}
