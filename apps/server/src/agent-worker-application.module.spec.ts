import 'reflect-metadata';
import { describe, expect, it } from 'vitest';
import { MODULE_METADATA } from '@nestjs/common/constants';
import { Test } from '@nestjs/testing';
import { AgentOsWorkerModule } from './agent-os/agent-os-worker.module';
import { AgentWorkerApplicationModule } from './agent-worker-application.module';
import { CHANNELS_OPERATIONS } from './channels/domain/operation/channels.operations';
import { INVENTORY_OPERATIONS } from './inventory/domain/operation/inventory.operations';
import { ORDERS_OPERATIONS } from './orders/domain/operation/orders.operations';
import { OperationHandlerRegistryService } from './operations/application/service/operation-handler-registry.service';
import { OperationOwnerWorkerModule } from './operations/operation-owner-worker.module';
import { OperationsModule, OperationsWorkerModule } from './operations/operations.module';
import { SourcingTrendOperationHandler } from './sourcing/adapter/in/operation/sourcing-trend.operation-handler';
import { PRODUCTS_LISTING_GENERATION_OPERATIONS } from './products/domain/operation/listing-generation.operations';
import { StorageService } from './common/storage/storage.service';
import { PrismaService } from './prisma/prisma.service';
import { RULES_EVALUATION_OPERATION } from './rules/domain/operation/rules.operations';
import { SOURCING_OPERATIONS } from './sourcing/domain/operation/sourcing.operations';

const operationDefinitionsRequiredByWorker = [
  ...CHANNELS_OPERATIONS,
  ...INVENTORY_OPERATIONS,
  ...ORDERS_OPERATIONS,
  ...PRODUCTS_LISTING_GENERATION_OPERATIONS,
  RULES_EVALUATION_OPERATION,
  ...SOURCING_OPERATIONS,
];

const apiEnqueueableOperationKeys = operationDefinitionsRequiredByWorker
  .filter((definition) => definition.allowedTriggers.length > 0)
  .map((definition) => definition.key)
  .sort();

const workerOnlyOperationKeys = operationDefinitionsRequiredByWorker
  .filter((definition) => definition.allowedTriggers.length === 0)
  .map((definition) => definition.key)
  .sort();

function workerModules(root: Function): Function[] {
  const seen = new Set<Function>();
  const visit = (module: Function) => {
    if (seen.has(module)) return;
    seen.add(module);
    const imports = Reflect.getMetadata(MODULE_METADATA.IMPORTS, module) ?? [];
    for (const imported of imports) {
      const importedModule = typeof imported === 'function'
        ? imported
        : imported?.forwardRef?.() ?? imported?.module;
      if (typeof importedModule === 'function') visit(importedModule);
    }
  };
  visit(root);
  return [...seen];
}

function resolvedClassNames(root: Function): string[] {
  return workerModules(root).flatMap((module) => {
    const providers = Reflect.getMetadata(MODULE_METADATA.PROVIDERS, module) ?? [];
    return [module, ...providers].flatMap((value) => {
      if (typeof value === 'function') return [value.name];
      if (value && typeof value === 'object' && typeof value.useClass === 'function') {
        return [value.useClass.name];
      }
      return [];
    });
  });
}

describe('AgentWorkerApplicationModule', () => {
  it('registers each API-enqueueable operation definition and handler in the production worker root', async () => {
    const worker = await Test.createTestingModule({
      imports: [AgentWorkerApplicationModule],
    })
      .overrideProvider(PrismaService)
      .useValue({})
      .overrideProvider(StorageService)
      .useValue({})
      .compile();

    try {
      await worker.init();
      const registry = worker.get(OperationHandlerRegistryService);
      const operationsRegistry = worker
        .select(OperationsModule)
        .get(OperationHandlerRegistryService, { strict: true });
      const definitions = registry.listDefinitions();

      expect(operationsRegistry).toBe(registry);
      expect(registry.getHandler('sourcing.collect_daily_trends')).toBe(
        worker.get(SourcingTrendOperationHandler),
      );

      const missingOrDuplicateApiDefinitions = apiEnqueueableOperationKeys.filter(
        (operationKey) => definitions.filter((definition) => definition.key === operationKey).length !== 1,
      );
      const missingOrDuplicateWorkerDefinitions = workerOnlyOperationKeys.filter(
        (operationKey) => definitions.filter((definition) => definition.key === operationKey).length !== 1,
      );

      expect(missingOrDuplicateApiDefinitions).toEqual([]);
      expect(missingOrDuplicateWorkerDefinitions).toEqual([]);
      for (const operationKey of apiEnqueueableOperationKeys) {
        expect(registry.getHandler(operationKey).execute).toEqual(expect.any(Function));
      }
      for (const operationKey of workerOnlyOperationKeys) {
        expect(registry.getHandler(operationKey).execute).toEqual(expect.any(Function));
      }
    } finally {
      await worker.close();
    }
  });

  it('contains only Operations durable background work, not Agent invocation runtime', () => {
    const imports = Reflect.getMetadata(
      MODULE_METADATA.IMPORTS,
      AgentWorkerApplicationModule,
    ) ?? [];
    const providers = Reflect.getMetadata(
      MODULE_METADATA.PROVIDERS,
      AgentWorkerApplicationModule,
    ) ?? [];
    expect(imports).toEqual([AgentOsWorkerModule]);
    expect(providers).toEqual([]);
    expect(Reflect.getMetadata(MODULE_METADATA.IMPORTS, AgentOsWorkerModule) ?? []).toEqual([
      OperationsWorkerModule,
      OperationOwnerWorkerModule,
    ]);
    expect(Reflect.getMetadata(MODULE_METADATA.IMPORTS, OperationsModule) ?? [])
      .not.toContain(OperationOwnerWorkerModule);

    const resolved = resolvedClassNames(AgentWorkerApplicationModule);
    expect(resolved).toEqual(expect.arrayContaining([
      'OperationRunWorkerService',
      'OperationSchedulerService',
      'OperationWorkerLifecycleService',
    ]));
    expect(resolved).not.toEqual(expect.arrayContaining([
      'PrismaCapabilityInvocationRepository',
      'CapabilityInvocationService',
      'CapabilityApprovalService',
      'AgentCapabilityRegistry',
      'SourcingAgentGatewayAdapter',
      'HostRunnerAttemptControlAdapter',
      'HostRunnerAttemptExecutorService',
      'AgentOsCapabilityModule',
      'SourcingAgentRuntimeModule',
      'AiDirectJobWorkerService',
    ]));
    expect(workerModules(AgentWorkerApplicationModule).flatMap((module) =>
      Reflect.getMetadata(MODULE_METADATA.CONTROLLERS, module) ?? [],
    )).toEqual([]);
  });
});
