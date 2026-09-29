import { Inject, Injectable } from '@nestjs/common';
import type { OwnerTransaction } from '../../../../common/owner-transaction';
import { ownerTransactionClient } from '../../../../prisma/owner-transaction';
import { CHANNEL_ACCOUNT_PORT, type ChannelAccountPort } from '../../../../channels/application/port/in/account/channel-account.port';
import type {
  ChannelAccountOrderCount,
  DailyOrderFacts,
  ListingOptionOrderFacts,
  OrderFactsPort,
  OrderLineWindowFacts,
  OrderWindowFacts,
  OrderWindowInput,
  PublishedOrderLineFact,
  PublishedOrderLinesInput,
  RepurchaseOrderFact,
} from '../../../application/port/in/facts/order-facts.port';
import {
  readDailyOrderFacts,
  readListingOptionOrderFacts,
  readObservedOrderBounds,
  readObservedOrderCount,
  readOrderCountsByChannelAccount,
  readOrderLineWindowFacts,
  readOrderStatusCount,
  readOrderWindowFacts,
  readPublishedOrderLines,
  readRepurchaseOrderFacts,
} from './read/order-facts.reader';

/**
 * `ORDER_FACTS_PORT` 구현(KID-392). 호출자의 `OwnerTransaction`을 풀어 주문 원장 리더를 돌린다.
 * 채널 계정 사실은 Orders가 Channels 포트로 얻는다 — 소비자는 넘기지 않는다.
 * 리더 함수(`read/order-facts.reader.ts`)는 이 어댑터 뒤로 흡수되는 과도기 구현이다(KID-324 결정 5).
 */
@Injectable()
export class OrderFactsRepository implements OrderFactsPort {
  constructor(@Inject(CHANNEL_ACCOUNT_PORT) private readonly accounts: ChannelAccountPort) {}

  readOrderWindowFacts(transaction: OwnerTransaction, input: OrderWindowInput): Promise<OrderWindowFacts> {
    return readOrderWindowFacts(ownerTransactionClient(transaction), input, this.accounts);
  }

  readOrderLineWindowFacts(transaction: OwnerTransaction, input: OrderWindowInput): Promise<OrderLineWindowFacts> {
    return readOrderLineWindowFacts(ownerTransactionClient(transaction), input, this.accounts);
  }

  readDailyOrderFacts(transaction: OwnerTransaction, input: OrderWindowInput): Promise<DailyOrderFacts[]> {
    return readDailyOrderFacts(ownerTransactionClient(transaction), input);
  }

  readListingOptionOrderFacts(transaction: OwnerTransaction, input: OrderWindowInput): Promise<ListingOptionOrderFacts[]> {
    return readListingOptionOrderFacts(ownerTransactionClient(transaction), input);
  }

  readRepurchaseOrderFacts(transaction: OwnerTransaction, input: OrderWindowInput): Promise<RepurchaseOrderFact[]> {
    return readRepurchaseOrderFacts(ownerTransactionClient(transaction), input);
  }

  readPublishedOrderLines(transaction: OwnerTransaction, input: PublishedOrderLinesInput): Promise<PublishedOrderLineFact[]> {
    return readPublishedOrderLines(ownerTransactionClient(transaction), input);
  }

  readObservedOrderBounds(transaction: OwnerTransaction, input: Readonly<{ organizationId: string }>): Promise<{ from: Date; to: Date } | null> {
    return readObservedOrderBounds(ownerTransactionClient(transaction), input.organizationId);
  }

  readObservedOrderCount(transaction: OwnerTransaction, input: Readonly<{ organizationId: string }>): Promise<number> {
    return readObservedOrderCount(ownerTransactionClient(transaction), input.organizationId);
  }

  readOrderStatusCount(transaction: OwnerTransaction, input: Readonly<{ organizationId: string; status: string }>): Promise<number> {
    return readOrderStatusCount(ownerTransactionClient(transaction), input.organizationId, input.status);
  }

  readOrderCountsByChannelAccount(transaction: OwnerTransaction, input: Readonly<{ organizationId: string }>): Promise<ChannelAccountOrderCount[]> {
    return readOrderCountsByChannelAccount(ownerTransactionClient(transaction), input.organizationId);
  }
}
