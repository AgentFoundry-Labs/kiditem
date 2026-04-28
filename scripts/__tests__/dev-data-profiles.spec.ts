import { describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const repoRoot = join(__dirname, '..', '..');

function runDevData(args: string[]) {
  return execFileSync(join(repoRoot, 'node_modules/.bin/tsx'), ['scripts/dev-data.ts', ...args], {
    cwd: repoRoot,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

describe('profile-based dev data workflow', () => {
  it('exposes generic dev data scripts', () => {
    const packageJson = JSON.parse(readFileSync(join(repoRoot, 'package.json'), 'utf8')) as {
      scripts?: Record<string, string>;
    };

    expect(packageJson.scripts).toHaveProperty('data:dev:status');
    expect(packageJson.scripts).toHaveProperty('data:dev:pull');
    expect(packageJson.scripts).toHaveProperty('data:dev:sync');
    expect(packageJson.scripts).toHaveProperty('data:dev:pack');
    expect(packageJson.scripts).toHaveProperty('data:dev:publish');
  });

  it('publishes a domain bundle and syncs it through a profile dry run', async () => {
    const tempRoot = mkdtempSync(join(tmpdir(), 'kiditem-profile-data-'));
    const producerRoot = join(tempRoot, 'producer');
    const consumerRoot = join(tempRoot, 'consumer');
    const driveRoot = join(tempRoot, 'drive');
    const domainRoot = join(producerRoot, 'coupang');
    const datasetId = '2026-04-28-real-v1';
    const bundleDir = join(domainRoot, datasetId);
    const payloadPath = join(bundleDir, 'payloads', 'wing-traffic.json');
    const archiveFileName = 'kiditem-coupang-real-2026-04-28-real-v1.zip';

    mkdirSync(join(bundleDir, 'payloads'), { recursive: true });
    writeFileSync(payloadPath, JSON.stringify({
      type: 'traffic',
      source: 'wing',
      data: [{ businessDate: '2026-04-28', visitors: 11 }],
    }));
    writeFileSync(join(bundleDir, 'manifest.json'), JSON.stringify({
      schemaVersion: 'kiditem.dev-data.coupang.v1',
      datasetId,
      lane: 'real',
      createdAt: '2026-04-28T00:00:00.000Z',
      defaultImportMode: 'scoped-replace',
      scope: {
        channel: 'coupang',
        businessDateFrom: '2026-04-28',
        businessDateTo: '2026-04-28',
      },
      payloads: [
        {
          path: 'payloads/wing-traffic.json',
          type: 'traffic',
          source: 'wing',
        },
      ],
    }));

    const publishOutput = JSON.parse(runDevData([
      'publish',
      '--domain', 'coupang',
      '--dataset', datasetId,
      '--data-root', producerRoot,
      '--drive-root', driveRoot,
    ])) as { archiveFileName: string; latestJsonPath: string; sha256: string };

    expect(publishOutput.archiveFileName).toBe(archiveFileName);
    expect(existsSync(join(driveRoot, 'coupang-real', 'bundles', archiveFileName))).toBe(true);

    const latestJson = JSON.parse(await readFile(publishOutput.latestJsonPath, 'utf8')) as {
      schemaVersion: string;
      domain: string;
      datasetId: string;
      archiveFileName: string;
      archivePath: string;
      sha256: string;
    };
    expect(latestJson).toMatchObject({
      schemaVersion: 'kiditem.dev-data.package.v1',
      domain: 'coupang',
      datasetId,
      archiveFileName,
      archivePath: `bundles/${archiveFileName}`,
      sha256: publishOutput.sha256,
    });

    mkdirSync(join(driveRoot, 'profiles'), { recursive: true });
    writeFileSync(join(driveRoot, 'profiles', 'workspace-demo.json'), JSON.stringify({
      schemaVersion: 'kiditem.dev-data.profile.v1',
      profileId: 'workspace-demo',
      steps: [
        {
          domain: 'coupang',
          lane: 'real',
          dataset: 'latest',
          mode: 'scoped-replace',
        },
      ],
    }));

    const syncOutput = JSON.parse(runDevData([
      'sync',
      '--profile', 'workspace-demo',
      '--data-root', consumerRoot,
      '--drive-root', driveRoot,
      '--dry-run',
    ])) as {
      profileId: string;
      dryRun: boolean;
      steps: Array<{
        domain: string;
        lane: string;
        datasetId: string;
        mode: string;
        replay?: { payloads: number; sources: string[] };
      }>;
    };

    expect(syncOutput).toMatchObject({
      profileId: 'workspace-demo',
      dryRun: true,
      steps: [
        {
          domain: 'coupang',
          lane: 'real',
          datasetId,
          mode: 'scoped-replace',
        },
      ],
    });
    expect(syncOutput.steps[0]?.replay).toMatchObject({ payloads: 1 });
    expect(syncOutput.steps[0]?.replay?.sources).toContain('wing');
    expect(existsSync(join(consumerRoot, 'coupang', datasetId, 'manifest.json'))).toBe(true);
  }, 30000);
});
