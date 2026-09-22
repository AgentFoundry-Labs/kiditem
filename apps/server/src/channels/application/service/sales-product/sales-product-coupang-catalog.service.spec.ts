import { expect, it } from 'vitest';
import * as XLSX from 'xlsx';
import { ChannelsDocumentsAdapter } from '../../../adapter/out/documents/channel-documents.adapter';
import { SalesProductCoupangCatalogService } from './sales-product-coupang-catalog.service';

it('plans and exports original workbook bytes through the document capability without exposing workbook state', async () => {
  const headers = ['등록상품ID', '등록상품명', '쿠팡 노출상품명', '제조사', '브랜드', '검색어', '성인상품여부(Y/N)', '모델번호', '바코드', '옵션 ID'];
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet([
    ['Catalog Template_Ver.1.2'], ['안내'], [], headers,
    ['product-1', '관측 이름', '노출 이름', '기존 제조사', '', '', 'N', '', '', 'option-1'],
  ]), 'Template');
  XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet([['기존 안내']]), 'Help');
  const bytes = new Uint8Array(XLSX.write(book, { type: 'buffer', bookType: 'xlsx' }));
  const documents = new ChannelsDocumentsAdapter();
  const service = new SalesProductCoupangCatalogService({
    readCoupangCatalogFacts: async () => [{ optionId: 'option-1', manufacturer: '새 제조사', modelNo: 'KI-1', barcode: '88001', brand: '상호', keywords: [], salesProductCode: 'SP-1' }],
  } as never, documents);
  const plan = await service.plan('org', bytes);
  expect(plan).toMatchObject({ changedRows: 1, changedCells: 2, conflicts: 1 });
  const result = await service.file('org', bytes, 'original.xlsx');
  expect(result).toMatchObject({ fileName: 'original_수정요청.xlsx', changedRows: 1, changedCells: 2 });
  const parsed = documents.readCoupangCatalog(result.buffer);
  expect(parsed).not.toHaveProperty('workbook');
  expect(parsed.rows[0].values).toMatchObject({ 등록상품ID: 'product-1', 등록상품명: '관측 이름', 제조사: '기존 제조사', 브랜드: '', 모델번호: 'KI-1', 바코드: '88001' });
  expect(XLSX.read(result.buffer, { type: 'buffer' }).SheetNames).toEqual(['Template', 'Help']);
  expect(documents.readCoupangCatalog(bytes).rows[0].values['모델번호']).toBe('');
});
