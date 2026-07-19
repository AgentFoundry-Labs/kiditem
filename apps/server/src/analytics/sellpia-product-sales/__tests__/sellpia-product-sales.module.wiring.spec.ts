import 'reflect-metadata';
import { describe, expect, it } from 'vitest';
import { InventoryModule } from '../../../inventory/inventory.module';
import { SellpiaProductSalesModule } from '../sellpia-product-sales.module';
import { SellpiaProductSalesService } from '../sellpia-product-sales.service';
import { SELLPIA_PRODUCT_DEPLETION_READ_PORT } from '../sellpia-product-depletion-read.port';
import { SELLPIA_VARIANT_ABC_GRADE_READ_PORT } from '../../application/port/in/sellpia-variant-abc-grade-read.port';

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
    const abcBinding = providers.find((provider) =>
      typeof provider === 'object'
      && provider !== null
      && 'provide' in provider
      && (provider as { provide: unknown }).provide
        === SELLPIA_VARIANT_ABC_GRADE_READ_PORT);

    expect(abcBinding).toMatchObject({ useExisting: SellpiaProductSalesService });
    expect(exports).toContain(SELLPIA_VARIANT_ABC_GRADE_READ_PORT);
    expect(exports).not.toContain(SellpiaProductSalesService);
  });
});
