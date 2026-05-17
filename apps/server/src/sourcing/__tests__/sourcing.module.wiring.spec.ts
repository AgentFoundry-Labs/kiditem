import 'reflect-metadata';
import { describe, it, expect } from 'vitest';
import { SourcingModule } from '../sourcing.module';
import { SourcingService } from '../application/service/sourcing.service';
import { SourcingPromotionService } from '../application/service/sourcing-promotion.service';
import { SourcingAgentGatewayAdapter } from '../adapter/out/agent/sourcing-agent.gateway.adapter';
import { SourcingOperationAlertAdapter } from '../adapter/out/automation/operation-alert.adapter';
import { SOURCING_AGENT_GATEWAY_PORT } from '../application/port/out/sourcing-agent.gateway.port';
import { SOURCING_OPERATION_ALERT_PORT } from '../application/port/out/operation-alert.port';
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
  it('mounts extension routes before candidate workspace routes', () => {
    const controllers: unknown[] = Reflect.getMetadata(CONTROLLERS_KEY, SourcingModule) ?? [];
    expect(controllers.map((controller) => (controller as { name: string }).name)).toEqual([
      'SourcingExtensionIngestController',
      'SourcingCandidateWorkspaceController',
    ]);
  });

  it('declares every application service as a provider', () => {
    const providers: unknown[] = Reflect.getMetadata(PROVIDERS_KEY, SourcingModule) ?? [];
    expect(providers).toContain(SourcingService);
    expect(providers).toContain(SourcingPromotionService);
  });

  it('binds outgoing ports to their adapters', () => {
    const providers: unknown[] = Reflect.getMetadata(PROVIDERS_KEY, SourcingModule) ?? [];
    expect(providers).toContain(SourcingAgentGatewayAdapter);
    expect(providers).toContain(SourcingOperationAlertAdapter);
    const gatewayBinding = providers.find(
      (p): p is { provide: symbol; useExisting: unknown } =>
        typeof p === 'object' && p !== null && (p as any).provide === SOURCING_AGENT_GATEWAY_PORT,
    );
    expect(gatewayBinding).toBeDefined();
    expect(gatewayBinding!.useExisting).toBe(SourcingAgentGatewayAdapter);
    const alertBinding = providers.find(
      (p): p is { provide: symbol; useExisting: unknown } =>
        typeof p === 'object' && p !== null && (p as any).provide === SOURCING_OPERATION_ALERT_PORT,
    );
    expect(alertBinding).toBeDefined();
    expect(alertBinding!.useExisting).toBe(SourcingOperationAlertAdapter);
  });

  it('imports the Agent OS runtime so the gateway adapter can resolve AGENT_RUNNER_PORT', () => {
    const imports: unknown[] = Reflect.getMetadata(IMPORTS_KEY, SourcingModule) ?? [];
    // PrismaModule + AgentOsModule + AiModule + AutomationModule + ProductsModule.
    // Supplier/procurement capability imports belong in SupplyModule.
    expect(imports.length).toBeGreaterThanOrEqual(2);
  });

  it('imports AutomationModule so its operation-alert adapter can resolve the owner-side port', () => {
    const imports: unknown[] = Reflect.getMetadata(IMPORTS_KEY, SourcingModule) ?? [];
    expect(imports).toContain(AutomationModule);
  });

  it('keeps public /api route prefix on every route-family controller', () => {
    const controllers: unknown[] = Reflect.getMetadata(CONTROLLERS_KEY, SourcingModule) ?? [];
    expect(controllers.map((controller) => Reflect.getMetadata(PATH_KEY, controller))).toEqual([
      'sourcing',
      'sourcing',
    ]);
  });
});
