import * as XLSX from 'xlsx';
import { describe, expect, it } from 'vitest';
import { orderNumbersFromSellpiaFile, sellpiaOrderNumbersFromFile } from './sellpia-order-targets';

function workbook(rows: unknown[][], bookType: XLSX.BookType = 'xlsx'): Buffer {
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet(rows), 'orders');
  return XLSX.write(book, { type: 'buffer', bookType }) as Buffer;
}

describe('셀피아 전송 대상 주문번호 — 변환 파일의 판매처주문번호|주문번호|주문코드 머리(웹 규칙 이식)', () => {
  it('판매처주문번호 머리가 주문번호보다 먼저이고, 빈 칸·반복 머리·중복은 뺀다', () => {
    const bytes = workbook([
      ['안내'],
      ['주문번호', '판매처 주문번호', '수취인'],
      ['X-1', 'A-1', '가'],
      ['X-2', ' A-2 ', '나'],
      ['X-3', '', '다'],
      ['주문번호', '판매처주문번호', '수취인'],
      ['X-4', 'A-1', '라'],
    ]);
    expect(sellpiaOrderNumbersFromFile(bytes)).toEqual(['A-1', 'A-2']);
  });

  it('구형 xls와 UTF-8 CSV(아트공구)도 읽는다', () => {
    expect(sellpiaOrderNumbersFromFile(workbook([['주문코드'], ['K-1']], 'biff8'))).toEqual(['K-1']);
    const csv = Buffer.from('\uFEFF수취인,주문번호\n가,C-1\n나,C-2\n', 'utf8');
    expect(sellpiaOrderNumbersFromFile(csv)).toEqual(['C-1', 'C-2']);
  });

  it('직배송 생성기의 머리 "판매처 주문번호\\n(예,20221115_0001)"처럼 괄호 설명이 붙어도 앞부분으로 찾는다', () => {
    const bytes = workbook([['No', '판매처 주문번호\n(예,20221115_0001)', '주문번호메모'], ['1', '20260929_0001', 'x'], ['2', '20260929_0002', 'y']], 'biff8');
    expect(sellpiaOrderNumbersFromFile(bytes)).toEqual(['20260929_0001', '20260929_0002']);
  });

  it('머리가 없으면 빈 목록이다', () => {
    expect(sellpiaOrderNumbersFromFile(workbook([['수취인'], ['가']]))).toEqual([]);
  });

  it('1만 건을 넘으면 검증 오류다', () => {
    const rows: unknown[][] = [['주문번호']];
    for (let i = 0; i <= 10_000; i += 1) rows.push([`N-${i}`]);
    expect(() => sellpiaOrderNumbersFromFile(workbook(rows))).toThrow(expect.objectContaining({ code: 'VALIDATION_FAILED' }));
  });

  it('수집 result용 읽기는 상한 없이 모두 뽑는다 — 전송 대상 1만 상한은 전송에만 건다(수집을 실패시키지 않는다, KID-234)', () => {
    const rows = [['주문번호'], ...Array.from({ length: 10_001 }, (_, index) => [`N-${index}`])];
    const bytes = workbook(rows);
    expect(orderNumbersFromSellpiaFile(bytes)).toHaveLength(10_001);
    expect(() => sellpiaOrderNumbersFromFile(bytes)).toThrow();
  });
});
