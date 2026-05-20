import { describe, it, expect } from 'vitest';
import { execSync } from 'node:child_process';
import path from 'node:path';

// Architecture guard tests freeze the automation port/adapter contract:
//
//   - PrismaService is imported only under
//     `automation/adapter/out/repository/**`, with one documented carve-out:
//     `application/service/workflow-runner.service.ts` still injects
//     PrismaService because the workflow executor framework
//     (`adapter/out/workflow-runner/executors/*`) takes a PrismaService
//     argument by design. A follow-up PR will redesign the executor
//     framework so the runner can depend on a port like every other
//     service.
//   - No `*persistence.ts` files survive (migration-waypoint naming).
//   - `application/**` is Prisma-free (no `@prisma/client` or `Prisma.*`
//     types) outside the WorkflowRunnerService carve-out.
//   - `application/port/**` contracts are ORM-type-free; public ports expose
//     local structural records and adapters translate ORM rows.
//   - `application/service/**` does not import `adapter/out/**`. Concrete
//     adapters reach application code only via Nest token bindings to
//     `application/port/out/*`. WorkflowRunnerService is the documented
//     carve-out — it imports the executor registry under
//     `adapter/out/workflow-runner/` while that framework still requires
//     direct PrismaService access.
//   - Incoming HTTP adapters do not import outgoing ports or repository
//     adapters directly; application services own orchestration.
//   - `application/service/**` does not import other owner-domain services
//     directly; cross-owner reach must go through an
//     `application/port/out/cross-domain/**` port + adapter bridge.
//   - `domain/**` is free of NestJS, Prisma, PrismaService, HTTP DTO
//     classes, and incoming-adapter modules, and does not depend on
//     application contracts.
//   - Outgoing port contracts keep local DTO shapes and do not import
//     concrete helpers or adapter implementations.
//   - No legacy `dto/`, `util/`, or `adapter/out/prisma/` folders remain.
//     Final shape uses `adapter/in/http/dto/`, `domain/util/`,
//     and `adapter/out/repository/`.
//   - No `services/` folder under the automation root — application code
//     lives in `application/service/` only.

const REPO_ROOT = path.resolve(__dirname, '../../../../..');
const AUTOMATION_ROOT = path.resolve(__dirname, '..');

// Documented PrismaService carve-outs. The single-file exception is for
// `application/service/workflow-runner.service.ts` because the workflow
// executor framework takes prisma as an argument by design. The directory
// allowlist covers two outgoing adapter lanes whose persistence concerns
// pre-date the repository lane: panel-event projection (its own SSE +
// mapper feed) and the executor framework itself.
const ALLOWED_PRISMA_FILES = new Set<string>([
  path.join(
    'apps/server/src/automation/application/service',
    'workflow-runner.service.ts',
  ),
]);

const ALLOWED_PRISMA_PREFIXES = [
  'apps/server/src/automation/adapter/out/repository/',
  'apps/server/src/automation/adapter/out/panel-event/',
  'apps/server/src/automation/adapter/out/workflow-runner/',
  // Panel mapper is invoked by both `WorkflowOrchestrationService` and
  // `WorkflowRunnerService` to project a workflow run into the SSE feed.
  // It is a panel-event adapter helper; ownership lives in mapper/ to
  // share the projection contract without duplicating logic.
  'apps/server/src/automation/mapper/panel-event/',
];

function rg(args: string): string[] {
  try {
    const out = execSync(`rg ${args}`, { cwd: REPO_ROOT, encoding: 'utf8' });
    return out
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean);
  } catch (err: unknown) {
    if ((err as { status?: number }).status === 1) return [];
    throw err;
  }
}

function automationRel(): string {
  return path.relative(REPO_ROOT, AUTOMATION_ROOT);
}

describe('automation architecture contract', () => {
  it('PrismaService is imported only in adapter/out/repository + documented carve-outs', () => {
    const auto = automationRel();
    // Match actual imports + type annotations, not comment mentions, by
    // requiring the identifier to follow `import` or `:` syntax.
    const hits = rg(
      `--type ts --files-with-matches 'import[^;]*PrismaService|:\\s*PrismaService' ${auto} --glob '!**/__tests__/**'`,
    );
    const violators = hits.filter((file) => {
      if (ALLOWED_PRISMA_FILES.has(file)) return false;
      return !ALLOWED_PRISMA_PREFIXES.some((prefix) => file.startsWith(prefix));
    });
    expect(
      violators,
      `PrismaService is leaking outside adapter/out/repository:\n${violators.join('\n')}`,
    ).toEqual([]);
  });

  it('no *persistence.ts files survive under apps/server/src/automation', () => {
    const auto = automationRel();
    const hits = rg(
      `--type ts --files --glob '${path.join(auto, '**', '*persistence.ts')}'`,
    );
    expect(
      hits,
      `\`*persistence.ts\` is migration-waypoint naming only — switch to repository adapters:\n${hits.join('\n')}`,
    ).toEqual([]);
  });

  it('application layer does not import Prisma client (except WorkflowRunnerService carve-out)', () => {
    const auto = automationRel();
    const applicationDir = path.join(auto, 'application');
    const hits = rg(
      `--type ts --files-with-matches '@prisma/client|Prisma\\.' ${applicationDir} --glob '!**/__tests__/**'`,
    );
    const violators = hits.filter((file) => !ALLOWED_PRISMA_FILES.has(file));
    expect(
      violators,
      `application ports/services must stay Prisma-free; Prisma belongs in outgoing adapters:\n${violators.join('\n')}`,
    ).toEqual([]);
  });

  it('application port contracts do not expose Prisma client types', () => {
    const auto = automationRel();
    const portDir = path.join(auto, 'application/port');
    const hits = rg(
      `--type ts --files-with-matches '@prisma/client|Prisma\\.' ${portDir} --glob '!**/__tests__/**'`,
    );
    expect(
      hits,
      `application ports must expose local structural records, not Prisma model/input types:\n${hits.join('\n')}`,
    ).toEqual([]);
  });

  it('application/service/** does not import adapter/out/** (except WorkflowRunnerService carve-out)', () => {
    const auto = automationRel();
    const serviceDir = path.join(auto, 'application/service');
    const hits = rg(
      `--type ts --files-with-matches '\\.\\./adapter/out|adapter/out/' ${serviceDir} --glob '!**/__tests__/**'`,
    );
    // Some services emit panel events through `adapter/out/panel-event/panel-events`
    // (the typed constant, not a Nest provider). That import is just the
    // event-name constant and is part of the publish surface; the panel
    // projection itself owns no Prisma. Keep it allowed alongside the
    // WorkflowRunnerService carve-out.
    const allowed = ALLOWED_PRISMA_FILES;
    const violators = hits.filter((file) => {
      if (allowed.has(file)) return false;
      // Read each violator to confirm what it imports. Allow `panel-events`
      // constant imports because they are event-name strings, not adapters.
      const lines = rg(
        `--type ts -n 'adapter/out/' ${file}`,
      );
      const onlyPanelEvents = lines.every((l) =>
        /panel-event\/panel-events'?$/.test(l) ||
        /panel-event\/panel-events';?$/.test(l),
      );
      return !onlyPanelEvents;
    });
    expect(
      violators,
      `application services must depend on application/port/out/*, not concrete adapter/out/** files:\n${violators.join('\n')}`,
    ).toEqual([]);
  });

  it('incoming HTTP adapters do not import outgoing ports or repository adapters', () => {
    const auto = automationRel();
    const httpDir = path.join(auto, 'adapter/in/http');
    const hits = rg(
      `--type ts --files-with-matches 'application/port/out|adapter/out/repository' ${httpDir} --glob '!**/__tests__/**'`,
    );
    expect(
      hits,
      `incoming adapters must call application services, not outgoing ports/adapters:\n${hits.join('\n')}`,
    ).toEqual([]);
  });

  it('application/service/** does not import other owner-domain services directly', () => {
    const auto = automationRel();
    const serviceDir = path.join(auto, 'application/service');
    const hits = rg(
      `--type ts --files-with-matches '\\.\\./\\.\\./\\.\\./(advertising|ai|channels|finance|inventory|orders|products|sourcing|rules|analytics)/application' ${serviceDir} --glob '!**/__tests__/**'`,
    );
    expect(
      hits,
      `application services must reach other owner domains through application/port/out/cross-domain/* ports:\n${hits.join('\n')}`,
    ).toEqual([]);
  });

  it('domain layer is free of Nest/Prisma/HTTP coupling', () => {
    const auto = automationRel();
    const domainDir = path.join(auto, 'domain');
    const hits = rg(
      `--type ts --files-with-matches '@nestjs|@prisma/client|PrismaService|adapter/in/http|\\.dto'\
       ${domainDir} --glob '!**/__tests__/**'`,
    );
    expect(hits, `domain code is importing infrastructure:\n${hits.join('\n')}`).toEqual([]);
  });

  it('domain layer does not depend on application contracts', () => {
    const auto = automationRel();
    const domainDir = path.join(auto, 'domain');
    const hits = rg(
      `--type ts --files-with-matches 'application/' ${domainDir} --glob '!**/__tests__/**'`,
    );
    expect(
      hits,
      `domain code must stay inward-facing and not import application contracts:\n${hits.join('\n')}`,
    ).toEqual([]);
  });

  it('outgoing port contracts do not import concrete helpers or adapters', () => {
    const auto = automationRel();
    const portDir = path.join(auto, 'application/port/out');
    const hits = rg(
      `--type ts --files-with-matches 'adapter/out|PrismaService' ${portDir} --glob '!**/__tests__/**'`,
    );
    expect(
      hits,
      `application ports should define local contracts, not depend on concrete implementations:\n${hits.join('\n')}`,
    ).toEqual([]);
  });

  it('no legacy top-level dto/, util/, or adapter/out/prisma/ folders remain', () => {
    const auto = automationRel();
    const dtoHits = rg(`--type ts --files --glob '${path.join(auto, 'dto', '**', '*.ts')}'`);
    const utilHits = rg(`--type ts --files --glob '${path.join(auto, 'util', '**', '*.ts')}'`);
    const prismaHits = rg(
      `--type ts --files --glob '${path.join(auto, 'adapter/out/prisma', '**', '*.ts')}'`,
    );
    const violators = [...dtoHits, ...utilHits, ...prismaHits];
    expect(
      violators,
      `Legacy folders detected — move to hex layout (adapter/in/http/dto/, domain/util/, adapter/out/repository/):\n${violators.join('\n')}`,
    ).toEqual([]);
  });

  it('no services/ folder under automation — application code lives in application/service/', () => {
    const auto = automationRel();
    const hits = rg(`--type ts --files --glob '${path.join(auto, 'services', '**', '*.ts')}'`);
    expect(
      hits,
      `automation has no legacy services/ facade; new logic belongs in application/service/:\n${hits.join('\n')}`,
    ).toEqual([]);
  });
});
