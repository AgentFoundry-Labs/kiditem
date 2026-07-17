import 'reflect-metadata';
import { describe, expect, it } from 'vitest';
import { PrismaModule } from '../../prisma/prisma.module';
import { SupplyModule } from '../../supply/supply.module';
import { OrdersModule } from '../orders.module';
import { CoupangDirectOrderCollectionService } from '../application/service/coupang-direct-order-collection.service';
import { CoupangDirectOrderCollectionTransactionAdapter } from '../adapter/out/transaction/coupang-direct-order-collection.transaction.adapter';
import { COUPANG_DIRECT_ORDER_COLLECTION_PORT } from '../application/port/in/coupang-direct-order-collection.port';
import { COUPANG_DIRECT_ORDER_COLLECTION_TRANSACTION_PORT } from '../application/port/out/transaction/coupang-direct-order-collection.transaction.port';

describe('OrdersModule owner wiring', () => {
  it('binds Coupang PA collection through Orders -> Supply -> Inventory', () => {
    const imports: unknown[] = Reflect.getMetadata('imports', OrdersModule) ?? [];
    const providers: unknown[] = Reflect.getMetadata('providers', OrdersModule) ?? [];

    expect(imports).toContain(PrismaModule);
    expect(imports).toContain(SupplyModule);
    expect(providers).toContain(CoupangDirectOrderCollectionService);
    expect(providers).toContain(CoupangDirectOrderCollectionTransactionAdapter);
    expect(providers).toContainEqual({
      provide: COUPANG_DIRECT_ORDER_COLLECTION_PORT,
      useExisting: CoupangDirectOrderCollectionService,
    });
    expect(providers).toContainEqual({
      provide: COUPANG_DIRECT_ORDER_COLLECTION_TRANSACTION_PORT,
      useExisting: CoupangDirectOrderCollectionTransactionAdapter,
    });
  });
});
