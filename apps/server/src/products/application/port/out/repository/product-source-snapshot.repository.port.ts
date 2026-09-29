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
  lastOperationId: string | null;
  lastImportedAt: Date | null;
  linkedChannelOptionCount: number;
  linkedProductCount: number;
  linkedProducts: ProductSourceSnapshotLinkedProduct[];
  linkedChannelOptions: ProductSourceSnapshotLinkedChannelOption[];
}>;

/** 지금 재고를 발행한 셀피아 재고 실행(상태 행의 `lastCompletedOperationId`·`lastVerifiedAt`·`verifiedGeneration`). */
export type ProductSourceLatestCollectionRow = Readonly<{
  operationId: string;
  completedAt: Date;
  generation: bigint;
}>;

export interface ProductSourceSnapshotRepositoryPort {
  listSnapshot(
    organizationId: string,
    query: ProductSourceSnapshotQuery,
  ): Promise<{
    rows: ProductSourceSnapshotRow[];
    total: number;
    summary: ProductSourceSnapshotSummary;
    latestCollection: ProductSourceLatestCollectionRow | null;
  }>;

  getSnapshot(
    organizationId: string,
    masterProductId: string,
  ): Promise<ProductSourceSnapshotRow | null>;
}
