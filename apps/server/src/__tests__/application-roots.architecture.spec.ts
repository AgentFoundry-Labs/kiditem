import 'reflect-metadata';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { APP_GUARD } from '@nestjs/core';
import { MODULE_METADATA } from '@nestjs/common/constants';
import { describe, expect, it } from 'vitest';
import { ApiApplicationModule } from '../api-application.module';
import { AgentWorkerApplicationModule } from '../agent-worker-application.module';
import { AgentMcpApplicationModule } from '../agent-mcp-application.module';
import { AgentOsHttpModule } from '../agent-os/agent-os-http.module';
import { AgentOsWorkerModule } from '../agent-os/agent-os-worker.module';
import { OperationsModule } from '../operations/operations.module';
import { OperationsHttpModule } from '../operations/operations-http.module';
import { OperationsController } from '../operations/adapter/in/http/operations.controller';
import { OperationSchedulesController } from '../operations/adapter/in/http/operation-schedules.controller';
import { BrowserOperationRuntimeController } from '../operations/adapter/in/http/browser-operation-runtime.controller';
import { BrowserOperationRuntimeService } from '../operations/application/service/browser-operation-runtime.service';
import { OperationRunWorkerService } from '../operations/application/service/operation-run-worker.service';
import { OperationSchedulerService } from '../operations/application/service/operation-scheduler.service';
import {
  DEFAULT_OPERATION_LIFECYCLE_OPTIONS,
  OPERATION_LIFECYCLE_OPTIONS,
  OperationServerLifecycleService,
} from '../operations/application/service/operation-server-lifecycle.service';
import { OperatorRuntimeHandler } from '../agent-os/adapter/out/runtime/operator-runtime.handler';
import { SourcingAgentApiCollectionModule } from '../sourcing/sourcing-agent-api-collection.module';
import { SourcingShadowOperationModule } from '../sourcing/sourcing-shadow-operation.module';
import { SourcingCollectionOperationAdapter } from '../sourcing/adapter/out/operations/sourcing-collection-operation.adapter';
import { MarketShadowOperationAdapter } from '../sourcing/adapter/out/operations/market-shadow-operation.adapter';
import { SourcingShadowSignalService } from '../sourcing/application/service/sourcing-shadow-signal.service';
import { GoogleTrendsRssAdapter } from '../sourcing/adapter/out/google-trends/google-trends-rss.adapter';
import { LinkfoxEchotikShadowAdapter } from '../sourcing/adapter/out/linkfox/linkfox-echotik-shadow.adapter';
import { MarketShadowSnapshotRepositoryAdapter } from '../sourcing/adapter/out/repository/market-shadow-snapshot.repository.adapter';
import { AiDirectJobWorkerService } from '../ai/application/service/ai-direct-job-worker.service';
import { AI_DIRECT_JOB_WAKE_PORT } from '../ai/application/port/out/runtime';
import { AgentSessionDeletionController } from '../agent-os/adapter/in/http/session-control/agent-session-deletion.controller';
import { AgentSessionDeletionOperationHandler } from '../agent-os/adapter/in/operation/agent-session-deletion.operation-handler';
import { AgentSessionDeletionService } from '../agent-os/application/service/session-control/agent-session-deletion.service';
import { AgentSessionDeletionFinalizerRecoveryService } from '../agent-os/application/service/session-control/agent-session-deletion-finalizer-recovery.service';
import { AgentSessionDeletionRecoveryService } from '../agent-os/application/service/session-control/agent-session-deletion-recovery.service';
import { PrismaAgentSessionDeletionCommandTransaction } from '../agent-os/adapter/out/transaction/session-deletion/prisma-agent-session-deletion-command.transaction';
import { PrismaAgentSessionDeletionQueryRepository } from '../agent-os/adapter/out/repository/session-deletion/prisma-agent-session-deletion-query.repository';
import { inspectStaticApplicationRootPolicy } from './application-root-policy';
import { SourcingAgentReadCapabilityModule } from '../sourcing/sourcing-agent-read-capability.module';
import { SourcingAgentListingCapabilityModule } from '../sourcing/sourcing-agent-listing-capability.module';
import { AiProductGenerationRuntimeModule } from '../ai/ai-product-generation-runtime.module';
import { AiAgentRuntimeModule, AiModule } from '../ai/ai.module';
import { SourcingAgentRuntimeModule } from '../sourcing/sourcing-agent-runtime.module';

type ProviderLike = Function | { provide?: unknown };
type ModuleLike =
  | Function
  | {
      module: Function;
      imports?: ModuleLike[];
      controllers?: Function[];
      providers?: ProviderLike[];
    };

const SERVER_SRC = join(__dirname, '..');

function moduleClass(value: ModuleLike): Function {
  return typeof value === 'function' ? value : value.module;
}

function graph(root: ModuleLike): Set<ModuleLike> {
  const seen = new Set<ModuleLike>();
  const visit = (current: ModuleLike): void => {
    if (seen.has(current)) return;
    seen.add(current);
    const type = moduleClass(current);
    const staticImports: ModuleLike[] =
      Reflect.getMetadata(MODULE_METADATA.IMPORTS, type) ?? [];
    const dynamicImports =
      typeof current === 'function' ? [] : (current.imports ?? []);
    [...staticImports, ...dynamicImports].forEach(visit);
  };
  visit(root);
  return seen;
}

function controllers(root: ModuleLike): Function[] {
  return [...graph(root)].flatMap((module) => [
    ...(Reflect.getMetadata(
      MODULE_METADATA.CONTROLLERS,
      moduleClass(module),
    ) ?? []),
    ...(typeof module === 'function' ? [] : (module.controllers ?? [])),
  ]);
}

function hasGlobalGuard(root: ModuleLike): boolean {
  return [...graph(root)].some((module) => {
    const providers: ProviderLike[] = [
      ...(Reflect.getMetadata(
        MODULE_METADATA.PROVIDERS,
        moduleClass(module),
      ) ?? []),
      ...(typeof module === 'function' ? [] : (module.providers ?? [])),
    ];
    return providers.some(
      (provider) =>
        typeof provider === 'object' && provider.provide === APP_GUARD,
    );
  });
}

function providers(root: ModuleLike): ProviderLike[] {
  return [...graph(root)].flatMap((module) => [
    ...(Reflect.getMetadata(MODULE_METADATA.PROVIDERS, moduleClass(module)) ?? []),
    ...(typeof module === 'function' ? [] : (module.providers ?? [])),
  ]);
}

function productionTypeScriptFiles(directory: string): string[] {
  return readdirSync(directory).flatMap((entry) => {
    const absolute = join(directory, entry);
    if (statSync(absolute).isDirectory()) {
      if (entry === '__tests__') return [];
      return productionTypeScriptFiles(absolute);
    }
    return entry.endsWith('.ts') && !entry.endsWith('.spec.ts')
      ? [absolute]
      : [];
  });
}

describe('application root topology', () => {
  it('keeps Operations controller-free while its HTTP wrapper owns API controllers', () => {
    expect(
      Reflect.getMetadata(MODULE_METADATA.CONTROLLERS, OperationsModule) ?? [],
    ).toEqual([]);
    expect(
      Reflect.getMetadata(MODULE_METADATA.CONTROLLERS, OperationsHttpModule) ?? [],
    ).toEqual([
      OperationsController,
      OperationSchedulesController,
      BrowserOperationRuntimeController,
    ]);
    expect(
      Reflect.getMetadata(MODULE_METADATA.IMPORTS, ApiApplicationModule) ?? [],
    ).toContain(OperationsHttpModule);

    for (const root of [AgentWorkerApplicationModule, AgentMcpApplicationModule]) {
      expect([...graph(root)].map(moduleClass)).not.toContain(OperationsHttpModule);
    }
  });

  it('exports the browser runtime service to its HTTP wrapper', () => {
    expect(
      Reflect.getMetadata(MODULE_METADATA.EXPORTS, OperationsModule) ?? [],
    ).toContain(BrowserOperationRuntimeService);
  });

  it('does not give the worker wrapper HTTP or Operations dependencies', () => {
    const workerImports: ModuleLike[] =
      Reflect.getMetadata(MODULE_METADATA.IMPORTS, AgentOsWorkerModule) ?? [];

    expect(workerImports).not.toContain(AgentOsHttpModule);
    expect([...graph(AgentOsWorkerModule)].map(moduleClass)).not.toContain(
      OperationsModule,
    );
  });

  it('gives Operations ownership only to the API root', () => {
    const hasOperations = (root: ModuleLike): boolean =>
      [...graph(root)].some(
        (module) => moduleClass(module) === OperationsModule,
      );

    expect(hasOperations(ApiApplicationModule)).toBe(true);
    expect(hasOperations(AgentWorkerApplicationModule)).toBe(false);
    expect(hasOperations(AgentMcpApplicationModule)).toBe(false);
    expect(controllers(AgentWorkerApplicationModule)).toEqual([]);
    expect(controllers(AgentMcpApplicationModule)).toEqual([]);
    expect(hasGlobalGuard(AgentWorkerApplicationModule)).toBe(false);
    expect(hasGlobalGuard(AgentMcpApplicationModule)).toBe(false);
    expect([...graph(AgentMcpApplicationModule)].map(moduleClass)).toContain(
      SourcingAgentReadCapabilityModule,
    );
  });

  it('composes listing generation from narrow controller-free owner modules only', () => {
    const mcpGraph = [...graph(AgentMcpApplicationModule)].map(moduleClass);
    expect(mcpGraph).toEqual(expect.arrayContaining([
      SourcingAgentListingCapabilityModule,
      AiProductGenerationRuntimeModule,
    ]));
    expect(mcpGraph).not.toEqual(expect.arrayContaining([
      AiModule,
      AiAgentRuntimeModule,
      SourcingAgentRuntimeModule,
      AgentOsHttpModule,
      OperationsModule,
    ]));
    expect(controllers(AiProductGenerationRuntimeModule)).toEqual([]);
    expect(
      readFileSync(
        join(SERVER_SRC, 'ai', 'ai-product-generation-runtime.module.ts'),
        'utf8',
      ),
    ).not.toMatch(/adapter\/in\/http|AgentOsApiExecutionModule|Operations(?:Http)?Module|INTERACTION_.*(?:SECRET|HMAC)/);
  });

  it('composes AgentSession deletion execution only in the API root', () => {
    const deletionSurface = [
      AgentSessionDeletionController,
      AgentSessionDeletionService,
      PrismaAgentSessionDeletionCommandTransaction,
      PrismaAgentSessionDeletionQueryRepository,
      AgentSessionDeletionOperationHandler,
      AgentSessionDeletionFinalizerRecoveryService,
      AgentSessionDeletionRecoveryService,
    ];
    expect(controllers(ApiApplicationModule)).toContain(
      AgentSessionDeletionController,
    );
    expect(providers(ApiApplicationModule)).toEqual(
      expect.arrayContaining(deletionSurface.slice(1)),
    );
    expect(providers(ApiApplicationModule)).toContain(OperationRunWorkerService);

    for (const root of [AgentWorkerApplicationModule, AgentMcpApplicationModule]) {
      expect(controllers(root)).not.toContain(AgentSessionDeletionController);
      expect(providers(root)).not.toEqual(
        expect.arrayContaining(deletionSurface),
      );
      expect(providers(root)).not.toContain(OperationRunWorkerService);
    }
  });

  it('binds every process entrypoint to its exact application root', () => {
    expect(readFileSync(join(SERVER_SRC, 'main.ts'), 'utf8')).toContain(
      "from './api-application.module'",
    );
    expect(readFileSync(join(SERVER_SRC, 'worker.ts'), 'utf8')).toContain(
      "from './agent-worker-application.module'",
    );
    expect(existsSync(join(
      SERVER_SRC,
      'agent-os/adapter/in/cli/run-openai-operator.ts',
    ))).toBe(false);
    const rootPackage = JSON.parse(readFileSync(
      join(SERVER_SRC, '../../../package.json'),
      'utf8',
    )) as { scripts?: Record<string, string> };
    expect(rootPackage.scripts).not.toHaveProperty('agent-os:operator:openai');
    expect(
      readFileSync(
        join(
          SERVER_SRC,
          'agent-os/adapter/in/mcp/kiditem-agent-os-mcp-server.ts',
        ),
        'utf8',
      ),
    ).toContain("from '../../../../agent-mcp-application.module'");
  });

  it('keeps the legacy manager handler out of the official MCP root', () => {
    expect(providers(AgentWorkerApplicationModule)).toContain(OperatorRuntimeHandler);
    expect(providers(AgentMcpApplicationModule)).not.toContain(OperatorRuntimeHandler);
  });

  it('keeps the API-owned AI direct-job poller out of Agent process roots', () => {
    for (const root of [
      AgentWorkerApplicationModule,
      AgentMcpApplicationModule,
    ]) {
      const rootProviders = providers(root);
      expect(rootProviders).not.toContain(AiDirectJobWorkerService);
      expect(rootProviders).not.toContainEqual(
        expect.objectContaining({ provide: AI_DIRECT_JOB_WAKE_PORT }),
      );
    }
  });

  it('keeps collection direct ownership controller-free in the API composition', () => {
    const apiProviders: ProviderLike[] =
      Reflect.getMetadata(MODULE_METADATA.PROVIDERS, SourcingAgentApiCollectionModule) ?? [];
    expect(Reflect.getMetadata(
      MODULE_METADATA.CONTROLLERS,
      SourcingAgentApiCollectionModule,
    ) ?? []).toEqual([]);
    expect(apiProviders).toContain(SourcingCollectionOperationAdapter);
  });

  it('keeps Shadow collection direct and controller-free in the API composition', () => {
    const apiProviders: ProviderLike[] =
      Reflect.getMetadata(MODULE_METADATA.PROVIDERS, SourcingShadowOperationModule) ?? [];
    expect(Reflect.getMetadata(
      MODULE_METADATA.CONTROLLERS,
      SourcingShadowOperationModule,
    ) ?? []).toEqual([]);
    expect(apiProviders).toContain(MarketShadowOperationAdapter);
    expect(apiProviders).toContain(SourcingShadowSignalService);

    const workerProviders = providers(AgentWorkerApplicationModule);
    const mcpProviders = providers(AgentMcpApplicationModule);
    for (const rootProviders of [workerProviders, mcpProviders]) {
      expect(rootProviders).not.toContain(MarketShadowOperationAdapter);
      expect(rootProviders).not.toContain(SourcingShadowSignalService);
      expect(rootProviders).not.toContain(GoogleTrendsRssAdapter);
      expect(rootProviders).not.toContain(LinkfoxEchotikShadowAdapter);
      expect(rootProviders).not.toContain(MarketShadowSnapshotRepositoryAdapter);
    }
  });

  it('removes legacy AgentRun grants and Sourcing HTTP self-call composition', () => {
    const retiredFiles = [
      'agent-os/application/port/in/capability/agent-api-capability-grant.port.ts',
      'agent-os/application/service/agent-api-capability-grant.service.ts',
      'agent-os/adapter/in/http/agent-api-capability-grant.guard.ts',
      'agent-os/adapter/in/http/agent-api-shadow-capability-grant.guard.ts',
      'agent-os/adapter/out/runtime/kiditem-mcp-session.adapter.ts',
      'agent-os/application/port/out/runtime/agent-mcp-session.port.ts',
      'sourcing/adapter/in/http/internal-sourcing-collection.controller.ts',
      'sourcing/adapter/in/http/internal-market-shadow-operation.controller.ts',
      'sourcing/adapter/out/http/sourcing-collection-api-command.adapter.ts',
      'sourcing/adapter/out/http/market-shadow-operation-api-command.adapter.ts',
      'sourcing/sourcing-agent-mcp-collection.module.ts',
      'sourcing/sourcing-agent-shadow-operation.module.ts',
    ];

    expect(retiredFiles.filter((file) => existsSync(join(SERVER_SRC, file)))).toEqual([]);
    expect(
      Reflect.getMetadata(MODULE_METADATA.CONTROLLERS, SourcingAgentApiCollectionModule) ?? [],
    ).toEqual([]);
    expect(
      Reflect.getMetadata(MODULE_METADATA.CONTROLLERS, SourcingShadowOperationModule) ?? [],
    ).toEqual([]);
  });

  it('gives Nest lifecycle ownership only to the Operations server lifecycle service', () => {
    const operationProviders: ProviderLike[] =
      Reflect.getMetadata(MODULE_METADATA.PROVIDERS, OperationsModule) ?? [];
    const hookNames = [
      'onModuleInit',
      'onApplicationBootstrap',
      'onModuleDestroy',
      'beforeApplicationShutdown',
    ];
    const lifecycleProviders = operationProviders.filter(
      (provider): provider is Function =>
        typeof provider === 'function' &&
        hookNames.some((hook) => typeof provider.prototype?.[hook] === 'function'),
    );

    expect(operationProviders).toContain(OperationSchedulerService);
    expect(operationProviders).toContain(OperationRunWorkerService);
    expect(lifecycleProviders).toEqual([OperationServerLifecycleService]);
    expect(operationProviders).toContainEqual({
      provide: OPERATION_LIFECYCLE_OPTIONS,
      useValue: DEFAULT_OPERATION_LIFECYCLE_OPTIONS,
    });
    expect(DEFAULT_OPERATION_LIFECYCLE_OPTIONS).toEqual({
      batchSize: 100,
      startupTimeoutMs: 30_000,
      shutdownTimeoutMs: 5_000,
    });
  });

  it('leaves no production import of the retired shared AppModule', () => {
    const imports = productionTypeScriptFiles(SERVER_SRC).flatMap((file) => {
      const source = readFileSync(file, 'utf8');
      return source.includes('app.module')
        ? [relative(SERVER_SRC, file)]
        : [];
    });

    expect(imports).toEqual([]);
  });

  it('rejects retired root imports, Operations reachability, and lifecycle identifiers in production source', () => {
    expect(inspectStaticApplicationRootPolicy(SERVER_SRC)).toEqual([]);
  });
});
