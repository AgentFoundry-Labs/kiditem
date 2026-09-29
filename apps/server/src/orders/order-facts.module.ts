import { Module } from '@nestjs/common';
import { ChannelCatalogModule } from '../channels/channel-catalog.module';
import { OrderFactsRepository } from './adapter/out/persistence/order-facts.repository';
import { ReviewFactsRepository } from './adapter/out/persistence/review-facts.repository';
import { ORDER_FACTS_PORT } from './application/port/in/facts/order-facts.port';
import { REVIEW_FACTS_PORT } from './application/port/in/facts/review-facts.port';

/**
 * Orders의 주문·리뷰 사실 incoming port(`ORDER_FACTS_PORT`·`REVIEW_FACTS_PORT`, KID-392)만 내보낸다.
 * 소비자(analytics·finance·products·channels·common 이익 계산)가 OrdersModule 전체를 들이지 않게 따로 둔다 —
 * OrdersModule은 SupplyModule·ChannelCatalogModule 등을 들이므로 순환을 피한다. 바깥 모듈은 in-port만 주입받는다.
 */
@Module({
  imports: [ChannelCatalogModule],
  providers: [
    OrderFactsRepository,
    { provide: ORDER_FACTS_PORT, useExisting: OrderFactsRepository },
    ReviewFactsRepository,
    { provide: REVIEW_FACTS_PORT, useExisting: ReviewFactsRepository },
  ],
  exports: [ORDER_FACTS_PORT, REVIEW_FACTS_PORT],
})
export class OrderFactsModule {}
