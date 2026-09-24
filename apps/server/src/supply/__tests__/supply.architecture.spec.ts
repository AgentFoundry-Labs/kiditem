import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { importFromPattern, scanSource } from '../../test-helpers/architecture-rg';

const SUPPLY_ROOT = path.resolve(__dirname, '..');

function at(...segments: string[]): string {
  return path.join(SUPPLY_ROOT, ...segments);
}

/** Files under `roots` whose import/export lines name a module matching `specifier`. */
function importers(roots: string[], specifier: string): string[] {
  return [...scanSource({ roots, pattern: importFromPattern(specifier), relativeTo: SUPPLY_ROOT }).hits];
}

describe('supply architecture contract', () => {
  it('PrismaService is imported only under repository adapters and approved locked transactions', () => {
    const allowedTransactions = new Set([
      'adapter/out/transaction/purchase-order-submission.transaction.adapter.ts',
      'adapter/out/transaction/rocket-purchase-confirmation.transaction.adapter.ts',
    ]);
    const violators = importers([SUPPLY_ROOT], String.raw`[^'"]*prisma/prisma\.service`).filter(
      (file) => !file.startsWith('adapter/out/repository/') && !allowedTransactions.has(file),
    );
    expect(
      violators,
      `PrismaService is leaking outside repository adapters or the approved submission transaction:\n${violators.join('\n')}`,
    ).toEqual([]);
  });

  it('application layer does not import Prisma client or expose Prisma types', () => {
    const hits = importers([at('application')], '@prisma/client');
    expect(
      hits,
      `application ports/services must stay Prisma-free; Prisma belongs in outgoing adapters:\n${hits.join('\n')}`,
    ).toEqual([]);
  });

  it('application/service/** does not import HTTP adapter DTOs', () => {
    const hits = importers([at('application/service')], String.raw`[^'"]*adapter/in/`);
    expect(
      hits,
      `application services must expose application command/input types, not HTTP DTOs:\n${hits.join('\n')}`,
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

  it('no legacy flat transitional exception remains documented', () => {
    const guide = readFileSync(path.join(SUPPLY_ROOT, 'CLAUDE.md'), 'utf8');
    expect(
      guide,
      'supply is no longer transitional-flat after closeout; update scoped guidance',
    ).not.toMatch(/transitional flat|transitional legacy CRUD|Transitional Exceptions/);
  });
});
