import { readCoupangCatalogSheet, applyCoupangCatalogEdits } from './coupang-wing/catalog-edit.adapter';
import type { CoupangCatalogEdit } from '../../../domain/registration/bulk-sheet/coupang-catalog-edit';
import { BadRequestException, Injectable } from '@nestjs/common';
import type { ChannelDocumentsPort } from '../../../application/port/out/documents/channel-documents.port';
import { parseCoupangWingWorkbook } from './coupang-wing/workbook.parser';
import { parseRocketSellpiaMatchingCsv } from './rocket/matching-csv.parser';
import { parseSabangnetWorkbook, SabangnetWorkbookFormatError } from './sabangnet/product-workbook.parser';
import { CoupangWingRegistrationExportService } from './coupang-wing/registration-workbook.adapter';
import { CoupangWingInventoryExportService } from './coupang-wing/inventory-workbook.adapter';

@Injectable()
export class ChannelsDocumentsAdapter implements ChannelDocumentsPort {
  readCoupangCatalog(bytes: Uint8Array) { return readCoupangCatalogSheet(bytes); }
  applyCoupangCatalog(bytes: Uint8Array, edits: readonly CoupangCatalogEdit[]) { return applyCoupangCatalogEdits(bytes, edits); }
  parseWingWorkbook(bytes: Uint8Array) { return parseCoupangWingWorkbook(Buffer.from(bytes)); }
  parseRocketMatchingCsv(bytes: Uint8Array) { return parseRocketSellpiaMatchingCsv(Buffer.from(bytes)); }
  parseSabangnetWorkbook(bytes: Uint8Array, name: string) {
    try { return parseSabangnetWorkbook(Buffer.from(bytes), decodeFileName(name)); }
    catch (error) {
      if (error instanceof SabangnetWorkbookFormatError) throw new BadRequestException(error.message);
      throw error;
    }
  }
  exportWingRegistration(template: Uint8Array, products: unknown, fileName?: string) {
    return new CoupangWingRegistrationExportService().convert(Buffer.from(template), products, fileName);
  }
  exportWingInventory(products: unknown, now: Date, fileName?: string) {
    return new CoupangWingInventoryExportService().convert(products, now, fileName);
  }
}

/** Multipart filenames may arrive as latin1-encoded UTF-8. */
function decodeFileName(name: string): string {
  const decoded = Buffer.from(name, 'latin1').toString('utf8');
  return decoded.includes('�') ? name : decoded;
}
