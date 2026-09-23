import { describe, expect, it } from 'vitest';
import {
  EMPTY_MALL_REGISTER_VALUES,
  FORM_MALL_ADAPTERS,
  SHARED_MALL_FIELDS,
  editableMallFields,
  getFormMallAdapter,
  mallRegisterReadiness,
  mallRegisterValuesToSave,
  mallRegisterValuesWithDefaults,
  normalizeMallRegisterValues,
  valuesForMall,
} from './mall-register-values';

/**
 * 상품에 저장하는 몰별 등록 칸 값.
 *
 * 지키는 것 둘 —
 *  1. 저장은 **사람이 고친 값만** 담는다. 기본값을 저장하면 어댑터가 기본값을 고쳐도
 *     옛 값에 묶인다.
 *  2. 막는 이유는 **어댑터가 말한 것만** 쓴다. 화면이 조건을 다시 적으면 버튼은
 *     열려 있는데 보내면 막히는 화면이 된다.
 */

const item = (overrides: Partial<{ salePrice: number | null; name: string }> = {}) => ({
  candidateId: 'c1',
  name: overrides.name ?? '할로윈 LED 거미줄',
  salePrice: overrides.salePrice === undefined ? 3500 : overrides.salePrice,
  thumbnailUrl: null,
});

describe('몰 등록 칸 값', () => {
  it('폼 방식 몰만 담는다', () => {
    expect(FORM_MALL_ADAPTERS.length).toBeGreaterThanOrEqual(3);
    for (const adapter of FORM_MALL_ADAPTERS) expect(adapter.mode).toBe('form');
    // 쿠팡 WING 은 셀피아 매칭·값 확인이 붙은 다른 흐름이다.
    expect(FORM_MALL_ADAPTERS.some((a) => a.mallKey === 'coupang')).toBe(false);
  });

  it('공통 칸은 한 번만 선다', () => {
    expect(SHARED_MALL_FIELDS.length).toBeGreaterThan(0);
    const keys = SHARED_MALL_FIELDS.map((field) => field.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('공통 칸은 몰별 칸에서 빠진다 — 같은 값을 두 번 받지 않는다', () => {
    const sharedKeys = new Set(SHARED_MALL_FIELDS.map((field) => field.key));
    for (const adapter of FORM_MALL_ADAPTERS) {
      for (const field of editableMallFields(adapter)) {
        expect(sharedKeys.has(field.key)).toBe(false);
      }
    }
  });

  it('몰 고정값은 사람에게 묻지 않는다', () => {
    for (const adapter of FORM_MALL_ADAPTERS) {
      for (const field of editableMallFields(adapter)) {
        expect(field.origin).toBe('override');
      }
    }
  });

  describe('되읽기', () => {
    it('모르는 몰과 모르는 칸은 버린다', () => {
      const values = normalizeMallRegisterValues(
        { '11st': { categoryPath: '문구/사무용품>디자인/팬시용품', 없는칸: 'x' }, 없는몰: { a: 'b' } },
        {},
      );
      expect(values.byMall['11st']).toEqual({ categoryPath: '문구/사무용품>디자인/팬시용품' });
      expect(values.byMall['없는몰']).toBeUndefined();
    });

    it('문자열이 아닌 값은 버린다 — 서버 JSON 은 무엇이든 들어올 수 있다', () => {
      const values = normalizeMallRegisterValues({ '11st': { categoryPath: 42 } }, { certNumber: null });
      expect(values.byMall['11st']).toBeUndefined();
      expect(values.shared).toEqual({});
    });

    it('저장한 적 없으면 빈 값이다', () => {
      expect(normalizeMallRegisterValues(undefined, undefined)).toEqual(EMPTY_MALL_REGISTER_VALUES);
      expect(normalizeMallRegisterValues(null, 'nope')).toEqual(EMPTY_MALL_REGISTER_VALUES);
    });
  });

  describe('기본값 채우기', () => {
    it('저장값이 어댑터 기본값을 이긴다', () => {
      const filled = mallRegisterValuesWithDefaults(
        normalizeMallRegisterValues({ '11st': { quantity: '3' } }, {}),
      );
      expect(filled.byMall['11st']?.quantity).toBe('3');
    });

    it('안 고친 칸은 어댑터 기본값이 들어간다', () => {
      const filled = mallRegisterValuesWithDefaults(EMPTY_MALL_REGISTER_VALUES);
      for (const adapter of FORM_MALL_ADAPTERS) {
        for (const field of adapter.fields) {
          if (SHARED_MALL_FIELDS.some((shared) => shared.key === field.key)) continue;
          expect(filled.byMall[adapter.mallKey]?.[field.key]).toBe(field.defaultValue);
        }
      }
    });
  });

  describe('저장', () => {
    it('기본값과 같은 값은 담지 않는다', () => {
      const filled = mallRegisterValuesWithDefaults(EMPTY_MALL_REGISTER_VALUES);
      expect(mallRegisterValuesToSave(filled)).toEqual({
        mallRegisterValues: {},
        mallRegisterShared: {},
      });
    });

    it('사람이 고친 값만 담는다', () => {
      const filled = mallRegisterValuesWithDefaults(EMPTY_MALL_REGISTER_VALUES);
      filled.byMall['11st'] = { ...filled.byMall['11st'], categoryPath: '문구/사무용품>디자인/팬시용품>기능성 팬시' };
      const saved = mallRegisterValuesToSave(filled);
      expect(saved.mallRegisterValues).toEqual({
        '11st': { categoryPath: '문구/사무용품>디자인/팬시용품>기능성 팬시' },
      });
    });

    it('저장 → 되읽기 → 저장이 같은 값이다', () => {
      const first = mallRegisterValuesWithDefaults(EMPTY_MALL_REGISTER_VALUES);
      first.byMall['11st'] = { ...first.byMall['11st'], categoryPath: '가>나' };
      const saved = mallRegisterValuesToSave(first);
      const again = mallRegisterValuesToSave(
        mallRegisterValuesWithDefaults(
          normalizeMallRegisterValues(saved.mallRegisterValues, saved.mallRegisterShared),
        ),
      );
      expect(again).toEqual(saved);
    });
  });

  it('공통 값은 모든 몰에 넘어가고 몰별 값이 이긴다', () => {
    const field = SHARED_MALL_FIELDS[0]!;
    const values = {
      byMall: { onch: { [field.key]: '이 몰만' } },
      shared: { [field.key]: '공통' },
    };
    for (const adapter of FORM_MALL_ADAPTERS) {
      const expected = adapter.mallKey === 'onch' ? '이 몰만' : '공통';
      expect(valuesForMall(values, adapter.mallKey)[field.key]).toBe(expected);
    }
  });
});

describe('몰별 준비 상태', () => {
  const filled = () => mallRegisterValuesWithDefaults(EMPTY_MALL_REGISTER_VALUES);

  it('막는 이유는 어댑터가 말한 그대로다', () => {
    const values = filled();
    for (const row of mallRegisterReadiness(item(), values)) {
      const adapter = getFormMallAdapter(row.mallKey)!;
      expect(row.reasons).toEqual(adapter.validate(item(), valuesForMall(values, row.mallKey)));
      expect(row.ready).toBe(row.reasons.length === 0);
    }
  });

  it('11번가는 분류를 넣기 전에는 막힌다 — 등록 후 바꾸기 어렵다', () => {
    const values = filled();
    const before = mallRegisterReadiness(item(), values).find((row) => row.mallKey === '11st')!;
    expect(before.ready).toBe(false);
    expect(before.missingFieldLabels).toContain('11번가 분류');

    values.byMall['11st'] = { ...values.byMall['11st'], categoryPath: '문구/사무용품>디자인/팬시용품>기능성 팬시' };
    const after = mallRegisterReadiness(item(), values).find((row) => row.mallKey === '11st')!;
    expect(after.ready).toBe(true);
    expect(after.summary).toContainEqual({
      label: '11번가 분류',
      value: '문구/사무용품>디자인/팬시용품>기능성 팬시',
    });
  });

  it('판매가를 모르는 상품(null)은 막지 않는다', () => {
    // 목록에는 가격 칸이 없다. 실제 판매가는 상세에서 셀피아 이름매칭으로 붙는다.
    for (const row of mallRegisterReadiness(item({ salePrice: null }), filled())) {
      expect(row.reasons.some((reason) => reason.includes('판매가가 0원'))).toBe(false);
    }
  });

  it('명시적 0원은 모든 몰에서 막는다', () => {
    for (const row of mallRegisterReadiness(item({ salePrice: 0 }), filled())) {
      expect(row.ready).toBe(false);
    }
  });

  it('상품이 없으면 전부 막고 이유를 말한다', () => {
    for (const row of mallRegisterReadiness(null, filled())) {
      expect(row.ready).toBe(false);
      expect(row.reasons.join(' ')).toContain('보낼 상품이 없습니다');
    }
  });

  it('폼 방식 몰만 이 흐름에 태운다 — 쿠팡 WING 도 레지스트리대로 폼 몰이다(KID-321)', () => {
    expect(getFormMallAdapter('coupang')?.mallName).toBe('쿠팡 WING');
    expect(getFormMallAdapter('없는몰')).toBeNull();
    expect(getFormMallAdapter('11st')?.mallName).toBe('11번가');
  });
});
