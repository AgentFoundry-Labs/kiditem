import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../../../../prisma/prisma.service';
import type {
  ProductsRepositoryTransaction,
  ProductsTransactionPort,
} from '../../../application/port/out/products-transaction.port';

@Injectable()
export class ProductsTransactionAdapter implements ProductsTransactionPort {
  constructor(private readonly prisma: PrismaService) {}

  run<T>(
    fn: (tx: ProductsRepositoryTransaction) => Promise<T>,
    options: { timeout?: number } = {},
  ): Promise<T> {
    return this.prisma.$transaction(
      (tx: Prisma.TransactionClient) => fn(tx as ProductsRepositoryTransaction),
      options,
    );
  }
}
