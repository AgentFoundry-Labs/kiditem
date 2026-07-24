import 'reflect-metadata';
import { describe, expect, it } from 'vitest';
import { InventoryModule } from '../../../inventory/inventory.module';
import { AiModule } from '../../../ai/ai.module';
import { SellpiaProductSalesModule } from '../sellpia-product-sales.module';
import { SellpiaProductSalesService } from '../sellpia-product-sales.service';
import { SELLPIA_PRODUCT_DEPLETION_READ_PORT } from '../sellpia-product-depletion-read.port';
import { MASTER_PRODUCT_ABC_METRIC_READ_PORT } from '../../application/port/in/master-product-abc-metric-read.port';

describe('SellpiaProductSalesModule wiring', () => {
  it('imports Inventory and AI owner ports, and exports the depletion read port through the service', () => {
    const imports: unknown[] = Reflect.getMetadata('imports', SellpiaProductSalesModule) ?? [];
    const providers: unknown[] = Reflect.getMetadata('providers', SellpiaProductSalesModule) ?? [];
    const exports: unknown[] = Reflect.getMetadata('exports', SellpiaProductSalesModule) ?? [];
    const binding = providers.find((provider) =>
      typeof provider === 'object'
      && provider !== null
      && (provider as { provide?: unknown }).provide
        === SELLPIA_PRODUCT_DEPLETION_READ_PORT) as {
          useExisting?: unknown;
        } | undefined;

    expect(imports).toContain(InventoryModule);
    expect(imports).toContain(AiModule);
    expect(binding?.useExisting).toBe(SellpiaProductSalesService);
    expect(exports).toContain(SELLPIA_PRODUCT_DEPLETION_READ_PORT);
  });

  it('publishes the MasterProduct ABC metric read port without exporting its concrete provider', () => {
    const providers: unknown[] = Reflect.getMetadata('providers', SellpiaProductSalesModule) ?? [];
    const exports: unknown[] = Reflect.getMetadata('exports', SellpiaProductSalesModule) ?? [];
    const abcBinding = providers.find((provider) =>
      typeof provider === 'object'
      && provider !== null
      && 'provide' in provider
      && (provider as { provide: unknown }).provide
        === MASTER_PRODUCT_ABC_METRIC_READ_PORT) as { useExisting?: unknown } | undefined;

    expect(abcBinding?.useExisting).toBeDefined();
    expect(abcBinding?.useExisting).not.toBe(SellpiaProductSalesService);
    expect(exports).toContain(MASTER_PRODUCT_ABC_METRIC_READ_PORT);
    expect(exports).not.toContain(abcBinding?.useExisting);
  });
});
