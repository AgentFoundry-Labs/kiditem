'use client';

import { safeStorageGet, safeStorageSet } from './browser-storage';

/**
 * 자동 로그인 차단과 재시도 간격 — 같은 몰을 계속 두드려 계정이 잠기지 않게 한다.
 *
 * 두 가지를 둔다.
 *
 * 1. **차단**: 자격증명 문제로 실패한 몰은 사람이 직접 로그인할 때까지 시도하지 않는다.
 *    비밀번호가 바뀌었거나 캡차 · 본인확인이 걸린 상태에서 매 바퀴 다시 넣으면 계정이 잠긴다.
 *    풀리는 때는 셋이다 — 사람이 직접 로그인해 로그인 상태 확인이 `signed_in` 을 보거나,
 *    로그인 테스트가 성공하거나, 사람이 화면에서 직접 푼다.
 * 2. **재시도 간격**: 성공했는지 확인하지 못한 자동 로그인도 한 시간에 한 번만 다시 시도한다.
 *    화면만 보고 "로그인됐다/아니다"를 단정하기 어려워서(몰마다 로그인 뒤 화면이 다르다)
 *    판정 대신 횟수로 막는다.
 *
 * 우리 서버나 확장이 답하지 못한 것(요청 한도 초과 · 시간 초과 · 확장 없음)은 자격증명 문제가
 * 아니므로 차단 이유가 되지 못한다 — 그걸로 막으면 멀쩡히 로그인된 몰이 '직접 로그인 필요'로
 * 굳는다.
 */

const STORAGE_KEY = 'kiditem.mall-auto-login-block.v1';
const ATTEMPT_STORAGE_KEY = 'kiditem.mall-auto-login-attempt.v1';

/** 확인하지 못한 자동 로그인을 다시 시도하기까지 기다리는 시간. */
export const AUTO_LOGIN_RETRY_INTERVAL_MS = 60 * 60_000;

/**
 * 이 실패가 자격증명 문제인가 — 몰이 아이디·비밀번호를 거부했다고 **말했을 때만** 그렇다.
 *
 * 전에는 반대로 '우리 쪽 사정' 문구를 적어 두고 그 밖의 모든 실패를 자격증명 문제로 봤다. 그러자
 * 새로 생긴 우리 쪽 오류(서버의 `ORDER_COLLECTION_ATTEMPT_NOT_FOUND`, 확장의 "message channel
 * closed")가 그대로 차단이 되어, 로그인된 쿠팡직배송 · 키즈노트가 '자동 멈춤 · 직접 로그인'으로
 * 굳었다(2026-09-18). 몰이 한 말만 믿는다.
 */
export function isCredentialFailureReason(reason: string): boolean {
  return mallRejectedCredentials(reason);
}

/**
 * 몰이 알림 창으로 남긴 답 중 "이 아이디·비밀번호로는 못 들어온다"는 뜻의 문장들. 이 말을 들으면
 * 더 두드리지 않는다 — 같은 비밀번호로 다시 넣으면 계정이 잠긴다. 그 밖의 문장(점검 중 · 세션
 * 만료 · 캡차)은 자격증명 문제가 아니므로 막지 않고 사장님께 그대로 보여 주기만 한다.
 */
const MALL_CREDENTIAL_REJECTIONS = [
  '비밀번호가 일치하지',
  '비밀번호를 확인',
  '비밀번호가 올바르지',
  '아이디 또는 비밀번호',
  '아이디와 비밀번호',
  '등록되지 않은 아이디',
  '존재하지 않는 아이디',
  '일치하는 회원',
  '가입되지 않은',
  'incorrect password',
  'invalid password',
  'password does not match',
] as const;

/** 몰이 아이디·비밀번호를 거부했다고 말했는가. */
export function mallRejectedCredentials(message: string | null | undefined): boolean {
  const text = (message ?? '').toLowerCase();
  if (!text) return false;
  return MALL_CREDENTIAL_REJECTIONS.some((phrase) => text.includes(phrase.toLowerCase()));
}

/**
 * 무엇이 막혔나. 둘은 사람이 할 일이 다르다 —
 * `login` 은 아이디·비밀번호 문제라 계정을 고치거나 직접 로그인해야 하고,
 * `verification` 은 본인확인 · OTP · 캡차라 몰 화면에서 사람이 인증만 하면 된다.
 */
export type MallLoginBlockKind = 'login' | 'verification';

export interface MallLoginBlock {
  mallKey: string;
  /** 언제 막혔나. */
  at: number;
  /** 왜 막혔나 — 사람이 읽는 짧은 말. 비밀번호 같은 값은 담지 않는다. */
  reason: string;
  kind: MallLoginBlockKind;
}

type BlockMap = Record<string, MallLoginBlock>;

let blocks: BlockMap = {};
let hydrated = false;
const listeners = new Set<() => void>();
let snapshot: MallLoginBlock[] = [];

function persist(): void {
  safeStorageSet('local', STORAGE_KEY, JSON.stringify(blocks));
}

function refresh(): void {
  snapshot = Object.values(blocks).sort((a, b) => b.at - a.at);
  for (const listener of listeners) listener();
}

function hydrate(): void {
  if (hydrated || typeof window === 'undefined') return;
  hydrated = true;
  const raw = safeStorageGet('local', STORAGE_KEY);
  if (!raw) return;
  try {
    const parsed = JSON.parse(raw) as BlockMap;
    const valid = Object.entries(parsed).filter(
      ([mallKey, value]) =>
        typeof mallKey === 'string' && typeof value?.at === 'number' && typeof value?.reason === 'string',
    );
    // 우리 쪽이 답하지 못해 생긴 차단은 버린다(요청 한도 초과 · 시간 초과 · 확장 없음 · 로그인
    // 뒤 화면 확인 실패). 비밀번호가 틀린 게 아니라서 지금은 새로 만들지 않지만, 그 규칙이 생기기
    // 전에 만든 차단이 남아 멀쩡히 로그인된 몰을 '직접 로그인'으로 붙들고 있었다. 한 번 걸러
    // 저장해 두면 다시 읽히지 않는다.
    // 인증(캡차 · 본인확인) 차단은 몰 화면의 일이라 그대로 두고, 로그인 차단만 몰의 거부로 거른다.
    const kept = valid.filter(([, value]) =>
      value.kind === 'verification' || isCredentialFailureReason(value.reason));
    blocks = Object.fromEntries(kept);
    snapshot = Object.values(blocks).sort((a, b) => b.at - a.at);
    if (kept.length !== valid.length) persist();
  } catch {
    blocks = {};
  }
}

/** 이 몰은 자동 로그인을 멈춘 상태인가. */
export function isMallAutoLoginBlocked(mallKey: string): boolean {
  hydrate();
  return Boolean(blocks[mallKey]);
}

export function mallAutoLoginBlock(mallKey: string): MallLoginBlock | null {
  hydrate();
  return blocks[mallKey] ?? null;
}

/** 실패했다 — 이제부터 이 몰은 사람이 직접 로그인(또는 인증)해야 한다. */
export function blockMallAutoLogin(
  mallKey: string,
  reason: string,
  kind: MallLoginBlockKind = 'login',
  at = Date.now(),
): MallLoginBlock {
  hydrate();
  const block: MallLoginBlock = { mallKey, at, reason, kind };
  blocks = { ...blocks, [mallKey]: block };
  persist();
  refresh();
  return block;
}

/** 풀렸다 — 사람이 직접 로그인했거나 로그인 테스트가 성공했다. */
export function clearMallAutoLoginBlock(mallKey: string): void {
  hydrate();
  if (!blocks[mallKey]) return;
  const next = { ...blocks };
  delete next[mallKey];
  blocks = next;
  persist();
  refresh();
}

export function subscribeMallLoginBlocks(listener: () => void): () => void {
  hydrate();
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getMallLoginBlocks(): MallLoginBlock[] {
  hydrate();
  return snapshot;
}

/** 서버 렌더에서는 저장소를 읽지 않는다. */
export function getMallLoginBlocksServerSnapshot(): MallLoginBlock[] {
  return EMPTY;
}

const EMPTY: MallLoginBlock[] = [];

/* ── 재시도 간격 ─────────────────────────────────────────────────────────── */

type AttemptMap = Record<string, number>;

let attempts: AttemptMap = {};
let attemptsHydrated = false;

function hydrateAttempts(): void {
  if (attemptsHydrated || typeof window === 'undefined') return;
  attemptsHydrated = true;
  const raw = safeStorageGet('local', ATTEMPT_STORAGE_KEY);
  if (!raw) return;
  try {
    const parsed = JSON.parse(raw) as AttemptMap;
    attempts = Object.fromEntries(
      Object.entries(parsed).filter(([mallKey, at]) => typeof mallKey === 'string' && typeof at === 'number'),
    );
  } catch {
    attempts = {};
  }
}

/** 자동 로그인을 시도했다고 적는다. 성공 여부와 무관하게 적어야 다음 바퀴가 곧바로 다시 넣지 않는다. */
export function markMallAutoLoginAttempt(mallKey: string, at = Date.now()): void {
  hydrateAttempts();
  attempts = { ...attempts, [mallKey]: at };
  safeStorageSet('local', ATTEMPT_STORAGE_KEY, JSON.stringify(attempts));
}

/** 아직 기다려야 하면 다시 시도할 수 있는 시각, 지금 시도해도 되면 `null`. */
export function mallAutoLoginRetryAt(mallKey: string, now = Date.now()): number | null {
  hydrateAttempts();
  const last = attempts[mallKey];
  if (typeof last !== 'number') return null;
  const retryAt = last + AUTO_LOGIN_RETRY_INTERVAL_MS;
  return retryAt > now ? retryAt : null;
}

/** 사람이 직접 눌렀다 — 간격을 기다리지 않는다(로그인 테스트 · 카드의 다시 켜기). */
export function clearMallAutoLoginAttempt(mallKey: string): void {
  hydrateAttempts();
  if (!(mallKey in attempts)) return;
  const next = { ...attempts };
  delete next[mallKey];
  attempts = next;
  safeStorageSet('local', ATTEMPT_STORAGE_KEY, JSON.stringify(attempts));
}

export function resetMallLoginBlocksForTest(): void {
  blocks = {};
  snapshot = [];
  hydrated = false;
  listeners.clear();
  attempts = {};
  attemptsHydrated = false;
}
