'use client';

import { safeStorageGet, safeStorageSet } from './browser-storage';
import { EXTENSION_TIMEOUT_MESSAGE } from './extension-bridge';

/**
 * 자동 로그인 차단 — 한 번 실패한 몰은 다시 로그인하러 들어가지 않는다.
 *
 * 자동 로그인이 실패했다는 것은 비밀번호가 바뀌었거나, 캡차 · 본인확인이 걸렸거나, 몰 화면이
 * 바뀌었다는 뜻이다. 그 상태로 매 바퀴 다시 시도하면 계정이 잠기고 몰에 실패 기록만 쌓인다.
 * 그래서 실패한 몰은 여기 적어 두고, 그 뒤로는 **시도하지 않고 사람에게 직접 로그인하라고
 * 알린다**.
 *
 * 풀리는 때는 셋이다 — 사람이 직접 로그인해 로그인 상태 확인이 `signed_in` 을 보거나,
 * 로그인 테스트가 성공하거나, 사람이 화면에서 직접 푼다.
 */

const STORAGE_KEY = 'kiditem.mall-auto-login-block.v1';

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
    // 확장 응답 시간 초과로 생긴 차단은 버린다. 답을 못 들은 것은 비밀번호가 틀린 게 아니라서
    // 지금은 새로 만들지 않지만, 그 규칙이 생기기 전에 만든 차단이 남아 멀쩡히 로그인된 몰을
    // '직접 로그인'으로 붙들고 있었다. 한 번 걸러 저장해 두면 다시 읽히지 않는다.
    const kept = valid.filter(([, value]) => !value.reason.includes(EXTENSION_TIMEOUT_MESSAGE));
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

export function resetMallLoginBlocksForTest(): void {
  blocks = {};
  snapshot = [];
  hydrated = false;
  listeners.clear();
}
