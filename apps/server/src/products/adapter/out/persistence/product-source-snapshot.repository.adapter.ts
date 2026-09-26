import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../../prisma/prisma.service';
import type {
  ProductSourceSnapshotRepositoryPort,
  ProductSourceSnapshotQuery,
} from '../../../application/port/out/persistence/product-source-snapshot.repository.port';
import {
  readProductSourceSnapshot,
  readProductSourceSnapshotList,
} from './read/product-source-availability';

@Injectable()
export class ProductSourceSnapshotRepositoryAdapter implements ProductSourceSnapshotRepositoryPort {
  constructor(private readonly prisma: PrismaService) {}

  listSnapshot(
    organizationId: string,
    query: ProductSourceSnapshotQuery,
  ) {
    return this.prisma.$transaction(
      (tx) => readProductSourceSnapshotList(tx, organizationId, query),
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );
  }

  getSnapshot(organizationId: string, masterProductId: string) {
    return this.prisma.$transaction(
      (tx) =>
        readProductSourceSnapshot(tx, organizationId, masterProductId),
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );
  }
}
