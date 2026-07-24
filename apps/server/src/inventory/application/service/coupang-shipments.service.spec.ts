import { describe, expect, it, vi } from 'vitest';

import { CoupangShipmentsService } from './coupang-shipments.service';
import type { CoupangShipmentFileStoragePort } from '../port/out/storage';
import type { CoupangShipmentDateSummaryRepositoryPort } from '../port/out/repository/coupang-shipment-date-summary.repository.port';

function makeDateSummaryRepo(): CoupangShipmentDateSummaryRepositoryPort {
  return {
    listDateSummary: vi.fn().mockResolvedValue([]),
    upsertDateSummary: vi.fn().mockResolvedValue([]),
  };
}

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
    const service = new CoupangShipmentsService(storage, makeDateSummaryRepo());

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

  it('reads the persisted 발송일 요약 through the date-summary repository', async () => {
    const storage = {
      listMergedFiles: vi.fn(),
      resolveMergedFile: vi.fn(),
    } satisfies CoupangShipmentFileStoragePort;
    const dateSummary = makeDateSummaryRepo();
    (dateSummary.listDateSummary as ReturnType<typeof vi.fn>).mockResolvedValue([
      { date: '2026-07-20', count: 12, boxes: 30, capturedAt: '2026-07-20T00:00:00.000Z' },
    ]);
    const service = new CoupangShipmentsService(storage, dateSummary);

    const result = await service.listDateSummary('org-a');

    expect(dateSummary.listDateSummary).toHaveBeenCalledWith('org-a');
    expect(result).toEqual({
      items: [
        { date: '2026-07-20', count: 12, boxes: 30, capturedAt: '2026-07-20T00:00:00.000Z' },
      ],
    });
  });

  it('upserts collected 발송일 요약 rows incrementally and returns the full set', async () => {
    const storage = {
      listMergedFiles: vi.fn(),
      resolveMergedFile: vi.fn(),
    } satisfies CoupangShipmentFileStoragePort;
    const dateSummary = makeDateSummaryRepo();
    (dateSummary.upsertDateSummary as ReturnType<typeof vi.fn>).mockResolvedValue([
      { date: '2026-07-21', count: 5, boxes: 9, capturedAt: '2026-07-21T00:00:00.000Z' },
      { date: '2026-07-20', count: 12, boxes: 30, capturedAt: '2026-07-20T00:00:00.000Z' },
    ]);
    const service = new CoupangShipmentsService(storage, dateSummary);

    const result = await service.saveDateSummary('org-a', [
      { date: '2026-07-21', count: 5, boxes: 9 },
    ]);

    expect(dateSummary.upsertDateSummary).toHaveBeenCalledWith('org-a', [
      { date: '2026-07-21', count: 5, boxes: 9 },
    ]);
    expect(result.items).toHaveLength(2);
  });
});
