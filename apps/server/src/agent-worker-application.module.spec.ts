import 'reflect-metadata';
import { describe, expect, it } from 'vitest';
import { MODULE_METADATA } from '@nestjs/common/constants';
import { AgentOsWorkerModule } from './agent-os/agent-os-worker.module';
import { AgentWorkerApplicationModule } from './agent-worker-application.module';

function workerModules(root: Function): Function[] {
  const seen = new Set<Function>();
  const visit = (module: Function) => {
    if (seen.has(module)) return;
    seen.add(module);
    const imports = Reflect.getMetadata(MODULE_METADATA.IMPORTS, module) ?? [];
    for (const imported of imports) {
      const importedModule =
        typeof imported === 'function' ? imported : imported?.module;
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
    ]));
  });
});
