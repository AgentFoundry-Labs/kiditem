import { ProductSourceInputError } from '../exception/product-source.error';
import { Inject, Injectable } from '@nestjs/common';
import {
  PRODUCT_SOURCE_SNAPSHOT_PORT,
  type ProductSourceSnapshotPort,
  type ProductSourceSnapshotListQuery,
} from '../port/in/product-source-snapshot.port';
import type {
  ProductExportPort,
  ProductExportResult,
} from '../port/in/product-export.port';
import type { ProductSourceSnapshotItem } from '../port/in/product-source-snapshot.port';
import {
  PRODUCT_SOURCE_EXPORT_RENDERER_PORT,
  type ProductSourceExportRendererPort,
  type ProductSourceExportRow,
} from '../port/out/documents/product-source-export-renderer.port';

@Injectable()
export class ProductExportUseCase implements ProductExportPort {
  constructor(
    @Inject(PRODUCT_SOURCE_SNAPSHOT_PORT)
    private readonly snapshots: ProductSourceSnapshotPort,
    @Inject(PRODUCT_SOURCE_EXPORT_RENDERER_PORT)
    private readonly renderer: ProductSourceExportRendererPort,
  ) {}

  async export(
    organizationId: string,
    query: ProductSourceSnapshotListQuery,
  ): Promise<ProductExportResult> {
    const snapshot = await this.snapshots.listSnapshotForExport(
      organizationId,
      filtersOnly(query),
    );

    if (snapshot.items.length !== snapshot.total) {
      throw new ProductSourceInputError('재고 엑셀 데이터를 끝까지 조회하지 못했습니다. 다시 시도해주세요.');
    }

    const rows = snapshot.items.map(toProductExportRow);
    const document = this.renderer.render(rows);

    return {
      buffer: document.buffer,
      fileName: `Sellpia_현재재고_${new Date().toISOString().slice(0, 10)}.xlsx`,
      contentType: document.contentType,
      rowCount: rows.length,
    };
  }
}

function filtersOnly(query: ProductSourceSnapshotListQuery): ProductSourceSnapshotListQuery {
  return {
    query: query.query,
    stockStatus: query.stockStatus,
    linkStatus: query.linkStatus,
  };
}

export function toProductExportRow(item: ProductSourceSnapshotItem): ProductSourceExportRow {
  return {
    셀피아상품코드: item.code,
    상품명: item.name,
    옵션: item.optionName ?? '',
    바코드: item.barcode ?? '',
    현재고: item.currentStock,
    매입가: item.purchasePrice ?? '',
    재고자산: item.stockValue ?? '',
    최종가져오기: item.lastImportedAt ?? '',
  };
}
