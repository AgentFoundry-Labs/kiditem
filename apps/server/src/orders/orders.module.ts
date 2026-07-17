import { Module } from '@nestjs/common';
import { ChannelsModule } from '../channels/channels.module';
import { PrismaModule } from '../prisma/prisma.module';
import { SupplyModule } from '../supply/supply.module';
import { OrdersController } from './controllers/orders.controller';
import { OrdersService } from './services/orders.service';
import { ReturnsController } from './controllers/returns.controller';
import { ReturnsService } from './services/returns.service';
import { CsController } from './controllers/cs.controller';
import { CsService } from './services/cs.service';
import { ReviewsController } from './controllers/reviews.controller';
import { ReviewsService } from './services/reviews.service';
import { OrderCollectionController } from './controllers/order-collection.controller';
import { OrderCollectionMallAccountController } from './controllers/order-collection-mall-account.controller';
import { OrderCollectionService } from './services/order-collection.service';
import { OrderCollectionMallAccountService } from './services/order-collection-mall-account.service';
import { CoupangDirectshipService } from './coupang-directship/coupang-directship.service';
import { ReturnTransfersController } from './return-transfers/return-transfers.controller';
import { ReturnTransfersService } from './return-transfers/return-transfers.service';
import { CoupangDirectOrderCollectionService } from './application/service/coupang-direct-order-collection.service';
import { CoupangDirectOrderCollectionTransactionAdapter } from './adapter/out/transaction/coupang-direct-order-collection.transaction.adapter';
import { COUPANG_DIRECT_ORDER_COLLECTION_PORT } from './application/port/in/coupang-direct-order-collection.port';
import { COUPANG_DIRECT_ORDER_COLLECTION_TRANSACTION_PORT } from './application/port/out/transaction/coupang-direct-order-collection.transaction.port';

@Module({
  imports: [ChannelsModule, PrismaModule, SupplyModule],
  controllers: [
    OrdersController,
    OrderCollectionController,
    OrderCollectionMallAccountController,
    ReturnsController,
    CsController,
    ReviewsController,
    ReturnTransfersController,
  ],
  providers: [
    OrdersService,
    OrderCollectionService,
    OrderCollectionMallAccountService,
    CoupangDirectshipService,
    ReturnsService,
    CsService,
    ReviewsService,
    ReturnTransfersService,
    CoupangDirectOrderCollectionService,
    CoupangDirectOrderCollectionTransactionAdapter,
    {
      provide: COUPANG_DIRECT_ORDER_COLLECTION_PORT,
      useExisting: CoupangDirectOrderCollectionService,
    },
    {
      provide: COUPANG_DIRECT_ORDER_COLLECTION_TRANSACTION_PORT,
      useExisting: CoupangDirectOrderCollectionTransactionAdapter,
    },
  ],
})
export class OrdersModule {}
