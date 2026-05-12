import { describe, it, expect } from 'vitest';
import { execSync } from 'node:child_process';
import path from 'node:path';

// Architecture guard tests freeze the Advertising port/adapter contract:
//
//   - PrismaService is imported only under
//     `advertising/adapter/out/repository/**`. The legacy
//     `services/channel-scrape-persistence.service.ts` is a transitional
//     facade and now delegates to repository adapters, so it must NOT import
//     PrismaService directly.
//   - `*persistence.ts` is not used as final naming under
//     `apps/server/src/advertising`. Migration-waypoint naming must be
//     replaced with `*.repository.adapter.ts`.
//   - `application/**` does not import `@prisma/client` or expose Prisma
//     types. Ports/services stay Prisma-free; Prisma belongs in outgoing
//     repository adapters.
//   - `application/service/**` does not import `adapter/out/**`. Concrete
//     adapters reach application code only via Nest token bindings to ports.
//   - `application/service/**` does not import other owner-domain services
//     directly (e.g., `automation/application/service/operation-alert.service`).
//     Cross-domain reach goes through a port + adapter under
//     `adapter/out/{owner}/**`.
//   - Domain code (`advertising/domain/**`) does not depend on NestJS,
//     Prisma, PrismaService, HTTP DTO classes, or any incoming-adapter
//     module.
//   - Advertising intentionally omits `application/port/in/**` because no
//     other owner domain consumes advertising use cases today. Controllers
//     therefore inject application services directly, which is allowed only
//     while no `application/port/in/**` exists.

const REPO_ROOT = path.resolve(__dirname, '../../../../..');
const ADVERTISING_ROOT = path.resolve(__dirname, '..');

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

function advertisingRel(): string {
  return path.relative(REPO_ROOT, ADVERTISING_ROOT);
}

describe('Advertising architecture contract', () => {
  it('PrismaService is imported only under advertising/adapter/out/repository/**', () => {
    const adv = advertisingRel();
    const allowedPrefix = path.join(adv, 'adapter/out/repository') + path.sep;
    const hits = rg(
      `--type ts --files-with-matches 'PrismaService' ${adv} --glob '!**/__tests__/**'`,
    );
    const violators = hits.filter((file) => !file.startsWith(allowedPrefix));
    expect(
      violators,
      `PrismaService is leaking outside adapter/out/repository:\n${violators.join('\n')}`,
    ).toEqual([]);
  });

  it('no *persistence.ts files survive under apps/server/src/advertising', () => {
    const adv = advertisingRel();
    const hits = rg(
      `--type ts --files --glob '${path.join(adv, '**', '*persistence.ts')}'`,
    );
    expect(
      hits,
      `\`*persistence.ts\` is migration-waypoint naming only — switch to repository adapters:\n${hits.join('\n')}`,
    ).toEqual([]);
  });

  it('application layer does not import Prisma client or expose Prisma types', () => {
    const adv = advertisingRel();
    const applicationGlob = path.join(adv, 'application') + '/**';
    const hits = rg(
      `--type ts --files-with-matches '@prisma/client|Prisma\\.' --glob '${applicationGlob}' --glob '!**/__tests__/**'`,
    );
    expect(
      hits,
      `application ports/services must stay Prisma-free; Prisma belongs in outgoing adapters:\n${hits.join('\n')}`,
    ).toEqual([]);
  });

  it('application/service/** does not import adapter/out/**', () => {
    const adv = advertisingRel();
    const serviceGlob = path.join(adv, 'application/service') + '/**';
    const hits = rg(
      `--type ts --files-with-matches '\\.\\./adapter/out|adapter/out/' --glob '${serviceGlob}' --glob '!**/__tests__/**'`,
    );
    expect(
      hits,
      `application services must depend on application/port/out/*, not concrete adapter/out/** files:\n${hits.join('\n')}`,
    ).toEqual([]);
  });

  it('application/service/** does not import other owner-domain services directly', () => {
    const adv = advertisingRel();
    const serviceGlob = path.join(adv, 'application/service') + '/**';
    // Cross-owner-domain reach must go through an `adapter/out/{owner}/` port
    // + adapter pair. The grep targets relative paths that climb out of
    // advertising and into another owner domain's application or adapter
    // layer.
    const hits = rg(
      `--type ts --files-with-matches '\\.\\./\\.\\./\\.\\./(automation|ai|channels|finance|inventory|orders|products|sourcing|rules|agent-os|analytics)/application' --glob '${serviceGlob}' --glob '!**/__tests__/**'`,
    );
    expect(
      hits,
      `application services must reach other owner domains through adapter/out/{owner}/* ports:\n${hits.join('\n')}`,
    ).toEqual([]);
  });

  it('domain layer is free of Nest/Prisma/HTTP coupling', () => {
    const adv = advertisingRel();
    const domainGlob = path.join(adv, 'domain') + '/**';
    const hits = rg(
      `--type ts --files-with-matches '@nestjs|@prisma/client|PrismaService|adapter/in/http|\\.dto'\
       --glob '${domainGlob}' --glob '!**/__tests__/**'`,
    );
    expect(hits, `domain code is importing infrastructure:\n${hits.join('\n')}`).toEqual([]);
  });

  it('no top-level dto/, util/, or adapter/out/prisma/ folders remain', () => {
    const adv = advertisingRel();
    // Final hex layout uses adapter/in/http/dto/ for HTTP DTOs, domain/util/
    // for pure helpers, and adapter/out/repository/ for Prisma adapters.
    // These legacy folders must not be reintroduced.
    const dtoHits = rg(`--type ts --files --glob '${path.join(adv, 'dto', '**', '*.ts')}'`);
    const utilHits = rg(`--type ts --files --glob '${path.join(adv, 'util', '**', '*.ts')}'`);
    const prismaHits = rg(
      `--type ts --files --glob '${path.join(adv, 'adapter/out/prisma', '**', '*.ts')}'`,
    );
    const violators = [...dtoHits, ...utilHits, ...prismaHits];
    expect(
      violators,
      `Legacy folders detected — move to hex layout (adapter/in/http/dto/, domain/util/, adapter/out/repository/):\n${violators.join('\n')}`,
    ).toEqual([]);
  });

  it('services/ folder only contains the grandfathered channel-scrape-persistence facade', () => {
    const adv = advertisingRel();
    const hits = rg(`--type ts --files --glob '${path.join(adv, 'services', '**', '*.ts')}'`);
    // ALLOWED_LEGACY_FILES — anything new in services/ is forbidden by the
    // backend AGENTS.md. The facade survives only because integration tests
    // inject it by class name.
    const ALLOWED_LEGACY_FILES = new Set<string>([
      path.join(adv, 'services/channel-scrape-persistence.service.ts'),
    ]);
    const violators = hits.filter((file) => !ALLOWED_LEGACY_FILES.has(file));
    expect(
      violators,
      `services/ accepts only legacy compatibility facades; new business logic belongs in application/service/:\n${violators.join('\n')}`,
    ).toEqual([]);
  });
});
