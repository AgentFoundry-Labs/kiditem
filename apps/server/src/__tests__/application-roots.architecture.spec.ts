import 'reflect-metadata';
import { readFileSync, readdirSync, statSync } from 'node:fs';
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
import { OperationRunWorkerService } from '../operations/application/service/operation-run-worker.service';
import { OperationSchedulerService } from '../operations/application/service/operation-scheduler.service';
import {
  DEFAULT_OPERATION_LIFECYCLE_OPTIONS,
  OPERATION_LIFECYCLE_OPTIONS,
  OperationServerLifecycleService,
} from '../operations/application/service/operation-server-lifecycle.service';
import { OperatorRuntimeHandler } from '../agent-os/adapter/out/runtime/operator-runtime.handler';
import { SourcingRuntimeHandler } from '../sourcing/adapter/out/runtime/sourcing-runtime.handler';
import { OrderAgentRuntimeHandler } from '../supply/adapter/out/runtime/order-agent-runtime.handler';
import { SourcingAgentApiCollectionModule } from '../sourcing/sourcing-agent-api-collection.module';
import { SourcingAgentMcpCollectionModule } from '../sourcing/sourcing-agent-mcp-collection.module';
import { SourcingAgentShadowOperationModule } from '../sourcing/sourcing-agent-shadow-operation.module';
import { SourcingShadowOperationModule } from '../sourcing/sourcing-shadow-operation.module';
import { InternalSourcingCollectionController } from '../sourcing/adapter/in/http/internal-sourcing-collection.controller';
import { InternalMarketShadowOperationController } from '../sourcing/adapter/in/http/internal-market-shadow-operation.controller';
import { SourcingCollectionOperationAdapter } from '../sourcing/adapter/out/operations/sourcing-collection-operation.adapter';
import { SourcingCollectionApiCommandAdapter } from '../sourcing/adapter/out/http/sourcing-collection-api-command.adapter';
import { MarketShadowOperationAdapter } from '../sourcing/adapter/out/operations/market-shadow-operation.adapter';
import { MarketShadowOperationApiCommandAdapter } from '../sourcing/adapter/out/http/market-shadow-operation-api-command.adapter';
import { SourcingShadowSignalService } from '../sourcing/application/service/sourcing-shadow-signal.service';
import { GoogleTrendsRssAdapter } from '../sourcing/adapter/out/google-trends/google-trends-rss.adapter';
import { LinkfoxEchotikShadowAdapter } from '../sourcing/adapter/out/linkfox/linkfox-echotik-shadow.adapter';
import { MarketShadowSnapshotRepositoryAdapter } from '../sourcing/adapter/out/repository/market-shadow-snapshot.repository.adapter';
import { AiDirectJobWorkerService } from '../ai/application/service/ai-direct-job-worker.service';
import { AI_DIRECT_JOB_WAKE_PORT } from '../ai/application/port/out/runtime';
import { AgentSessionDeletionController } from '../agent-os/adapter/in/http/session-control/agent-session-deletion.controller';
import { AgentSessionDeletionService } from '../agent-os/application/service/session-control/agent-session-deletion.service';
import { PrismaAgentSessionDeletionCommandTransaction } from '../agent-os/adapter/out/transaction/session-deletion/prisma-agent-session-deletion-command.transaction';
import { PrismaAgentSessionDeletionQueryRepository } from '../agent-os/adapter/out/repository/session-deletion/prisma-agent-session-deletion-query.repository';
import { inspectStaticApplicationRootPolicy } from './application-root-policy';

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
  });

  it('keeps the unbound AgentSession deletion-control surface out of API, worker, and MCP roots', () => {
    const deletionSurface = [
      AgentSessionDeletionController,
      AgentSessionDeletionService,
      PrismaAgentSessionDeletionCommandTransaction,
      PrismaAgentSessionDeletionQueryRepository,
    ];
    for (const root of [
      ApiApplicationModule,
      AgentWorkerApplicationModule,
      AgentMcpApplicationModule,
    ]) {
      expect(controllers(root)).not.toContain(AgentSessionDeletionController);
      expect(providers(root)).not.toEqual(
        expect.arrayContaining(deletionSurface),
      );
    }
  });

  it('binds every process entrypoint to its exact application root', () => {
    expect(readFileSync(join(SERVER_SRC, 'main.ts'), 'utf8')).toContain(
      "from './api-application.module'",
    );
    expect(readFileSync(join(SERVER_SRC, 'worker.ts'), 'utf8')).toContain(
      "from './agent-worker-application.module'",
    );
    expect(
      readFileSync(
        join(
          SERVER_SRC,
          'agent-os/adapter/in/cli/run-openai-operator.ts',
        ),
        'utf8',
      ),
    ).toContain("from '../../../../agent-mcp-application.module'");
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

  it('keeps the real manager, sourcing/listing, and order handlers in both Agent roots', () => {
    for (const root of [
      AgentWorkerApplicationModule,
      AgentMcpApplicationModule,
    ]) {
      const rootProviders = providers(root);
      expect(rootProviders).toContain(OperatorRuntimeHandler);
      expect(rootProviders).toContain(SourcingRuntimeHandler);
      expect(rootProviders).toContain(OrderAgentRuntimeHandler);
    }
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

  it('binds collection directly only in API and over HTTP only in MCP', () => {
    const apiProviders: ProviderLike[] =
      Reflect.getMetadata(MODULE_METADATA.PROVIDERS, SourcingAgentApiCollectionModule) ?? [];
    const mcpProviders: ProviderLike[] =
      Reflect.getMetadata(MODULE_METADATA.PROVIDERS, SourcingAgentMcpCollectionModule) ?? [];
    expect(Reflect.getMetadata(
      MODULE_METADATA.CONTROLLERS,
      SourcingAgentApiCollectionModule,
    )).toEqual([InternalSourcingCollectionController]);
    expect(Reflect.getMetadata(
      MODULE_METADATA.CONTROLLERS,
      SourcingAgentMcpCollectionModule,
    ) ?? []).toEqual([]);
    expect(apiProviders).toContain(SourcingCollectionOperationAdapter);
    expect(apiProviders).not.toContain(SourcingCollectionApiCommandAdapter);
    expect(mcpProviders).toContain(SourcingCollectionApiCommandAdapter);
    expect(mcpProviders).not.toContain(SourcingCollectionOperationAdapter);
  });

  it('keeps Shadow collection direct ownership in API and uses only the strict API command in Agent roots', () => {
    const apiProviders: ProviderLike[] =
      Reflect.getMetadata(MODULE_METADATA.PROVIDERS, SourcingShadowOperationModule) ?? [];
    const agentProviders: ProviderLike[] =
      Reflect.getMetadata(MODULE_METADATA.PROVIDERS, SourcingAgentShadowOperationModule) ?? [];
    expect(Reflect.getMetadata(
      MODULE_METADATA.CONTROLLERS,
      SourcingShadowOperationModule,
    )).toEqual([InternalMarketShadowOperationController]);
    expect(apiProviders).toContain(MarketShadowOperationAdapter);
    expect(apiProviders).toContain(SourcingShadowSignalService);
    expect(agentProviders).toContain(MarketShadowOperationApiCommandAdapter);
    expect(agentProviders).not.toContain(MarketShadowOperationAdapter);

    for (const root of [AgentWorkerApplicationModule, AgentMcpApplicationModule]) {
      const rootProviders = providers(root);
      expect(rootProviders).toContain(MarketShadowOperationApiCommandAdapter);
      expect(rootProviders).not.toContain(MarketShadowOperationAdapter);
      expect(rootProviders).not.toContain(SourcingShadowSignalService);
      expect(rootProviders).not.toContain(GoogleTrendsRssAdapter);
      expect(rootProviders).not.toContain(LinkfoxEchotikShadowAdapter);
      expect(rootProviders).not.toContain(MarketShadowSnapshotRepositoryAdapter);
    }
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
