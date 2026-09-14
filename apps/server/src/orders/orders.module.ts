import { Module } from '@nestjs/common';
import { AlertsModule } from '../alerts/alerts.module';
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
import { ORDER_COLLECTION_SOURCE_PORT } from './application/port/in/order-collection-source.port';
import { OrderCollectionSourceController } from './controllers/order-collection-source.controller';
import { OrderCollectionSourceRepository } from './adapter/out/repository/order-collection-source.repository';
import { SellpiaShipmentTrackingSourceController } from './controllers/sellpia-shipment-tracking-source.controller';
import { SellpiaShipmentTrackingSourceRepository } from './adapter/out/repository/sellpia-shipment-tracking-source.repository';
import { SELLPIA_SHIPMENT_TRACKING_SOURCE_PORT } from './application/port/in/sellpia-shipment-tracking-source.port';
import { REVIEW_COLLECTION_SOURCE_PORT } from './application/port/in/review-collection-source.port';
import { ReviewCollectionSourceRepository } from './adapter/out/repository/review-collection-source.repository';

@Module({
  imports: [AlertsModule, PrismaModule, SupplyModule],
  controllers: [
    OrdersController,
    OrderCollectionController,
    OrderCollectionSourceController,
    SellpiaShipmentTrackingSourceController,
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
    OrderCollectionSourceRepository,
    SellpiaShipmentTrackingSourceRepository,
    ReviewCollectionSourceRepository,
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
    {
      provide: ORDER_COLLECTION_SOURCE_PORT,
      useExisting: OrderCollectionSourceRepository,
    },
    {
      provide: SELLPIA_SHIPMENT_TRACKING_SOURCE_PORT,
      useExisting: SellpiaShipmentTrackingSourceRepository,
    },
    {
      provide: REVIEW_COLLECTION_SOURCE_PORT,
      useExisting: ReviewCollectionSourceRepository,
    },
  ],
})
export class OrdersModule {}
