import 'reflect-metadata';
import { describe, expect, it } from 'vitest';
import { AdvertisingModule } from '../advertising.module';
import { PrismaModule } from '../../prisma/prisma.module';
import { AiModule } from '../../ai/ai.module';
import { AutomationModule } from '../../automation/automation.module';
import { ChannelsModule } from '../../channels/channels.module';
import { OperationsModule } from '../../operations/operations.module';
import { AdvertisingProfitabilityReadModule } from '../advertising-profitability-read.module';

describe('AdvertisingModule retained wiring', () => {
  it('uses owner modules without the removed Agent OS execution wrapper', () => {
    const imports = Reflect.getMetadata('imports', AdvertisingModule) ?? [];
    expect(imports).toEqual([
      PrismaModule,
      AiModule,
      AutomationModule,
      ChannelsModule,
      OperationsModule,
      AdvertisingProfitabilityReadModule,
    ]);
    const providerNames = (Reflect.getMetadata('providers', AdvertisingModule) ?? [])
      .map((provider: Function | { provide?: unknown }) =>
        typeof provider === 'function' ? provider.name : String(provider.provide));
    expect(providerNames).not.toContain('AdvertisingProfitabilityOperationHandler');
    const controllerNames = (Reflect.getMetadata('controllers', AdvertisingModule) ?? []).map((controller: Function) => controller.name);
    expect(controllerNames).toContain('AdKeywordAgentController');
    expect(controllerNames).not.toContain('AdStrategyAgentController');
    expect(controllerNames).not.toContain('ProfitabilityAdRefreshController');
  });
});
