import { describe, it, expect } from 'vitest';
import { execSync } from 'node:child_process';
import path from 'node:path';

// These guard tests freeze the Inventory architecture contract:
//
//   - PrismaService is only ever imported under `inventory/adapter/out/prisma/**`.
//   - Domain code (`inventory/domain/**`) does not depend on NestJS, Prisma, the
//     PrismaService class, HTTP DTO classes, or any incoming-adapter module.
//
// They run as a thin shell-out against the working tree so they cover the
// production source files exactly the way the scanners do.

const REPO_ROOT = path.resolve(__dirname, '../../../../..');
const INVENTORY_ROOT = path.resolve(__dirname, '..');

function rg(args: string): string[] {
  try {
    const out = execSync(`rg ${args}`, { cwd: REPO_ROOT, encoding: 'utf8' });
    return out
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean);
  } catch (err: unknown) {
    // ripgrep exits 1 when no matches; treat as empty result.
    if ((err as { status?: number }).status === 1) return [];
    throw err;
  }
}

describe('Inventory architecture contract', () => {
  it('PrismaService is imported only under inventory/adapter/out/prisma/**', () => {
    const inventoryRel = path.relative(REPO_ROOT, INVENTORY_ROOT);
    const allowedPrefix = path.join(inventoryRel, 'adapter/out/prisma') + path.sep;
    const hits = rg(
      `--type ts --files-with-matches 'PrismaService' ${inventoryRel} --glob '!**/__tests__/**'`,
    );
    const violators = hits.filter((file) => !file.startsWith(allowedPrefix));
    expect(violators, `PrismaService is leaking outside adapter/out/prisma:\n${violators.join('\n')}`)
      .toEqual([]);
  });

  it('domain layer is free of Nest/Prisma/HTTP coupling', () => {
    const inventoryRel = path.relative(REPO_ROOT, INVENTORY_ROOT);
    const domainGlob = path.join(inventoryRel, 'domain') + '/**';
    const hits = rg(
      `--type ts --files-with-matches '@nestjs|@prisma/client|PrismaService|adapter/in/http|\\.dto'\
       --glob '${domainGlob}' --glob '!**/__tests__/**'`,
    );
    expect(hits, `domain code is importing infrastructure:\n${hits.join('\n')}`).toEqual([]);
  });
});
