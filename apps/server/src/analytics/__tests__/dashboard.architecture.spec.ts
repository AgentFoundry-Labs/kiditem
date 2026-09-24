import path from 'node:path';
import { describe, it, expect } from 'vitest';
import { importFromPattern, ownerSource, scanSource } from '../../test-helpers/architecture-rg';

// Architecture guard tests freeze the analytics dashboard port/adapter
// contract. Dashboard layers sit in analytics' own lanes, each under a
// `dashboard/` subfolder (`adapter/in/http/dashboard/`, `domain/dashboard/`, …);
// every rule is scoped to those subfolders and the two dashboard modules. Mirrors the advertising architecture spec:
//
//   - PrismaService is imported only under
//     `analytics/adapter/out/repository/dashboard/**`.
//   - No `*persistence.ts` files survive. Migration-waypoint naming is
//     replaced with `*.repository.adapter.ts`.
//   - `application/**` is Prisma-free (no `@prisma/client` or `Prisma.*`).
//   - `application/service/**` does not import `adapter/out/**`. Concrete
//     adapters reach application code only via Nest token bindings to
//     `application/port/out/*`.
//   - Incoming HTTP adapters do not import outgoing ports or repository
//     adapters directly; application services own orchestration.
//   - `application/service/**` does not import other owner-domain services
//     directly. Dashboard is analytics-owned and currently has no
//     cross-owner reach; if one appears later it must go through a port
//     under `application/port/out/cross-domain/**`.
//   - Domain code (`analytics/domain/dashboard/**`) is free of NestJS,
//     Prisma, PrismaService, HTTP DTO classes, and incoming-adapter
//     modules, and does not depend on application contracts.
//   - Outgoing port contracts keep local DTO shapes and do not import
//     concrete helpers or adapter implementations.
//   - No legacy top-level `dto/`, `util/`, `helpers/`, or
//     `adapter/out/prisma/` folders remain. Final shape uses
//     `adapter/in/http/dashboard/dto/`, `domain/dashboard/util/`, and
//     `adapter/out/repository/dashboard/`.
//   - No `services/` folder at the dashboard root — application code lives
//     under `application/service/dashboard/` only.
//
// Dashboard's only `application/port/in/dashboard/**` contract is the
// analytics overview capability; the controller injects application services
// directly.

const ANALYTICS_ROOT = path.resolve(__dirname, '..');
const { importers, ownerFiles } = ownerSource(ANALYTICS_ROOT);
/** The dashboard subfolder of an analytics lane. */
const at = (lane: string): string => path.join(ANALYTICS_ROOT, lane, 'dashboard');
const DASHBOARD_ROOTS = [
  ...[
    'adapter/in/http',
    'adapter/in/agent',
    'adapter/out/repository',
    'application/port/in',
    'application/port/out/repository',
    'application/service',
    'domain',
  ].map(at),
  path.join(ANALYTICS_ROOT, 'dashboard.module.ts'),
  path.join(ANALYTICS_ROOT, 'dashboard-capability.module.ts'),
];
const APPLICATION_ROOTS = ['application/port/in', 'application/port/out/repository', 'application/service'].map(at);
const dashboardFiles = (): string[] => [...scanSource({ roots: DASHBOARD_ROOTS, relativeTo: ANALYTICS_ROOT }).hits];
const OTHER_OWNERS =
  'automation|ai|channels|finance|inventory|orders|products|sourcing|rules|agent-os|advertising';

/** Files under `roots` whose source matches `pattern` anywhere (code-usage rules). */
function matching(roots: string[], pattern: string): string[] {
  return [...scanSource({ roots, pattern, relativeTo: ANALYTICS_ROOT }).hits];
}

describe('analytics/dashboard architecture contract', () => {
  it('PrismaService is imported only under adapter/out/repository/dashboard/**', () => {
    const violators = importers(DASHBOARD_ROOTS, String.raw`[^'"]*prisma/prisma\.service`)
      .filter((file) => !file.startsWith('adapter/out/repository/dashboard/'));
    expect(
      violators,
      `PrismaService is leaking outside adapter/out/repository:\n${violators.join('\n')}`,
    ).toEqual([]);
  });

  it('no *persistence.ts files survive under the dashboard subfolders', () => {
    const hits = dashboardFiles().filter((file) => file.endsWith('persistence.ts'));
    expect(
      hits,
      `\`*persistence.ts\` is migration-waypoint naming only — switch to repository adapters:\n${hits.join('\n')}`,
    ).toEqual([]);
  });

  it('application layer does not import Prisma client or expose Prisma types', () => {
    const hits = importers(APPLICATION_ROOTS, '@prisma/client');
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

  it('incoming HTTP adapters do not import outgoing ports or repository adapters', () => {
    const hits = importers([at('adapter/in/http')], String.raw`[^'"]*(?:application/port/out|adapter/out)/`);
    expect(
      hits,
      `incoming adapters must call application services, not outgoing ports/adapters:\n${hits.join('\n')}`,
    ).toEqual([]);
  });

  it('application/service/** does not import other owner-domain services directly', () => {
    // Another owner's published application/port/in/** interface is allowed
    // (apps/server/CLAUDE.md, Module Boundaries); anything else in its
    // application layer is not.
    const hits = scanSource({
      roots: [at('application/service')],
      pattern: importFromPattern(String.raw`(?:\.\./)+(?:${OTHER_OWNERS})/application/`),
      mode: 'lines',
      relativeTo: ANALYTICS_ROOT,
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

  it('domain layer does not depend on application contracts', () => {
    const hits = importers([at('domain')], String.raw`[^'"]*application/`);
    expect(
      hits,
      `domain code must stay inward-facing and not import application contracts:\n${hits.join('\n')}`,
    ).toEqual([]);
  });

  it('outgoing port contracts do not import concrete helpers or adapters', () => {
    const hits = importers(
      [at('application/port/out/repository')],
      String.raw`[^'"]*adapter/out|[^'"]*common/per-listing-profit|[^'"]*prisma\.service|@prisma/client`,
    );
    expect(
      hits,
      `application ports should define local contracts, not depend on concrete implementations:\n${hits.join('\n')}`,
    ).toEqual([]);
  });

  it('names Sellpia stock reads after the final MasterProduct owner', () => {
    const hits = matching(DASHBOARD_ROOTS, 'OutOfStockInventorySku');
    expect(
      hits,
      `dashboard stock reads must not retain the retired InventorySku owner name:\n${hits.join('\n')}`,
    ).toEqual([]);
  });

  it('no legacy top-level dto/, util/, helpers/, or adapter/out/prisma/ folders remain', () => {
    const violators = ownerFiles().filter((file) =>
      ['dto/', 'util/', 'helpers/', 'adapter/out/prisma/'].some((prefix) => file.startsWith(`dashboard/${prefix}`)),
    );
    expect(
      violators,
      `Legacy folders detected — move to hex layout (adapter/in/http/dto/, domain/util/, adapter/out/repository/):\n${violators.join('\n')}`,
    ).toEqual([]);
  });

  it('no services/ folder under dashboard — application code lives in application/service/', () => {
    const hits = ownerFiles().filter((file) => file.startsWith('dashboard/services/'));
    expect(
      hits,
      `dashboard has no legacy services/ facade; new logic belongs in application/service/:\n${hits.join('\n')}`,
    ).toEqual([]);
  });

  it('composes Orders and Inventory through their canonical readers', () => {
    const hits = matching(
      [at('adapter/out/repository')],
      String.raw`(prisma|tx)\.(order|sellpiaInventorySku)|FROM orders|JOIN order_line_items|FROM sellpia_inventory_skus`,
    );
    expect(
      hits,
      `dashboard adapters must compose canonical Orders and Inventory readers:\n${hits.join('\n')}`,
    ).toEqual([]);
  });

  it('does not retain the Wing dashboard KPI blob reader', () => {
    const hits = matching(
      DASHBOARD_ROOTS,
      'WING_AD_SUMMARY_REPOSITORY_PORT|WingAdSummaryRepositoryAdapter|rawAdSummary|adSummary|wingAdData|mappingStatusCounts|confirmedUntil',
    );
    expect(
      hits,
      `the dashboard KPI blob has no canonical fact and must be removed:\n${hits.join('\n')}`,
    ).toEqual([]);
  });

  it('reads collection completion through the Core provenance reader', () => {
    const hits = matching(
      DASHBOARD_ROOTS,
      String.raw`sourceImportRun[[:space:]]*\.|(FROM|JOIN|UPDATE|INTO)[[:space:]]+"?source_import_runs`,
    );
    expect(
      hits,
      `dashboard must not choose completed import provenance directly:\n${hits.join('\n')}`,
    ).toEqual([]);
  });
});
