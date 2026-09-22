import * as XLSX from 'xlsx';

/**
 * 쿠팡 윙 **쿠팡상품정보 수정요청** 엑셀 (윙 › 상품관리 › 상품조회/수정 › 엑셀 대량 수정).
 *
 * 신규 등록용 `sellertool_upload.xlsm`(`coupang-wing.sheet.ts`)과 다른 물건이다. 저쪽은 없는
 * 상품을 만들고, 이쪽은 **이미 올라간 상품의 정보를 고쳐 달라고 제안**한다. 둘 다 쓴다
 * (사장님 2026-09-22: "둘다 기능을 유지해줘").
 *
 * 흐름은 윙이 정해 둔 네 단계다. 요청하면 쿠팡이 파일을 만들고(개수에 따라 최대 1시간),
 * 흰 칸만 고쳐 다시 올리면, 업로드 목록에서 실패 내역을 받는다.
 *
 * **이것은 수정이 아니라 제안이다.** 안내문 그대로: "판매자는 쿠팡상품정보를 직접 수정하는
 * 대신 수정할 내용을 제안할 수 있습니다. 쿠팡 시스템은 여러 판매자가 수정 제안한 값 중 가장
 * 좋은 값을 선정해 상세페이지에 노출합니다." 그러므로 이 파일을 만들었다는 사실은 몰에 그
 * 값이 들어갔다는 뜻이 **아니다** — 올린 뒤 윙의 업로드 목록으로만 확인된다.
 *
 * 한 줄은 상품이 아니라 **옵션 하나**다(`옵션 ID`). 같은 상품의 옵션이 여러 줄로 선다.
 */

/** 양식 자신이 말하는 판. 모르는 판이면 건드리지 않는다 — 칸 자리가 바뀌면 엉뚱한 곳에 쓴다. */
const TEMPLATE_MARKER = 'Catalog Template_Ver.1.2';
const TEMPLATE_SHEET = 'Template';
/** 0부터 센 칸 이름 줄. 그 위 세 줄은 제목 · 안내 · 묶음 제목이다. */
const HEADER_ROW = 3;

/**
 * 고칠 수 있는 칸(흰 칸). 안내문의 "수정할 수 있습니다" 목록과 다운로드 요청 화면의 체크박스가
 * 똑같이 말하는 아홉 가지다. 나머지(등록상품ID · 등록상품명 · 카테고리 · 승인상태 · 판매상태 ·
 * 노출상품ID · 옵션 ID · 등록 옵션명)는 회색 칸이라 손대지 않는다.
 */
export const COUPANG_CATALOG_EDITABLE_COLUMNS = [
  '쿠팡 노출상품명',
  '제조사',
  '브랜드',
  '검색어',
  '성인상품여부(Y/N)',
  '모델번호',
  '바코드',
] as const;

export type CoupangCatalogEditableColumn = typeof COUPANG_CATALOG_EDITABLE_COLUMNS[number];

/** 줄을 찾는 열쇠. 옵션 ID 는 윙이 준 값이고 우리가 만들지 않는다. */
const ROW_KEY_COLUMN = '옵션 ID';

/** 검색어는 쉼표로 나눠 최소 1개, 최대 40개(안내문 4번). */
const SEARCH_TAG_COLUMN = '검색어';
const SEARCH_TAG_MAX = 40;

export type CoupangCatalogEdit = Readonly<{
  /** 윙이 준 옵션 ID. 이 값으로 줄을 찾는다. */
  optionId: string;
  values: Partial<Record<CoupangCatalogEditableColumn, string>>;
}>;

export type CoupangCatalogSheetRow = Readonly<{
  optionId: string;
  /** 0부터 센 실제 시트 줄 번호. */
  rowIndex: number;
  values: Readonly<Record<string, string>>;
}>;

export type CoupangCatalogSheet = Readonly<{
  workbook: XLSX.WorkBook;
  header: readonly string[];
  rows: readonly CoupangCatalogSheetRow[];
}>;

export type CoupangCatalogEditResult = Readonly<{
  bytes: Buffer;
  /** 실제로 값이 바뀐 칸 수. */
  changed: number;
  /** 그 옵션 ID 가 파일에 없어 건너뛴 수정. */
  unknownOptionIds: readonly string[];
}>;

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
export function readCoupangCatalogSheet(bytes: Buffer): CoupangCatalogSheet {
  const workbook = XLSX.read(bytes, { type: 'buffer', cellStyles: true });
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
  sheet: CoupangCatalogSheet,
  edits: readonly CoupangCatalogEdit[],
): CoupangCatalogEditResult {
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

/**
 * 윙 옵션 하나에 대해 **우리가 아는** 값. 우리 판매상품 · 단품에서만 온다. 모르는 값은 `null`
 * 이고, 채우지 않는다([ADR-0006](../../../../../../docs/adr/0006-a-displayed-number-is-a-measurement-or-nothing.md)).
 */
export type CoupangCatalogFacts = Readonly<{
  optionId: string;
  brand: string | null;
  manufacturer: string | null;
  modelNo: string | null;
  barcode: string | null;
  keywords: readonly string[];
  /** 이어진 판매상품 코드 — 사람이 어느 상품인지 알아보라고. */
  salesProductCode: string | null;
}>;

export type CoupangCatalogPlannedChange = Readonly<{
  column: CoupangCatalogEditableColumn;
  before: string;
  after: string;
}>;

export type CoupangCatalogPlanRow = Readonly<{
  optionId: string;
  listingName: string;
  optionName: string;
  salesProductCode: string | null;
  /** 우리 단품과 이어지지 않은 옵션. 채울 근거가 없다. */
  unlinked: boolean;
  changes: readonly CoupangCatalogPlannedChange[];
  /** 우리 값과 다르지만 몰에 이미 값이 있어 그대로 둔 칸. */
  conflicts: readonly CoupangCatalogPlannedChange[];
}>;

export type CoupangCatalogPlan = Readonly<{
  rows: readonly CoupangCatalogPlanRow[];
  edits: readonly CoupangCatalogEdit[];
  /** 칸별로 몇 줄을 채우는지. */
  byColumn: Readonly<Record<string, number>>;
}>;

/**
 * 우리가 채워 주는 칸과 그 값이 어디서 오는지. 나머지 흰 칸은 사람이 고른 값으로만 간다.
 *
 * `브랜드` 는 넣지 않는다. 우리 판매상품의 브랜드는 774 건 중 770 건이 `kiditem` — 우리 상호이지
 * 상품의 브랜드가 아니다(로컬 2026-09-22). 윙 안내문은 브랜드 칸에 **상품이 속한 브랜드**(없으면
 * 제조사 이름)를 적으라고 한다. 우리 상호를 넣으면 쿠팡 카탈로그에 틀린 브랜드를 제안하게 된다.
 */
const FILLABLE: readonly {
  column: CoupangCatalogEditableColumn;
  read: (facts: CoupangCatalogFacts) => string | null;
}[] = [
  { column: '제조사', read: (f) => f.manufacturer },
  { column: '모델번호', read: (f) => f.modelNo },
  { column: '바코드', read: (f) => f.barcode },
  {
    column: '검색어',
    read: (f) => {
      const tags = f.keywords.map((tag) => tag.trim()).filter(Boolean).slice(0, SEARCH_TAG_MAX);
      return tags.length ? tags.join(',') : null;
    },
  },
];

/**
 * 윙 파일 한 장과 우리가 아는 값을 맞대어, **빈 칸만** 채우는 수정 제안을 짠다.
 *
 * 이미 값이 있는 칸은 건드리지 않는다. 그 값은 어느 판매자가 제안해 쿠팡이 고른 값이고, 우리 값이
 * 더 맞다는 근거가 파일 안에 없다. 우리 값과 다른 칸은 `conflicts` 로 세어 사람이 보고 판단한다.
 *
 * `쿠팡 노출상품명` · `성인상품여부` 는 짜지 않는다 — 상세페이지에 그대로 나가는 값이라 사람이 고른다.
 */
export function planCoupangCatalogEdits(
  sheet: CoupangCatalogSheet,
  facts: readonly CoupangCatalogFacts[],
): CoupangCatalogPlan {
  const byOptionId = new Map(facts.map((fact) => [fact.optionId, fact]));
  const rows: CoupangCatalogPlanRow[] = [];
  const edits: CoupangCatalogEdit[] = [];
  const byColumn: Record<string, number> = {};

  for (const row of sheet.rows) {
    const fact = byOptionId.get(row.optionId);
    const changes: CoupangCatalogPlannedChange[] = [];
    const conflicts: CoupangCatalogPlannedChange[] = [];
    if (fact) {
      for (const field of FILLABLE) {
        const after = field.read(fact);
        if (after === null) continue;
        const before = row.values[field.column] ?? '';
        if (before === after) continue;
        if (before) {
          conflicts.push({ column: field.column, before, after });
          continue;
        }
        changes.push({ column: field.column, before, after });
        byColumn[field.column] = (byColumn[field.column] ?? 0) + 1;
      }
    }
    if (changes.length) {
      edits.push({
        optionId: row.optionId,
        values: Object.fromEntries(changes.map((change) => [change.column, change.after])),
      });
    }
    rows.push({
      optionId: row.optionId,
      listingName: row.values['등록상품명'] ?? '',
      optionName: row.values['등록 옵션명'] ?? '',
      salesProductCode: fact?.salesProductCode ?? null,
      unlinked: !fact,
      changes,
      conflicts,
    });
  }

  return { rows, edits, byColumn };
}
