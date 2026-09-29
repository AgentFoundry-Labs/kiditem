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
import { ReturnTransfersController } from './adapter/in/web/return-transfers/return-transfers.controller';
import { ReturnTransfersService } from './application/service/return-transfers/return-transfers.service';
import { CoupangDirectOrderCollectionService } from './application/service/coupang-direct-order-collection.service';
import { CoupangDirectOrderCollectionTransactionAdapter } from './adapter/out/transaction/coupang-direct-order-collection.transaction.adapter';
import { COUPANG_DIRECT_ORDER_COLLECTION_PORT } from './application/port/in/coupang-direct-order-collection.port';
import { COUPANG_DIRECT_ORDER_COLLECTION_TRANSACTION_PORT } from './application/port/out/transaction/coupang-direct-order-collection.transaction.port';
import { ORDER_COLLECTION_SOURCE_PORT } from './application/port/in/order-collection-source.port';
import { OrderCollectionSourceController } from './adapter/in/web/order-collection-source.controller';
import { OrderCollectionSourceRepository } from './adapter/out/persistence/order-collection-source.repository';
import { SellpiaShipmentTrackingController } from './adapter/in/web/sellpia-shipment-tracking.controller';
import { CoupangReviewsOperationOwner } from './adapter/in/operation/coupang-reviews-operation-owner';
import { SellpiaShipmentTrackingOperationOwner } from './adapter/in/operation/sellpia-shipment-tracking-operation-owner';
import { OrderOperationCapturePersistenceAdapter } from './adapter/out/persistence/order-operation-capture.repository';
import { ORDER_OPERATION_CAPTURE_PORT } from './application/port/in/order-operation-capture.port';
import { OperationModule } from '../common/operation/operation.module';
import { CoupangDirectshipOperationOwner } from './adapter/in/operation/coupang-directship-operation-owner';
import { MallOrdersOperationOwner } from './adapter/in/operation/mall-orders-operation-owner';
import { MallOrdersOperationService } from './application/service/mall-orders-operation.service';
import { MallOrdersUploadService } from './application/service/mall-orders-upload.service';
import { OrderCollectionUploadController } from './adapter/in/web/order-collection-upload.controller';
import { OrderMallAccountPersistenceAdapter } from './adapter/out/persistence/order-mall-account.repository';
import { ORDER_MALL_ACCOUNT_PORT } from './application/port/out/repository/order-mall-account.port';
import { OrderCollectionTodayOrdersModule } from './order-collection-today-orders.module';
import { OrdersActionOperationsController } from './adapter/in/web/orders-action-operations.controller';
import { SellpiaOrderTransferOperationOwner } from './adapter/in/operation/sellpia-order-transfer-operation-owner';
import { SellpiaPostTransferOperationOwner } from './adapter/in/operation/sellpia-post-transfer-operation-owner';
import { SellpiaAutoInvoiceOperationOwner } from './adapter/in/operation/sellpia-auto-invoice-operation-owner';
import { SellpiaOrderSnapshotOperationOwner } from './adapter/in/operation/sellpia-order-snapshot-operation-owner';
import { CoupangShipmentListOperationOwner } from './adapter/in/operation/coupang-shipment-list-operation-owner';
import { MallTrackingUploadOperationOwner } from './adapter/in/operation/mall-tracking-upload-operation-owner';
import { SellpiaActionOutcomesPersistenceAdapter } from './adapter/out/persistence/sellpia-action-outcomes.repository';
import { SELLPIA_ACTION_OUTCOMES_PORT } from './application/port/out/repository/sellpia-action-outcomes.port';
import { OrdersActionOperationService } from './application/service/orders-action-operation.service';
import { SellpiaInvoiceTargetsService } from './application/service/sellpia-invoice-targets.service';
import { SellpiaOrderTransferService } from './application/service/sellpia-order-transfer.service';

@Module({
  imports: [RocketPoSourceModule, ChannelCatalogModule, AlertsModule, PrismaModule, SupplyModule, ShipmentsModule, ProductSourceModule, OperationModule, OrderCollectionTodayOrdersModule],
  controllers: [
    OrdersController,
    OrderCollectionController,
    CoupangDirectshipController,
    OrderCollectionSourceController,
    OrderCollectionUploadController,
    SellpiaShipmentTrackingController,
    ReviewsController,
    ReturnTransfersController,
    OrdersActionOperationsController,
  ],
  providers: [
    OrdersService,
    OrderCollectionService,
    CoupangDirectshipService,
    ReviewsService,
    ReviewIngestService,
    ReturnTransfersService,
    CoupangDirectOrderCollectionService,
    CoupangDirectOrderCollectionTransactionAdapter,
    OrderCollectionSourceRepository,
    OrderOperationCapturePersistenceAdapter,
    CoupangReviewsOperationOwner,
    SellpiaShipmentTrackingOperationOwner,
    MallOrdersOperationService,
    MallOrdersUploadService,
    MallOrdersOperationOwner,
    OrderMallAccountPersistenceAdapter,
    CoupangDirectshipOperationOwner,
    SellpiaOrderTransferService,
    SellpiaInvoiceTargetsService,
    OrdersActionOperationService,
    SellpiaActionOutcomesPersistenceAdapter,
    SellpiaOrderTransferOperationOwner,
    SellpiaPostTransferOperationOwner,
    SellpiaAutoInvoiceOperationOwner,
    SellpiaOrderSnapshotOperationOwner,
    CoupangShipmentListOperationOwner,
    MallTrackingUploadOperationOwner,
    {
      provide: COUPANG_DIRECT_ORDER_COLLECTION_PORT,
      useExisting: CoupangDirectOrderCollectionService,
    },
    {
      provide: COUPANG_DIRECT_ORDER_COLLECTION_TRANSACTION_PORT,
      useExisting: CoupangDirectOrderCollectionTransactionAdapter,
    },
    {
      provide: ORDER_COLLECTION_SOURCE_PORT,
      useExisting: OrderCollectionSourceRepository,
    },
    {
      provide: ORDER_OPERATION_CAPTURE_PORT,
      useExisting: OrderOperationCapturePersistenceAdapter,
    },
    {
      provide: ORDER_MALL_ACCOUNT_PORT,
      useExisting: OrderMallAccountPersistenceAdapter,
    },
    {
      provide: SELLPIA_ACTION_OUTCOMES_PORT,
      useExisting: SellpiaActionOutcomesPersistenceAdapter,
    },
  ],
})
export class OrdersModule {}
