import { Injectable } from '@nestjs/common';
import * as XLSX from 'xlsx';
import type {
  ProductSourceExportDocument,
  ProductSourceExportRendererPort,
  ProductSourceExportRow,
} from '../../../application/port/out/documents/product-source-export-renderer.port';

@Injectable()
export class ProductSourceXlsxExporterAdapter
implements ProductSourceExportRendererPort {
  render(rows: readonly ProductSourceExportRow[]): ProductSourceExportDocument {
    const workbook = XLSX.utils.book_new();
    const sheet = XLSX.utils.json_to_sheet([...rows]);
    XLSX.utils.book_append_sheet(workbook, sheet, 'Sellpia 현재재고');
    return {
      buffer: Buffer.from(XLSX.write(workbook, {
        type: 'buffer',
        bookType: 'xlsx',
      })),
      contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    };
  }
}
