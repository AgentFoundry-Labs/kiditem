import { AsyncLocalStorage } from 'node:async_hooks';
import type { Prisma, PrismaClient } from '@prisma/client';

type AdIngestRepositoryClient = Prisma.TransactionClient | PrismaClient;

const storage = new AsyncLocalStorage<Prisma.TransactionClient>();

export function runWithAdIngestTransaction<T>(
  transaction: Prisma.TransactionClient,
  operation: () => Promise<T>,
): Promise<T> {
  return storage.run(transaction, operation);
}

export function adIngestRepositoryClient(prisma: PrismaClient): AdIngestRepositoryClient {
  return storage.getStore() ?? prisma;
}

export function withAdIngestRepositoryTransaction<T>(
  prisma: PrismaClient,
  operation: (client: Prisma.TransactionClient) => Promise<T>,
): Promise<T> {
  const current = storage.getStore();
  return current ? operation(current) : prisma.$transaction(operation);
}
