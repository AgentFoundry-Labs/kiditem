import type { ProductSourceSnapshotSummary } from '../../in/product-source-snapshot.port';

export const PRODUCT_SOURCE_SNAPSHOT_REPOSITORY_PORT = Symbol(
  'PRODUCT_SOURCE_SNAPSHOT_REPOSITORY_PORT',
);

export type ProductSourceSnapshotQuery = {
  skip: number;
  take?: number;
  query?: string;
  stockStatus: 'all' | 'in_stock' | 'out_of_stock';
  linkStatus?: 'linked' | 'unlinked';
};

export type ProductSourceSnapshotLinkedProduct = Readonly<{
  id: string;
  code: string;
  name: string;
}>;

export type ProductSourceSnapshotLinkedChannelOption = Readonly<{
  id: string;
  masterProductId: string;
  channelListingId: string;
  channel: string;
  externalOptionId: string;
  itemName: string | null;
}>;

export type ProductSourceSnapshotRow = Readonly<{
  masterProductId: string;
  code: string;
  name: string;
  optionName: string | null;
  barcode: string | null;
  currentStock: number;
  purchasePrice: number | null;
  lastImportRunId: string | null;
  lastImportedAt: Date | null;
  linkedChannelOptionCount: number;
  linkedProductCount: number;
  linkedProducts: ProductSourceSnapshotLinkedProduct[];
  linkedChannelOptions: ProductSourceSnapshotLinkedChannelOption[];
}>;

export type ProductSourceImportRunRow = Readonly<{
  id: string;
  fileName: string | null;
  fileHash: string | null;
  status: string;
  rowCount: number;
  importedAt: Date | null;
  lastVerifiedAt: Date | null;
  verificationCount: number;
  lastTrigger: string | null;
  freshnessGeneration: bigint | null;
  manualFreshExportConfirmedAt: Date | null;
  manualFreshExportConfirmedBy: string | null;
  qualityReport: unknown;
  errorCode: string | null;
  errorMessage: string | null;
  createdAt: Date;
  updatedAt: Date;
}>;

export interface ProductSourceSnapshotRepositoryPort {
  listSnapshot(
    organizationId: string,
    query: ProductSourceSnapshotQuery,
  ): Promise<{
    rows: ProductSourceSnapshotRow[];
    total: number;
    summary: ProductSourceSnapshotSummary;
    latestImport: ProductSourceImportRunRow | null;
  }>;

  getSnapshot(
    organizationId: string,
    masterProductId: string,
  ): Promise<ProductSourceSnapshotRow | null>;

  listImportRuns(
    organizationId: string,
    query: { skip: number; take: number },
  ): Promise<{
    rows: ProductSourceImportRunRow[];
    total: number;
  }>;
}
