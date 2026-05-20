import { describe, expect, it } from 'vitest';
import { execSync } from 'node:child_process';
import path from 'node:path';

const REPO_ROOT = path.resolve(__dirname, '../../../../..');
const SUPPLY_ROOT = path.resolve(__dirname, '..');

function rg(args: string): string[] {
  try {
    const out = execSync(`rg ${args}`, { cwd: REPO_ROOT, encoding: 'utf8' });
    return out
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean);
  } catch (err: unknown) {
    if ((err as { status?: number }).status === 1) return [];
    throw err;
  }
}

function supplyRel(): string {
  return path.relative(REPO_ROOT, SUPPLY_ROOT);
}

describe('supply architecture contract', () => {
  it('PrismaService is imported only under supply/adapter/out/repository/**', () => {
    const supply = supplyRel();
    const allowedPrefix = path.join(supply, 'adapter/out/repository') + path.sep;
    const hits = rg(
      `--type ts --files-with-matches 'PrismaService' ${supply} --glob '!**/__tests__/**'`,
    );
    const violators = hits.filter((file) => !file.startsWith(allowedPrefix));
    expect(
      violators,
      `PrismaService is leaking outside adapter/out/repository:\n${violators.join('\n')}`,
    ).toEqual([]);
  });

  it('application layer does not import Prisma client or expose Prisma types', () => {
    const supply = supplyRel();
    const applicationGlob = path.join(supply, 'application') + '/**';
    const hits = rg(
      `--type ts --files-with-matches '@prisma/client|Prisma\\.' --glob '${applicationGlob}' --glob '!**/__tests__/**'`,
    );
    expect(
      hits,
      `application ports/services must stay Prisma-free; Prisma belongs in outgoing adapters:\n${hits.join('\n')}`,
    ).toEqual([]);
  });

  it('application/service/** does not import HTTP adapter DTOs', () => {
    const supply = supplyRel();
    const serviceGlob = path.join(supply, 'application/service') + '/**';
    const hits = rg(
      `--type ts --files-with-matches 'adapter/in/|\\.\\./.*adapter/in/' --glob '${serviceGlob}' --glob '!**/__tests__/**'`,
    );
    expect(
      hits,
      `application services must expose application command/input types, not HTTP DTOs:\n${hits.join('\n')}`,
    ).toEqual([]);
  });

  it('application/service/** does not import adapter/out/**', () => {
    const supply = supplyRel();
    const serviceGlob = path.join(supply, 'application/service') + '/**';
    const hits = rg(
      `--type ts --files-with-matches '\\.\\./.*adapter/out|adapter/out/' --glob '${serviceGlob}' --glob '!**/__tests__/**'`,
    );
    expect(
      hits,
      `application services must depend on application/port/out/*, not concrete adapter/out/** files:\n${hits.join('\n')}`,
    ).toEqual([]);
  });

  it('incoming HTTP adapters do not import outgoing ports or repository adapters', () => {
    const supply = supplyRel();
    const httpGlob = path.join(supply, 'adapter/in/http') + '/**';
    const hits = rg(
      `--type ts --files-with-matches 'application/port/out|adapter/out/' --glob '${httpGlob}' --glob '!**/__tests__/**'`,
    );
    expect(
      hits,
      `incoming adapters must call application services, not outgoing ports/adapters:\n${hits.join('\n')}`,
    ).toEqual([]);
  });

  it('no legacy flat transitional exception remains documented', () => {
    const supply = supplyRel();
    const hits = rg(
      `--type md --files-with-matches 'transitional flat|transitional legacy CRUD|Transitional Exceptions' ${path.join(supply, 'AGENTS.md')}`,
    );
    expect(
      hits,
      `supply is no longer transitional-flat after closeout; update scoped guidance:\n${hits.join('\n')}`,
    ).toEqual([]);
  });
});
