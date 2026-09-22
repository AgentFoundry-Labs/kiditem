import type { Prisma } from '@prisma/client';
import type { OwnerTransaction } from '../common/owner-transaction';

const handles = new WeakMap<object, OwnerTransaction>();
const clients = new WeakMap<OwnerTransaction, Prisma.TransactionClient>();

/** Share a transaction between owner adapters without exposing database APIs in application contracts. */
export function ownerTransaction(client: Prisma.TransactionClient): OwnerTransaction {
  let handle = handles.get(client);
  if (!handle) {
    handle = Object.freeze({}) as OwnerTransaction;
    handles.set(client, handle);
    clients.set(handle, client);
  }
  return handle;
}

export function ownerTransactionClient(handle: OwnerTransaction): Prisma.TransactionClient {
  const client = clients.get(handle);
  if (!client) throw new Error('An owner transaction must be issued by persistence composition.');
  return client;
}
