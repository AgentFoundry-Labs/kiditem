import { Module } from '@nestjs/common';
import { OperationModule } from '../common/operation/operation.module';
import { PrismaModule } from '../prisma/prisma.module';
import { OrderCollectionTodayOrdersAdapter } from './adapter/out/persistence/read/order-collection-today-orders.adapter';
import { ORDER_COLLECTION_TODAY_ORDERS_PORT } from './application/port/in/order-collection-today-orders.port';

/**
 * Orders의 오늘 주문 capability(KID-234·KID-359 H3). 주문수집 화면(Orders)과 대시보드(Analytics)가 같은 셈을
 * 읽도록 이 모듈 하나가 내보낸다 — Analytics가 OrdersModule 전체를 들이지 않게 따로 둔다.
 */
@Module({
  imports: [PrismaModule, OperationModule],
  providers: [
    OrderCollectionTodayOrdersAdapter,
    { provide: ORDER_COLLECTION_TODAY_ORDERS_PORT, useExisting: OrderCollectionTodayOrdersAdapter },
  ],
  exports: [ORDER_COLLECTION_TODAY_ORDERS_PORT],
})
export class OrderCollectionTodayOrdersModule {}
