import 'reflect-metadata';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { ChannelsFinalCapabilityAdapter } from '../../channels/adapter/in/agent/channels-final-capability.adapter';
import { ChannelsFinalCapabilityModule } from '../../channels/channels-final-capability.module';
import { CHANNELS_FINAL_CAPABILITY_PORT } from '../../channels/application/port/in/capability/channels-final-capability.port';
import { SourcingFinalCapabilityAdapter } from '../adapter/in/agent/sourcing-final-capability.adapter';
import { SourcingFinalDiscoveryCapabilityAdapter } from '../adapter/in/agent/sourcing-final-discovery-capability.adapter';
import {
  SOURCING_FINAL_CAPABILITY_PORT,
} from '../application/port/in/capability/sourcing-final-capability.port';
import {
  SOURCING_FINAL_DISCOVERY_CAPABILITY_PORT,
} from '../application/port/in/capability/sourcing-final-discovery-capability.port';
import { SourcingModule } from '../sourcing.module';

const PROVIDERS_KEY = 'providers';

function providers(module: object): Array<unknown> {
  return Reflect.getMetadata(PROVIDERS_KEY, module) ?? [];
}

function binding(
  entries: Array<unknown>,
  token: symbol,
): { provide: symbol; useExisting: unknown } | undefined {
  return entries.find((entry): entry is { provide: symbol; useExisting: unknown } =>
    Boolean(entry) && typeof entry === 'object' && 'provide' in entry
      && (entry as { provide?: unknown }).provide === token,
  );
}

describe('Sourcing final capability wiring', () => {
  it('binds the final Sourcing capability port to Sourcing-owned incoming adapters', () => {
    const entries = providers(SourcingModule);

    expect(entries).toContain(SourcingFinalCapabilityAdapter);
    expect(entries).toContain(SourcingFinalDiscoveryCapabilityAdapter);
    expect(binding(entries, SOURCING_FINAL_CAPABILITY_PORT)).toEqual({
      provide: SOURCING_FINAL_CAPABILITY_PORT,
      useExisting: SourcingFinalCapabilityAdapter,
    });
    expect(binding(entries, SOURCING_FINAL_DISCOVERY_CAPABILITY_PORT)).toEqual({
      provide: SOURCING_FINAL_DISCOVERY_CAPABILITY_PORT,
      useExisting: SourcingFinalDiscoveryCapabilityAdapter,
    });
  });

  it('keeps Agent OS composition on incoming ports rather than concrete Sourcing services or runtime handlers', () => {
    const finalAdapter = readFileSync(
      new URL('../adapter/in/agent/sourcing-final-capability.adapter.ts', import.meta.url),
      'utf8',
    );
    const registrar = readFileSync(
      new URL('../../agent-os/application/service/final-capability-catalog-registrar.service.ts', import.meta.url),
      'utf8',
    );

    expect(finalAdapter).not.toContain('agent-os/application/service');
    expect(registrar).toContain('SOURCING_FINAL_CAPABILITY_PORT');
    expect(registrar).not.toContain('SourcingService');
    expect(registrar).not.toContain('SourcingPlaywrightRuntimeHandler');
    expect(registrar).not.toContain('PrismaService');
  });

  it('keeps canonical Channels mutations behind the Channels-owned final port', () => {
    const entries = providers(ChannelsFinalCapabilityModule);

    expect(entries).toContain(ChannelsFinalCapabilityAdapter);
    expect(binding(entries, CHANNELS_FINAL_CAPABILITY_PORT)).toEqual({
      provide: CHANNELS_FINAL_CAPABILITY_PORT,
      useExisting: ChannelsFinalCapabilityAdapter,
    });
  });
});
