import { describe, expect, it } from 'vitest';
import {
  MASTER_IMPORT_KEY_PREFIX,
  masterImportKey,
  normalizeForGroup,
  planKiditemImport,
  planWingMatches,
  projectWingRow,
  resolveBarcodeBucket,
  type WorkbookRow,
} from '../import-baseline-planner';

function row(overrides: Record<string, unknown>): WorkbookRow {
  return {
    상품코드: '',
    자사상품코드: '',
    상품명: '',
    옵션명: '',
    상품분류: '',
    브랜드: '',
    매입가: 0,
    판매가: 0,
    재고: 0,
    안전재고: 0,
    상품위치: '',
    매입처코드: '',
    매입처: '',
    '매입처 주소': '',
    '매입처 전화번호': '',
    '매입처 상가명': '',
    매입상품명: '',
    최소발주수량: 0,
    ...overrides,
  };
}

describe('normalizeForGroup', () => {
  it('collapses whitespace and lowercases without losing Korean', () => {
    expect(normalizeForGroup('  Toy  Box  ')).toBe('toybox');
    expect(normalizeForGroup('아동\t의자  L')).toBe('아동의자l');
  });
  it('returns empty string for null/undefined/blank', () => {
    expect(normalizeForGroup(null)).toBe('');
    expect(normalizeForGroup(undefined)).toBe('');
    expect(normalizeForGroup('   ')).toBe('');
  });
});

describe('masterImportKey', () => {
  it('produces the documented kiditem:v1: prefix and stays under 100 chars', () => {
    const key = masterImportKey('8806384882841', normalizeForGroup('아동 의자 핑크'));
    expect(key.startsWith(MASTER_IMPORT_KEY_PREFIX)).toBe(true);
    expect(key.length).toBeLessThan(100);
  });

  it('is deterministic and differs by bucket or normalized name', () => {
    const a = masterImportKey('8806384882841', 'toya');
    const b = masterImportKey('8806384882841', 'toya');
    const c = masterImportKey('8806384882841', 'toyb');
    const d = masterImportKey('1234567890123', 'toya');
    expect(a).toBe(b);
    expect(a).not.toBe(c);
    expect(a).not.toBe(d);
  });
});

describe('resolveBarcodeBucket', () => {
  it('returns the source barcode when present', () => {
    expect(resolveBarcodeBucket('8806', 'CODE-1', 5)).toBe('8806');
  });
  it('falls back to blank:<optionLegacyCode> when barcode is blank', () => {
    expect(resolveBarcodeBucket(null, 'CODE-1', 5)).toBe('blank:CODE-1');
  });
  it('falls back to blank-row:<rowNumber> when both are blank', () => {
    expect(resolveBarcodeBucket(null, null, 42)).toBe('blank-row:42');
  });
});

describe('planKiditemImport — barcode-shared masters (8806384882841 hard case)', () => {
  const rows: WorkbookRow[] = [
    // Master A (4 options) — same barcode, same name
    row({ 상품코드: 'A-PINK', 자사상품코드: '8806384882841', 상품명: 'Toy A', 옵션명: '핑크' }),
    row({ 상품코드: 'A-BLACK', 자사상품코드: '8806384882841', 상품명: 'Toy A', 옵션명: '블랙' }),
    row({ 상품코드: 'A-GOLD', 자사상품코드: '8806384882841', 상품명: 'Toy A', 옵션명: '골드' }),
    row({ 상품코드: 'A-RAND', 자사상품코드: '8806384882841', 상품명: 'Toy A', 옵션명: '랜덤' }),
    // Master B (4 options) — same barcode, different name
    row({ 상품코드: 'B-PINK', 자사상품코드: '8806384882841', 상품명: 'Toy B', 옵션명: '핑크' }),
    row({ 상품코드: 'B-BLACK', 자사상품코드: '8806384882841', 상품명: 'Toy B', 옵션명: '블랙' }),
    row({ 상품코드: 'B-GOLD', 자사상품코드: '8806384882841', 상품명: 'Toy B', 옵션명: '골드' }),
    row({ 상품코드: 'B-RAND', 자사상품코드: '8806384882841', 상품명: 'Toy B', 옵션명: '랜덤' }),
  ];

  it('groups into two masters sharing the same source barcode', () => {
    const plan = planKiditemImport(rows);
    expect(plan.masters).toHaveLength(2);
    expect(plan.masters.every((m) => m.sourceBarcode === '8806384882841')).toBe(true);
    expect(plan.masters.map((m) => m.name).sort()).toEqual(['Toy A', 'Toy B']);
  });

  it('emits 8 distinct options (4 per master) without hard conflicts', () => {
    const plan = planKiditemImport(rows);
    expect(plan.options).toHaveLength(8);
    expect(plan.hardConflicts).toEqual([]);
    const grouped = new Map<string, number>();
    for (const opt of plan.options) {
      grouped.set(opt.masterImportKey, (grouped.get(opt.masterImportKey) ?? 0) + 1);
    }
    expect([...grouped.values()].sort()).toEqual([4, 4]);
  });

  it('reports the shared barcode as multi-name', () => {
    const plan = planKiditemImport(rows);
    expect(plan.sharedSourceBarcodeGroups).toBe(1);
    expect(plan.multiNameBarcodeGroups).toBe(1);
  });
});

describe('planKiditemImport — single barcode, single name with N options', () => {
  it('groups all options under a single master', () => {
    const rows: WorkbookRow[] = Array.from({ length: 11 }, (_, i) =>
      row({
        상품코드: `OPT-${i}`,
        자사상품코드: '8801076260167',
        상품명: 'Toy C',
        옵션명: `색상-${i}`,
      }),
    );
    const plan = planKiditemImport(rows);
    expect(plan.masters).toHaveLength(1);
    expect(plan.options).toHaveLength(11);
    expect(plan.hardConflicts).toEqual([]);
  });
});

describe('planKiditemImport — duplicate (master, optionName) is a hard conflict', () => {
  it('flags duplicate (masterImportKey, optionDisplayName) and lists row numbers', () => {
    const rows: WorkbookRow[] = [
      row({ 상품코드: 'X-1', 자사상품코드: '8800000000001', 상품명: 'Toy X', 옵션명: '핑크' }),
      row({ 상품코드: 'X-2', 자사상품코드: '8800000000001', 상품명: 'Toy X', 옵션명: '핑크' }),
    ];
    const plan = planKiditemImport(rows);
    expect(plan.hardConflicts).toHaveLength(1);
    expect(plan.hardConflicts[0].optionDisplayName).toBe('핑크');
    expect(plan.hardConflicts[0].rowNumbers).toEqual([2, 3]);
  });
});

describe('planKiditemImport — option barcode is never the source EAN', () => {
  it('source 자사상품코드 lives on the master, not on the option', () => {
    const rows: WorkbookRow[] = [
      row({ 상품코드: 'OPT-1', 자사상품코드: '8806384808919', 상품명: 'Toy D', 옵션명: '핑크' }),
    ];
    const plan = planKiditemImport(rows);
    expect(plan.masters[0].sourceBarcode).toBe('8806384808919');
    // The planner intentionally does not surface a barcode on the option plan
    // — `import-product-baseline.ts` writes ProductOption.barcode = null.
    const optionKeys = Object.keys(plan.options[0]);
    expect(optionKeys).not.toContain('barcode');
  });

  it('does not use 모델명/EAN as a fallback option display name', () => {
    const rows: WorkbookRow[] = [
      row({
        상품코드: 'OPT-1',
        자사상품코드: '8806384808919',
        상품명: 'Toy D',
        옵션명: '',
        모델명: '8806384808919',
      }),
    ];

    const plan = planKiditemImport(rows);

    expect(plan.masters[0].sourceBarcode).toBe('8806384808919');
    expect(plan.options[0].optionDisplayName).toBeNull();
  });
});

describe('planKiditemImport — supplier fields', () => {
  it('preserves supplier metadata from the kiditem workbook row for supplier import', () => {
    const plan = planKiditemImport([
      row({
        상품코드: 'OPT-1',
        자사상품코드: '8806384808919',
        상품명: 'Toy Supplier',
        옵션명: '핑크',
        매입가: '3,200',
        매입처코드: 'SUP-001',
        매입처: '해피프랜즈',
        '매입처 주소': '서울시 중구',
        '매입처 전화번호': '02-1234-5678',
        '매입처 상가명': '동대문 A동',
        매입상품명: '매입 Toy Supplier 핑크',
        최소발주수량: '12',
      }),
    ]);

    expect(plan.options[0]).toMatchObject({
      supplierCode: 'SUP-001',
      supplierName: '해피프랜즈',
      supplierAddress: '서울시 중구',
      supplierPhone: '02-1234-5678',
      supplierMarketName: '동대문 A동',
      supplierProductName: '매입 Toy Supplier 핑크',
      supplyPrice: 3200,
      minOrderQty: 12,
    });
  });
});

describe('planKiditemImport — blank-barcode rows do not collapse', () => {
  it('two blank-barcode rows with different option codes get their own masters', () => {
    const rows: WorkbookRow[] = [
      row({ 상품코드: 'AAA', 자사상품코드: '', 상품명: 'Toy E', 옵션명: '핑크' }),
      row({ 상품코드: 'BBB', 자사상품코드: '', 상품명: 'Toy E', 옵션명: '핑크' }),
    ];
    const plan = planKiditemImport(rows);
    // Same name, blank barcode, different option codes → different fallback buckets.
    expect(plan.masters).toHaveLength(2);
    expect(plan.hardConflicts).toEqual([]);
  });
});

describe('planWingMatches — exact-only attachment', () => {
  const kiditem = planKiditemImport([
    // Two masters share barcode 8806... — barcode fallback would be ambiguous.
    row({ 상품코드: 'A-1', 자사상품코드: '8806', 상품명: 'Toy A', 옵션명: '핑크' }),
    row({ 상품코드: 'B-1', 자사상품코드: '8806', 상품명: 'Toy B', 옵션명: '핑크' }),
    // Single-master barcode 1234 — barcode fallback is exact-one allowed.
    row({ 상품코드: 'C-1', 자사상품코드: '1234', 상품명: 'Toy C', 옵션명: '블랙' }),
  ]);

  it('attaches by option-legacy when exactly one option has that code', () => {
    const wing = planWingMatches(
      [
        {
          rowNumber: 2,
          listingExternalId: 'EXT-1',
          matched: true,
          optionLegacyCode: 'A-1',
          sourceBarcode: '8806',
          channelName: 'Wing A',
          channelPrice: 1000,
        },
      ],
      kiditem,
    );
    expect(wing.attachments).toHaveLength(1);
    expect(wing.attachments[0].matchedBy).toBe('option-legacy');
    expect(wing.optionLegacyMatches).toBe(1);
    expect(wing.barcodeFallbackMatches).toBe(0);
  });

  it('falls back to master barcode only when exactly one master matches', () => {
    const wing = planWingMatches(
      [
        {
          rowNumber: 3,
          listingExternalId: 'EXT-2',
          matched: true,
          optionLegacyCode: null,
          sourceBarcode: '1234',
          channelName: 'Wing C',
          channelPrice: 2000,
        },
      ],
      kiditem,
    );
    expect(wing.attachments).toHaveLength(1);
    expect(wing.attachments[0].matchedBy).toBe('master-barcode-exact-one');
    expect(wing.barcodeFallbackMatches).toBe(1);
  });

  it('reports ambiguous source-barcode rows without attaching', () => {
    const wing = planWingMatches(
      [
        {
          rowNumber: 4,
          listingExternalId: 'EXT-3',
          matched: true,
          optionLegacyCode: null,
          sourceBarcode: '8806',
          channelName: null,
          channelPrice: 0,
        },
      ],
      kiditem,
    );
    expect(wing.attachments).toEqual([]);
    expect(wing.ambiguousBarcodeMatches).toBe(1);
    expect(wing.reports[0].reason).toContain('source barcode 8806');
  });

  it('reports unmatched rows where neither key resolves', () => {
    const wing = planWingMatches(
      [
        {
          rowNumber: 5,
          listingExternalId: 'EXT-4',
          matched: true,
          optionLegacyCode: 'NOT-IN-KIDITEM',
          sourceBarcode: 'NO-BC',
          channelName: null,
          channelPrice: 0,
        },
      ],
      kiditem,
    );
    expect(wing.attachments).toEqual([]);
    expect(wing.unmatchedMatchedRows).toBe(1);
  });

  it('skips rows missing listingExternalId without attempting a match', () => {
    const wing = planWingMatches(
      [
        {
          rowNumber: 6,
          listingExternalId: null,
          matched: true,
          optionLegacyCode: 'A-1',
          sourceBarcode: '8806',
          channelName: null,
          channelPrice: 0,
        },
      ],
      kiditem,
    );
    expect(wing.attachments).toEqual([]);
    expect(wing.skippedMissingListingExternalId).toBe(1);
  });

  it('treats non-matched workbook rows (매칭상태 != "O") as not-matched, not as failures', () => {
    const wing = planWingMatches(
      [
        {
          rowNumber: 7,
          listingExternalId: 'EXT-9',
          matched: false,
          optionLegacyCode: 'A-1',
          sourceBarcode: '8806',
          channelName: null,
          channelPrice: 0,
        },
      ],
      kiditem,
    );
    expect(wing.attachments).toEqual([]);
    expect(wing.notMatchedRows).toBe(1);
    expect(wing.unmatchedMatchedRows).toBe(0);
  });
});

describe('projectWingRow', () => {
  it('reads the canonical Wing column names', () => {
    const projected = projectWingRow(
      {
        등록상품ID: '999',
        매칭상태: 'O',
        상품코드: 'OPT-1',
        자사상품코드: '8806',
        등록상품명: 'Listing',
        판매가: '12,000',
      },
      3,
    );
    expect(projected).toEqual({
      rowNumber: 3,
      listingExternalId: '999',
      matched: true,
      optionLegacyCode: 'OPT-1',
      sourceBarcode: '8806',
      channelName: 'Listing',
      channelPrice: 12000,
    });
  });
});
