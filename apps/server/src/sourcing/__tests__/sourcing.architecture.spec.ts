import { describe, it, expect } from 'vitest';
import { execSync } from 'node:child_process';
import path from 'node:path';

// Architecture guard tests freeze the sourcing port/adapter contract:
//
//   - PrismaService is imported only under `sourcing/adapter/out/repository/**`.
//   - `application/**` does not import Prisma client/types. Ports and services
//     expose local structural records only.
//   - `application/service/**` does not import concrete adapters/DTOs or other
//     owner-domain services directly. Cross-owner reach goes through local
//     ports + concrete adapters under `adapter/out/{owner}/`.
//   - Incoming HTTP adapters call application services, not outgoing ports or
//     repository adapters directly.
//   - No legacy top-level `dto/`, `services/`, or `adapter/out/prisma/`
//     folders remain.

const REPO_ROOT = path.resolve(__dirname, '../../../../..');
const SOURCING_ROOT = path.resolve(__dirname, '..');

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

function sourcingRel(): string {
  return path.relative(REPO_ROOT, SOURCING_ROOT);
}

describe('sourcing architecture contract', () => {
  it('PrismaService is imported only under sourcing/adapter/out/repository/**', () => {
    const sourcing = sourcingRel();
    const allowedPrefix = path.join(sourcing, 'adapter/out/repository') + path.sep;
    const hits = rg(
      `--type ts --files-with-matches 'PrismaService' ${sourcing} --glob '!**/__tests__/**'`,
    );
    const violators = hits.filter((file) => !file.startsWith(allowedPrefix));
    expect(
      violators,
      `PrismaService is leaking outside adapter/out/repository:\n${violators.join('\n')}`,
    ).toEqual([]);
  });

  it('application layer does not import Prisma client or expose Prisma types', () => {
    const sourcing = sourcingRel();
    const applicationGlob = path.join(sourcing, 'application') + '/**';
    const hits = rg(
      `--type ts --files-with-matches '@prisma/client|Prisma\\.' --glob '${applicationGlob}' --glob '!**/__tests__/**'`,
    );
    expect(
      hits,
      `application ports/services must stay Prisma-free; Prisma belongs in outgoing adapters:\n${hits.join('\n')}`,
    ).toEqual([]);
  });

  it('application/service/** does not import adapter/out/**', () => {
    const sourcing = sourcingRel();
    const serviceGlob = path.join(sourcing, 'application/service') + '/**';
    const hits = rg(
      `--type ts --files-with-matches '\\.\\./adapter/out|adapter/out/' --glob '${serviceGlob}' --glob '!**/__tests__/**'`,
    );
    expect(
      hits,
      `application services must depend on application/port/out/*, not concrete adapter/out/** files:\n${hits.join('\n')}`,
    ).toEqual([]);
  });

  it('application/service/** does not import HTTP adapter DTOs', () => {
    const sourcing = sourcingRel();
    const serviceGlob = path.join(sourcing, 'application/service') + '/**';
    const hits = rg(
      `--type ts --files-with-matches 'adapter/in/|\\.\\./.*adapter/in/' --glob '${serviceGlob}' --glob '!**/__tests__/**'`,
    );
    expect(
      hits,
      `application services must expose application command/input types, not HTTP DTOs:\n${hits.join('\n')}`,
    ).toEqual([]);
  });

  it('application/service/** does not import other owner-domain services directly', () => {
    const sourcing = sourcingRel();
    const serviceGlob = path.join(sourcing, 'application/service') + '/**';
    const hits = rg(
      `--type ts --files-with-matches '\\.\\./\\.\\./\\.\\./(automation|ai|channels|finance|inventory|orders|products|rules|agent-os|analytics|advertising)/application' --glob '${serviceGlob}' --glob '!**/__tests__/**'`,
    );
    expect(
      hits,
      `application services must reach other owner domains through adapter/out/{owner}/* ports:\n${hits.join('\n')}`,
    ).toEqual([]);
  });

  it('incoming HTTP adapters do not import outgoing ports or repository adapters', () => {
    const sourcing = sourcingRel();
    const httpGlob = path.join(sourcing, 'adapter/in/http') + '/**';
    const hits = rg(
      `--type ts --files-with-matches 'application/port/out|adapter/out/' --glob '${httpGlob}' --glob '!**/__tests__/**'`,
    );
    expect(
      hits,
      `incoming adapters must call application services, not outgoing ports/adapters:\n${hits.join('\n')}`,
    ).toEqual([]);
  });

  it('no legacy top-level dto/, services/, or adapter/out/prisma/ folders remain', () => {
    const sourcing = sourcingRel();
    const dtoHits = rg(`--type ts --files --glob '${path.join(sourcing, 'dto', '**', '*.ts')}'`);
    const serviceHits = rg(
      `--type ts --files --glob '${path.join(sourcing, 'services', '**', '*.ts')}'`,
    );
    const prismaHits = rg(
      `--type ts --files --glob '${path.join(sourcing, 'adapter/out/prisma', '**', '*.ts')}'`,
    );
    const violators = [...dtoHits, ...serviceHits, ...prismaHits];
    expect(
      violators,
      `Legacy folders detected — use adapter/in/http/dto/, application/service/, and adapter/out/repository/:\n${violators.join('\n')}`,
    ).toEqual([]);
  });
});
