/**
 * 옛 전역 JS와 만나는 유일한 파일. 옛 워커가 `importScripts`로 이 번들을 맨 뒤에 실으므로
 * 옛 전역(`KidItemDomains`, `sourceOwnerEnvironmentContext`)이 이미 있다.
 * 다른 어떤 파일도 `KidItem*` 전역을 참조하지 못한다(`check:extension-runtime-layers`).
 * KID-355의 마지막 조각에서 옛 입구가 사라지면 이 파일도 함께 사라진다.
 */
import type { ApiPort } from '../core/api';

declare const KidItemDomains: {
  register(domain: {
    externalActions?: Record<string, { validate(msg: unknown): unknown; handle(input: unknown, environmentId: string): Promise<unknown> }>;
    capabilities?: Record<string, boolean>;
  }): void;
};
declare const sourceOwnerEnvironmentContext: {
  authedFetch(environmentId: string, path: string, init?: RequestInit): Promise<Response>;
};
declare const KidItemWorkerKeepAlive: { during(work: Promise<unknown>): Promise<unknown> } | undefined;

/**
 * 옛 워커 위에서 실렸는가. Vitest와 번들 스펙은 옛 전역 없이 번들을 싣는다 — 그때는 설치를 건너뛴다.
 */
export function legacyGlobalsPresent(): boolean {
  return typeof KidItemDomains !== 'undefined' && typeof sourceOwnerEnvironmentContext !== 'undefined';
}

/** 실행이 끝날 때까지 서비스워커를 살려 둔다(옛 워커의 참조 카운트 keep-alive). */
export function legacyKeepAlive(work: Promise<unknown>): void {
  if (typeof KidItemWorkerKeepAlive === 'undefined' || !KidItemWorkerKeepAlive) return;
  KidItemWorkerKeepAlive.during(work).catch(() => undefined);
}

export function legacyApiPort(environmentId: string): ApiPort {
  return { fetch: (path, init) => sourceOwnerEnvironmentContext.authedFetch(environmentId, path, init) };
}

export function registerWithLegacyDomains(domain: Parameters<typeof KidItemDomains.register>[0]): void {
  KidItemDomains.register(domain);
}
