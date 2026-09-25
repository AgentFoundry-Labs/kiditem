import { RocketPoSourceModule } from './rocket-po-source.module';
import { ChannelCatalogModule } from '../channels/channel-catalog.module';
import { ShipmentsModule } from './shipments.module';
import { Module } from '@nestjs/common';
import { AlertsModule } from '../alerts/alerts.module';
import { PrismaModule } from '../prisma/prisma.module';
import { SupplyModule } from '../supply/supply.module';
import { ProductSourceModule } from '../products/product-source.module';
import { OrdersController } from './adapter/in/web/orders.controller';
import { OrdersService } from './application/service/orders.service';
import { ReviewsController } from './adapter/in/web/reviews.controller';
import { ReviewsService } from './application/service/reviews.service';
import { ReviewIngestService } from './application/service/review-ingest.service';
import { OrderCollectionController } from './adapter/in/web/order-collection.controller';
import { CoupangDirectshipController } from './adapter/in/web/coupang-directship.controller';
import { OrderCollectionService } from './application/service/order-collection.service';
import { CoupangDirectshipService } from './coupang-directship/coupang-directship.service';
import { CoupangDirectPoSnapshotService } from './application/service/coupang-direct-po-snapshot.service';
import { ReturnTransfersController } from './adapter/in/web/return-transfers/return-transfers.controller';
import { ReturnTransfersService } from './application/service/return-transfers/return-transfers.service';
import { CoupangDirectOrderCollectionService } from './application/service/coupang-direct-order-collection.service';
import { CoupangDirectOrderCollectionTransactionAdapter } from './adapter/out/transaction/coupang-direct-order-collection.transaction.adapter';
import { COUPANG_DIRECT_ORDER_COLLECTION_PORT } from './application/port/in/coupang-direct-order-collection.port';
import { COUPANG_DIRECT_ORDER_COLLECTION_TRANSACTION_PORT } from './application/port/out/transaction/coupang-direct-order-collection.transaction.port';
import { SellpiaOrderTransmissionController } from './adapter/in/web/sellpia-order-transmission.controller';
import { SellpiaOrderTransmissionService } from './application/service/sellpia-order-transmission.service';
import { SellpiaOrderTransmissionRepositoryAdapter } from './adapter/out/repository/sellpia-order-transmission.repository.adapter';
import { SELLPIA_ORDER_TRANSMISSION_PORT } from './application/port/in/sellpia-order-transmission.port';
import { SELLPIA_ORDER_TRANSMISSION_REPOSITORY_PORT } from './application/port/out/repository/sellpia-order-transmission.repository.port';
import { ORDER_COLLECTION_SOURCE_PORT } from './application/port/in/order-collection-source.port';
import { OrderCollectionSourceController } from './adapter/in/web/order-collection-source.controller';
import { OrderCollectionSourceRepository } from './adapter/out/repository/order-collection-source.repository';
import { SellpiaShipmentTrackingController } from './adapter/in/web/sellpia-shipment-tracking.controller';
import { CoupangReviewsOperationOwner } from './adapter/in/operation/coupang-reviews-operation-owner';
import { SellpiaShipmentTrackingOperationOwner } from './adapter/in/operation/sellpia-shipment-tracking-operation-owner';
import { OrderOperationCapturePersistenceAdapter } from './adapter/out/persistence/order-operation-capture.persistence.adapter';
import { ORDER_OPERATION_CAPTURE_PORT } from './application/port/in/order-operation-capture.port';
import { OperationModule } from '../common/operation/operation.module';

@Module({
  imports: [RocketPoSourceModule, ChannelCatalogModule, AlertsModule, PrismaModule, SupplyModule, ShipmentsModule, ProductSourceModule, OperationModule],
  controllers: [
    OrdersController,
    OrderCollectionController,
    CoupangDirectshipController,
    OrderCollectionSourceController,
    SellpiaShipmentTrackingController,
    ReviewsController,
    ReturnTransfersController,
    SellpiaOrderTransmissionController,
  ],
  providers: [
    OrdersService,
    OrderCollectionService,
    CoupangDirectPoSnapshotService,
    CoupangDirectshipService,
    ReviewsService,
    ReviewIngestService,
    ReturnTransfersService,
    CoupangDirectOrderCollectionService,
    CoupangDirectOrderCollectionTransactionAdapter,
    SellpiaOrderTransmissionService,
    SellpiaOrderTransmissionRepositoryAdapter,
    OrderCollectionSourceRepository,
    OrderOperationCapturePersistenceAdapter,
    CoupangReviewsOperationOwner,
    SellpiaShipmentTrackingOperationOwner,
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
      provide: ORDER_OPERATION_CAPTURE_PORT,
      useExisting: OrderOperationCapturePersistenceAdapter,
    },
  ],
})
export class OrdersModule {}
