import { ShipmentsModule } from '../shipments.module';
import { RocketPoSourceModule } from '../rocket-po-source.module';
import { RocketPoSourceController } from '../adapter/in/web/rocket-po-source.controller';
import { RocketPoCatalogService } from '../application/service/rocket-po-catalog.service';
import { RocketPoCatalogRepositoryAdapter } from '../adapter/out/repository/rocket-po-catalog.repository.adapter';
import { ROCKET_PO_CATALOG_PORT } from '../application/port/in/rocket-po-catalog.port';
import { ROCKET_PO_CATALOG_REPOSITORY_PORT } from '../application/port/out/repository/rocket-po-catalog.repository.port';
import { ChannelCatalogModule } from '../../channels/channel-catalog.module';
import 'reflect-metadata';
import { describe, expect, it } from 'vitest';
import { AlertsModule } from '../../alerts/alerts.module';
import { PrismaModule } from '../../prisma/prisma.module';
import { SupplyModule } from '../../supply/supply.module';
import { ProductSourceModule } from '../../products/product-source.module';
import { SellpiaOrderTransmissionRepositoryAdapter } from '../adapter/out/repository/sellpia-order-transmission.repository.adapter';
import { OrderCollectionSourceRepository } from '../adapter/out/repository/order-collection-source.repository';
import { OrderOperationCapturePersistenceAdapter } from '../adapter/out/persistence/order-operation-capture.persistence.adapter';
import { CoupangDirectOrderCollectionTransactionAdapter } from '../adapter/out/transaction/coupang-direct-order-collection.transaction.adapter';
import { COUPANG_DIRECT_ORDER_COLLECTION_PORT } from '../application/port/in/coupang-direct-order-collection.port';
import { ORDER_COLLECTION_SOURCE_PORT } from '../application/port/in/order-collection-source.port';
import { ORDER_OPERATION_CAPTURE_PORT } from '../application/port/in/order-operation-capture.port';
import { SELLPIA_ORDER_TRANSMISSION_PORT } from '../application/port/in/sellpia-order-transmission.port';
import { COUPANG_DIRECT_ORDER_COLLECTION_TRANSACTION_PORT } from '../application/port/out/transaction/coupang-direct-order-collection.transaction.port';
import { SELLPIA_ORDER_TRANSMISSION_REPOSITORY_PORT } from '../application/port/out/repository/sellpia-order-transmission.repository.port';
import { CoupangDirectOrderCollectionService } from '../application/service/coupang-direct-order-collection.service';
import { SellpiaOrderTransmissionService } from '../application/service/sellpia-order-transmission.service';
import { OrderCollectionController } from '../adapter/in/web/order-collection.controller';
import { CoupangDirectshipController } from '../adapter/in/web/coupang-directship.controller';
import { OrderCollectionSourceController } from '../adapter/in/web/order-collection-source.controller';
import { SellpiaShipmentTrackingController } from '../adapter/in/web/sellpia-shipment-tracking.controller';
import { OrdersController } from '../adapter/in/web/orders.controller';
import { ReviewsController } from '../adapter/in/web/reviews.controller';
import { SellpiaOrderTransmissionController } from '../adapter/in/web/sellpia-order-transmission.controller';
import { CoupangDirectshipService } from '../coupang-directship/coupang-directship.service';
import { OrdersModule } from '../orders.module';
import { ReturnTransfersController } from '../adapter/in/web/return-transfers/return-transfers.controller';
import { ReturnTransfersService } from '../application/service/return-transfers/return-transfers.service';
import { CoupangReviewsOperationOwner } from '../adapter/in/operation/coupang-reviews-operation-owner';
import { SellpiaShipmentTrackingOperationOwner } from '../adapter/in/operation/sellpia-shipment-tracking-operation-owner';
import { OperationModule } from '../../common/operation/operation.module';
import { MallOrdersOperationOwner } from '../adapter/in/operation/mall-orders-operation-owner';
import { MallOrdersOperationService } from '../application/service/mall-orders-operation.service';
import { OrderMallAccountPersistenceAdapter } from '../adapter/out/persistence/order-mall-account.persistence.adapter';
import { ORDER_MALL_ACCOUNT_PORT } from '../application/port/out/persistence/order-mall-account.port';
import { OrderCollectionTodayOrdersModule } from '../order-collection-today-orders.module';
import { CoupangDirectPoSnapshotService } from '../application/service/coupang-direct-po-snapshot.service';
import { OrderCollectionService } from '../application/service/order-collection.service';
import { OrdersService } from '../application/service/orders.service';
import { ReviewIngestService } from '../application/service/review-ingest.service';
import { ReviewsService } from '../application/service/reviews.service';

describe('OrdersModule owner wiring', () => {
  it('registers the complete surviving Orders capability set', () => {
    const imports: unknown[] = Reflect.getMetadata('imports', OrdersModule) ?? [];
    const controllers: unknown[] = Reflect.getMetadata('controllers', OrdersModule) ?? [];
    const providers: unknown[] = Reflect.getMetadata('providers', OrdersModule) ?? [];
    const exports: unknown[] = Reflect.getMetadata('exports', OrdersModule) ?? [];

    expect(imports).toEqual([
      RocketPoSourceModule,
      ChannelCatalogModule,
      AlertsModule,
      PrismaModule,
      SupplyModule,
      ShipmentsModule,
      ProductSourceModule,
      OperationModule,
      OrderCollectionTodayOrdersModule,
    ]);
    expect(controllers).toEqual([
      OrdersController,
      OrderCollectionController,
      CoupangDirectshipController,
      OrderCollectionSourceController,
      SellpiaShipmentTrackingController,
      ReviewsController,
      ReturnTransfersController,
      SellpiaOrderTransmissionController,
    ]);
    expect(providers).toEqual([
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
      MallOrdersOperationService,
      MallOrdersOperationOwner,
      OrderMallAccountPersistenceAdapter,
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
      {
        provide: ORDER_MALL_ACCOUNT_PORT,
        useExisting: OrderMallAccountPersistenceAdapter,
      },
    ]);
    expect(exports).toEqual([]);
  });

  it('keeps Rocket PO collection and account claims in the Orders owner module', () => {
    const controllers: unknown[] = Reflect.getMetadata('controllers', RocketPoSourceModule) ?? [];
    const providers: unknown[] = Reflect.getMetadata('providers', RocketPoSourceModule) ?? [];
    const exports: unknown[] = Reflect.getMetadata('exports', RocketPoSourceModule) ?? [];

    expect(controllers).toEqual([RocketPoSourceController]);
    expect(providers).toEqual([
      RocketPoCatalogService,
      RocketPoCatalogRepositoryAdapter,
      { provide: ROCKET_PO_CATALOG_PORT, useExisting: RocketPoCatalogService },
      { provide: ROCKET_PO_CATALOG_REPOSITORY_PORT, useExisting: RocketPoCatalogRepositoryAdapter },
    ]);
    expect(exports).toEqual([ROCKET_PO_CATALOG_PORT]);
  });
});
