import {
  REGISTRATION_INPUT_PRODUCT_FACT_KEYS,
  REGISTRATION_MALL_FIELD_FACT_EXCEPTIONS,
  RegistrationMallInputSchema,
  type RegistrationMallInput,
} from '@kiditem/shared/sales-product';

/**
 * 등록 대상의 몰 전용 값 규칙 — 순수 함수만 둔다(KID-313 W2).
 *
 * 등록 대상은 "이 몰에는 이 옵션 · 이 몰 카테고리 · 이 몰 칸 값"만 기억한다. 상품 이름 · 가격 ·
 * 상세 · 이미지 같은 상품 사실은 판매 상품 · 옵션 · 콘텐츠 revision 에 하나씩 있고, 등록 실행이
 * 제출 순간에 그 정본을 읽어 payload 로 동결한다. 옛 `registrationInput` 은 그 사실을 복사해
 * 두었고 그래서 세 곳이 서로 달라졌다.
 */

export class RegistrationMallInputError extends Error {
  constructor(readonly productFactKeys: readonly string[], message: string) {
    super(message);
  }
}

const PRODUCT_FACT_KEYS: ReadonlySet<string> = new Set(REGISTRATION_INPUT_PRODUCT_FACT_KEYS);
const MALL_FIELD_FACT_EXCEPTIONS: ReadonlySet<string> = new Set(REGISTRATION_MALL_FIELD_FACT_EXCEPTIONS);

/** `mallFields` 안에 둘 수 없는 상품 사실 키 — 몰 값인 공급가 · 홍보문은 뺀다. */
function isMallFieldProductFact(key: string): boolean {
  return PRODUCT_FACT_KEYS.has(key) && !MALL_FIELD_FACT_EXCEPTIONS.has(key);
}

/** 저장 직전에 검증한다. 상품 사실 키가 하나라도 있으면 어느 키인지 말하며 거절한다. */
export function normalizeRegistrationMallInput(raw: unknown): RegistrationMallInput {
  const record = typeof raw === 'object' && raw !== null ? (raw as Record<string, unknown>) : {};
  const productFactKeys = Object.keys(record).filter((key) => PRODUCT_FACT_KEYS.has(key));
  if (productFactKeys.length > 0) {
    throw new RegistrationMallInputError(
      productFactKeys,
      `등록 설정에는 상품 사실을 두지 않습니다(${productFactKeys.join(', ')}). 판매 상품 · 옵션 · 상세 페이지에서 고치세요.`,
    );
  }
  const mallFieldKeys = Object.keys(record).filter(
    (key) => key !== 'mallCategory' && key !== 'mallFields' && key !== 'adapter',
  );
  if (mallFieldKeys.length > 0) {
    throw new RegistrationMallInputError(
      mallFieldKeys,
      `등록 설정의 몰 칸은 mallFields 안에 둡니다(${mallFieldKeys.join(', ')}).`,
    );
  }
  const mallFieldFactKeys = Object.keys(recordOf(record.mallFields)).filter(isMallFieldProductFact);
  if (mallFieldFactKeys.length > 0) {
    throw new RegistrationMallInputError(
      mallFieldFactKeys,
      `등록 설정에는 상품 사실을 두지 않습니다(${mallFieldFactKeys.join(', ')}). 판매 상품 · 옵션 · 상세 페이지에서 고치세요.`,
    );
  }
  return RegistrationMallInputSchema.parse(record);
}

export type MallFieldRejection = { key: string; reason: 'product_fact' | 'too_long' | 'invalid' };

/**
 * 가져오기처럼 한 칸이 틀려도 줄을 버리지 않는 쓰기가 쓴다: 등록 설정에 둘 수 있는 몰 칸만 남기고, 못 받는 칸은
 * 키와 까닭을 돌려준다. 남긴 칸은 `normalizeRegistrationMallInput` 을 지난다.
 */
export function acceptedMallFields(fields: Record<string, unknown>): {
  mallFields: RegistrationMallInput['mallFields'];
  rejected: MallFieldRejection[];
} {
  const mallFields: RegistrationMallInput['mallFields'] = {};
  const rejected: MallFieldRejection[] = [];
  for (const [key, value] of Object.entries(fields)) {
    if (isMallFieldProductFact(key)) {
      rejected.push({ key, reason: 'product_fact' });
      continue;
    }
    const parsed = RegistrationMallInputSchema.safeParse({ mallFields: { [key]: value } });
    if (parsed.success) mallFields[key] = parsed.data.mallFields[key]!;
    else rejected.push({ key, reason: typeof value === 'string' && key.length <= 120 ? 'too_long' : 'invalid' });
  }
  return { mallFields, rejected };
}

function recordOf(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

/** 빈 등록 설정. resolve 가 처음 만들 때 쓴다. */
export function emptyRegistrationMallInput(): RegistrationMallInput {
  return RegistrationMallInputSchema.parse({});
}

/** 어댑터 namespace 하나만 바꾼다. 다른 채널의 값은 건드리지 않는다. */
export function withAdapterValues(
  input: RegistrationMallInput,
  channelKey: string,
  values: Record<string, unknown> | null,
): RegistrationMallInput {
  const adapter = { ...input.adapter };
  if (values === null) delete adapter[channelKey];
  else adapter[channelKey] = values;
  return { ...input, adapter };
}
