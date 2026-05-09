import { describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildCoupangImageSyncRowsForListings } from '../dev-data-coupang';

const repoRoot = join(__dirname, '..', '..');

function runDevData(args: string[], env: Record<string, string> = {}) {
  return execFileSync(join(repoRoot, 'node_modules/.bin/tsx'), ['scripts/dev-data.ts', ...args], {
    cwd: repoRoot,
    env: { ...process.env, ...env },
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

describe('profile-based dev data workflow', () => {
  it('exports image sync replay rows from MasterProductImage URLs, not master sourceUrl', () => {
    const result = buildCoupangImageSyncRowsForListings([
      {
        externalId: '200',
        channelName: '쿠팡 옵션 B',
        master: {
          name: '공유 마스터',
          legacyCode: null,
          sourceUrl: 'https://wing.coupang.com/product-page',
          images: [
            {
              url: 'https://image.example/shared.jpg',
              source: 'coupang-wing',
              isPrimary: true,
              sortOrder: 0,
            },
          ],
          options: [{ legacyCode: 'KIDITEM-1' }],
        },
      },
      {
        externalId: '100',
        channelName: '쿠팡 옵션 A',
        master: {
          name: '공유 마스터',
          legacyCode: null,
          sourceUrl: 'https://wing.coupang.com/product-page',
          images: [
            {
              url: 'https://image.example/shared.jpg',
              source: 'coupang-wing',
              isPrimary: true,
              sortOrder: 0,
            },
          ],
          options: [{ legacyCode: 'KIDITEM-1' }],
        },
      },
    ] as never);

    expect(result.rows).toEqual([
      {
        inventoryId: '100',
        legacyCode: 'KIDITEM-1',
        name: '쿠팡 옵션 A',
        url: 'https://image.example/shared.jpg',
      },
      {
        inventoryId: '200',
        legacyCode: 'KIDITEM-1',
        name: '쿠팡 옵션 B',
        url: 'https://image.example/shared.jpg',
      },
    ]);
    expect(result.skippedMissingImageUrl).toBe(0);
  });

  it('exposes generic dev data scripts', () => {
    const packageJson = JSON.parse(readFileSync(join(repoRoot, 'package.json'), 'utf8')) as {
      scripts?: Record<string, string>;
    };

    expect(packageJson.scripts).toHaveProperty('data:dev:status');
    expect(packageJson.scripts).toHaveProperty('data:dev:setup');
    expect(packageJson.scripts).toHaveProperty('data:dev:pull');
    expect(packageJson.scripts).toHaveProperty('data:dev:sync');
    expect(packageJson.scripts).toHaveProperty('data:dev:pack');
    expect(packageJson.scripts).toHaveProperty('data:dev:publish');
  });

  it('does not expose the removed manual API token replay fallback', () => {
    for (const file of ['scripts/dev-data.ts', 'scripts/dev-data-coupang.ts']) {
      const source = readFileSync(join(repoRoot, file), 'utf8');
      expect(source).not.toContain('KIDITEM_API_ACCESS_TOKEN');
      expect(source).not.toContain('access-token');
    }
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
    const imageSyncPayloadPath = join(bundleDir, 'payloads', 'coupang-image-sync.json');
    const kiditemListPath = join(bundleDir, 'references', 'kiditem_list.xlsx');
    const wingInventoryMatchedPath = join(bundleDir, 'references', 'wing-inventory-matched.xlsx');
    const archiveFileName = 'kiditem-coupang-2026-04-28-real-v1.zip';

    mkdirSync(join(bundleDir, 'payloads'), { recursive: true });
    mkdirSync(join(bundleDir, 'references'), { recursive: true });
    writeFileSync(payloadPath, JSON.stringify({
      type: 'traffic',
      source: 'wing',
      data: [{ businessDate: '2026-04-28', visitors: 11 }],
    }));
    writeFileSync(imageSyncPayloadPath, JSON.stringify({
      type: 'coupang_image_sync',
      source: 'wing_image_sync',
      data: [{ inventoryId: '123456', legacyCode: 'LEG-1', name: '테스트 상품', url: 'https://image.example/item.jpg' }],
    }));
    writeFileSync(kiditemListPath, 'kiditem inventory reference');
    writeFileSync(wingInventoryMatchedPath, 'matched wing inventory reference');
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
        {
          path: 'payloads/coupang-image-sync.json',
          type: 'coupang_image_sync',
          source: 'wing_image_sync',
        },
      ],
      references: [
        {
          path: 'references/kiditem_list.xlsx',
          type: 'kiditem_list',
        },
        {
          path: 'references/wing-inventory-matched.xlsx',
          type: 'wing_inventory_matched',
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
    expect(existsSync(join(driveRoot, 'coupang', 'bundles', archiveFileName))).toBe(true);

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
    writeFileSync(join(driveRoot, 'profiles', 'workspace.json'), JSON.stringify({
      schemaVersion: 'kiditem.dev-data.profile.v1',
      profileId: 'workspace',
      steps: [
        {
          domain: 'coupang',
          dataset: 'latest',
          mode: 'scoped-replace',
        },
      ],
    }));

    const syncOutput = JSON.parse(runDevData([
      'sync',
      '--profile', 'workspace',
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
      profileId: 'workspace',
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
    expect(syncOutput.steps[0]?.replay).toMatchObject({ payloads: 2 });
    expect(syncOutput.steps[0]?.replay?.sources).toContain('wing');
    expect(syncOutput.steps[0]?.replay?.sources).toContain('wing_image_sync');
    expect(existsSync(join(consumerRoot, 'coupang', datasetId, 'manifest.json'))).toBe(true);
    expect(existsSync(join(consumerRoot, 'coupang', datasetId, 'references', 'kiditem_list.xlsx'))).toBe(true);
    expect(existsSync(join(consumerRoot, 'coupang', datasetId, 'references', 'wing-inventory-matched.xlsx'))).toBe(true);
  }, 30000);

  it('uses project reference files from the Drive root when exporting Coupang payloads', async () => {
    const tempRoot = mkdtempSync(join(tmpdir(), 'kiditem-project-reference-'));
    const dataRoot = join(tempRoot, 'data');
    const driveRoot = join(tempRoot, 'drive');
    const payloadDir = join(tempRoot, 'payloads');
    const datasetId = '2026-05-01-v1';

    mkdirSync(join(driveRoot, 'references'), { recursive: true });
    mkdirSync(payloadDir, { recursive: true });
    writeFileSync(join(driveRoot, 'references', 'kiditem_list.xlsx'), 'kiditem project inventory reference');
    writeFileSync(
      join(driveRoot, 'references', 'wing-inventory-matched.xlsx'),
      'matched project inventory reference',
    );
    writeFileSync(join(payloadDir, 'wing-traffic.json'), JSON.stringify({
      type: 'traffic',
      source: 'wing',
      data: [{ businessDate: '2026-05-01', visitors: 13 }],
    }));

    const exportOutput = JSON.parse(runDevData([
      'export',
      '--domain', 'coupang',
      '--dataset', datasetId,
      '--payload-dir', payloadDir,
      '--from', '2026-05-01',
      '--to', '2026-05-01',
      '--data-root', dataRoot,
      '--drive-root', driveRoot,
    ])) as { exported: string; payloadCount: number; referenceCount: number };

    expect(exportOutput).toMatchObject({ exported: datasetId, payloadCount: 1, referenceCount: 2 });
    expect(existsSync(join(dataRoot, 'coupang', datasetId, 'references', 'kiditem_list.xlsx'))).toBe(true);
    expect(existsSync(join(dataRoot, 'coupang', datasetId, 'references', 'wing-inventory-matched.xlsx'))).toBe(true);

    const manifest = JSON.parse(
      await readFile(join(dataRoot, 'coupang', datasetId, 'manifest.json'), 'utf8'),
    ) as { references?: Array<{ type: string }> };
    expect(manifest.references?.map((item) => item.type)).toEqual([
      'kiditem_list',
      'wing_inventory_matched',
    ]);
  }, 30000);

  it('sets up Drive profiles and project references', async () => {
    const tempRoot = mkdtempSync(join(tmpdir(), 'kiditem-drive-setup-'));
    const driveRoot = join(tempRoot, 'drive', 'KidItem Dev Data');
    const sourceRoot = join(tempRoot, 'source');

    mkdirSync(sourceRoot, { recursive: true });
    writeFileSync(join(sourceRoot, 'kiditem_list.xlsx'), 'kiditem project inventory reference');
    writeFileSync(join(sourceRoot, 'wing-inventory-matched.xlsx'), 'matched project inventory reference');

    const setupOutput = JSON.parse(runDevData([
      'setup',
      '--drive-root', driveRoot,
      '--reference-source-root', sourceRoot,
    ])) as {
      driveRoot: string;
      ok: boolean;
      profiles: Array<{ profileId: string; status: string }>;
      references: Array<{ fileName: string; status: string }>;
      blockers: string[];
    };

    expect(setupOutput).toMatchObject({
      driveRoot,
      ok: true,
      blockers: [],
    });
    expect(setupOutput.profiles.map((profile) => profile.profileId).sort()).toEqual(['coupang', 'workspace']);
    expect(setupOutput.references.map((reference) => reference.fileName).sort()).toEqual([
      'kiditem_list.xlsx',
      'wing-inventory-matched.xlsx',
    ]);
    expect(existsSync(join(driveRoot, 'profiles', 'workspace.json'))).toBe(true);
    expect(existsSync(join(driveRoot, 'profiles', 'coupang.json'))).toBe(true);
    expect(existsSync(join(driveRoot, 'references', 'kiditem_list.xlsx'))).toBe(true);
    expect(existsSync(join(driveRoot, 'references', 'wing-inventory-matched.xlsx'))).toBe(true);
    expect(existsSync(join(driveRoot, 'coupang', 'bundles'))).toBe(true);
  }, 30000);

  it('auto-discovers the visible Google Drive root and ignores Drive Desktop .Encrypted mirrors', async () => {
    const tempRoot = mkdtempSync(join(tmpdir(), 'kiditem-drive-autodiscover-'));
    const cloudStorageRoot = join(tempRoot, 'CloudStorage');
    const visibleDriveRoot = join(
      cloudStorageRoot,
      'GoogleDrive-test@example.com',
      'My Drive',
      'KidItem Dev Data',
    );
    const encryptedMirrorRoot = join(
      cloudStorageRoot,
      'GoogleDrive-test@example.com',
      '.Encrypted',
      'My Drive',
      'KidItem Dev Data',
    );
    const sourceRoot = join(tempRoot, 'source');

    mkdirSync(visibleDriveRoot, { recursive: true });
    mkdirSync(encryptedMirrorRoot, { recursive: true });
    mkdirSync(sourceRoot, { recursive: true });
    writeFileSync(join(sourceRoot, 'kiditem_list.xlsx'), 'kiditem project inventory reference');
    writeFileSync(join(sourceRoot, 'wing-inventory-matched.xlsx'), 'matched project inventory reference');

    const setupOutput = JSON.parse(runDevData([
      'setup',
      '--reference-source-root', sourceRoot,
    ], {
      KIDITEM_DEV_DATA_CLOUD_STORAGE_ROOT: cloudStorageRoot,
      KIDITEM_DEV_DATA_DRIVE_DIR: '',
    })) as { driveRoot: string; ok: boolean };

    expect(setupOutput).toMatchObject({
      driveRoot: visibleDriveRoot,
      ok: true,
    });

    const statusOutput = JSON.parse(runDevData([
      'status',
    ], {
      KIDITEM_DEV_DATA_CLOUD_STORAGE_ROOT: cloudStorageRoot,
      KIDITEM_DEV_DATA_DRIVE_DIR: '',
    })) as { configuredDriveRoot: string | null };

    expect(statusOutput.configuredDriveRoot).toBe(visibleDriveRoot);
  }, 30000);
});
