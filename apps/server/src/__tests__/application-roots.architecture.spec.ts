import 'reflect-metadata';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { APP_GUARD } from '@nestjs/core';
import { MODULE_METADATA } from '@nestjs/common/constants';
import { describe, expect, it } from 'vitest';
import { ApiApplicationModule } from '../api-application.module';
import { AgentWorkerApplicationModule } from '../agent-worker-application.module';
import { AgentMcpApplicationModule } from '../agent-mcp-application.module';
import { OperationsModule } from '../operations/operations.module';
import { OperatorRuntimeHandler } from '../agent-os/adapter/out/runtime/operator-runtime.handler';
import { SourcingRuntimeHandler } from '../sourcing/adapter/out/runtime/sourcing-runtime.handler';
import { OrderAgentRuntimeHandler } from '../supply/adapter/out/runtime/order-agent-runtime.handler';
import { SourcingAgentApiCollectionModule } from '../sourcing/sourcing-agent-api-collection.module';
import { SourcingAgentMcpCollectionModule } from '../sourcing/sourcing-agent-mcp-collection.module';
import { InternalSourcingCollectionController } from '../sourcing/adapter/in/http/internal-sourcing-collection.controller';
import { SourcingCollectionOperationAdapter } from '../sourcing/adapter/out/operations/sourcing-collection-operation.adapter';
import { SourcingCollectionApiCommandAdapter } from '../sourcing/adapter/out/http/sourcing-collection-api-command.adapter';

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

  it('keeps the real manager, sourcing/listing, and order handlers in worker context', () => {
    const workerProviders = providers(AgentWorkerApplicationModule);
    expect(workerProviders).toContain(OperatorRuntimeHandler);
    expect(workerProviders).toContain(SourcingRuntimeHandler);
    expect(workerProviders).toContain(OrderAgentRuntimeHandler);
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

  it('leaves no production import of the retired shared AppModule', () => {
    const imports = productionTypeScriptFiles(SERVER_SRC).flatMap((file) => {
      const source = readFileSync(file, 'utf8');
      return source.includes('app.module')
        ? [relative(SERVER_SRC, file)]
        : [];
    });

    expect(imports).toEqual([]);
  });
});
