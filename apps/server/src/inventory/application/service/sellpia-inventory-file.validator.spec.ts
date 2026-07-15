import { BadRequestException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import * as XLSX from 'xlsx';
import { SellpiaInventoryFileValidator } from './sellpia-inventory-file.validator';

describe('SellpiaInventoryFileValidator', () => {
  const validator = new SellpiaInventoryFileValidator();

  it.each([
    ['OLE2', ole2Buffer(), 'application/vnd.ms-excel'],
    ['XLSX', xlsxBuffer(), 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'],
    ['CSV', Buffer.from('\uFEFF상품코드,상품명,재고\nSP-001,상품,3'), 'text/csv'],
    ['TSV', Buffer.from('상품 코드\t상품명\t재 고\nSP-001\t상품\t3'), 'text/tab-separated-values'],
    [
      'CP949 CSV',
      Buffer.concat([
        Buffer.from('bbf3c7b0c4dab5e52cc0e7b0ed0a', 'hex'),
        Buffer.from('SP-001,3'),
      ]),
      'text/csv',
    ],
  ])('accepts a supported %s envelope', (_label, buffer, mimeType) => {
    expect(() => validator.validate({ buffer, mimeType })).not.toThrow();
  });

  it.each([
    '<!doctype html><html><body>login</body></html>',
    '<html><form action="/login">Sellpia 로그인</form></html>',
  ])('rejects an HTML/login response without including its bytes', (content) => {
    let error: unknown;
    try {
      validator.validate({ buffer: Buffer.from(content), mimeType: 'text/html' });
    } catch (caught) {
      error = caught;
    }
    expect(error).toBeInstanceOf(BadRequestException);
    expect((error as BadRequestException).message).not.toContain(content);
  });

  it('rejects a valid workbook magic under an unapproved MIME type', () => {
    expect(() => validator.validate({
      buffer: xlsxBuffer(),
      mimeType: 'application/pdf',
    })).toThrow(BadRequestException);
  });

  it('rejects an allowed MIME type when the bytes have no supported magic', () => {
    expect(() => validator.validate({
      buffer: Buffer.from('not a Sellpia workbook'),
      mimeType: 'application/vnd.ms-excel',
    })).toThrow(BadRequestException);
  });
});

function xlsxBuffer(): Buffer {
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(
    workbook,
    XLSX.utils.aoa_to_sheet([['상품코드', '재고'], ['SP-001', 1]]),
    'Sheet1',
  );
  return Buffer.from(XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' }));
}

function ole2Buffer(): Buffer {
  return Buffer.concat([
    Buffer.from('d0cf11e0a1b11ae1', 'hex'),
    Buffer.alloc(504),
  ]);
}
