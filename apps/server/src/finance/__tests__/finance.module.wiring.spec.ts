import 'reflect-metadata';
import { describe, expect, it } from 'vitest';
import { FinanceModule } from '../finance.module';
import { ProfitLossController } from '../controllers/profit-loss.controller';
import { ProfitLossService } from '../services/profit-loss.service';
import { SupplierPaymentsController } from '../supplier-payments/supplier-payments.controller';
import { SalesPlansController } from '../sales-plans/sales-plans.controller';
import { SettlementsController } from '../settlements/settlements.controller';

describe('FinanceModule capability wiring', () => {
  it('keeps live finance capabilities without retired CRUD surfaces', () => {
    const controllers: unknown[] = Reflect.getMetadata('controllers', FinanceModule) ?? [];
    const providers: unknown[] = Reflect.getMetadata('providers', FinanceModule) ?? [];
    const controllerNames = controllers.map((controller) => (controller as { name?: string }).name);
    const providerNames = providers.map((provider) => (provider as { name?: string }).name);

    expect(controllers).toEqual(expect.arrayContaining([
      ProfitLossController,
      SupplierPaymentsController,
      SalesPlansController,
      SettlementsController,
    ]));
    expect(providers).toContain(ProfitLossService);
    expect(controllerNames).not.toContain('ManualLedgerController');
    expect(controllerNames).not.toContain('ProcessingCostsController');
    expect(providerNames).not.toContain('ManualLedgerService');
    expect(providerNames).not.toContain('ProcessingCostsService');
  });
});
