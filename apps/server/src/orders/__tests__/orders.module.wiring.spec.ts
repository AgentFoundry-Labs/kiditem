import 'reflect-metadata';
import { describe, expect, it } from 'vitest';
import { PrismaModule } from '../../prisma/prisma.module';
import { OperationsModule } from '../../operations/operations.module';
import { SupplyModule } from '../../supply/supply.module';
import { OrdersModule } from '../orders.module';
import { CoupangDirectOrderCollectionService } from '../application/service/coupang-direct-order-collection.service';
import { CoupangDirectOrderCollectionTransactionAdapter } from '../adapter/out/transaction/coupang-direct-order-collection.transaction.adapter';
import { COUPANG_DIRECT_ORDER_COLLECTION_PORT } from '../application/port/in/coupang-direct-order-collection.port';
import { COUPANG_DIRECT_ORDER_COLLECTION_TRANSACTION_PORT } from '../application/port/out/transaction/coupang-direct-order-collection.transaction.port';
import { SellpiaOrderTransmissionController } from '../controllers/sellpia-order-transmission.controller';
import { SellpiaOrderTransmissionService } from '../application/service/sellpia-order-transmission.service';
import { SellpiaOrderTransmissionRepositoryAdapter } from '../adapter/out/repository/sellpia-order-transmission.repository.adapter';
import { SELLPIA_ORDER_TRANSMISSION_PORT } from '../application/port/in/sellpia-order-transmission.port';
import { SELLPIA_ORDER_TRANSMISSION_REPOSITORY_PORT } from '../application/port/out/repository/sellpia-order-transmission.repository.port';
import { MarketplaceOrderCollectionOperationHandler } from '../adapter/in/operation/marketplace-order-collection.operation-handler';

describe('OrdersModule owner wiring', () => {
  it('binds Coupang PA collection through Orders -> Supply -> Inventory', () => {
    const imports: unknown[] = Reflect.getMetadata('imports', OrdersModule) ?? [];
    const controllers: unknown[] = Reflect.getMetadata('controllers', OrdersModule) ?? [];
    const providers: unknown[] = Reflect.getMetadata('providers', OrdersModule) ?? [];
    const controllerNames = controllers.map((controller) => (controller as { name?: string }).name);
    const providerNames = providers.map((provider) => (provider as { name?: string }).name);

    expect(imports).toContain(PrismaModule);
    expect(imports).toContain(SupplyModule);
    expect(imports).toContain(OperationsModule);
    expect(controllers).toContain(SellpiaOrderTransmissionController);
    expect(providers).toContain(CoupangDirectOrderCollectionService);
    expect(providers).toContain(CoupangDirectOrderCollectionTransactionAdapter);
    expect(providers).toContain(SellpiaOrderTransmissionService);
    expect(providers).toContain(SellpiaOrderTransmissionRepositoryAdapter);
    expect(providers).toContain(MarketplaceOrderCollectionOperationHandler);
    expect(controllerNames).not.toContain('CsController');
    expect(providerNames).not.toContain('CsService');
    expect(providers).toContainEqual({
      provide: COUPANG_DIRECT_ORDER_COLLECTION_PORT,
      useExisting: CoupangDirectOrderCollectionService,
    });
    expect(providers).toContainEqual({
      provide: COUPANG_DIRECT_ORDER_COLLECTION_TRANSACTION_PORT,
      useExisting: CoupangDirectOrderCollectionTransactionAdapter,
    });
    expect(providers).toContainEqual({
      provide: SELLPIA_ORDER_TRANSMISSION_PORT,
      useExisting: SellpiaOrderTransmissionService,
    });
    expect(providers).toContainEqual({
      provide: SELLPIA_ORDER_TRANSMISSION_REPOSITORY_PORT,
      useExisting: SellpiaOrderTransmissionRepositoryAdapter,
    });
  });
});
