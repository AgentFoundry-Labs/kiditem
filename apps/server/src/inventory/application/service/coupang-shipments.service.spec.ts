import { describe, expect, it, vi } from 'vitest';

import { CoupangShipmentsService } from './coupang-shipments.service';
import type { CoupangShipmentFileStoragePort } from '../port/out/storage';

describe('CoupangShipmentsService', () => {
  it('passes organization scope to the shipment file storage port', async () => {
    const storage = {
      listMergedFiles: vi.fn().mockResolvedValue({ rootPath: '/tmp/org-a', totalFiles: 0, days: [] }),
      resolveMergedFile: vi.fn().mockResolvedValue({
        path: '/tmp/org-a/run/2026-07-01/file.pdf',
        fileName: 'file.pdf',
        sizeBytes: 1,
      }),
    } satisfies CoupangShipmentFileStoragePort;
    const service = new CoupangShipmentsService(storage);

    await service.listLocalFiles('org-a');
    await service.resolveLocalFile('org-a', {
      runId: 'run',
      date: '2026-07-01',
      fileName: 'file.pdf',
    });

    expect(storage.listMergedFiles).toHaveBeenCalledWith('org-a');
    expect(storage.resolveMergedFile).toHaveBeenCalledWith('org-a', {
      runId: 'run',
      date: '2026-07-01',
      fileName: 'file.pdf',
    });
  });
});
