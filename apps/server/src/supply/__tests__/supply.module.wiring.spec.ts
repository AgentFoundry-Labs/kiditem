import 'reflect-metadata';
import { describe, it, expect } from 'vitest';
import { SupplyModule } from '../supply.module';
import { SuppliersController } from '../adapter/in/http/suppliers.controller';
import { ProcurementController } from '../adapter/in/http/procurement.controller';
import { SuppliersService } from '../application/service/suppliers.service';
import { ProcurementService } from '../application/service/procurement.service';
import { SupplierRepositoryAdapter } from '../adapter/out/repository/supplier.repository.adapter';
import { ProcurementRepositoryAdapter } from '../adapter/out/repository/procurement.repository.adapter';
import { SUPPLIER_REPOSITORY_PORT } from '../application/port/out/supplier.repository.port';
import { PROCUREMENT_REPOSITORY_PORT } from '../application/port/out/procurement.repository.port';

// NestJS @Module / @Controller metadata keys (stable across Nest 10/11).
const CONTROLLERS_KEY = 'controllers';
const PROVIDERS_KEY = 'providers';
const PATH_KEY = 'path';

function expectBinding(providers: unknown[], token: symbol, adapter: unknown) {
  const binding = providers.find(
    (provider): provider is { provide: symbol; useExisting: unknown } =>
      typeof provider === 'object' &&
      provider !== null &&
      (provider as { provide?: unknown }).provide === token,
  );
  expect(binding).toBeDefined();
  expect(binding!.useExisting).toBe(adapter);
}

// supply owner module — extracted from SourcingModule during issue #192
// follow-up Track A PR 1. This spec freezes the module metadata so a removed
// controller, a missing provider, or a route rename fails at vitest time
// before reaching dev:server boot.
describe('SupplyModule owner wiring', () => {
  it('mounts suppliers + procurement controllers', () => {
    const controllers: unknown[] = Reflect.getMetadata(CONTROLLERS_KEY, SupplyModule) ?? [];
    expect(new Set(controllers)).toEqual(new Set([SuppliersController, ProcurementController]));
  });

  it('declares supply services as providers', () => {
    const providers: unknown[] = Reflect.getMetadata(PROVIDERS_KEY, SupplyModule) ?? [];
    for (const cls of [SuppliersService, ProcurementService]) {
      expect(providers).toContain(cls);
    }
  });

  it('binds outgoing repository ports to local adapters', () => {
    const providers: unknown[] = Reflect.getMetadata(PROVIDERS_KEY, SupplyModule) ?? [];

    expect(providers).toContain(SupplierRepositoryAdapter);
    expect(providers).toContain(ProcurementRepositoryAdapter);
    expectBinding(providers, SUPPLIER_REPOSITORY_PORT, SupplierRepositoryAdapter);
    expectBinding(providers, PROCUREMENT_REPOSITORY_PORT, ProcurementRepositoryAdapter);
  });

  it('keeps public /api route prefixes', () => {
    expect(Reflect.getMetadata(PATH_KEY, SuppliersController)).toBe('suppliers');
    expect(Reflect.getMetadata(PATH_KEY, ProcurementController)).toBe('purchase-orders');
  });
});
