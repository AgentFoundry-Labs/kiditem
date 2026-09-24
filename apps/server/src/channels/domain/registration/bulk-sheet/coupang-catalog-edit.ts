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
  header: readonly string[];
  rows: readonly CoupangCatalogSheetRow[];
}>;

export type CoupangCatalogEditResult = Readonly<{
  bytes: Uint8Array;
  /** 실제로 값이 바뀐 칸 수. */
  changed: number;
  /** 그 옵션 ID 가 파일에 없어 건너뛴 수정. */
  unknownOptionIds: readonly string[];
}>;

/**
 * 윙 옵션 하나에 대해 **우리가 아는** 값. 우리 판매상품 · 단품에서만 온다. 모르는 값은 `null`
 * 이고, 채우지 않는다([ADR-0006](../../../../../../../docs/adr/0006-a-displayed-number-is-a-measurement-or-nothing.md)).
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
