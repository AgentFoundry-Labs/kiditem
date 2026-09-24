import 'reflect-metadata';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { MODULE_METADATA } from '@nestjs/common/constants';
import { describe, expect, it } from 'vitest';
import { ApiApplicationModule } from '../api-application.module';
import { AgentOsInteractionHttpModule } from '../agent-os/agent-os-interaction-http.module';
import { AgentOsHttpModule } from '../agent-os/agent-os-http.module';
import { DetailPageEditorController } from '../content/adapter/in/http/detail-page-editor.controller';
import { ImageAiController } from '../content/adapter/in/http/image-ai.controller';
import { ThumbnailJobReviewController } from '../content/adapter/in/http/thumbnail-job-review.controller';
import { inspectStaticApplicationRootPolicy } from './application-root-policy';

type ModuleLike =
  | Function
  | { module: Function; imports?: ModuleLike[] }
  // 서로의 공개 계약만 부르는 두 owner 사이의 순환(Channels ↔ AI)은 forwardRef 로 푼다.
  | { forwardRef: () => ModuleLike };
const serverSource = join(__dirname, '..');

function moduleClass(module: ModuleLike): Function {
  if (typeof module === 'function') return module;
  if ('forwardRef' in module) return moduleClass(module.forwardRef());
  return module.module;
}
function graph(root: ModuleLike): Set<ModuleLike> {
  const seen = new Set<ModuleLike>();
  const visit = (current: ModuleLike | undefined): void => {
    if (!current) return;
    if (seen.has(current)) return;
    seen.add(current);
    const imports = Reflect.getMetadata(MODULE_METADATA.IMPORTS, moduleClass(current)) ?? [];
    const nested = typeof current === 'function' || 'forwardRef' in current ? [] : current.imports ?? [];
    for (const item of [...imports, ...nested]) visit(item as ModuleLike | undefined);
  };
  visit(root);
  return seen;
}
function classes(root: ModuleLike): Function[] { return [...graph(root)].map(moduleClass); }

describe('final application-root topology', () => {
  it('keeps direct owner cancellation without the retired OperationCancellation boundary', () => {
    const modules = classes(ApiApplicationModule);
    const controllers = modules.flatMap((module) =>
      Reflect.getMetadata(MODULE_METADATA.CONTROLLERS, module) ?? [],
    );
    expect(controllers).toEqual(expect.arrayContaining([
      DetailPageEditorController,
      ImageAiController,
      ThumbnailJobReviewController,
    ]));
    expect(modules.map((module) => module.name)).not.toContain('OperationCancellationModule');
    expect(existsSync(join(serverSource, 'operation-cancellation/operation-cancellation.module.ts'))).toBe(false);
  });

  it('has one API interaction boundary, with no duplicate direct Agent OS HTTP import', () => {
    const apiImports = Reflect.getMetadata(MODULE_METADATA.IMPORTS, ApiApplicationModule) ?? [];
    expect(apiImports).toContain(AgentOsInteractionHttpModule);
    expect(apiImports).not.toContain(AgentOsHttpModule);
    expect(classes(AgentOsInteractionHttpModule)).toContain(AgentOsHttpModule);
    expect(apiImports
      .filter((module): module is Function => typeof module === 'function')
      .map((module) => module.name))
      .not.toContain('OperationsHttpModule');
  });

  it('binds the process entrypoint to the API root', () => {
    expect(readFileSync(join(serverSource, 'main.ts'), 'utf8')).toContain("from './api-application.module'");
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
