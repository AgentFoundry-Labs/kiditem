import { applyCoupangCatalogEdits, coupangCatalogUsedRange, readCoupangCatalogSheet } from '../../../adapter/out/documents/coupang-wing/catalog-edit.adapter';
import { describe, expect, it } from 'vitest';
import * as XLSX from 'xlsx';
import {
  COUPANG_CATALOG_EDITABLE_COLUMNS,
  planCoupangCatalogEdits,
  type CoupangCatalogFacts,
} from './coupang-catalog-edit';

/**
 * 사장님이 2026-09-18 윙에서 내려받은 `Coupang_detailinfo_260918.xlsx` 의 모양 그대로다:
 * 1행 판 표시, 2행 안내, 3행 묶음 제목, 4행 칸 이름, 5행부터 옵션 한 줄씩.
 */
const HEADER = [
  '등록상품ID', '등록상품명', '쿠팡 노출상품명', '카테고리', '제조사', '브랜드', '검색어',
  '성인상품여부(Y/N)', '승인상태', '판매상태', '노출상품ID', '옵션 ID', '등록 옵션명',
  '모델번호', '바코드',
];

function buildSheet(rows: string[][], marker = 'Catalog Template_Ver.1.2'): Buffer {
  const grid = [
    [marker],
    ['쿠팡상품정보 수정요청 엑셀파일 이용 안내'],
    ['상품기본정보'],
    HEADER,
    ...rows,
  ];
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([['도움말']]), 'Help');
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(grid), 'Template');
  return XLSX.write(workbook, { bookType: 'xlsx', type: 'buffer' }) as Buffer;
}

function row(optionId: string, overrides: Partial<Record<string, string>> = {}): string[] {
  const base: Record<string, string> = {
    등록상품ID: 'P-1', 등록상품명: '등록 이름', '쿠팡 노출상품명': '노출 이름',
    카테고리: '완구', 제조사: '', 브랜드: '', 검색어: '',
    '성인상품여부(Y/N)': 'N', 승인상태: '승인', 판매상태: '판매중',
    노출상품ID: 'D-1', '옵션 ID': optionId, '등록 옵션명': '기본',
    모델번호: '', 바코드: '',
  };
  return HEADER.map((name) => overrides[name] ?? base[name] ?? '');
}

function readBack(bytes: Uint8Array, optionId: string): Record<string, string> {
  return readCoupangCatalogSheet(bytes).rows.find((r) => r.optionId === optionId)!.values;
}

describe('쿠팡상품정보 수정요청 엑셀', () => {
  it('한 줄은 상품이 아니라 옵션 하나다', () => {
    const bytes = buildSheet([row('20001'), row('20002')]);
    const sheet = readCoupangCatalogSheet(bytes);
    expect(sheet.rows.map((r) => r.optionId)).toEqual(['20001', '20002']);
  });

  it('시트가 적어 둔 범위는 믿지 않고 실제 칸으로 다시 센다', () => {
    // 윙이 실제로 이렇게 준다: `<dimension ref="A1:HW4"/>` 로 적어 놓고 그 아래에 2,274 줄
    // (실측 2026-09-22 `Coupang_detailinfo_260918.xlsx`). 적힌 범위를 믿으면 빈 양식으로 읽힌다.
    const workbook = XLSX.read(buildSheet([row('20001'), row('20002')]), { type: 'buffer' });
    const sheet = workbook.Sheets['Template']!;
    sheet['!ref'] = 'A1:O4';

    expect(coupangCatalogUsedRange(sheet)).toBe('A1:O6');
  });

  it('모르는 양식 판은 고치지 않는다 — 칸 자리가 달라 엉뚱한 곳에 쓴다', () => {
    expect(() => readCoupangCatalogSheet(buildSheet([row('20001')], 'Catalog Template_Ver.9.9')))
      .toThrow(/Catalog Template_Ver\.1\.2/);
  });

  it('흰 칸만 고치고 값이 그대로면 쓰지 않는다', () => {
    const bytes = buildSheet([row('20001', { 브랜드: '키드아이템' })]);
    const sheet = readCoupangCatalogSheet(bytes);
    const result = applyCoupangCatalogEdits(bytes, [{
      optionId: '20001',
      values: { 바코드: '8809123456789', 브랜드: '키드아이템' },
    }]);

    expect(result.changed).toBe(1); // 브랜드는 이미 같은 값이라 세지 않는다
    const after = readBack(result.bytes, '20001');
    expect(after['바코드']).toBe('8809123456789');
    expect(after['브랜드']).toBe('키드아이템');
  });

  it('회색 칸은 거절한다', () => {
    const bytes = buildSheet([row('20001')]);
    const sheet = readCoupangCatalogSheet(bytes);
    expect(() => applyCoupangCatalogEdits(bytes, [{
      optionId: '20001',
      values: { '옵션 ID': '99999' } as never,
    }])).toThrow(/회색 칸/);
  });

  it('고치지 않은 칸과 Help 시트는 그대로 둔다', () => {
    const bytes = buildSheet([row('20001'), row('20002')]);
    const sheet = readCoupangCatalogSheet(bytes);
    const result = applyCoupangCatalogEdits(bytes, [{
      optionId: '20001', values: { 모델번호: 'KI-1' },
    }]);

    const after = readCoupangCatalogSheet(result.bytes);
    expect(XLSX.read(result.bytes, { type: 'buffer' }).SheetNames).toContain('Help');
    expect(readBack(result.bytes, '20001')['등록상품명']).toBe('등록 이름');
    expect(readBack(result.bytes, '20002')['모델번호']).toBe('');
  });

  it('파일에 없는 옵션은 조용히 넘기지 않고 이름을 돌려준다', () => {
    const bytes = buildSheet([row('20001')]);
    const sheet = readCoupangCatalogSheet(bytes);
    const result = applyCoupangCatalogEdits(bytes, [{ optionId: '없는옵션', values: { 바코드: '1' } }]);

    expect(result.changed).toBe(0);
    expect(result.unknownOptionIds).toEqual(['없는옵션']);
  });

  it('검색어는 1~40개다 — 넘치면 몰이 그 줄을 통째로 거절한다', () => {
    const bytes = buildSheet([row('20001')]);
    const sheet = readCoupangCatalogSheet(bytes);
    const tooMany = Array.from({ length: 41 }, (_, i) => `말${i}`).join(',');

    expect(() => applyCoupangCatalogEdits(bytes, [{ optionId: '20001', values: { 검색어: tooMany } }]))
      .toThrow(/최대 40개/);
    expect(() => applyCoupangCatalogEdits(bytes, [{ optionId: '20001', values: { 검색어: ' , ' } }]))
      .toThrow(/최소 1개/);
  });

  it('고칠 수 있는 칸 목록은 안내문·다운로드 요청 화면과 같다', () => {
    expect([...COUPANG_CATALOG_EDITABLE_COLUMNS]).toEqual([
      '쿠팡 노출상품명', '제조사', '브랜드', '검색어', '성인상품여부(Y/N)', '모델번호', '바코드',
    ]);
  });
});

function facts(optionId: string, overrides: Partial<CoupangCatalogFacts> = {}): CoupangCatalogFacts {
  return {
    optionId,
    brand: null,
    manufacturer: null,
    modelNo: null,
    barcode: null,
    keywords: [],
    salesProductCode: 'K-1',
    ...overrides,
  };
}

describe('우리가 아는 값으로 수정요청 짜기', () => {
  it('빈 칸만 채우고, 이미 값이 있으면 다르더라도 두고 센다', () => {
    const bytes = buildSheet([row('20001', { 모델번호: '옛번호' })]);
    const sheet = readCoupangCatalogSheet(bytes);
    const plan = planCoupangCatalogEdits(sheet, [
      facts('20001', { modelNo: 'KI-1', manufacturer: '한국완구' }),
    ]);

    expect(plan.rows[0]!.changes).toEqual([{ column: '제조사', before: '', after: '한국완구' }]);
    expect(plan.rows[0]!.conflicts).toEqual([{ column: '모델번호', before: '옛번호', after: 'KI-1' }]);
    expect(plan.byColumn).toEqual({ 제조사: 1 });
  });

  it('브랜드는 채우지 않는다 — 우리 브랜드 칸은 상호(kiditem)라 상품 브랜드가 아니다', () => {
    const bytes = buildSheet([row('20001')]);
    const sheet = readCoupangCatalogSheet(bytes);
    const plan = planCoupangCatalogEdits(sheet, [facts('20001', { brand: 'kiditem' })]);

    expect(plan.edits).toEqual([]);
  });

  it('모르는 값은 채우지 않는다', () => {
    const bytes = buildSheet([row('20001')]);
    const sheet = readCoupangCatalogSheet(bytes);
    const plan = planCoupangCatalogEdits(sheet, [facts('20001')]);

    expect(plan.edits).toEqual([]);
    expect(plan.rows[0]!.changes).toEqual([]);
  });

  it('우리 단품과 이어지지 않은 옵션은 손대지 않고 그렇다고 말한다', () => {
    const bytes = buildSheet([row('20001'), row('20002')]);
    const sheet = readCoupangCatalogSheet(bytes);
    const plan = planCoupangCatalogEdits(sheet, [facts('20001', { barcode: '8809123456789' })]);

    expect(plan.rows.map((r) => r.unlinked)).toEqual([false, true]);
    expect(plan.edits).toEqual([{ optionId: '20001', values: { 바코드: '8809123456789' } }]);
  });

  it('검색어는 쉼표로 잇고 40개에서 끊는다 — 넘겨 보내면 그 줄이 통째로 거절된다', () => {
    const bytes = buildSheet([row('20001')]);
    const sheet = readCoupangCatalogSheet(bytes);
    const plan = planCoupangCatalogEdits(sheet, [
      facts('20001', { keywords: Array.from({ length: 45 }, (_, i) => `말${i}`) }),
    ]);

    const tags = plan.rows[0]!.changes[0]!.after.split(',');
    expect(tags).toHaveLength(40);
    expect(() => applyCoupangCatalogEdits(bytes, plan.edits)).not.toThrow();
  });

  it('짠 것을 그대로 적용하면 센 수와 바뀐 칸 수가 같다', () => {
    const bytes = buildSheet([row('20001'), row('20002')]);
    const sheet = readCoupangCatalogSheet(bytes);
    const plan = planCoupangCatalogEdits(sheet, [
      facts('20001', { modelNo: 'KI-1', barcode: '8809123456789' }),
      facts('20002', { manufacturer: '한국완구' }),
    ]);
    const result = applyCoupangCatalogEdits(bytes, plan.edits);

    expect(result.changed).toBe(3);
    expect(result.unknownOptionIds).toEqual([]);
    expect(readBack(result.bytes, '20001')['바코드']).toBe('8809123456789');
    expect(readBack(result.bytes, '20002')['제조사']).toBe('한국완구');
  });
});
