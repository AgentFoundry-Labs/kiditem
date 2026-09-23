import {
  REGISTRATION_INPUT_PRODUCT_FACT_KEYS,
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
  return RegistrationMallInputSchema.parse(record);
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
