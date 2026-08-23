import 'reflect-metadata';
import { describe, expect, it } from 'vitest';
import { AdvertisingModule } from '../advertising.module';
import { PrismaModule } from '../../prisma/prisma.module';
import { AiModule } from '../../ai/ai.module';
import { AutomationModule } from '../../automation/automation.module';
import { ChannelsModule } from '../../channels/channels.module';
import { ProductsModule } from '../../products/products.module';
import { OperationsModule } from '../../operations/operations.module';

describe('AdvertisingModule retained wiring', () => {
  it('uses owner modules without the removed Agent OS execution wrapper', () => {
    const imports = Reflect.getMetadata('imports', AdvertisingModule) ?? [];
    expect(imports).toEqual([PrismaModule, AiModule, AutomationModule, ChannelsModule, ProductsModule, OperationsModule]);
    const controllerNames = (Reflect.getMetadata('controllers', AdvertisingModule) ?? []).map((controller: Function) => controller.name);
    expect(controllerNames).toContain('AdKeywordAgentController');
    expect(controllerNames).not.toContain('AdStrategyAgentController');
  });
});
