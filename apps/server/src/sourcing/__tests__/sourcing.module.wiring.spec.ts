import 'reflect-metadata';
import { describe, it, expect } from 'vitest';
import { SourcingModule } from '../sourcing.module';
import { SourcingController } from '../adapter/in/http/sourcing.controller';
import { SourcingService } from '../application/service/sourcing.service';
import { SourcingAgentGatewayAdapter } from '../adapter/out/agent/sourcing-agent.gateway.adapter';
import { SOURCING_AGENT_GATEWAY_PORT } from '../application/port/out/sourcing-agent.gateway.port';
import { AutomationModule } from '../../automation/automation.module';

// NestJS @Module / @Controller metadata keys (stable across Nest 10/11).
const IMPORTS_KEY = 'imports';
const CONTROLLERS_KEY = 'controllers';
const PROVIDERS_KEY = 'providers';
const PATH_KEY = 'path';

// Sourcing owner module — Chinese new-product discovery. Suppliers and
// procurement were extracted to SupplyModule during issue #192 follow-up
// Track A PR 1. This spec freezes the module metadata so a removed
// controller, a missing provider, or a route rename fails at vitest time
// before reaching dev:server boot.
describe('SourcingModule canonical owner wiring', () => {
  it('mounts every capability controller from adapter/in/http', () => {
    const controllers: unknown[] = Reflect.getMetadata(CONTROLLERS_KEY, SourcingModule) ?? [];
    expect(new Set(controllers)).toEqual(new Set([SourcingController]));
  });

  it('declares every application service as a provider', () => {
    const providers: unknown[] = Reflect.getMetadata(PROVIDERS_KEY, SourcingModule) ?? [];
    expect(providers).toContain(SourcingService);
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

  it('imports the Agent OS runtime so the gateway adapter can resolve AGENT_RUNNER_PORT', () => {
    const imports: unknown[] = Reflect.getMetadata(IMPORTS_KEY, SourcingModule) ?? [];
    // PrismaModule + AgentOsModule + AutomationModule (+ ProductsModule).
    // Suppliers stays transitional flat CRUD; introducing a new import here
    // means a new capability surface.
    expect(imports.length).toBeGreaterThanOrEqual(2);
  });

  it('imports AutomationModule so SourcingService can resolve OperationAlertService for producer-owned alerts', () => {
    const imports: unknown[] = Reflect.getMetadata(IMPORTS_KEY, SourcingModule) ?? [];
    expect(imports).toContain(AutomationModule);
  });

  it('keeps public /api route prefix', () => {
    expect(Reflect.getMetadata(PATH_KEY, SourcingController)).toBe('sourcing');
  });
});
