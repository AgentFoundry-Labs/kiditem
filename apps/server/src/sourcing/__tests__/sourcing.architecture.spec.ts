import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, it, expect } from 'vitest';
import { importFromPattern, scanSource } from '../../test-helpers/architecture-rg';

// Architecture guard tests freeze the sourcing port/adapter contract:
//
//   - PrismaService is imported only under `sourcing/adapter/out/repository/**`.
//   - `application/**` does not import Prisma client/types. Ports and services
//     expose local structural records only.
//   - `application/service/**` does not import concrete adapters/DTOs or other
//     owner-domain services directly. Cross-owner reach goes through local
//     `application/port/out/cross-domain/**` ports + concrete adapters.
//   - Incoming HTTP adapters call application services, not outgoing ports or
//     repository adapters directly.
//   - No legacy top-level `dto/`, `services/`, or `adapter/out/prisma/`
//     folders remain.

const SOURCING_ROOT = path.resolve(__dirname, '..');
const OTHER_OWNERS =
  'automation|ai|channels|finance|inventory|orders|products|rules|agent-os|analytics|advertising';

/**
 * Known violations in files PR #557 also edits. Each entry names its removal
 * issue; an entry whose violation is gone fails as stale.
 */
const KNOWN_VIOLATIONS: Record<string, string> = {
  // removeWith: KID-328 — takes the channels transaction type from channels application/port/out.
  'application/service/sourcing-workspace-archive.service.ts': 'KID-328',
  // removeWith: KID-328 — takes launch-candidate status constants from application/port/out.
  'adapter/in/http/dto/sourcing-intelligence.dto.ts': 'KID-328',
};

function at(...segments: string[]): string {
  return path.join(SOURCING_ROOT, ...segments);
}

function importers(roots: string[], specifier: string): string[] {
  return [...scanSource({ roots, pattern: importFromPattern(specifier), relativeTo: SOURCING_ROOT }).hits];
}

function ownerFiles(): string[] {
  return [...scanSource({ roots: [SOURCING_ROOT], relativeTo: SOURCING_ROOT }).hits];
}

/** Splits hits into new violations and the known entries this rule still sees. */
function unexpected(hits: readonly string[]): string[] {
  return hits.filter((file) => !(file.split(':')[0]! in KNOWN_VIOLATIONS));
}

describe('sourcing architecture contract', () => {
  it('composes one source attempt authority without the retired collection coordinator', () => {
    const source = readFileSync(path.join(SOURCING_ROOT, 'sourcing.module.ts'), 'utf8');
    expect(source).not.toMatch(/SourcingCollectionCoordinator|SourcingCollectionRepositoryAdapter|SOURCING_COLLECTION_REPOSITORY_PORT/);
    expect(existsSync(path.join(SOURCING_ROOT, 'sourcing-operation-worker.module.ts'))).toBe(false);
  });

  it('PrismaService is imported only under sourcing/adapter/out/repository/**', () => {
    const violators = importers([SOURCING_ROOT], String.raw`[^'"]*prisma/prisma\.service`)
      .filter((file) => !file.startsWith('adapter/out/repository/'));
    expect(
      violators,
      `PrismaService is leaking outside adapter/out/repository:\n${violators.join('\n')}`,
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

  it('application/service/** does not import HTTP adapter DTOs', () => {
    const hits = importers([at('application/service')], String.raw`[^'"]*adapter/in/`);
    expect(
      hits,
      `application services must expose application command/input types, not HTTP DTOs:\n${hits.join('\n')}`,
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
      relativeTo: SOURCING_ROOT,
    }).hits.filter((line) => !/\/application\/port\/in\//.test(line));
    const violators = unexpected(hits);
    expect(
      violators,
      `application services must reach other owner domains through ports, not services:\n${violators.join('\n')}`,
    ).toEqual([]);
    expect(existsSync(path.join(
      SOURCING_ROOT,
      'application/service/sourcing-assistant.service.ts',
    ))).toBe(false);
  });

  it('incoming HTTP adapters do not import outgoing ports or repository adapters', () => {
    const hits = importers([at('adapter/in/http')], String.raw`[^'"]*(?:application/port/out|adapter/out)/`);
    const violators = unexpected(hits);
    expect(
      violators,
      `incoming adapters must call application services, not outgoing ports/adapters:\n${violators.join('\n')}`,
    ).toEqual([]);
  });

  it('keeps each known violation entry live until its removal issue lands', () => {
    const stillViolating = new Set([
      ...scanSource({
        roots: [at('application/service')],
        pattern: importFromPattern(String.raw`(?:\.\./)+(?:${OTHER_OWNERS})/application/port/out/`),
        relativeTo: SOURCING_ROOT,
      }).hits,
      ...importers([at('adapter/in/http')], String.raw`[^'"]*(?:application/port/out|adapter/out)/`),
    ]);
    const stale = Object.keys(KNOWN_VIOLATIONS).filter((file) => !stillViolating.has(file));
    expect(stale, `remove fixed entries from KNOWN_VIOLATIONS:\n${stale.join('\n')}`).toEqual([]);
  });

  it('no legacy top-level dto/, services/, or adapter/out/prisma/ folders remain', () => {
    const violators = ownerFiles().filter((file) =>
      ['dto/', 'services/', 'adapter/out/prisma/'].some((prefix) => file.startsWith(prefix)),
    );
    expect(
      violators,
      `Legacy folders detected — use adapter/in/http/dto/, application/service/, and adapter/out/repository/:\n${violators.join('\n')}`,
    ).toEqual([]);
  });

  it('loads browser fallback extractors from the unified KidItem OS extension', () => {
    const runtimeSource = readFileSync(
      path.join(SOURCING_ROOT, 'adapter/out/runtime/sourcing-playwright-runtime.handler.ts'),
      'utf8',
    );

    expect(runtimeSource).toContain(
      'extensions/kiditem-os/content/sourcing/extractors',
    );
    expect(runtimeSource).not.toContain(
      'extensions/product-scraper/extractors',
    );
  });

  it('keeps local CLI subprocess execution out of the Sourcing owner domain', () => {
    const hits = importers([SOURCING_ROOT], String.raw`(?:node:)?child_process['"]`);
    expect(
      hits,
      `Sourcing must use Agent OS for local CLI execution:\n${hits.join('\n')}`,
    ).toEqual([]);
  });
});
