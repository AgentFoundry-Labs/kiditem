import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../../../../prisma/prisma.service';
import type { ListBundleComponentsQuery } from '../../../dto/list-bundle-components.query';
import type {
  BundleComponentRow,
  ProductBundleRepositoryPort,
} from '../../../application/port/out/repository/product-bundle.repository.port';
import type { ProductsRepositoryTransaction } from '../../../application/port/out/transaction/products-transaction.port';
import {
  createBundleComponent,
  deleteBundleComponentScoped,
  findBundleComponentForTenant,
  lockBundleOptionRow,
  updateBundleComponentQty,
} from './bundle-component.persistence';
import { listBundleComponentsForTenant } from './bundle-component.query';

function tx(value: ProductsRepositoryTransaction): Prisma.TransactionClient {
  return value as Prisma.TransactionClient;
}

@Injectable()
export class BundleRepositoryAdapter implements ProductBundleRepositoryPort {
  constructor(private readonly prisma: PrismaService) {}

  lockBundleOptionRow(
    repositoryTx: ProductsRepositoryTransaction,
    bundleOptionId: string,
    organizationId: string,
  ): Promise<void> {
    return lockBundleOptionRow(tx(repositoryTx), bundleOptionId, organizationId);
  }

  async findBundleRuleOptions(input: {
    organizationId: string;
    bundleOptionId: string;
    componentOptionId: string;
    tx?: ProductsRepositoryTransaction;
  }) {
    const db = input.tx ? tx(input.tx) : this.prisma;
    const [bundleOpt, compOpt] = await Promise.all([
      db.productOption.findFirst({
        where: { id: input.bundleOptionId, organizationId: input.organizationId, isDeleted: false },
      }),
      db.productOption.findFirst({
        where: { id: input.componentOptionId, organizationId: input.organizationId, isDeleted: false },
      }),
    ]);
    return { bundleOpt, compOpt };
  }

  findBundleComponentForTenant(
    repositoryTx: ProductsRepositoryTransaction,
    id: string,
    organizationId: string,
  ): Promise<BundleComponentRow | null> {
    return findBundleComponentForTenant(tx(repositoryTx), id, organizationId);
  }

  createBundleComponent(
    repositoryTx: ProductsRepositoryTransaction,
    data: {
      bundleOptionId: string;
      componentOptionId: string;
      qty: number;
      organizationId: string;
    },
  ): Promise<BundleComponentRow> {
    return createBundleComponent(tx(repositoryTx), data);
  }

  listBundleComponentsForTenant(
    organizationId: string,
    query: ListBundleComponentsQuery,
  ): Promise<BundleComponentRow[]> {
    return listBundleComponentsForTenant(this.prisma, organizationId, query);
  }

  updateBundleComponentQty(
    repositoryTx: ProductsRepositoryTransaction,
    id: string,
    organizationId: string,
    qty: number,
  ): Promise<number> {
    return updateBundleComponentQty(tx(repositoryTx), id, organizationId, qty);
  }

  deleteBundleComponentScoped(
    repositoryTx: ProductsRepositoryTransaction,
    id: string,
    organizationId: string,
  ): Promise<number> {
    return deleteBundleComponentScoped(tx(repositoryTx), id, organizationId);
  }
}
