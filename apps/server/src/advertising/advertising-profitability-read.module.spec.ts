import { ChannelCatalogModule } from '../channels/channel-catalog.module';
import { ProductCollectionRuntimeModule } from '../products/product-collection-runtime.module';
import 'reflect-metadata';
import { Test } from '@nestjs/testing';
import { describe, expect, it } from 'vitest';
import { AlertsModule } from '../alerts/alerts.module';
import { PrismaService } from '../prisma/prisma.service';
import { PrismaModule } from '../prisma/prisma.module';
import { ProfitabilityAdImportRepositoryAdapter } from './adapter/out/repository/profitability-ad-import.repository.adapter';
import { ProfitabilityAdImportController } from './adapter/in/http/profitability-ad-import.controller';
import { ADVERTISING_PROFITABILITY_READ_PORT } from './application/port/in/profitability-ad-import.port';
import { AdvertisingProfitabilityReadModule } from './advertising-profitability-read.module';

describe('AdvertisingProfitabilityReadModule', () => {
  it('exports only profitability read ports without importing Products', () => {
    const imports: unknown[] = Reflect.getMetadata('imports', AdvertisingProfitabilityReadModule) ?? [];
    const exports: unknown[] = Reflect.getMetadata('exports', AdvertisingProfitabilityReadModule) ?? [];
    const controllers: unknown[] = Reflect.getMetadata(
      'controllers',
      AdvertisingProfitabilityReadModule,
    ) ?? [];

    expect(imports).toEqual([ChannelCatalogModule, PrismaModule, AlertsModule, ProductCollectionRuntimeModule]);
    expect(controllers).toEqual([ProfitabilityAdImportController]);
    expect(exports).toEqual([ADVERTISING_PROFITABILITY_READ_PORT]);
  });

  it('resolves the exact-generation read port to its repository owner', async () => {
    const module = await Test.createTestingModule({
      imports: [AdvertisingProfitabilityReadModule],
    })
      .overrideProvider(PrismaService)
      .useValue({})
      .compile();
    try {
      const readPort = module.get(ADVERTISING_PROFITABILITY_READ_PORT);
      expect(readPort).toBeInstanceOf(ProfitabilityAdImportRepositoryAdapter);
      expect(typeof readPort.readGeneration).toBe('function');
      expect(typeof readPort.readSourceSnapshot).toBe('function');
    } finally {
      await module.close();
    }
  });
});
