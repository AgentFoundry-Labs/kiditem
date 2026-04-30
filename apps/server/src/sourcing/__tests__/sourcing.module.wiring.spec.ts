import 'reflect-metadata';
import { describe, it, expect } from 'vitest';
import { SourcingModule } from '../sourcing.module';
import { SourcingController } from '../adapter/in/http/sourcing.controller';
import { ProcurementController } from '../adapter/in/http/procurement.controller';
import { SuppliersController } from '../adapter/in/http/suppliers.controller';
import { SourcingService } from '../application/service/sourcing.service';
import { ProcurementService } from '../application/service/procurement.service';
import { SuppliersService } from '../application/service/suppliers.service';
import { SourcingAgentGatewayAdapter } from '../adapter/out/agent/sourcing-agent.gateway.adapter';
import { SOURCING_AGENT_GATEWAY_PORT } from '../application/port/out/sourcing-agent.gateway.port';

// NestJS @Module / @Controller metadata keys (stable across Nest 10/11).
const IMPORTS_KEY = 'imports';
const CONTROLLERS_KEY = 'controllers';
const PROVIDERS_KEY = 'providers';
const PATH_KEY = 'path';

// Wave H1 Lane S — sourcing canonical fold (suppliers + procurement under
// SourcingModule). This spec freezes the module metadata so a removed
// controller, a missing provider, or a route rename fails at vitest time
// before reaching dev:server boot.
describe('SourcingModule canonical owner wiring', () => {
  it('mounts every capability controller from adapter/in/http', () => {
    const controllers: unknown[] = Reflect.getMetadata(CONTROLLERS_KEY, SourcingModule) ?? [];
    expect(new Set(controllers)).toEqual(
      new Set([SourcingController, ProcurementController, SuppliersController]),
    );
  });

  it('declares every application service as a provider', () => {
    const providers: unknown[] = Reflect.getMetadata(PROVIDERS_KEY, SourcingModule) ?? [];
    for (const cls of [SourcingService, ProcurementService, SuppliersService]) {
      expect(providers).toContain(cls);
    }
  });

  it('binds SOURCING_AGENT_GATEWAY_PORT to the gateway adapter', () => {
    const providers: unknown[] = Reflect.getMetadata(PROVIDERS_KEY, SourcingModule) ?? [];
    expect(providers).toContain(SourcingAgentGatewayAdapter);
    const portBinding = providers.find(
      (p): p is { provide: symbol; useExisting: unknown } =>
        typeof p === 'object' && p !== null && (p as any).provide === SOURCING_AGENT_GATEWAY_PORT,
    );
    expect(portBinding).toBeDefined();
    expect(portBinding!.useExisting).toBe(SourcingAgentGatewayAdapter);
  });

  it('imports the AgentRegistry runtime so the gateway adapter can resolve', () => {
    const imports: unknown[] = Reflect.getMetadata(IMPORTS_KEY, SourcingModule) ?? [];
    // PrismaModule + AgentRegistryModule. Suppliers stays transitional flat
    // CRUD; introducing a new import here means a new capability surface.
    expect(imports.length).toBeGreaterThanOrEqual(2);
  });

  it('keeps public /api route prefixes for every capability', () => {
    expect(Reflect.getMetadata(PATH_KEY, SourcingController)).toBe('sourcing');
    expect(Reflect.getMetadata(PATH_KEY, ProcurementController)).toBe('purchase-orders');
    expect(Reflect.getMetadata(PATH_KEY, SuppliersController)).toBe('suppliers');
  });
});
