import {
  ValidatorConstraint,
  type ValidationArguments,
  type ValidatorConstraintInterface,
} from 'class-validator';

/**
 * 경계 있는 문자열 맵 검사.
 *
 * `manualBasics` 는 `rawData` JSON 안에 병합돼 남는 오버레이라 한 번 들어간 키는
 * 지워지지 않는다. 그래서 모양이 아니라 **크기**가 진짜 위험이다 — 자유 JSON 을
 * 그대로 받으면 후보 한 건의 `rawData` 가 끝없이 자란다.
 *
 * `depth: 1` 은 `{ 키: 값 }`, `depth: 2` 는 `{ 키: { 키: 값 } }` 이다. 값은 언제나
 * 문자열이어야 한다. 뜻은 검사하지 않는다 — 어느 몰이 어떤 칸을 요구하는지 아는
 * 것은 프런트 어댑터이고, 서버가 그 목록을 또 적으면 몰을 늘릴 때마다 두 곳을
 * 고쳐야 한다.
 */

/** 한 층에 담을 수 있는 키 수. 몰 여덟에 칸 몇 개인 지금의 수십 배다. */
const MAX_KEYS = 64;
/** 키 길이. 몰키·칸키 모두 짧은 슬러그다. */
const MAX_KEY_LENGTH = 64;
/** 값 길이. 가장 긴 값이 분류 경로(`대>중>소`)라 넉넉하다. */
const MAX_VALUE_LENGTH = 500;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** 한 층을 본다. 통과하면 `null`, 아니면 사람이 읽을 이유. */
function checkLayer(value: unknown, depth: number): string | null {
  if (!isPlainObject(value)) return '객체여야 합니다';
  const keys = Object.keys(value);
  if (keys.length > MAX_KEYS) return `키가 ${MAX_KEYS}개를 넘습니다`;
  for (const key of keys) {
    if (key.length === 0 || key.length > MAX_KEY_LENGTH) {
      return `키 길이는 1~${MAX_KEY_LENGTH}자여야 합니다`;
    }
    const entry = value[key];
    if (depth > 1) {
      const nested = checkLayer(entry, depth - 1);
      if (nested) return `${key}: ${nested}`;
      continue;
    }
    if (typeof entry !== 'string') return `${key}: 값은 문자열이어야 합니다`;
    if (entry.length > MAX_VALUE_LENGTH) {
      return `${key}: 값은 ${MAX_VALUE_LENGTH}자 이하여야 합니다`;
    }
  }
  return null;
}

@ValidatorConstraint({ name: 'isBoundedStringMap', async: false })
export class IsBoundedStringMap implements ValidatorConstraintInterface {
  validate(value: unknown, args: ValidationArguments): boolean {
    const depth = typeof args.constraints?.[0] === 'number' ? args.constraints[0] : 1;
    return checkLayer(value, depth) === null;
  }

  defaultMessage(args: ValidationArguments): string {
    const depth = typeof args.constraints?.[0] === 'number' ? args.constraints[0] : 1;
    const reason = checkLayer(args.value, depth) ?? '모양이 맞지 않습니다';
    return `${args.property}: ${reason}`;
  }
}

export const BOUNDED_STRING_MAP_LIMITS = {
  maxKeys: MAX_KEYS,
  maxKeyLength: MAX_KEY_LENGTH,
  maxValueLength: MAX_VALUE_LENGTH,
} as const;
