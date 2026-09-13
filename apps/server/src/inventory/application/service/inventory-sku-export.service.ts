import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import * as XLSX from 'xlsx';
import {
  INVENTORY_SKU_SNAPSHOT_LIST_PORT,
  type InventorySkuSnapshotExportReader,
  type InventorySkuSnapshotListQuery,
} from '../port/in/stock/inventory-sku-snapshot-list.port';
import type {
  InventorySkuSnapshotItem,
} from '@kiditem/shared/inventory';
import type {
  InventorySkuExportPort,
  InventorySkuExportResult,
} from '../port/in/stock/inventory-sku-export.port';

@Injectable()
export class InventorySkuExportService implements InventorySkuExportPort {
  constructor(
    @Inject(INVENTORY_SKU_SNAPSHOT_LIST_PORT)
    private readonly snapshots: InventorySkuSnapshotExportReader,
  ) {}

  async export(
    organizationId: string,
    query: InventorySkuSnapshotListQuery,
  ): Promise<InventorySkuExportResult> {
    const snapshot = await this.snapshots.listSnapshotForExport(
      organizationId,
      filtersOnly(query),
    );

    if (snapshot.items.length !== snapshot.total) {
      throw new BadRequestException('재고 엑셀 데이터를 끝까지 조회하지 못했습니다. 다시 시도해주세요.');
    }

    const rows = snapshot.items.map(toInventoryExportRow);
    const workbook = XLSX.utils.book_new();
    const sheet = XLSX.utils.json_to_sheet(rows);
    XLSX.utils.book_append_sheet(workbook, sheet, 'Sellpia 현재재고');
    const buffer = Buffer.from(XLSX.write(workbook, {
      type: 'buffer',
      bookType: 'xlsx',
    }));

    return {
      buffer,
      fileName: `Sellpia_현재재고_${new Date().toISOString().slice(0, 10)}.xlsx`,
      contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      rowCount: rows.length,
    };
  }
}

function filtersOnly(query: InventorySkuSnapshotListQuery): InventorySkuSnapshotListQuery {
  return {
    query: query.query,
    stockStatus: query.stockStatus,
    activeStatus: query.activeStatus,
    linkStatus: query.linkStatus,
  };
}

export function toInventoryExportRow(item: InventorySkuSnapshotItem) {
  return {
    셀피아상품코드: item.code,
    상품명: item.name,
    옵션: item.optionName ?? '',
    바코드: item.barcode ?? '',
    현재고: item.currentStock,
    매입가: item.purchasePrice ?? '',
    판매가: item.salePrice ?? '',
    재고자산: item.stockValue ?? '',
    최종가져오기: item.lastImportedAt ?? '',
  };
}
