import { describe, expect, it } from 'vitest';
import { execSync } from 'node:child_process';
import path from 'node:path';

const REPO_ROOT = path.resolve(__dirname, '../../../../..');
const PRODUCTS_ROOT = path.resolve(__dirname, '..');

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

function productsRel(): string {
  return path.relative(REPO_ROOT, PRODUCTS_ROOT);
}

describe('products architecture contract', () => {
  it('PrismaService is imported only under products/adapter/out/repository/**', () => {
    const products = productsRel();
    const allowedPrefix = path.join(products, 'adapter/out/repository') + path.sep;
    const hits = rg(
      `--type ts --files-with-matches 'PrismaService' ${products} --glob '!**/__tests__/**' --glob '!${path.join(products, 'categories', '**')}'`,
    );
    const violators = hits.filter((file) => !file.startsWith(allowedPrefix));
    expect(
      violators,
      `PrismaService is leaking outside adapter/out/repository:\n${violators.join('\n')}`,
    ).toEqual([]);
  });

  it('application layer does not import Prisma client or expose Prisma types', () => {
    const products = productsRel();
    const applicationGlob = path.join(products, 'application') + '/**';
    const hits = rg(
      `--type ts --files-with-matches '@prisma/client|Prisma\\.' --glob '${applicationGlob}' --glob '!**/__tests__/**'`,
    );
    expect(
      hits,
      `application ports/services must stay Prisma-free; Prisma belongs in outgoing adapters:\n${hits.join('\n')}`,
    ).toEqual([]);
  });

  it('application/service/** does not import adapter/out/**', () => {
    const products = productsRel();
    const serviceGlob = path.join(products, 'application/service') + '/**';
    const hits = rg(
      `--type ts --files-with-matches '\\.\\./.*adapter/out|adapter/out/' --glob '${serviceGlob}' --glob '!**/__tests__/**'`,
    );
    expect(
      hits,
      `application services must depend on application/port/out/*, not concrete adapter/out/** files:\n${hits.join('\n')}`,
    ).toEqual([]);
  });

  it('application/service/** does not import other owner-domain services directly', () => {
    const products = productsRel();
    const serviceGlob = path.join(products, 'application/service') + '/**';
    const hits = rg(
      `--type ts --files-with-matches '\\.\\./\\.\\./\\.\\./(advertising|ai|analytics|automation|finance|inventory|orders|rules|agent-os|sourcing|supply)/application' --glob '${serviceGlob}' --glob '!**/__tests__/**'`,
    );
    expect(
      hits,
      `application services must reach other owner domains through application/port/out/cross-domain/* ports:\n${hits.join('\n')}`,
    ).toEqual([]);
  });

  it('incoming HTTP adapters do not import outgoing ports or repository adapters', () => {
    const products = productsRel();
    const httpGlob = path.join(products, 'adapter/in/http') + '/**';
    const hits = rg(
      `--type ts --files-with-matches 'application/port/out|adapter/out/' --glob '${httpGlob}' --glob '!**/__tests__/**'`,
    );
    expect(
      hits,
      `incoming adapters must call application services, not outgoing ports/adapters:\n${hits.join('\n')}`,
    ).toEqual([]);
  });

  it('legacy adapter/out/prisma folder no longer exists', () => {
    const products = productsRel();
    const legacyFiles = rg(
      `--type ts --files --glob '${path.join(products, 'adapter/out/prisma', '**', '*.ts')}'`,
    );
    expect(
      legacyFiles,
      `final products repositories live under adapter/out/repository, not adapter/out/prisma:\n${legacyFiles.join('\n')}`,
    ).toEqual([]);
  });
});
