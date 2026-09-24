import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, it, expect } from 'vitest';
import { importFromPattern, ownerSource, scanSource } from '../../test-helpers/architecture-rg';

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
const { at, importers, ownerFiles } = ownerSource(SOURCING_ROOT);
const OTHER_OWNERS =
  'automation|ai|channels|finance|inventory|orders|products|rules|agent-os|analytics|advertising';

/**
 * Known violations in files PR #557 also edits, keyed by file and the exact
 * module specifier it imports. Only that import line is exempt; another
 * violating import in the same file still fails, and an entry whose import is
 * gone fails as stale.
 */
const KNOWN_VIOLATIONS: readonly { file: string; specifier: string; removeWith: string }[] = [
  // Takes the channels transaction type from channels application/port/out.
  {
    file: 'application/service/sourcing-workspace-archive.service.ts',
    specifier: '../../../channels/application/port/out/transaction/repository-transaction',
    removeWith: 'KID-328',
  },
  // Takes launch-candidate status constants from application/port/out.
  {
    file: 'adapter/in/http/dto/sourcing-intelligence.dto.ts',
    specifier: '../../../../application/port/out/repository/sourcing-launch-candidate.repository.port',
    removeWith: 'KID-328',
  },
];

/** `file:line:text` hits → the file and the module specifier the line imports. */
function importOf(hit: string): { file: string; specifier: string | null } {
  const [file = '', , ...text] = hit.split(':');
  return { file, specifier: /['"]([^'"]+)['"]/.exec(text.join(':'))?.[1] ?? null };
}

function isKnown(hit: string): boolean {
  const { file, specifier } = importOf(hit);
  return KNOWN_VIOLATIONS.some((entry) => entry.file === file && entry.specifier === specifier);
}

/** Application-service import lines that reach another owner's application layer outside port/in. */
function crossOwnerImportLines(): string[] {
  return scanSource({
    roots: [at('application/service')],
    pattern: importFromPattern(String.raw`(?:\.\./)+(?:${OTHER_OWNERS})/application/`),
    mode: 'lines',
    relativeTo: SOURCING_ROOT,
  }).hits.filter((line) => !/\/application\/port\/in\//.test(line));
}

/** Incoming HTTP adapter import lines that reach an outgoing port or adapter. */
function httpOutgoingImportLines(): string[] {
  return [...scanSource({
    roots: [at('adapter/in/http')],
    pattern: importFromPattern(String.raw`[^'"]*(?:application/port/out|adapter/out)/`),
    mode: 'lines',
    relativeTo: SOURCING_ROOT,
  }).hits];
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
    const violators = crossOwnerImportLines().filter((line) => !isKnown(line));
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
    const violators = httpOutgoingImportLines().filter((line) => !isKnown(line));
    expect(
      violators,
      `incoming adapters must call application services, not outgoing ports/adapters:\n${violators.join('\n')}`,
    ).toEqual([]);
  });

  it('keeps each known violation entry live until its removal issue lands', () => {
    const live = [...crossOwnerImportLines(), ...httpOutgoingImportLines()].map(importOf);
    const stale = KNOWN_VIOLATIONS.filter(
      (entry) => !live.some(({ file, specifier }) => file === entry.file && specifier === entry.specifier),
    ).map((entry) => `${entry.file} -> ${entry.specifier} (${entry.removeWith})`);
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
