// Outgoing port for advertising-side collection status reads: the snapshot the
// extension-status endpoint serves.

export const ADVERTISING_EXTENSION_STATUS_REPOSITORY_PORT = Symbol(
  'AdvertisingExtensionStatusRepositoryPort',
);

export interface ExtensionStatusLatestListing {
  isOfferWinner: boolean | null;
  lastObservedAt: Date;
}

export interface ExtensionStatusLatestRun {
  finishedAt: Date | null;
  startedAt: Date | null;
  pageType: string | null;
}

export interface ExtensionStatusWingKpi {
  normalizedJson: Record<string, unknown> | null;
  lastObservedAt: Date | null;
}

export interface ExtensionStatusSnapshot {
  listingCount: number;
  latestPerListing: ExtensionStatusLatestListing[];
  rawSnapshotCount: number;
  latestRun: ExtensionStatusLatestRun | null;
  wingKpi: ExtensionStatusWingKpi | null;
}

export interface AdvertisingExtensionStatusRepositoryPort {
  /**
   * Single-pass read of every column the extension-status endpoint needs:
   * listing count, latest per-listing winner state, raw snapshot count,
   * latest run, and the wing-kpi row. Used by `AdvertisingExtensionService`.
   */
  findExtensionStatusSnapshot(
    organizationId: string,
  ): Promise<ExtensionStatusSnapshot>;
}
