import type {
  InventorySkuSnapshotListQuery,
} from './inventory-sku-snapshot-list.port';

export const INVENTORY_SKU_EXPORT_PORT = Symbol('INVENTORY_SKU_EXPORT_PORT');

export type InventorySkuExportResult = {
  buffer: Buffer;
  fileName: string;
  contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
  rowCount: number;
};

export interface InventorySkuExportPort {
  export(
    organizationId: string,
    query: InventorySkuSnapshotListQuery,
  ): Promise<InventorySkuExportResult>;
}
