import { existsSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { importFromPattern, ownerSource, scanSource } from '../../test-helpers/architecture-rg';

// Architecture guard tests freeze the Channels reconstruction contract:
//
//   - PrismaService is imported only under `channels/adapter/out/repository/**`.
//   - `application/**` does not import Prisma client/types. Ports and services
//     expose local structural records only.
//   - `application/service/**` does not import concrete adapters, HTTP DTOs, or
//     other owner-domain application services directly.
//   - Incoming HTTP adapters call application services, not outgoing ports or
//     repository adapters directly.
//   - Outgoing provider/automation adapters do not import application services.
//   - The legacy `adapters/coupang/` folder remains retired.
//   - Cross-owner channel-option capacity policy comes from its focused shared
//     contract, never Products internals.
//   - Channels owns the focused recipe mutation implementation while Product
//     identity validation comes through the public Products collection ports.

const SERVER_SRC = path.resolve(__dirname, '../..');
const CHANNELS_ROOT = path.resolve(__dirname, '..');
const { at, importers } = ownerSource(CHANNELS_ROOT);
const OTHER_OWNERS =
  'advertising|agent-os|alerts|analytics|content|finance|inventory|orders|products|sourcing|supply';

/**
 * Known violations, keyed by file and the exact module specifier it imports.
 * Only that import line is exempt; another violating import in the same file
 * still fails, and an entry whose import is gone fails as stale.
 */
const KNOWN_VIOLATIONS: readonly { file: string; specifier: string; removeWith: string }[] = [];

/** `file:line:text` hits → the file and the module specifier the line imports. */
function importOf(hit: string): { file: string; specifier: string | null } {
  const [file = '', , ...text] = hit.split(':');
  return { file, specifier: /['"]([^'"]+)['"]/.exec(text.join(':'))?.[1] ?? null };
}

function isKnown(hit: string): boolean {
  const { file, specifier } = importOf(hit);
  return KNOWN_VIOLATIONS.some((entry) => entry.file === file && entry.specifier === specifier);
}

function importLines(roots: string[], specifier: string): string[] {
  return [...scanSource({
    roots,
    pattern: importFromPattern(specifier),
    mode: 'lines',
    relativeTo: CHANNELS_ROOT,
  }).hits];
}

/** Application-service import lines that reach another owner's application layer outside port/in. */
function crossOwnerImportLines(): string[] {
  return importLines(
    [at('application/service')],
    String.raw`(?:\.\./)+(?:${OTHER_OWNERS})/application/`,
  ).filter((line) => !/\/application\/port\/in\//.test(line));
}

/** Incoming HTTP adapter import lines that reach an outgoing port or adapter. */
function httpOutgoingImportLines(): string[] {
  return importLines([at('adapter/in/web')], String.raw`[^'"]*(?:application/port/out|adapter/out)/`);
}

/** Outgoing adapter import lines that reach an application service. */
function adapterOutServiceImportLines(): string[] {
  return importLines([at('adapter/out')], String.raw`[^'"]*application/service/`);
}

describe('channels architecture contract', () => {
  it('PrismaService is imported only under channels/adapter/out/repository/**', () => {
    const allowedPrefixes = ['adapter/out/repository/', 'adapter/out/persistence/', 'adapter/in/agent/'];
    const violators = importers([CHANNELS_ROOT], String.raw`[^'"]*prisma/prisma\.service`)
      .filter((file) => file !== 'seed-channel-accounts.ts'
        && !allowedPrefixes.some((prefix) => file.startsWith(prefix)));
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
  });

  it('Channels and Products consume the public channel-option capacity contract', () => {
    const consumers = [...scanSource({
      roots: [path.join(SERVER_SRC, 'channels'), path.join(SERVER_SRC, 'products')],
      pattern: importFromPattern('@kiditem/shared/channel-option-capacity'),
      relativeTo: SERVER_SRC,
    }).hits];
    expect(consumers).toEqual([
      'channels/adapter/out/persistence/stockout-check.persistence.adapter.ts',
      'channels/application/service/listing/channel-inventory-availability.projection.ts',
      'products/mapper/product-operations-inventory.mapper.ts',
    ]);

    const internalImports = [...scanSource({
      roots: [SERVER_SRC],
      pattern: importFromPattern(String.raw`[^'"]*domain/channel-option-capacity`),
      relativeTo: SERVER_SRC,
    }).hits];
    expect(
      internalImports,
      `server domains must not import another owner's internal capacity policy:\n${internalImports.join('\n')}`,
    ).toEqual([]);
  });

  it('does not reach Inventory directly from Channels adapters', () => {
    const hits = importers(
      [CHANNELS_ROOT],
      String.raw`[^'"]*inventory/(?:application/port/in/stock/(?:sellpia-inventory-sku-read|inventory-transactional-read)|adapter/out/persistence/(?:read|transaction))`,
    );
    expect(hits).toEqual([]);
  });

  it('incoming HTTP adapters do not import outgoing ports or repository adapters', () => {
    const violators = httpOutgoingImportLines().filter((line) => !isKnown(line));
    expect(
      violators,
      `incoming adapters must call application services, not outgoing ports/adapters:\n${violators.join('\n')}`,
    ).toEqual([]);
  });

  it('outgoing adapters do not import application services', () => {
    const violators = adapterOutServiceImportLines().filter((line) => !isKnown(line));
    expect(
      violators,
      `outgoing adapters must depend on application/port/out contracts, not application services:\n${violators.join('\n')}`,
    ).toEqual([]);
  });

  it('keeps each known violation entry live until its removal issue lands', () => {
    const live = [
      ...crossOwnerImportLines(),
      ...httpOutgoingImportLines(),
      ...adapterOutServiceImportLines(),
    ].map(importOf);
    const stale = KNOWN_VIOLATIONS.filter(
      (entry) => !live.some(({ file, specifier }) => file === entry.file && specifier === entry.specifier),
    ).map((entry) => `${entry.file} -> ${entry.specifier} (${entry.removeWith})`);
    expect(stale, `remove fixed entries from KNOWN_VIOLATIONS:\n${stale.join('\n')}`).toEqual([]);
  });

  it('does not retain channel-owned component recipes or persisted mapping status', () => {
    const hits = [...scanSource({
      roots: [CHANNELS_ROOT],
      pattern: 'ChannelSkuComponent|channelSkuComponent',
      relativeTo: CHANNELS_ROOT,
    }).hits];
    expect(
      hits,
      `the completed cutover must not retain channel-owned recipe persistence:\n${hits.join('\n')}`,
    ).toEqual([]);
  });

  it('keeps component-row mutations inside the focused Channels recipe adapter', () => {
    const hits = [...scanSource({
      roots: [CHANNELS_ROOT],
      pattern: String.raw`channelListingOptionInventoryComponent\.(create|createMany|update|updateMany|delete|deleteMany|upsert)\b`,
      relativeTo: CHANNELS_ROOT,
    }).hits];
    expect(
      hits,
      `unexpected recipe persistence outside the focused Channels adapter:\n${hits.join('\n')}`,
    ).toEqual(['adapter/out/persistence/channel-option-recipe.repository.adapter.ts']);
  });

  it('does not retain the retired Open API adapter folder', () => {
    expect(existsSync(at('adapters/coupang'))).toBe(false);
  });
});
