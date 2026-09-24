import {
  ERROR_DEFINITIONS,
  FieldErrorSchema,
  resolveErrorCode,
  type ErrorKind,
  type FieldError,
  type KiditemErrorCode,
} from '@kiditem/shared/errors';

/**
 * 봉투 `details`에서 웹이 읽는 구조 데이터(ADR-0023). 코드 분기는 `ApiError.code`로 하고, 여기에는
 * 식별자·대기 시간·등록되지 않은 하위 사유(`reason`)만 있다.
 */
export type ApiErrorDetails = Readonly<{
  attemptId?: string;
  /** 등록 코드 밑의 기계 사유(예: 중복 거절 `draft_exists`, 채널 `ambiguous_listing`). 화면 문장이 아니다. */
  reason?: string;
  /** How long the response said to wait before asking again, from its `Retry-After`. */
  retryAfterMs?: number;
  /** The sales product a duplicate refusal collides with, from its `details.existing.salesProductId`. */
  existingSalesProductId?: string;
  /** That product's status (`details.existing.salesProductStatus`), so the link can say what it opens. */
  existingSalesProductStatus?: string;
}>;

export type ApiErrorCode = KiditemErrorCode | 'UNKNOWN';

const HANGUL = /[가-힣]/;
const INTERNAL_TEXT = ERROR_DEFINITIONS.INTERNAL_ERROR.text;

/**
 * API 실패 하나. `code`는 레지스트리 코드(모르면 `UNKNOWN`), `message`는 항상 한국어 운영자 문장이다 —
 * 서버가 한국어 문장을 주면 그것, 아니면 코드의 레지스트리 문장. 영어 원문은 여기서 끊긴다.
 */
export class ApiError extends Error {
  readonly code: ApiErrorCode;
  readonly kind: ErrorKind | 'unknown';

  constructor(
    public readonly status: number,
    code: string | null,
    message?: string | null,
    public readonly details: ApiErrorDetails = {},
    public readonly errors: readonly FieldError[] = [],
  ) {
    const resolved = resolveErrorCode(code);
    const fallback = resolved ? ERROR_DEFINITIONS[resolved].text : INTERNAL_TEXT;
    super(typeof message === 'string' && HANGUL.test(message) ? message.trim() : fallback);
    this.name = 'ApiError';
    this.code = resolved ?? 'UNKNOWN';
    this.kind = resolved ? ERROR_DEFINITIONS[resolved].kind : 'unknown';
  }
}

export function isApiError(err: unknown): err is ApiError {
  return err instanceof ApiError;
}

/**
 * 오류 하나를 운영자가 읽을 한국어 문장으로(화면·토스트의 유일한 choke point).
 *
 *   - null/undefined → null (렌더링 `error ?? null` 삼항용)
 *   - ApiError       → 서버의 한국어 문장 또는 코드의 레지스트리 문장(코드를 모르는 일반 실패는 `fallback`)
 *   - 한국어 Error   → 그 문장(웹 자신이 던진 안내)
 *   - 그 밖(ZodError·영어 Error·임의 값) → `fallback`, 없으면 INTERNAL_ERROR 문장
 */
export function friendlyError(err: unknown, fallback?: string): string | null {
  if (err == null) return null;
  if (isApiError(err)) return err.code === 'UNKNOWN' && err.message === INTERNAL_TEXT && fallback ? fallback : err.message;
  if (err instanceof Error && err.name !== 'ZodError' && HANGUL.test(err.message)) return err.message;
  return fallback ?? INTERNAL_TEXT;
}

/**
 * 오류 응답 → `ApiError`. ADR-0023 봉투(`code`·`kind`·`message`·`errors`·`details`)를 읽고, 옛 봉투
 * (`error`·영어 `message`·최상위 `attemptId`/`existing`)는 `resolveErrorCode(body.code ?? body.error)`로
 * 이행한다. 문장이 한국어가 아니면 `ApiError`가 코드의 레지스트리 문장으로 바꾼다. 본문도 코드도 없으면
 * 호출부의 `fallback` 문장.
 */
export function apiErrorFromBody(res: Response, body: unknown, fallback?: string): ApiError {
  const record = (body && typeof body === 'object' ? body : {}) as Record<string, unknown>;
  const details = (record.details && typeof record.details === 'object' ? record.details : {}) as Record<string, unknown>;
  const rawCode = typeof record.code === 'string' ? record.code : typeof record.error === 'string' ? record.error : null;
  const attemptId = details.attemptId ?? record.attemptId;
  const reason = details.reason ?? record.reason;
  const parsed: ApiErrorDetails = {
    ...(typeof attemptId === 'string' && attemptId ? { attemptId } : {}),
    ...(typeof reason === 'string' && reason ? { reason } : {}),
    ...existingSalesProductDetail(details.existing ?? record.existing),
    ...retryAfterDetail(res),
  };
  const message = typeof record.message === 'string' && record.message.trim() ? record.message : null;
  return new ApiError(
    res.status,
    rawCode,
    message ?? (rawCode === null ? fallback ?? null : null),
    parsed,
    fieldErrors(record.errors),
  );
}

function fieldErrors(value: unknown): FieldError[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    const parsed = FieldErrorSchema.safeParse(item);
    return parsed.success ? [parsed.data] : [];
  });
}

/** 중복 거절(409)이 가리키는 기존 판매 상품. 화면이 그 초안으로 가는 링크를 낸다(KID-313). */
function existingSalesProductDetail(
  existing: unknown,
): { existingSalesProductId?: string; existingSalesProductStatus?: string } {
  if (!existing || typeof existing !== 'object') return {};
  const { salesProductId, salesProductStatus } = existing as Record<string, unknown>;
  if (typeof salesProductId !== 'string' || !salesProductId) return {};
  return {
    existingSalesProductId: salesProductId,
    ...(typeof salesProductStatus === 'string' && salesProductStatus ? { existingSalesProductStatus: salesProductStatus } : {}),
  };
}

/**
 * How long `Retry-After` says to wait, in either form the header allows: whole
 * seconds, or an HTTP date. A moment already past means nothing is left to
 * wait for; a header the client cannot read leaves the caller its own cadence.
 */
function retryAfterDetail(res: Response): { retryAfterMs?: number } {
  const header = res.headers.get('Retry-After')?.trim();
  if (!header) return {};
  if (/^\d+$/.test(header)) return { retryAfterMs: Number(header) * 1_000 };
  const until = Date.parse(header);
  return Number.isNaN(until) ? {} : { retryAfterMs: Math.max(0, until - Date.now()) };
}

/**
 * `fetchRaw`로 받은 실패 응답 → `ApiError`(파일 내려받기 등 JSON이 아닌 성공 응답을 쓰는 호출부용).
 * 본문 파싱은 `apiClient`와 같은 `apiErrorFromBody` 하나다.
 */
export async function readApiError(res: Response, fallback?: string): Promise<ApiError> {
  const body = await res.clone().json().catch(() => null);
  return apiErrorFromBody(res, body, fallback);
}
