import 'reflect-metadata';
import { describe, expect, it } from 'vitest';
import { InventoryModule } from '../../../inventory/inventory.module';
import { SellpiaProductSalesModule } from '../sellpia-product-sales.module';
import { SellpiaProductSalesService } from '../sellpia-product-sales.service';
import { SELLPIA_PRODUCT_DEPLETION_READ_PORT } from '../sellpia-product-depletion-read.port';

describe('SellpiaProductSalesModule wiring', () => {
  it('imports Inventory and exports the depletion read port through the service', () => {
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
    expect(binding?.useExisting).toBe(SellpiaProductSalesService);
    expect(exports).toContain(SELLPIA_PRODUCT_DEPLETION_READ_PORT);
  });

  it('publishes a second typed Analytics read port without exporting its concrete service', () => {
    const providers: unknown[] = Reflect.getMetadata('providers', SellpiaProductSalesModule) ?? [];
    const exports: unknown[] = Reflect.getMetadata('exports', SellpiaProductSalesModule) ?? [];
    const symbolExports = exports.filter((value) => typeof value === 'symbol');
    const abcBinding = providers.find((provider) =>
      typeof provider === 'object'
      && provider !== null
      && 'provide' in provider
      && typeof (provider as { provide: unknown }).provide === 'symbol'
      && (provider as { provide: symbol }).provide !== SELLPIA_PRODUCT_DEPLETION_READ_PORT);

    expect(abcBinding).toMatchObject({ useExisting: SellpiaProductSalesService });
    expect(symbolExports).toHaveLength(2);
    expect(exports).not.toContain(SellpiaProductSalesService);
  });
});
