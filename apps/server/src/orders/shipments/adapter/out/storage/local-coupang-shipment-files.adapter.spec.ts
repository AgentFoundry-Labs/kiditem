import { afterEach, describe, expect, it } from 'vitest';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { NotFoundException } from '@nestjs/common';

import { LocalCoupangShipmentFilesAdapter } from './local-coupang-shipment-files.adapter';

const ORGANIZATION_ID = '00000000-0000-0000-0000-000000000001';
const OTHER_ORGANIZATION_ID = '00000000-0000-0000-0000-000000000002';

describe('LocalCoupangShipmentFilesAdapter', () => {
  const previousDir = process.env.COUPANG_SHIPMENTS_DIR;
  let tempRoot: string | null = null;

  afterEach(async () => {
    process.env.COUPANG_SHIPMENTS_DIR = previousDir;
    if (tempRoot) {
      await rm(tempRoot, { recursive: true, force: true });
      tempRoot = null;
    }
  });

  it('lists and resolves files only under the organization directory', async () => {
    tempRoot = await mkdtemp(join(tmpdir(), 'kiditem-coupang-shipments-'));
    process.env.COUPANG_SHIPMENTS_DIR = tempRoot;
    const adapter = new LocalCoupangShipmentFilesAdapter();

    await writePdf(tempRoot, ORGANIZATION_ID, 'run-a', '2026-07-01', '라벨_병합.pdf');
    await writePdf(tempRoot, OTHER_ORGANIZATION_ID, 'run-b', '2026-07-01', '다른조직_병합.pdf');

    const ownFiles = await adapter.listMergedFiles(ORGANIZATION_ID);
    const otherFiles = await adapter.listMergedFiles('00000000-0000-0000-0000-000000000003');
    const resolved = await adapter.resolveMergedFile(ORGANIZATION_ID, {
      runId: 'run-a',
      date: '2026-07-01',
      fileName: '라벨_병합.pdf',
    });

    expect(ownFiles.rootPath).toBe(join(tempRoot, ORGANIZATION_ID));
    expect(ownFiles.totalFiles).toBe(1);
    expect(ownFiles.days[0]?.files[0]?.fileName).toBe('라벨_병합.pdf');
    expect(otherFiles.totalFiles).toBe(0);
    expect(resolved.path).toBe(join(tempRoot, ORGANIZATION_ID, 'run-a', '2026-07-01', '라벨_병합.pdf'));
  });

  it('rejects traversal outside the organization directory', async () => {
    tempRoot = await mkdtemp(join(tmpdir(), 'kiditem-coupang-shipments-'));
    process.env.COUPANG_SHIPMENTS_DIR = tempRoot;
    const adapter = new LocalCoupangShipmentFilesAdapter();

    await expect(
      adapter.resolveMergedFile(ORGANIZATION_ID, {
        runId: '..',
        date: '2026-07-01',
        fileName: '라벨_병합.pdf',
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});

async function writePdf(
  root: string,
  organizationId: string,
  runId: string,
  date: string,
  fileName: string,
): Promise<void> {
  const dir = join(root, organizationId, runId, date);
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, fileName), Buffer.from('%PDF-1.4\n'));
}
