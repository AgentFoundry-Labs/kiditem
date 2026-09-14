import 'reflect-metadata';
import { describe, expect, it } from 'vitest';
import { AlertsModule } from '../../alerts/alerts.module';
import { PrismaModule } from '../../prisma/prisma.module';
import { SupplyModule } from '../../supply/supply.module';
import { SellpiaOrderTransmissionRepositoryAdapter } from '../adapter/out/repository/sellpia-order-transmission.repository.adapter';
import { OrderCollectionSourceRepository } from '../adapter/out/repository/order-collection-source.repository';
import { SellpiaShipmentTrackingSourceRepository } from '../adapter/out/repository/sellpia-shipment-tracking-source.repository';
import { CoupangDirectOrderCollectionTransactionAdapter } from '../adapter/out/transaction/coupang-direct-order-collection.transaction.adapter';
import { COUPANG_DIRECT_ORDER_COLLECTION_PORT } from '../application/port/in/coupang-direct-order-collection.port';
import { ORDER_COLLECTION_SOURCE_PORT } from '../application/port/in/order-collection-source.port';
import { SELLPIA_SHIPMENT_TRACKING_SOURCE_PORT } from '../application/port/in/sellpia-shipment-tracking-source.port';
import { SELLPIA_ORDER_TRANSMISSION_PORT } from '../application/port/in/sellpia-order-transmission.port';
import { COUPANG_DIRECT_ORDER_COLLECTION_TRANSACTION_PORT } from '../application/port/out/transaction/coupang-direct-order-collection.transaction.port';
import { SELLPIA_ORDER_TRANSMISSION_REPOSITORY_PORT } from '../application/port/out/repository/sellpia-order-transmission.repository.port';
import { REVIEW_COLLECTION_SOURCE_PORT } from '../application/port/in/review-collection-source.port';
import { CoupangDirectOrderCollectionService } from '../application/service/coupang-direct-order-collection.service';
import { SellpiaOrderTransmissionService } from '../application/service/sellpia-order-transmission.service';
import { OrderCollectionController } from '../controllers/order-collection.controller';
import { OrderCollectionSourceController } from '../controllers/order-collection-source.controller';
import { SellpiaShipmentTrackingSourceController } from '../controllers/sellpia-shipment-tracking-source.controller';
import { OrderCollectionMallAccountController } from '../controllers/order-collection-mall-account.controller';
import { OrdersController } from '../controllers/orders.controller';
import { ReviewsController } from '../controllers/reviews.controller';
import { SellpiaOrderTransmissionController } from '../controllers/sellpia-order-transmission.controller';
import { CoupangDirectshipService } from '../coupang-directship/coupang-directship.service';
import { OrdersModule } from '../orders.module';
import { ReturnTransfersController } from '../return-transfers/return-transfers.controller';
import { ReturnTransfersService } from '../return-transfers/return-transfers.service';
import { ReviewCollectionSourceRepository } from '../adapter/out/repository/review-collection-source.repository';
import { CoupangDirectPoSnapshotService } from '../services/coupang-direct-po-snapshot.service';
import { OrderCollectionService } from '../services/order-collection.service';
import { OrderCollectionMallAccountService } from '../services/order-collection-mall-account.service';
import { OrdersService } from '../services/orders.service';
import { ReviewIngestService } from '../services/review-ingest.service';
import { ReviewsService } from '../services/reviews.service';

describe('OrdersModule owner wiring', () => {
  it('registers the complete surviving Orders capability set', () => {
    const imports: unknown[] = Reflect.getMetadata('imports', OrdersModule) ?? [];
    const controllers: unknown[] = Reflect.getMetadata('controllers', OrdersModule) ?? [];
    const providers: unknown[] = Reflect.getMetadata('providers', OrdersModule) ?? [];
    const exports: unknown[] = Reflect.getMetadata('exports', OrdersModule) ?? [];

    expect(imports).toEqual([
      AlertsModule,
      PrismaModule,
      SupplyModule,
    ]);
    expect(controllers).toEqual([
      OrdersController,
      OrderCollectionController,
      OrderCollectionSourceController,
      SellpiaShipmentTrackingSourceController,
      OrderCollectionMallAccountController,
      ReviewsController,
      ReturnTransfersController,
      SellpiaOrderTransmissionController,
    ]);
    expect(providers).toEqual([
      OrdersService,
      OrderCollectionService,
      OrderCollectionMallAccountService,
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
    ]);
    expect(exports).toEqual([]);
  });
});
