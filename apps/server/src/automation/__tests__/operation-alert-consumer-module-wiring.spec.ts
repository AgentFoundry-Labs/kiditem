import 'reflect-metadata';
import { describe, expect, it } from 'vitest';
import { AutomationModule } from '../automation.module';
import { OperationAlertRuntimeModule } from '../operation-alert-runtime.module';
import { AiProductGenerationRuntimeModule } from '../../ai/ai-product-generation-runtime.module';
import { AiOperationAlertAdapter } from '../../ai/adapter/out/automation/operation-alert.adapter';
import { AI_OPERATION_ALERT_PORT } from '../../ai/application/port/out/cross-domain/operation-alert.port';
import { ChannelsModule } from '../../channels/channels.module';
import { ChannelsOperationAlertAdapter } from '../../channels/adapter/out/automation/operation-alert.adapter';
import { CHANNELS_OPERATION_ALERT_PORT } from '../../channels/application/port/out/cross-domain/operation-alert.port';
import { FinanceModule } from '../../finance/finance.module';
import { FinanceOperationAlertAdapter } from '../../finance/adapter/out/automation/operation-alert.adapter';
import { FINANCE_OPERATION_ALERT_PORT } from '../../finance/application/port/out/cross-domain/operation-alert.port';
import { RulesModule } from '../../rules/rules.module';
import { RulesOperationAlertAdapter } from '../../rules/adapter/out/automation/operation-alert.adapter';
import { RULES_OPERATION_ALERT_PORT } from '../../rules/application/port/out/cross-domain/operation-alert.port';
import { TrafficModule } from '../../analytics/traffic/traffic.module';
import { TrafficOperationAlertAdapter } from '../../analytics/traffic/adapter/out/automation/operation-alert.adapter';
import { TRAFFIC_OPERATION_ALERT_PORT } from '../../analytics/traffic/application/port/out/cross-domain/operation-alert.port';
import { InventoryFreshnessRuntimeModule } from '../../inventory/inventory-freshness-runtime.module';
import { InventoryOperationAlertAdapter } from '../../inventory/adapter/out/automation/operation-alert.adapter';
import { INVENTORY_OPERATION_ALERT_PORT } from '../../inventory/application/port/out/cross-domain/operation-alert.port';

const IMPORTS_KEY = 'imports';
const PROVIDERS_KEY = 'providers';

type ProviderBinding = {
  provide: symbol;
  useExisting: unknown;
};

type AlertRuntimeModule = typeof AutomationModule | typeof OperationAlertRuntimeModule;

const consumers = [
  {
    name: 'InventoryFreshnessRuntimeModule',
    module: InventoryFreshnessRuntimeModule,
    alertRuntimeModule: OperationAlertRuntimeModule,
    adapter: InventoryOperationAlertAdapter,
    token: INVENTORY_OPERATION_ALERT_PORT,
  },
  {
    name: 'AiProductGenerationRuntimeModule',
    module: AiProductGenerationRuntimeModule,
    alertRuntimeModule: OperationAlertRuntimeModule,
    adapter: AiOperationAlertAdapter,
    token: AI_OPERATION_ALERT_PORT,
  },
  {
    name: 'ChannelsModule',
    module: ChannelsModule,
    alertRuntimeModule: AutomationModule,
    adapter: ChannelsOperationAlertAdapter,
    token: CHANNELS_OPERATION_ALERT_PORT,
  },
  {
    name: 'FinanceModule',
    module: FinanceModule,
    alertRuntimeModule: AutomationModule,
    adapter: FinanceOperationAlertAdapter,
    token: FINANCE_OPERATION_ALERT_PORT,
  },
  {
    name: 'RulesModule',
    module: RulesModule,
    alertRuntimeModule: AutomationModule,
    adapter: RulesOperationAlertAdapter,
    token: RULES_OPERATION_ALERT_PORT,
  },
  {
    name: 'TrafficModule',
    module: TrafficModule,
    alertRuntimeModule: AutomationModule,
    adapter: TrafficOperationAlertAdapter,
    token: TRAFFIC_OPERATION_ALERT_PORT,
  },
];

function isProviderBinding(provider: unknown, token: symbol): provider is ProviderBinding {
  return typeof provider === 'object' && provider !== null && (provider as ProviderBinding).provide === token;
}

describe('operation alert consumer module wiring', () => {
  it.each(consumers)('$name imports its operation-alert runtime owner', ({
    module,
    alertRuntimeModule,
  }: {
    module: unknown;
    alertRuntimeModule: AlertRuntimeModule;
  }) => {
    const imports: unknown[] = Reflect.getMetadata(IMPORTS_KEY, module) ?? [];
    expect(imports).toContain(alertRuntimeModule);
  });

  it.each(consumers)('$name binds its local OperationAlert port to its alert adapter', ({ module, adapter, token }) => {
    const providers: unknown[] = Reflect.getMetadata(PROVIDERS_KEY, module) ?? [];
    expect(providers).toContain(adapter);

    const binding = providers.find((provider) => isProviderBinding(provider, token));
    expect(binding).toBeDefined();
    expect(binding!.useExisting).toBe(adapter);
  });
});
