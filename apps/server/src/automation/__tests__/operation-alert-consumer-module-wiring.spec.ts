import 'reflect-metadata';
import { describe, expect, it } from 'vitest';
import { AutomationModule } from '../automation.module';
import { AiModule } from '../../ai/ai.module';
import { AiOperationAlertAdapter } from '../../ai/adapter/out/automation/operation-alert.adapter';
import { AI_OPERATION_ALERT_PORT } from '../../ai/application/port/out/operation-alert.port';
import { ChannelsModule } from '../../channels/channels.module';
import { ChannelsOperationAlertAdapter } from '../../channels/adapter/out/automation/operation-alert.adapter';
import { CHANNELS_OPERATION_ALERT_PORT } from '../../channels/application/port/out/operation-alert.port';
import { FinanceModule } from '../../finance/finance.module';
import { FinanceOperationAlertAdapter } from '../../finance/adapter/out/automation/operation-alert.adapter';
import { FINANCE_OPERATION_ALERT_PORT } from '../../finance/application/port/out/operation-alert.port';
import { RulesModule } from '../../rules/rules.module';
import { RulesOperationAlertAdapter } from '../../rules/adapter/out/automation/operation-alert.adapter';
import { RULES_OPERATION_ALERT_PORT } from '../../rules/application/port/out/operation-alert.port';
import { TrafficModule } from '../../analytics/traffic/traffic.module';
import { TrafficOperationAlertAdapter } from '../../analytics/traffic/adapter/out/automation/operation-alert.adapter';
import { TRAFFIC_OPERATION_ALERT_PORT } from '../../analytics/traffic/application/port/out/operation-alert.port';
import { SourcingModule } from '../../sourcing/sourcing.module';
import { SourcingOperationAlertAdapter } from '../../sourcing/adapter/out/automation/operation-alert.adapter';
import { SOURCING_OPERATION_ALERT_PORT } from '../../sourcing/application/port/out/operation-alert.port';

const IMPORTS_KEY = 'imports';
const PROVIDERS_KEY = 'providers';

type ProviderBinding = {
  provide: symbol;
  useExisting: unknown;
};

const consumers = [
  {
    name: 'AiModule',
    module: AiModule,
    adapter: AiOperationAlertAdapter,
    token: AI_OPERATION_ALERT_PORT,
  },
  {
    name: 'ChannelsModule',
    module: ChannelsModule,
    adapter: ChannelsOperationAlertAdapter,
    token: CHANNELS_OPERATION_ALERT_PORT,
  },
  {
    name: 'FinanceModule',
    module: FinanceModule,
    adapter: FinanceOperationAlertAdapter,
    token: FINANCE_OPERATION_ALERT_PORT,
  },
  {
    name: 'RulesModule',
    module: RulesModule,
    adapter: RulesOperationAlertAdapter,
    token: RULES_OPERATION_ALERT_PORT,
  },
  {
    name: 'TrafficModule',
    module: TrafficModule,
    adapter: TrafficOperationAlertAdapter,
    token: TRAFFIC_OPERATION_ALERT_PORT,
  },
  {
    name: 'SourcingModule',
    module: SourcingModule,
    adapter: SourcingOperationAlertAdapter,
    token: SOURCING_OPERATION_ALERT_PORT,
  },
];

function isProviderBinding(provider: unknown, token: symbol): provider is ProviderBinding {
  return typeof provider === 'object' && provider !== null && (provider as ProviderBinding).provide === token;
}

describe('operation alert consumer module wiring', () => {
  it.each(consumers)('$name imports AutomationModule', ({ module }) => {
    const imports: unknown[] = Reflect.getMetadata(IMPORTS_KEY, module) ?? [];
    expect(imports).toContain(AutomationModule);
  });

  it.each(consumers)('$name binds its local OperationAlert port to its automation adapter', ({ module, adapter, token }) => {
    const providers: unknown[] = Reflect.getMetadata(PROVIDERS_KEY, module) ?? [];
    expect(providers).toContain(adapter);

    const binding = providers.find((provider) => isProviderBinding(provider, token));
    expect(binding).toBeDefined();
    expect(binding!.useExisting).toBe(adapter);
  });
});
