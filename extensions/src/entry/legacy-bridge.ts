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

export function legacyApiPort(environmentId: string): ApiPort {
  return { fetch: (path, init) => sourceOwnerEnvironmentContext.authedFetch(environmentId, path, init) };
}

export function registerWithLegacyDomains(domain: Parameters<typeof KidItemDomains.register>[0]): void {
  KidItemDomains.register(domain);
}
