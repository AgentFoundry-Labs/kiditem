import 'reflect-metadata';
import { describe, expect, it } from 'vitest';
import { PrismaModule } from '../prisma/prisma.module';
import { MASTER_PRODUCT_AD_SPEND_READ_PORT } from './application/port/in/master-product-ad-spend-read.port';
import { AdvertisingProfitabilityReadModule } from './advertising-profitability-read.module';

describe('AdvertisingProfitabilityReadModule', () => {
  it('exports only the narrow ad-spend read port without importing Products', () => {
    const imports: unknown[] = Reflect.getMetadata('imports', AdvertisingProfitabilityReadModule) ?? [];
    const exports: unknown[] = Reflect.getMetadata('exports', AdvertisingProfitabilityReadModule) ?? [];

    expect(imports).toEqual([PrismaModule]);
    expect(exports).toEqual([MASTER_PRODUCT_AD_SPEND_READ_PORT]);
  });
});
