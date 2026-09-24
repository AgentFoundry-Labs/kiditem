import path from 'node:path';
import { describe, it, expect } from 'vitest';
import { importFromPattern, scanSource } from '../../test-helpers/architecture-rg';

// Architecture guard tests freeze the Advertising port/adapter contract:
//
//   - PrismaService is imported only under
//     `advertising/adapter/out/repository/**`.
//   - The retired `services/` compatibility lane stays empty.
//   - Shared persistence helpers stay inside outgoing repository adapters.
//   - `application/**` does not import `@prisma/client` or expose Prisma
//     types. Ports/services stay Prisma-free; Prisma belongs in outgoing
//     repository adapters.
//   - `application/service/**` does not import `adapter/out/**`. Concrete
//     adapters reach application code only via Nest token bindings to ports.
//   - `application/service/**` does not import other owner-domain services
//     directly (e.g., `automation/application/service/operation-alert.service`).
//     Cross-domain reach goes through a local
//     `application/port/out/cross-domain/**` port plus the concrete
//     `adapter/out/{domain}/**` bridge.
//   - Domain code (`advertising/domain/**`) does not depend on NestJS,
//     Prisma, PrismaService, HTTP DTO classes, or any incoming-adapter
//     module.
//   - Advertising intentionally omits `application/port/in/**` because no
//     other owner domain consumes advertising use cases today. Controllers
//     therefore inject application services directly, which is allowed only
//     while no `application/port/in/**` exists.

const ADVERTISING_ROOT = path.resolve(__dirname, '..');
const OTHER_OWNERS =
  'automation|ai|channels|finance|inventory|orders|products|sourcing|rules|agent-os|analytics';

function at(...segments: string[]): string {
  return path.join(ADVERTISING_ROOT, ...segments);
}

/** Files under `roots` whose import/export lines name a module matching `specifier`. */
function importers(roots: string[], specifier: string): string[] {
  return [...scanSource({ roots, pattern: importFromPattern(specifier), relativeTo: ADVERTISING_ROOT }).hits];
}

/** Every production file of the owner, relative to its root. */
function ownerFiles(): string[] {
  return [...scanSource({ roots: [ADVERTISING_ROOT], relativeTo: ADVERTISING_ROOT }).hits];
}

describe('Advertising architecture contract', () => {
  it('PrismaService is imported only under advertising/adapter/out/repository/**', () => {
    const violators = importers([ADVERTISING_ROOT], String.raw`[^'"]*prisma/prisma\.service`)
      .filter((file) => !file.startsWith('adapter/out/repository/'));
    expect(
      violators,
      `PrismaService is leaking outside adapter/out/repository:\n${violators.join('\n')}`,
    ).toEqual([]);
  });

  it('shared persistence helpers stay under outgoing repository adapters', () => {
    const violators = ownerFiles().filter(
      (file) => file.endsWith('persistence.ts') && !file.startsWith('adapter/out/repository/'),
    );
    expect(
      violators,
      `Persistence helpers must stay under outgoing repository adapters:\n${violators.join('\n')}`,
    ).toEqual([]);
  });

  it('application layer does not import Prisma client or expose Prisma types', () => {
    const hits = importers([at('application')], '@prisma/client');
    expect(
      hits,
      `application ports/services must stay Prisma-free; Prisma belongs in outgoing adapters:\n${hits.join('\n')}`,
    ).toEqual([]);
  });

  it('application/service/** does not import adapter/out/**', () => {
    const hits = importers([at('application/service')], String.raw`[^'"]*adapter/out/`);
    expect(
      hits,
      `application services must depend on application/port/out/*, not concrete adapter/out/** files:\n${hits.join('\n')}`,
    ).toEqual([]);
  });

  it('application/service/** does not import other owner-domain services directly', () => {
    // Cross-owner reach goes through a local application/port/out/cross-domain/**
    // port plus an adapter bridge, or the other owner's published
    // application/port/in/** interface (apps/server/CLAUDE.md, Module Boundaries).
    const hits = scanSource({
      roots: [at('application/service')],
      pattern: importFromPattern(String.raw`(?:\.\./)+(?:${OTHER_OWNERS})/application/`),
      mode: 'lines',
      relativeTo: ADVERTISING_ROOT,
    }).hits.filter((line) => !/\/application\/port\/in\//.test(line));
    expect(
      hits,
      `application services must reach other owner domains through ports:\n${hits.join('\n')}`,
    ).toEqual([]);
  });

  it('domain layer is free of Nest/Prisma/HTTP coupling', () => {
    const hits = importers(
      [at('domain')],
      String.raw`@nestjs|@prisma/client|[^'"]*prisma\.service|[^'"]*adapter/in/http|[^'"]*\.dto['"]`,
    );
    expect(hits, `domain code is importing infrastructure:\n${hits.join('\n')}`).toEqual([]);
  });

  it('no top-level dto/, util/, or adapter/out/prisma/ folders remain', () => {
    // Final hex layout uses adapter/in/http/dto/ for HTTP DTOs, domain/util/
    // for pure helpers, and adapter/out/repository/ for Prisma adapters.
    // These legacy folders must not be reintroduced.
    const violators = ownerFiles().filter((file) =>
      ['dto/', 'util/', 'adapter/out/prisma/'].some((prefix) => file.startsWith(prefix)),
    );
    expect(
      violators,
      `Legacy folders detected — move to hex layout (adapter/in/http/dto/, domain/util/, adapter/out/repository/):\n${violators.join('\n')}`,
    ).toEqual([]);
  });

  it('no services/ compatibility folder remains', () => {
    const hits = ownerFiles().filter((file) => file.startsWith('services/'));
    expect(
      hits,
      `services/ is retired; business logic belongs in application/service/:\n${hits.join('\n')}`,
    ).toEqual([]);
  });
});
