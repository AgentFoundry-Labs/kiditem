import { KiditemInvalidValueError } from '@kiditem/shared/errors';
import { SELLPIA_TRANSFER_TARGETS_MAX } from '@kiditem/shared/orders-action-operations';
import * as XLSX from 'xlsx';

/** 셀피아 업로드 파일에서 주문번호 칸을 찾는 머리(앞이 우선). 웹 `sellpia-order-targets.ts`의 규칙을 서버로 옮겼다(KID-355). */
const ORDER_NUMBER_HEADERS = ['판매처주문번호', '주문번호', '주문코드'] as const;

/**
 * 셀피아 전송 대상 주문번호: 변환 파일(xlsx·xls·UTF-8 CSV)의 시트마다 첫 머리 칸 아래 값. 빈 칸·반복 머리·중복은 뺀다.
 * 이 번호들이 뒤의 자동송장 대상을 정하므로(선택된 번호만 채번) 파일에 실제로 적힌 값만 쓴다.
 */
export function sellpiaOrderNumbersFromFile(bytes: Buffer): string[] {
  const book = readBook(bytes);
  const orderNumbers = new Set<string>();
  for (const sheetName of book.SheetNames) {
    const sheet = book.Sheets[sheetName];
    if (!sheet) continue;
    const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, raw: false, defval: '' });
    const header = findHeader(rows);
    if (!header) continue;
    for (let rowIndex = header.rowIndex + 1; rowIndex < rows.length; rowIndex += 1) {
      const value = String(rows[rowIndex]?.[header.columnIndex] ?? '').trim();
      if (!value || normalizedHeader(value) === header.header) continue;
      orderNumbers.add(value);
      if (orderNumbers.size > SELLPIA_TRANSFER_TARGETS_MAX) {
        throw new KiditemInvalidValueError('VALIDATION_FAILED', {
          details: { reason: 'too_many_transfer_targets', max: SELLPIA_TRANSFER_TARGETS_MAX },
        });
      }
    }
  }
  return [...orderNumbers];
}

/** zip(xlsx)·OLE(xls)가 아니면 텍스트(CSV)로 보고 UTF-8로 푼다 — SheetJS가 BOM 없는 CSV를 latin1로 읽지 않게. */
function readBook(bytes: Buffer): XLSX.WorkBook {
  const isZip = bytes[0] === 0x50 && bytes[1] === 0x4b;
  const isOle = bytes[0] === 0xd0 && bytes[1] === 0xcf;
  if (isZip || isOle) return XLSX.read(bytes, { type: 'buffer', cellDates: false });
  return XLSX.read(bytes.toString('utf8').replace(/^\uFEFF/, ''), { type: 'string', cellDates: false });
}

function findHeader(rows: unknown[][]): { rowIndex: number; columnIndex: number; header: string } | null {
  for (const candidate of ORDER_NUMBER_HEADERS) {
    for (let rowIndex = 0; rowIndex < rows.length; rowIndex += 1) {
      const columnIndex = (rows[rowIndex] ?? []).findIndex((value) => normalizedHeader(value) === candidate);
      if (columnIndex >= 0) return { rowIndex, columnIndex, header: candidate };
    }
  }
  return null;
}

/** 공백·줄바꿈을 빼고 괄호 설명 앞부분만 본다 — 직배송 양식의 머리는 `판매처 주문번호\n(예,20221115_0001)`이다. */
function normalizedHeader(value: unknown): string {
  return String(value ?? '').replace(/\s+/g, '').split(/[(（]/)[0] ?? '';
}
