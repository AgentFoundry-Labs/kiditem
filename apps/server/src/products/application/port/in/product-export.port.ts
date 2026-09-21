import type { ProductSourceSnapshotListQuery } from './product-source-snapshot.port';

export const PRODUCT_EXPORT_PORT = Symbol('PRODUCT_EXPORT_PORT');

export type ProductExportResult = {
  buffer: Buffer;
  fileName: string;
  contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
  rowCount: number;
};

export interface ProductExportPort {
  export(
    organizationId: string,
    query: ProductSourceSnapshotListQuery,
  ): Promise<ProductExportResult>;
}
