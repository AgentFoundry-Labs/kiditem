import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { importFromPattern, ownerSource, scanSource } from '../architecture-rg';

// The helper exists so an architecture rule can never pass because rg looked at
// nothing (KID-258). These cases plant a violation and expect the rule to see it.
describe('scanSource', () => {
  let root: string;

  beforeEach(() => {
    root = mkdtempSync(path.join(os.tmpdir(), 'architecture-rg-'));
    mkdirSync(path.join(root, 'application', 'service'), { recursive: true });
    mkdirSync(path.join(root, '__tests__'), { recursive: true });
    writeFileSync(
      path.join(root, 'application', 'service', 'clean.service.ts'),
      "import { ok } from '../port/in/ok.port';\nexport const clean = ok;\n",
    );
    writeFileSync(
      path.join(root, 'application', 'service', 'dirty.service.ts'),
      "import { PrismaClient } from '@prisma/client';\nexport const dirty = new PrismaClient();\n",
    );
    writeFileSync(
      path.join(root, 'application', 'service', 'dirty.service.spec.ts'),
      "import { PrismaClient } from '@prisma/client';\nexport const spec = PrismaClient;\n",
    );
    writeFileSync(
      path.join(root, '__tests__', 'fixture.ts'),
      "import { PrismaClient } from '@prisma/client';\nexport const fixture = PrismaClient;\n",
    );
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it('finds a planted violation and ignores test sources', () => {
    const result = scanSource({
      roots: [root],
      pattern: String.raw`from '@prisma/client'`,
      relativeTo: root,
    });
    expect(result.scanned).toBe(2);
    expect(result.hits).toEqual(['application/service/dirty.service.ts']);
  });

  it('passes once the violation is removed', () => {
    rmSync(path.join(root, 'application', 'service', 'dirty.service.ts'));
    const result = scanSource({
      roots: [root],
      pattern: String.raw`from '@prisma/client'`,
      relativeTo: root,
    });
    expect(result.scanned).toBe(1);
    expect(result.hits).toEqual([]);
  });

  it('returns file:line:text in lines mode', () => {
    const result = scanSource({
      roots: [root],
      pattern: String.raw`from '@prisma/client'`,
      mode: 'lines',
      relativeTo: root,
    });
    expect(result.hits).toEqual([
      "application/service/dirty.service.ts:1:import { PrismaClient } from '@prisma/client';",
    ]);
  });

  it('narrows the scan with extra globs', () => {
    const result = scanSource({
      roots: [root],
      pattern: String.raw`from '@prisma/client'`,
      globs: ['!**/dirty.service.ts'],
      relativeTo: root,
    });
    expect(result.scanned).toBe(1);
    expect(result.hits).toEqual([]);
  });

  it('fails instead of passing vacuously when nothing is scanned', () => {
    const empty = path.join(root, 'nothing-here');
    mkdirSync(empty);
    expect(() => scanSource({ roots: [empty], pattern: 'x' })).toThrow(/no TypeScript source/);
    expect(() => scanSource({ roots: [], pattern: 'x' })).toThrow(/roots must not be empty/);
  });

  it('matches module specifiers on import and export lines only, not in comments or strings', () => {
    writeFileSync(
      path.join(root, 'application', 'service', 'commented.service.ts'),
      [
        "// Prisma belongs in adapters; never import from '@prisma/client' here.",
        "const note = \"from '@prisma/client'\";",
        'export const commented = note;',
        '',
      ].join('\n'),
    );
    writeFileSync(
      path.join(root, 'application', 'service', 'multiline.service.ts'),
      ['import {', '  Prisma,', "} from '@prisma/client';", 'export const multiline = Prisma;', ''].join('\n'),
    );
    writeFileSync(
      path.join(root, 'application', 'service', 'reexport.service.ts'),
      "export type { AdAction } from '@prisma/client';\n",
    );
    const result = scanSource({
      roots: [root],
      pattern: importFromPattern(String.raw`@prisma/client`),
      relativeTo: root,
    });
    expect(result.hits).toEqual([
      'application/service/dirty.service.ts',
      'application/service/multiline.service.ts',
      'application/service/reexport.service.ts',
    ]);
  });

  it('matches inline import() and require() specifiers but not a comment that names them', () => {
    writeFileSync(
      path.join(root, 'application', 'service', 'lazy.service.ts'),
      "export const lazy = () => import('../adapter/out/x');\n",
    );
    writeFileSync(
      path.join(root, 'application', 'service', 'required.service.ts'),
      "const adapter = require('../adapter/out/y');\nexport const required = adapter;\n",
    );
    writeFileSync(
      path.join(root, 'application', 'service', 'typed.service.ts'),
      "export let typed: import('../adapter/out/z').Z | null = null;\n",
    );
    writeFileSync(
      path.join(root, 'application', 'service', 'noted.service.ts'),
      "// never import('../adapter/out/x') or require('../adapter/out/y') here\nexport const noted = 1;\n",
    );
    const result = scanSource({
      roots: [root],
      pattern: importFromPattern(String.raw`[^'"]*adapter/out/`),
      relativeTo: root,
    });
    expect(result.hits).toEqual([
      'application/service/lazy.service.ts',
      'application/service/required.service.ts',
      'application/service/typed.service.ts',
    ]);
  });

  it('scopes paths, importers and file listings to one owner root', () => {
    const owner = ownerSource(root);
    expect(owner.at('application', 'service')).toBe(path.join(root, 'application', 'service'));
    expect(owner.importers([owner.at('application')], '@prisma/client')).toEqual([
      'application/service/dirty.service.ts',
    ]);
    expect(owner.ownerFiles()).toEqual([
      'application/service/clean.service.ts',
      'application/service/dirty.service.ts',
    ]);
  });
});
