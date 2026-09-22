import * as XLSX from 'xlsx';
import {
  COUPANG_CATALOG_EDITABLE_COLUMNS,
  type CoupangCatalogEditableColumn,
  type CoupangCatalogEdit,
  type CoupangCatalogEditResult,
  type CoupangCatalogSheet,
  type CoupangCatalogSheetRow,
} from '../../../../domain/registration/bulk-sheet/coupang-catalog-edit';

const TEMPLATE_MARKER = 'Catalog Template_Ver.1.2';
const TEMPLATE_SHEET = 'Template';
const HEADER_ROW = 3;
const ROW_KEY_COLUMN = '옵션 ID';
const SEARCH_TAG_COLUMN = '검색어';
const SEARCH_TAG_MAX = 40;

export function readCoupangCatalogSheet(bytes: Uint8Array): CoupangCatalogSheet {
  const { header, rows } = readWorkbook(bytes);
  return { header, rows };
}

/** 실제로 값이 있는 칸으로 다시 센 시트 범위. 시트가 적어 둔 `!ref` 는 믿지 않는다. */
export function coupangCatalogUsedRange(sheet: XLSX.WorkSheet): string {
  let lastRow = 0;
  let lastColumn = 0;
  for (const address of Object.keys(sheet)) {
    if (address.startsWith('!')) continue;
    const cell = XLSX.utils.decode_cell(address);
    if (cell.r > lastRow) lastRow = cell.r;
    if (cell.c > lastColumn) lastColumn = cell.c;
  }
  return XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: lastRow, c: lastColumn } });
}

function cellText(value: unknown): string {
  if (value === null || value === undefined) return '';
  return String(value).trim();
}

/**
 * 윙이 내려준 파일을 읽는다. 양식 판이 다르거나 칸 이름 줄이 우리가 아는 모양이 아니면 던진다 —
 * 자리를 짐작해 쓰면 엉뚱한 칸을 고친다.
 */
function readWorkbook(bytes: Uint8Array): CoupangCatalogSheet & { workbook: XLSX.WorkBook } {
  const workbook = XLSX.read(Buffer.from(bytes), { type: 'buffer', cellStyles: true });
  const sheet = workbook.Sheets[TEMPLATE_SHEET];
  if (!sheet) {
    throw new Error(`쿠팡상품정보 엑셀에 '${TEMPLATE_SHEET}' 시트가 없습니다.`);
  }
  // 윙 파일은 자기 범위를 'A1:HW4'(머리 네 줄)로 적어 놓고 그 아래에 상품 줄을 쌓는다.
  // 엑셀은 실제 칸을 보고 다시 세지만, 적힌 범위를 믿고 읽으면 2,274 줄짜리 파일이
  // 빈 양식으로 보인다(실측 2026-09-22 `Coupang_detailinfo_260918.xlsx`).
  sheet['!ref'] = coupangCatalogUsedRange(sheet);
  const grid = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
    header: 1,
    blankrows: true,
    defval: null,
  });
  const marker = cellText(grid[0]?.[0]);
  if (marker !== TEMPLATE_MARKER) {
    throw new Error(
      `쿠팡상품정보 엑셀 양식이 '${TEMPLATE_MARKER}' 가 아닙니다(받은 값: '${marker}'). 칸 자리가 달라 고치지 않습니다.`,
    );
  }
  const header = (grid[HEADER_ROW] ?? []).map(cellText);
  const keyColumn = header.indexOf(ROW_KEY_COLUMN);
  if (keyColumn < 0) {
    throw new Error(`쿠팡상품정보 엑셀에 '${ROW_KEY_COLUMN}' 칸이 없습니다.`);
  }
  for (const column of COUPANG_CATALOG_EDITABLE_COLUMNS) {
    if (!header.includes(column)) {
      throw new Error(`쿠팡상품정보 엑셀에 '${column}' 칸이 없습니다.`);
    }
  }
  const rows: CoupangCatalogSheetRow[] = [];
  for (let rowIndex = HEADER_ROW + 1; rowIndex < grid.length; rowIndex += 1) {
    const row = grid[rowIndex];
    const optionId = cellText(row?.[keyColumn]);
    if (!optionId) continue;
    const values: Record<string, string> = {};
    header.forEach((name, column) => {
      if (name) values[name] = cellText(row?.[column]);
    });
    rows.push({ optionId, rowIndex, values });
  }
  return { workbook, header, rows };
}

/** 검색어는 쉼표로 나눠 1~40개여야 한다. 넘치면 몰이 그 줄을 통째로 거절한다. */
function assertSearchTags(value: string): void {
  const tags = value.split(',').map((tag) => tag.trim()).filter(Boolean);
  if (tags.length === 0) {
    throw new Error('검색어는 최소 1개가 필요합니다.');
  }
  if (tags.length > SEARCH_TAG_MAX) {
    throw new Error(`검색어는 최대 ${SEARCH_TAG_MAX}개입니다(받은 값: ${tags.length}개).`);
  }
}

/**
 * 흰 칸만 고쳐 올릴 파일을 만든다. 회색 칸과 나머지 시트(`Help`)는 손대지 않는다.
 *
 * 값이 지금과 같으면 쓰지 않는다 — 바꾼 것이 없는데 바꿨다고 세면, 올린 뒤 실패 내역과 대조할
 * 때 숫자가 맞지 않는다.
 */
export function applyCoupangCatalogEdits(
  originalBytes: Uint8Array,
  edits: readonly CoupangCatalogEdit[],
): CoupangCatalogEditResult {
  const sheet = readWorkbook(originalBytes);
  const template = sheet.workbook.Sheets[TEMPLATE_SHEET]!;
  const byOptionId = new Map(sheet.rows.map((row) => [row.optionId, row]));
  const unknownOptionIds: string[] = [];
  let changed = 0;

  for (const edit of edits) {
    const row = byOptionId.get(edit.optionId);
    if (!row) {
      unknownOptionIds.push(edit.optionId);
      continue;
    }
    for (const [column, next] of Object.entries(edit.values)) {
      if (next === undefined) continue;
      if (!COUPANG_CATALOG_EDITABLE_COLUMNS.includes(column as CoupangCatalogEditableColumn)) {
        throw new Error(`'${column}' 는 회색 칸이라 고칠 수 없습니다.`);
      }
      if (column === SEARCH_TAG_COLUMN) assertSearchTags(next);
      if (cellText(next) === row.values[column]) continue;
      const columnIndex = sheet.header.indexOf(column);
      const address = XLSX.utils.encode_cell({ r: row.rowIndex, c: columnIndex });
      const existing = template[address];
      // 칸의 꾸밈(회색/흰색)은 그대로 두고 값만 바꾼다.
      template[address] = { ...(existing ?? {}), t: 's', v: next, w: next };
      changed += 1;
    }
  }

  // 윙이 준 줄을 하나도 빼지 않고 그대로 돌려준다 — 몰이 만든 모양이라 받아 준다는 것이 확실하다.
  // 같은 글자를 한 번만 담아(`bookSST`) 파일을 줄인다.
  const bytes = XLSX.write(sheet.workbook, { bookType: 'xlsx', type: 'buffer', bookSST: true }) as Buffer;
  return { bytes, changed, unknownOptionIds };
}
