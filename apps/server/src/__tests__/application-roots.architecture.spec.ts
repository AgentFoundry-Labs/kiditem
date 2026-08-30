import 'reflect-metadata';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { MODULE_METADATA } from '@nestjs/common/constants';
import { describe, expect, it } from 'vitest';
import { ApiApplicationModule } from '../api-application.module';
import { AgentWorkerApplicationModule } from '../agent-worker-application.module';
import { AgentOsInteractionHttpModule } from '../agent-os/agent-os-interaction-http.module';
import { AgentOsHttpModule } from '../agent-os/agent-os-http.module';
import { AgentOsWorkerModule } from '../agent-os/agent-os-worker.module';
import { OperationsHttpModule } from '../operations/operations-http.module';
import { OperationsWorkerModule } from '../operations/operations.module';
import { inspectStaticApplicationRootPolicy } from './application-root-policy';

type ModuleLike = Function | { module: Function; imports?: ModuleLike[] };
const serverSource = join(__dirname, '..');

function moduleClass(module: ModuleLike): Function { return typeof module === 'function' ? module : module.module; }
function graph(root: ModuleLike): Set<ModuleLike> {
  const seen = new Set<ModuleLike>();
  const visit = (current: ModuleLike | undefined): void => {
    if (!current) return;
    if (seen.has(current)) return;
    seen.add(current);
    const imports = Reflect.getMetadata(MODULE_METADATA.IMPORTS, moduleClass(current)) ?? [];
    for (const item of [...imports, ...(typeof current === 'function' ? [] : current.imports ?? [])]) visit(item as ModuleLike | undefined);
  };
  visit(root);
  return seen;
}
function classes(root: ModuleLike): Function[] { return [...graph(root)].map(moduleClass); }

describe('final application-root topology', () => {
  it('has one API interaction boundary, with no duplicate direct Agent OS HTTP import', () => {
    const apiImports = Reflect.getMetadata(MODULE_METADATA.IMPORTS, ApiApplicationModule) ?? [];
    expect(apiImports).toContain(AgentOsInteractionHttpModule);
    expect(apiImports).not.toContain(AgentOsHttpModule);
    expect(classes(AgentOsInteractionHttpModule)).toContain(AgentOsHttpModule);
    expect(apiImports).toContain(OperationsHttpModule);
  });

  it('keeps worker execution and API transport separate', () => {
    expect(classes(AgentWorkerApplicationModule)).toContain(AgentOsWorkerModule);
    expect(classes(AgentWorkerApplicationModule)).toContain(OperationsWorkerModule);
    expect(classes(AgentWorkerApplicationModule)).not.toContain(AgentOsHttpModule);
    expect(existsSync(join(serverSource, 'agent-mcp-application.module.ts'))).toBe(false);
  });

  it('binds process entrypoints to API and worker roots', () => {
    expect(readFileSync(join(serverSource, 'main.ts'), 'utf8')).toContain("from './api-application.module'");
    expect(readFileSync(join(serverSource, 'worker.ts'), 'utf8')).toContain("from './agent-worker-application.module'");
    expect(existsSync(join(serverSource, 'agent-os/adapter/in/cli/run-openai-operator.ts'))).toBe(false);
  });

  it('rejects retired root imports and lifecycle identifiers in production source', () => {
    expect(inspectStaticApplicationRootPolicy(serverSource)).toEqual([]);
  });

  it('rejects application composition that reaches the direct runtime HTTP adapter', () => {
    const fixtureRoot = mkdtempSync(join(tmpdir(), 'kiditem-agent-root-policy-'));
    const applicationRoot = join(fixtureRoot, 'agent-runtime-application.module.ts');
    const runtimeHttp = join(fixtureRoot, 'agent-os', 'agent-os-runtime-http.module.ts');
    mkdirSync(join(fixtureRoot, 'agent-os'), { recursive: true });
    writeFileSync(
      applicationRoot,
      "import './agent-os/agent-os-runtime-http.module';\nexport const runtime = true;\n",
    );
    writeFileSync(runtimeHttp, 'export const directHttp = true;\n');

    try {
      expect(inspectStaticApplicationRootPolicy(fixtureRoot)).toEqual([
        'agent-runtime-application.module.ts reaches direct Agent OS runtime HTTP through agent-runtime-application.module.ts -> agent-os/agent-os-runtime-http.module.ts',
      ]);
    } finally {
      rmSync(fixtureRoot, { recursive: true, force: true });
    }
  });
});
