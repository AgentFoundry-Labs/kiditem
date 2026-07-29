import * as XLSX from 'xlsx';

const SELLPIA_ORDER_NUMBER_HEADERS = [
  '판매처주문번호',
  '주문번호',
  '주문코드',
] as const;
const MAX_SELLPIA_INVOICE_TARGETS = 10_000;

function normalizedHeader(value: unknown): string {
  return String(value ?? '').replace(/\s+/g, '');
}

function normalizedOrderNumber(value: unknown): string {
  return String(value ?? '').trim();
}

/**
 * Reads the exact order identifiers written into the Sellpia upload workbook.
 * These identifiers are later used to select only this upload's invoice rows.
 */
export async function extractSellpiaOrderNumbers(blob: Blob): Promise<string[]> {
  const workbook = XLSX.read(await blob.arrayBuffer(), {
    type: 'array',
    cellDates: false,
  });
  const orderNumbers = new Set<string>();

  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName];
    if (!sheet) continue;
    const rows = XLSX.utils.sheet_to_json<Array<unknown>>(sheet, {
      header: 1,
      raw: false,
      defval: '',
    });
    const header = findOrderNumberHeader(rows);
    if (!header) continue;

    for (let rowIndex = header.rowIndex + 1; rowIndex < rows.length; rowIndex += 1) {
      const value = normalizedOrderNumber(rows[rowIndex]?.[header.columnIndex]);
      if (!value || normalizedHeader(value) === header.header) continue;
      orderNumbers.add(value);
      if (orderNumbers.size > MAX_SELLPIA_INVOICE_TARGETS) {
        throw new Error(
          `송장채번 대상 주문이 ${MAX_SELLPIA_INVOICE_TARGETS.toLocaleString()}건을 초과합니다.`,
        );
      }
    }
  }

  return [...orderNumbers];
}

function findOrderNumberHeader(
  rows: Array<Array<unknown>>,
): { rowIndex: number; columnIndex: number; header: string } | null {
  for (const candidate of SELLPIA_ORDER_NUMBER_HEADERS) {
    for (let rowIndex = 0; rowIndex < rows.length; rowIndex += 1) {
      const columnIndex = (rows[rowIndex] ?? [])
        .findIndex((value) => normalizedHeader(value) === candidate);
      if (columnIndex >= 0) {
        return { rowIndex, columnIndex, header: candidate };
      }
    }
  }
  return null;
}
