import { Module } from '@nestjs/common';
import { ChannelsModule } from '../channels/channels.module';
import { PrismaModule } from '../prisma/prisma.module';
import { SupplyModule } from '../supply/supply.module';
import { OrdersController } from './controllers/orders.controller';
import { OrdersService } from './services/orders.service';
import { ReturnsController } from './controllers/returns.controller';
import { ReturnsService } from './services/returns.service';
import { ReviewsController } from './controllers/reviews.controller';
import { ReviewsService } from './services/reviews.service';
import { ReviewIngestService } from './services/review-ingest.service';
import { OrderCollectionController } from './controllers/order-collection.controller';
import { OrderCollectionMallAccountController } from './controllers/order-collection-mall-account.controller';
import { OrderCollectionService } from './services/order-collection.service';
import { OrderCollectionMallAccountService } from './services/order-collection-mall-account.service';
import { CoupangDirectshipService } from './coupang-directship/coupang-directship.service';
import { CoupangDirectPoSnapshotService } from './services/coupang-direct-po-snapshot.service';
import { ReturnTransfersController } from './return-transfers/return-transfers.controller';
import { ReturnTransfersService } from './return-transfers/return-transfers.service';
import { CoupangDirectOrderCollectionService } from './application/service/coupang-direct-order-collection.service';
import { CoupangDirectOrderCollectionTransactionAdapter } from './adapter/out/transaction/coupang-direct-order-collection.transaction.adapter';
import { COUPANG_DIRECT_ORDER_COLLECTION_PORT } from './application/port/in/coupang-direct-order-collection.port';
import { COUPANG_DIRECT_ORDER_COLLECTION_TRANSACTION_PORT } from './application/port/out/transaction/coupang-direct-order-collection.transaction.port';
import { SellpiaOrderTransmissionController } from './controllers/sellpia-order-transmission.controller';
import { SellpiaOrderTransmissionService } from './application/service/sellpia-order-transmission.service';
import { SellpiaOrderTransmissionRepositoryAdapter } from './adapter/out/repository/sellpia-order-transmission.repository.adapter';
import { SELLPIA_ORDER_TRANSMISSION_PORT } from './application/port/in/sellpia-order-transmission.port';
import { SELLPIA_ORDER_TRANSMISSION_REPOSITORY_PORT } from './application/port/out/repository/sellpia-order-transmission.repository.port';

@Module({
  imports: [ChannelsModule, PrismaModule, SupplyModule],
  controllers: [
    OrdersController,
    OrderCollectionController,
    OrderCollectionMallAccountController,
    ReturnsController,
    ReviewsController,
    ReturnTransfersController,
    SellpiaOrderTransmissionController,
  ],
  providers: [
    OrdersService,
    OrderCollectionService,
    OrderCollectionMallAccountService,
    CoupangDirectPoSnapshotService,
    CoupangDirectshipService,
    ReturnsService,
    ReviewsService,
    ReviewIngestService,
    ReturnTransfersService,
    CoupangDirectOrderCollectionService,
    CoupangDirectOrderCollectionTransactionAdapter,
    SellpiaOrderTransmissionService,
    SellpiaOrderTransmissionRepositoryAdapter,
    {
      provide: COUPANG_DIRECT_ORDER_COLLECTION_PORT,
      useExisting: CoupangDirectOrderCollectionService,
    },
    {
      provide: COUPANG_DIRECT_ORDER_COLLECTION_TRANSACTION_PORT,
      useExisting: CoupangDirectOrderCollectionTransactionAdapter,
    },
    {
      provide: SELLPIA_ORDER_TRANSMISSION_PORT,
      useExisting: SellpiaOrderTransmissionService,
    },
    {
      provide: SELLPIA_ORDER_TRANSMISSION_REPOSITORY_PORT,
      useExisting: SellpiaOrderTransmissionRepositoryAdapter,
    },
  ],
})
export class OrdersModule {}
