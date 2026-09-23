import { describe, expect, it } from 'vitest';
import * as XLSX from 'xlsx';
import type { ChannelDocumentsPort } from '../../../application/port/out/documents/channel-documents.port';
import { ChannelsDocumentsAdapter } from './channel-documents.adapter';
import { ChannelIntegrityAdapter } from '../integrity/channel-integrity.adapter';

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

  describe('Sabangnet product source raw', () => {
    const sha256 = new ChannelIntegrityAdapter().sha256;
    const headers = [
      '품번코드', '상품명', '자체상품코드', '브랜드명', '옵션제목(1)', '옵션상세명칭(1)', '대표이미지', '부가이미지2',
      '상품상세설명', '추가상품상세설명_1', '추가상품상세설명_2', '속성분류코드', '속성값1', '속성값2', '인증번호', '인증기관',
      '수입신고번호', '관리자메모', '사이트검색어', '판매가',
    ];
    const cells = [
      '100017', '투명우산 그리기', 'OWN-100017', '키드아이템', '단품', '단품', 'https://pic.sabangnet.co.kr/a.jpg',
      'https://pic.sabangnet.co.kr/b.jpg', '<p>상세</p>', '', '<p>추가</p>', '35', '면', '중국', 'CB-1', 'KTR',
      'IMP-1', '메모', '우산,미술', 2880,
    ];

    function parse(rowCells: (string | number)[]) {
      const book = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet([headers, rowCells]), 'Sheet1');
      const bytes = new Uint8Array(XLSX.write(book, { type: 'buffer', bookType: 'xlsx' }));
      const parsed = documents.parseSabangnetWorkbook(bytes, 'products.xlsx');
      if (parsed.kind !== 'products') throw new Error('expected products');
      return parsed.rows[0]!;
    }

    it('keeps a digest of each mapped detail in the raw row instead of the HTML itself', () => {
      const row = parse(cells);

      expect(row.raw['#digest:상품상세설명']).toBe(sha256('<p>상세</p>'));
      expect(row.raw['#digest:추가상품상세설명']).toBe(sha256('<p>추가</p>'));
      expect(Object.values(row.raw)).not.toContain('<p>상세</p>');

      const blank = parse(cells.map((cell, index) => (headers[index]!.includes('상세설명') ? '' : cell)));
      expect(blank.raw['#digest:상품상세설명']).toBe('');
      expect(blank.raw['#digest:추가상품상세설명']).toBe('');
    });

    it('reads a stored raw row back into the row the file produced', () => {
      const row = parse(cells);

      const source = documents.readSabangnetProductSource(JSON.parse(JSON.stringify(row.raw)));

      const { raw: _raw, row: _line, detailHtml: _detail, extraDetailHtml: _extra, ...facts } = row;
      expect(source).toMatchObject(facts);
    });

    it('reads a raw row stored before detail digests the same way, and no row for a non-record', () => {
      const row = parse(cells);
      const legacy = Object.fromEntries(Object.entries(row.raw).filter(([key]) => !key.startsWith('#digest:')));

      expect(documents.readSabangnetProductSource(legacy)).toMatchObject({ name: '투명우산 그리기', brand: '키드아이템' });
      expect(documents.readSabangnetProductSource(null)).toBeNull();
      expect(documents.readSabangnetProductSource(['a'])).toBeNull();
    });
  });
});
