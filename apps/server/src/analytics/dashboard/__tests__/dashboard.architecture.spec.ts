import { describe, it, expect } from 'vitest';
import { execSync } from 'node:child_process';
import path from 'node:path';

// Architecture guard tests freeze the analytics/dashboard port/adapter
// contract. Mirrors the advertising architecture spec:
//
//   - PrismaService is imported only under
//     `analytics/dashboard/adapter/out/repository/**`.
//   - No `*persistence.ts` files survive. Migration-waypoint naming is
//     replaced with `*.repository.adapter.ts`.
//   - `application/**` is Prisma-free (no `@prisma/client` or `Prisma.*`).
//   - `application/service/**` does not import `adapter/out/**`. Concrete
//     adapters reach application code only via Nest token bindings to
//     `application/port/out/*`.
//   - `application/service/**` does not import other owner-domain services
//     directly. Dashboard is analytics-owned and currently has no
//     cross-owner reach; if one appears later it must go through a port
//     under `adapter/out/{owner}/`.
//   - Domain code (`analytics/dashboard/domain/**`) is free of NestJS,
//     Prisma, PrismaService, HTTP DTO classes, and incoming-adapter
//     modules.
//   - No legacy top-level `dto/`, `util/`, `helpers/`, or
//     `adapter/out/prisma/` folders remain. Final shape uses
//     `adapter/in/http/dto/`, `domain/util/`, and `adapter/out/repository/`.
//   - No `services/` folder at the dashboard root — application code lives
//     under `application/service/` only.
//
// Dashboard intentionally omits `application/port/in/**` because no other
// owner domain consumes dashboard use cases today. The controller injects
// application services directly while that remains true.

const REPO_ROOT = path.resolve(__dirname, '../../../../..');
const DASHBOARD_ROOT = path.resolve(__dirname, '..');

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

function dashboardRel(): string {
  return path.relative(REPO_ROOT, DASHBOARD_ROOT);
}

describe('analytics/dashboard architecture contract', () => {
  it('PrismaService is imported only under dashboard/adapter/out/repository/**', () => {
    const dash = dashboardRel();
    const allowedPrefix = path.join(dash, 'adapter/out/repository') + path.sep;
    const hits = rg(
      `--type ts --files-with-matches 'PrismaService' ${dash} --glob '!**/__tests__/**'`,
    );
    const violators = hits.filter((file) => !file.startsWith(allowedPrefix));
    expect(
      violators,
      `PrismaService is leaking outside adapter/out/repository:\n${violators.join('\n')}`,
    ).toEqual([]);
  });

  it('no *persistence.ts files survive under apps/server/src/analytics/dashboard', () => {
    const dash = dashboardRel();
    const hits = rg(
      `--type ts --files --glob '${path.join(dash, '**', '*persistence.ts')}'`,
    );
    expect(
      hits,
      `\`*persistence.ts\` is migration-waypoint naming only — switch to repository adapters:\n${hits.join('\n')}`,
    ).toEqual([]);
  });

  it('application layer does not import Prisma client or expose Prisma types', () => {
    const dash = dashboardRel();
    const applicationGlob = path.join(dash, 'application') + '/**';
    const hits = rg(
      `--type ts --files-with-matches '@prisma/client|Prisma\\.' --glob '${applicationGlob}' --glob '!**/__tests__/**'`,
    );
    expect(
      hits,
      `application ports/services must stay Prisma-free; Prisma belongs in outgoing adapters:\n${hits.join('\n')}`,
    ).toEqual([]);
  });

  it('application/service/** does not import adapter/out/**', () => {
    const dash = dashboardRel();
    const serviceGlob = path.join(dash, 'application/service') + '/**';
    const hits = rg(
      `--type ts --files-with-matches '\\.\\./adapter/out|adapter/out/' --glob '${serviceGlob}' --glob '!**/__tests__/**'`,
    );
    expect(
      hits,
      `application services must depend on application/port/out/*, not concrete adapter/out/** files:\n${hits.join('\n')}`,
    ).toEqual([]);
  });

  it('application/service/** does not import other owner-domain services directly', () => {
    const dash = dashboardRel();
    const serviceGlob = path.join(dash, 'application/service') + '/**';
    // Cross-owner-domain reach must go through an `adapter/out/{owner}/` port
    // + adapter pair. The grep targets relative paths that climb out of
    // analytics and into another owner domain's application or adapter
    // layer.
    const hits = rg(
      `--type ts --files-with-matches '\\.\\./\\.\\./\\.\\./(automation|ai|channels|finance|inventory|orders|products|sourcing|rules|agent-os|advertising)/application' --glob '${serviceGlob}' --glob '!**/__tests__/**'`,
    );
    expect(
      hits,
      `application services must reach other owner domains through adapter/out/{owner}/* ports:\n${hits.join('\n')}`,
    ).toEqual([]);
  });

  it('domain layer is free of Nest/Prisma/HTTP coupling', () => {
    const dash = dashboardRel();
    const domainGlob = path.join(dash, 'domain') + '/**';
    const hits = rg(
      `--type ts --files-with-matches '@nestjs|@prisma/client|PrismaService|adapter/in/http|\\.dto'\
       --glob '${domainGlob}' --glob '!**/__tests__/**'`,
    );
    expect(hits, `domain code is importing infrastructure:\n${hits.join('\n')}`).toEqual([]);
  });

  it('no legacy top-level dto/, util/, helpers/, or adapter/out/prisma/ folders remain', () => {
    const dash = dashboardRel();
    const dtoHits = rg(`--type ts --files --glob '${path.join(dash, 'dto', '**', '*.ts')}'`);
    const utilHits = rg(`--type ts --files --glob '${path.join(dash, 'util', '**', '*.ts')}'`);
    const helpersHits = rg(
      `--type ts --files --glob '${path.join(dash, 'helpers', '**', '*.ts')}'`,
    );
    const prismaHits = rg(
      `--type ts --files --glob '${path.join(dash, 'adapter/out/prisma', '**', '*.ts')}'`,
    );
    const violators = [...dtoHits, ...utilHits, ...helpersHits, ...prismaHits];
    expect(
      violators,
      `Legacy folders detected — move to hex layout (adapter/in/http/dto/, domain/util/, adapter/out/repository/):\n${violators.join('\n')}`,
    ).toEqual([]);
  });

  it('no services/ folder under dashboard — application code lives in application/service/', () => {
    const dash = dashboardRel();
    const hits = rg(`--type ts --files --glob '${path.join(dash, 'services', '**', '*.ts')}'`);
    expect(
      hits,
      `dashboard has no legacy services/ facade; new logic belongs in application/service/:\n${hits.join('\n')}`,
    ).toEqual([]);
  });
});
