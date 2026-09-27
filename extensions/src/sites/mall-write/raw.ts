import { RuntimeError } from '../../core/errors';
import { RUNTIME_PLAN_INVALID } from './form';

/**
 * 전용 처리기 몰(신세계·스마트스토어·GS샵·롯데ON·카카오)의 값 묶음 검사 도구(옛 `normalize<Mall>Form`의 공용 조각, KID-256).
 * 페이지 처리기가 이 값으로 선택자를 만들기 때문에 모양을 서비스워커에서 굳힌다 — 탭을 열기 전에 던진다.
 */
export type Raw = Record<string, unknown>;

export const asRaw = (value: unknown): Raw => (typeof value === 'object' && value !== null && !Array.isArray(value) ? (value as Raw) : {});

export function requireRaw(value: unknown, message: string): Raw {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) throw planInvalid(message);
  return value as Raw;
}

export function planInvalid(message: string): RuntimeError {
  return new RuntimeError(RUNTIME_PLAN_INVALID, message, { reason: 'form_values' });
}

/** 글자로(null·undefined는 빈 글자), 최대 길이까지. */
export const text = (entry: unknown, max = 1000): string => (entry === null || entry === undefined ? '' : String(entry)).slice(0, max);
/** 숫자만으로 된 번호(아니면 빈 글자). */
export const digits = (entry: unknown): string => (/^\d+$/.test(String(entry ?? '')) ? String(entry) : '');
/** 무늬에 맞는 코드(아니면 빈 글자). */
export const code = (entry: unknown, pattern: RegExp): string => (pattern.test(String(entry ?? '')) ? String(entry) : '');
/** 0 이상의 정수(아니면 0). */
export const amount = (entry: unknown): number => {
  const parsed = Number(entry);
  return Number.isFinite(parsed) && parsed >= 0 ? Math.round(parsed) : 0;
};
/** 값 맵의 항목들(맵이 아니면 없음). */
export const entriesOf = (value: unknown): Array<[string, unknown]> => Object.entries(asRaw(value));

/** 한 글자씩 붙여 가며 `measure` 바이트를 넘기 전까지 자른다(몰 화면과 같은 글자 수 규칙). */
export function cutBytes(entry: string, maxBytes: number, measure: (value: string) => number): string {
  let out = '';
  for (const char of entry) {
    if (measure(out + char) > maxBytes) break;
    out += char;
  }
  return out.trim();
}
