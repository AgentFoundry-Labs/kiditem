import { describe, expect, it, vi } from "vitest";

import { CoupangShipmentsService } from "./coupang-shipments.service";
import type { CoupangShipmentFileStoragePort } from "../port/out/storage";
import type { CoupangShipmentDateSummaryRepositoryPort } from "../port/out/repository/coupang-shipment-date-summary.repository.port";

function makeDateSummaryRepo(): CoupangShipmentDateSummaryRepositoryPort {
  return {
    listDateSummary: vi.fn().mockResolvedValue([]),
    beginSummary: vi.fn(),
    readSummarySource: vi.fn(),
    readSummaryAttempt: vi.fn(),
    completeSummary: vi.fn(),
    failSummary: vi.fn(),
    cancelSummary: vi.fn(),
  };
}

describe("CoupangShipmentsService", () => {
  it("passes organization scope to the shipment file storage port", async () => {
    const storage = {
      listMergedFiles: vi
        .fn()
        .mockResolvedValue({ rootPath: "/tmp/org-a", totalFiles: 0, days: [] }),
      resolveMergedFile: vi.fn().mockResolvedValue({
        path: "/tmp/org-a/run/2026-07-01/file.pdf",
        fileName: "file.pdf",
        sizeBytes: 1,
      }),
    } satisfies CoupangShipmentFileStoragePort;
    const service = new CoupangShipmentsService(storage, makeDateSummaryRepo());

    await service.listLocalFiles("org-a");
    await service.resolveLocalFile("org-a", {
      runId: "run",
      date: "2026-07-01",
      fileName: "file.pdf",
    });

    expect(storage.listMergedFiles).toHaveBeenCalledWith("org-a");
    expect(storage.resolveMergedFile).toHaveBeenCalledWith("org-a", {
      runId: "run",
      date: "2026-07-01",
      fileName: "file.pdf",
    });
  });

  it("reads the persisted 발송일 요약 through the date-summary repository", async () => {
    const storage = {
      listMergedFiles: vi.fn(),
      resolveMergedFile: vi.fn(),
    } satisfies CoupangShipmentFileStoragePort;
    const dateSummary = makeDateSummaryRepo();
    (dateSummary.listDateSummary as ReturnType<typeof vi.fn>).mockResolvedValue(
      [
        {
          date: "2026-07-20",
          count: 12,
          boxes: 30,
          capturedAt: "2026-07-20T00:00:00.000Z",
        },
      ],
    );
    const service = new CoupangShipmentsService(storage, dateSummary);

    const result = await service.listDateSummary("org-a");

    expect(dateSummary.listDateSummary).toHaveBeenCalledWith("org-a");
    expect(result).toEqual({
      items: [
        {
          date: "2026-07-20",
          count: 12,
          boxes: 30,
          capturedAt: "2026-07-20T00:00:00.000Z",
        },
      ],
    });
  });
});
