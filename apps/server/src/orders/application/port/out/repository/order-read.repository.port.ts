import type { Prisma } from '@prisma/client';
import type { OwnerTransaction } from '../../../../../common/owner-transaction';
import type { OrderFactsPort } from '../../in/facts/order-facts.port';

/**
 * Orders' own order reads (KID-392): the facts other owners get through
 * `ORDER_FACTS_PORT`, plus the order list, detail, identity and status counts
 * only Orders' services read. Implemented by the persistence adapter behind
 * `ORDER_FACTS_PORT`, in the caller's transaction.
 */
export const ORDER_READ_REPOSITORY_PORT = Symbol('ORDER_READ_REPOSITORY_PORT');

type OrderWithLines = Prisma.OrderGetPayload<{ include: { lineItems: true } }>;

export type OrderListFact = Omit<OrderWithLines, 'totalPrice'> & {
  totalPrice: number;
  channelAccount: { channel: string } | null;
};

export type OrderDetailFact = Omit<OrderWithLines, 'totalPrice'> & { totalPrice: number };

export interface OrderListInput {
  organizationId: string;
  status: string | { in: string[] };
  from?: Date;
  to?: Date;
}

export interface OrderStatusCounts {
  total: number;
  byStatus: Record<string, number>;
}

type OrderRef = Readonly<{ organizationId: string; id: string }>;

export interface OrderReadRepositoryPort extends OrderFactsPort {
  readOrderList(transaction: OwnerTransaction, input: OrderListInput): Promise<OrderListFact[]>;
  readOrderById(transaction: OwnerTransaction, input: OrderRef): Promise<OrderDetailFact | null>;
  readOrderIdentity(transaction: OwnerTransaction, input: OrderRef): Promise<{ id: string } | null>;
  readOrderStatusCounts(transaction: OwnerTransaction, input: Readonly<{ organizationId: string }>): Promise<OrderStatusCounts>;
}
