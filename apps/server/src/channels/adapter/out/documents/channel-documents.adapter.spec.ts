import { describe, expect, it } from 'vitest';
import * as XLSX from 'xlsx';
import type { ChannelDocumentsPort } from '../../../application/port/out/documents/channel-documents.port';
import { ChannelsDocumentsAdapter } from './channel-documents.adapter';

const documents: ChannelDocumentsPort = new ChannelsDocumentsAdapter();

describe('Channels document boundary', () => {
  it('accepts browser-compatible CSV bytes without requiring a Node Buffer', () => {
    const headers = ['쿠팡공급사_상품명', '바코드', 'skuId', 'vendorItemId', '셀피아상품', '셀피아바코드', '매칭방식', '신뢰도', '셀피아저장매칭', 'KidItem동기화', '매칭상태', '근거'];
    const bytes = new TextEncoder().encode(headers.join(',') + '\n원본 상품,8801,sku-1,vendor-1,셀피아 상품,8802,barcode,1,Y,Y,matched,원본');
    const result = documents.parseRocketMatchingCsv(bytes);
    expect(result.rows[0]).toMatchObject({ externalSkuId: 'sku-1', vendorItemId: 'vendor-1', productName: '원본 상품', channelBarcode: '8801' });
  });

  it('decodes multipart Korean filenames at the document boundary', () => {
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([
      ['상품명', '품번코드', '옵션제목1'], ['상품', 'KID-1', '색상'],
    ]), 'Sheet1');
    const bytes = new Uint8Array(XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' }));
    const originalName = '사방넷상품대량수정.xlsx';
    const multipartName = Buffer.from(originalName, 'utf8').toString('latin1');
    expect(documents.parseSabangnetWorkbook(bytes, multipartName)).toMatchObject({ kind: 'products', name: originalName, rows: [{ goodsNo: 'KID-1', name: '상품' }] });
  });
});
