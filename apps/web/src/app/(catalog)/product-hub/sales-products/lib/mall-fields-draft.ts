import {
  REGISTRATION_INPUT_PRODUCT_FACT_KEYS,
  REGISTRATION_MALL_FIELD_FACT_EXCEPTIONS,
  REGISTRATION_MALL_FIELD_VALUE_MAX,
  type RegistrationMallInput,
} from '@kiditem/shared/sales-product';

type MallFields = RegistrationMallInput['mallFields'];
type MallFieldValue = MallFields[string];

/**
 * 등록 설정의 몰 전용 칸(`mallFields`) 편집 초안(KID-310 e). 자주 쓰는 세 칸(공급가 · 홍보문 · 재고 비율)은
 * 칸으로, 나머지 몰 키는 키 · 값 줄로 고친다 — JSON 을 손으로 쓰지 않는다.
 */
export interface MallFieldsDraft {
  supplyPrice: string;
  promoText: string;
  stockPercent: string;
  extra: { key: string; value: string }[];
}

export type MallFieldsParseResult = { ok: true; value: MallFields } | { ok: false; error: string };

const STRUCTURED_KEYS = ['supplyPrice', 'promoText', 'stockPercent'] as const;
const MALL_KEY_MAX = 120;
const FORBIDDEN_KEYS = new Set<string>(
  REGISTRATION_INPUT_PRODUCT_FACT_KEYS.filter(
    (key) => !(REGISTRATION_MALL_FIELD_FACT_EXCEPTIONS as readonly string[]).includes(key),
  ),
);

function text(value: MallFieldValue | undefined): string {
  return value === null || value === undefined ? '' : String(value);
}

export function mallFieldsDraftOf(mallFields: MallFields): MallFieldsDraft {
  return {
    supplyPrice: text(mallFields.supplyPrice),
    promoText: text(mallFields.promoText),
    stockPercent: text(mallFields.stockPercent),
    extra: Object.entries(mallFields)
      .filter(([key]) => !(STRUCTURED_KEYS as readonly string[]).includes(key))
      .map(([key, value]) => ({ key, value: text(value) })),
  };
}

/**
 * 초안 → 저장할 `mallFields`. 서버(`RegistrationMallInputSchema`)가 거절할 값은 이유와 함께 먼저 막는다.
 * 사람이 고치지 않은 글자 아닌 값(숫자 · 참거짓 · null)은 원래 값 그대로 둔다.
 */
export function mallFieldsFromDraft(draft: MallFieldsDraft, original: MallFields): MallFieldsParseResult {
  const value: MallFields = {};

  const supplyPrice = draft.supplyPrice.trim();
  if (supplyPrice) {
    const parsed = Number(supplyPrice);
    if (!Number.isSafeInteger(parsed) || parsed < 0) return { ok: false, error: '공급가는 0 이상의 정수여야 합니다.' };
    value.supplyPrice = typeof original.supplyPrice === 'number' && original.supplyPrice === parsed ? parsed : String(parsed);
  }

  const promoText = draft.promoText.trim();
  if (promoText) {
    if (promoText.length > REGISTRATION_MALL_FIELD_VALUE_MAX) {
      return { ok: false, error: `홍보문은 ${REGISTRATION_MALL_FIELD_VALUE_MAX}자까지입니다.` };
    }
    value.promoText = promoText;
  }

  const stockPercent = draft.stockPercent.trim();
  if (stockPercent) {
    const parsed = Number(stockPercent);
    if (!Number.isInteger(parsed) || parsed < 0 || parsed > 100) {
      return { ok: false, error: '재고 비율은 0~100 사이 정수여야 합니다.' };
    }
    // 글자로 저장된 값을 고치지 않았으면 그대로 둔다 — 고친 값만 숫자로 쓴다.
    value.stockPercent = typeof original.stockPercent === 'string' && original.stockPercent.trim() === stockPercent
      ? original.stockPercent
      : parsed;
  }

  for (const row of draft.extra) {
    const key = row.key.trim();
    if (!key && !row.value.trim()) continue;
    if (!key) return { ok: false, error: '값이 있는 줄에는 칸 이름이 있어야 합니다.' };
    if (key.length > MALL_KEY_MAX) return { ok: false, error: `칸 이름은 ${MALL_KEY_MAX}자까지입니다.` };
    if ((STRUCTURED_KEYS as readonly string[]).includes(key) || Object.hasOwn(value, key)) {
      return { ok: false, error: `같은 칸(${key})이 두 번 있습니다.` };
    }
    if (FORBIDDEN_KEYS.has(key)) {
      return { ok: false, error: `${key} 는 상품 사실입니다 — 판매상품에서 고치세요.` };
    }
    if (row.value.length > REGISTRATION_MALL_FIELD_VALUE_MAX) {
      return { ok: false, error: `${key} 값은 ${REGISTRATION_MALL_FIELD_VALUE_MAX}자까지입니다.` };
    }
    const stored = original[key];
    value[key] = stored !== undefined && typeof stored !== 'string' && text(stored) === row.value ? stored : row.value;
  }

  return { ok: true, value };
}
