import {
  MALL_PUBLISH_ADAPTERS,
  getMallPublishAdapter,
} from './adapters';
import type {
  MallFieldSpec,
  MallPublishAdapter,
  MallPublishItem,
} from './mall-publish-adapter';

/**
 * 상품에 저장해 두는 몰별 등록 칸 값.
 *
 * 몰마다 사람이 골라야 하는 값이 있다(11번가 분류, 도매꾹 최소 구매수량 …). 그걸
 * 등록할 때마다 다시 치면 같은 상품인데 몰마다 다른 값이 들어가고, 그건 우리가 만든
 * 오류다. 그래서 **상품 상세에 한 번 적어 두고 목록에서는 버튼만 누른다.**
 *
 * 이 파일은 순수하다 — 서버도 확장도 부르지 않는다. 저장 모양을 우리 모양으로
 * 옮기고, 어댑터에게 "이 상품 이 값으로 지금 보낼 수 있느냐"를 묻는 것까지가 전부다.
 */

/** 폼을 채우는 몰만. 엑셀·API 경로는 각자 다른 화면을 쓴다. */
export const FORM_MALL_ADAPTERS: readonly MallPublishAdapter[] =
  MALL_PUBLISH_ADAPTERS.filter((adapter) => adapter.mode === 'form');

/**
 * 여러 몰이 같은 `key` 로 선언한 칸.
 *
 * 안전인증번호처럼 상품에 하나뿐인 값이다. 몰마다 따로 받으면 같은 숫자를 몰 수만큼
 * 다시 치게 되고, 서로 다르게 적히면 그건 우리가 만든 오류다. 한 번만 받는다.
 */
export const SHARED_MALL_FIELDS: readonly MallFieldSpec[] = (() => {
  const seen = new Map<string, MallFieldSpec>();
  for (const adapter of FORM_MALL_ADAPTERS) {
    for (const field of adapter.fields) {
      if (!field.shared || seen.has(field.key)) continue;
      seen.set(field.key, field);
    }
  }
  return [...seen.values()];
})();

const SHARED_KEYS = new Set(SHARED_MALL_FIELDS.map((field) => field.key));

/** 사람이 이 몰에서 골라야 하는 칸. 몰 고정값과 공통 칸은 뺀다. */
export function editableMallFields(adapter: MallPublishAdapter): MallFieldSpec[] {
  return adapter.fields.filter(
    (field) => field.origin === 'override' && !SHARED_KEYS.has(field.key),
  );
}

export interface MallRegisterValues {
  /** 몰키 → 그 몰의 값. */
  byMall: Record<string, Record<string, string>>;
  /** 여러 몰이 함께 쓰는 값. 필드키 → 값. */
  shared: Record<string, string>;
}

export const EMPTY_MALL_REGISTER_VALUES: MallRegisterValues = { byMall: {}, shared: {} };

const stringMap = (value: unknown): Record<string, string> => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const result: Record<string, string> = {};
  for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
    if (typeof entry === 'string') result[key] = entry;
  }
  return result;
};

/**
 * 저장된 값 → 우리 모양.
 *
 * 우리가 아는 몰과 칸만 남긴다. 어댑터를 지웠을 때 옛 값이 계속 따라다니면, 화면에
 * 없는 칸 때문에 등록이 막히는 일이 생긴다.
 */
export function normalizeMallRegisterValues(
  savedByMall: unknown,
  savedShared: unknown,
): MallRegisterValues {
  const byMall: Record<string, Record<string, string>> = {};
  const source = savedByMall && typeof savedByMall === 'object' && !Array.isArray(savedByMall)
    ? savedByMall as Record<string, unknown>
    : {};
  for (const adapter of FORM_MALL_ADAPTERS) {
    const known = new Set(adapter.fields.map((field) => field.key));
    const saved = stringMap(source[adapter.mallKey]);
    const kept: Record<string, string> = {};
    for (const [key, value] of Object.entries(saved)) {
      if (known.has(key) && !SHARED_KEYS.has(key)) kept[key] = value;
    }
    if (Object.keys(kept).length > 0) byMall[adapter.mallKey] = kept;
  }
  const shared: Record<string, string> = {};
  const savedSharedMap = stringMap(savedShared);
  for (const field of SHARED_MALL_FIELDS) {
    const value = savedSharedMap[field.key];
    if (typeof value === 'string' && value.trim()) shared[field.key] = value;
  }
  return { byMall, shared };
}

/**
 * 어댑터 기본값을 깔고 저장값을 덮는다.
 *
 * 기본값을 저장해 두지 않는 이유 — 어댑터가 기본값을 고치면 저장한 상품 전부가
 * 옛 값에 묶인다. 기본값은 언제나 어댑터에서 읽고, 저장은 사람이 고친 것만 남긴다.
 */
export function mallRegisterValuesWithDefaults(
  saved: MallRegisterValues,
): MallRegisterValues {
  const byMall: Record<string, Record<string, string>> = {};
  for (const adapter of FORM_MALL_ADAPTERS) {
    const defaults: Record<string, string> = {};
    for (const field of adapter.fields) {
      if (SHARED_KEYS.has(field.key)) continue;
      defaults[field.key] = field.defaultValue;
    }
    byMall[adapter.mallKey] = { ...defaults, ...(saved.byMall[adapter.mallKey] ?? {}) };
  }
  const shared: Record<string, string> = {};
  for (const field of SHARED_MALL_FIELDS) shared[field.key] = field.defaultValue;
  return { byMall, shared: { ...shared, ...saved.shared } };
}

/** 그 몰에 보낼 값. 공통 값을 먼저 깔고 몰별 값이 이긴다. */
export function valuesForMall(
  values: MallRegisterValues,
  mallKey: string,
): Record<string, string> {
  return { ...values.shared, ...(values.byMall[mallKey] ?? {}) };
}

/**
 * 저장할 값만 추린다.
 *
 * 어댑터 기본값과 같은 값은 담지 않는다. 담으면 기본값이 바뀌어도 옛 값이 그대로
 * 남아, 사람이 고친 적 없는 칸이 고친 것처럼 굳는다.
 */
export function mallRegisterValuesToSave(values: MallRegisterValues): {
  mallRegisterValues: Record<string, Record<string, string>>;
  mallRegisterShared: Record<string, string>;
} {
  const byMall: Record<string, Record<string, string>> = {};
  for (const adapter of FORM_MALL_ADAPTERS) {
    const current = values.byMall[adapter.mallKey] ?? {};
    const kept: Record<string, string> = {};
    for (const field of adapter.fields) {
      if (SHARED_KEYS.has(field.key)) continue;
      const value = (current[field.key] ?? '').trim();
      if (!value || value === field.defaultValue.trim()) continue;
      kept[field.key] = value;
    }
    if (Object.keys(kept).length > 0) byMall[adapter.mallKey] = kept;
  }
  const shared: Record<string, string> = {};
  for (const field of SHARED_MALL_FIELDS) {
    const value = (values.shared[field.key] ?? '').trim();
    if (!value || value === field.defaultValue.trim()) continue;
    shared[field.key] = value;
  }
  return { mallRegisterValues: byMall, mallRegisterShared: shared };
}

/** 몰 하나가 지금 보낼 수 있는 상태인가. */
export interface MallReadiness {
  mallKey: string;
  mallName: string;
  ready: boolean;
  /** 못 보내는 이유. 사람이 읽는 문장이고, 어댑터가 쓴 그대로다. */
  reasons: string[];
  /** 필수인데 비어 있는 칸 이름. 상세에서 무엇을 채워야 하는지 가리킨다. */
  missingFieldLabels: string[];
  /** 보낼 값 요약. 사람이 버튼을 누르기 전에 무엇이 들어가는지 본다. */
  summary: { label: string; value: string }[];
}

/**
 * 몰마다 "지금 보낼 수 있느냐"와 "왜 못 보내느냐".
 *
 * 판정은 전부 어댑터가 한다 — 화면이 몰별 조건을 다시 적으면 어댑터와 어긋나고,
 * 어긋나면 버튼은 열려 있는데 보내면 막히는(또는 그 반대의) 화면이 된다.
 */
export function mallRegisterReadiness(
  item: MallPublishItem | null,
  values: MallRegisterValues,
  adapters: readonly MallPublishAdapter[] = FORM_MALL_ADAPTERS,
): MallReadiness[] {
  return adapters.map((adapter) => {
    const merged = valuesForMall(values, adapter.mallKey);
    const missing = adapter.fields.filter(
      (field) => field.required && field.origin === 'override' && !(merged[field.key] ?? '').trim(),
    );
    const reasons = item
      ? adapter.validate(item, merged)
      : ['보낼 상품이 없습니다.'];
    return {
      mallKey: adapter.mallKey,
      mallName: adapter.mallName,
      ready: reasons.length === 0,
      reasons,
      missingFieldLabels: missing.map((field) => field.label),
      summary: editableMallFields(adapter)
        .map((field) => ({ label: field.label, value: (merged[field.key] ?? '').trim() }))
        .filter((row) => row.value.length > 0),
    };
  });
}

/** 몰키로 어댑터를 찾되 폼 방식만 돌려준다. 다른 방식은 이 흐름에 태우지 않는다. */
export function getFormMallAdapter(mallKey: string): MallPublishAdapter | null {
  const adapter = getMallPublishAdapter(mallKey);
  return adapter && adapter.mode === 'form' ? adapter : null;
}
