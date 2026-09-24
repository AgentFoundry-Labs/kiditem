import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { scanSource } from '../architecture-rg';

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
});
