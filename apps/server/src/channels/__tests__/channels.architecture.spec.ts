import { describe, expect, it } from 'vitest';
import { execSync } from 'node:child_process';
import path from 'node:path';

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
//   - The legacy `adapters/coupang/` folder remains a compatibility shim only.

const REPO_ROOT = path.resolve(__dirname, '../../../../..');
const CHANNELS_ROOT = path.resolve(__dirname, '..');

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

function channelsRel(): string {
  return path.relative(REPO_ROOT, CHANNELS_ROOT);
}

describe('channels architecture contract', () => {
  it('PrismaService is imported only under channels/adapter/out/repository/**', () => {
    const channels = channelsRel();
    const allowedPrefix = path.join(channels, 'adapter/out/repository') + path.sep;
    const hits = rg(
      `--type ts --files-with-matches 'PrismaService' ${channels} --glob '!**/__tests__/**'`,
    );
    const violators = hits.filter((file) => !file.startsWith(allowedPrefix));
    expect(
      violators,
      `PrismaService is leaking outside adapter/out/repository:\n${violators.join('\n')}`,
    ).toEqual([]);
  });

  it('application layer does not import Prisma client or expose Prisma types', () => {
    const channels = channelsRel();
    const applicationGlob = path.join(channels, 'application') + '/**';
    const hits = rg(
      `--type ts --files-with-matches '@prisma/client|Prisma\\.' --glob '${applicationGlob}' --glob '!**/__tests__/**'`,
    );
    expect(
      hits,
      `application ports/services must stay Prisma-free; Prisma belongs in outgoing adapters:\n${hits.join('\n')}`,
    ).toEqual([]);
  });

  it('application/service/** does not import adapter/out/**', () => {
    const channels = channelsRel();
    const serviceGlob = path.join(channels, 'application/service') + '/**';
    const hits = rg(
      `--type ts --files-with-matches '\\.\\./adapter/out|adapter/out/' --glob '${serviceGlob}' --glob '!**/__tests__/**'`,
    );
    expect(
      hits,
      `application services must depend on application/port/out/*, not concrete adapter/out/** files:\n${hits.join('\n')}`,
    ).toEqual([]);
  });

  it('application/service/** does not import HTTP adapter DTOs', () => {
    const channels = channelsRel();
    const serviceGlob = path.join(channels, 'application/service') + '/**';
    const hits = rg(
      `--type ts --files-with-matches 'adapter/in/|\\.\\./.*adapter/in/' --glob '${serviceGlob}' --glob '!**/__tests__/**'`,
    );
    expect(
      hits,
      `application services must expose application command/input types, not HTTP DTOs:\n${hits.join('\n')}`,
    ).toEqual([]);
  });

  it('application/service/** does not import other owner-domain services directly', () => {
    const channels = channelsRel();
    const serviceGlob = path.join(channels, 'application/service') + '/**';
    const hits = rg(
      `--type ts --files-with-matches '\\.\\./\\.\\./\\.\\./(advertising|ai|analytics|automation|finance|inventory|orders|products|rules|agent-os|sourcing|supply)/application' --glob '${serviceGlob}' --glob '!**/__tests__/**'`,
    );
    expect(
      hits,
      `application services must reach other owner domains through application/port/out/cross-domain/* ports:\n${hits.join('\n')}`,
    ).toEqual([]);
  });

  it('incoming HTTP adapters do not import outgoing ports or repository adapters', () => {
    const channels = channelsRel();
    const httpGlob = path.join(channels, 'adapter/in/http') + '/**';
    const hits = rg(
      `--type ts --files-with-matches 'application/port/out|adapter/out/' --glob '${httpGlob}' --glob '!**/__tests__/**'`,
    );
    expect(
      hits,
      `incoming adapters must call application services, not outgoing ports/adapters:\n${hits.join('\n')}`,
    ).toEqual([]);
  });

  it('outgoing adapters do not import application services', () => {
    const channels = channelsRel();
    const adapterOutGlob = path.join(channels, 'adapter/out') + '/**';
    const hits = rg(
      `--type ts --files-with-matches 'application/service|\\.\\./\\.\\./\\.\\./application/service' --glob '${adapterOutGlob}' --glob '!**/__tests__/**'`,
    );
    expect(
      hits,
      `outgoing adapters must depend on application/port/out contracts, not application services:\n${hits.join('\n')}`,
    ).toEqual([]);
  });

  it('does not retain channel-owned component recipes or persisted mapping status', () => {
    const channels = channelsRel();
    const hits = rg(
      `--type ts --files-with-matches 'ChannelSkuComponent|channelSkuComponent' ${channels} --glob '!**/__tests__/**' --glob '!**/*.spec.ts'`,
    );
    expect(
      hits,
      `the completed cutover must not retain channel-owned recipe persistence:\n${hits.join('\n')}`,
    ).toEqual([]);
  });

  it('legacy adapters/coupang folder contains only compatibility shims', () => {
    const channels = channelsRel();
    const legacyFiles = rg(
      `--type ts --files --glob '${path.join(channels, 'adapters/coupang', '**', '*.ts')}'`,
    );
    expect(legacyFiles).toEqual([
      path.join(channels, 'adapters/coupang/orders.ts'),
    ]);
    const nonShimHits = rg(
      `--type ts --files-with-matches 'PrismaService|fetch\\(|@nestjs/common' --glob '${path.join(channels, 'adapters/coupang', '**', '*.ts')}'`,
    );
    expect(
      nonShimHits,
      `legacy adapters/coupang files must stay compat-only:\n${nonShimHits.join('\n')}`,
    ).toEqual([]);
  });
});
