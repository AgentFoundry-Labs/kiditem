import type { OperationLockKey } from '@kiditem/shared/operation';

/**
 * 브라우저 자원 — 수집 창·탭·로그인 확인. 이름은 서버 lockKey와 같다
 * (`account:<channelAccountId>`는 그 계정으로 로그인된 탭, `resource:<site>:<id>`는 그 사이트 탭).
 * 동시 실행 거절은 서버 잠금이 한다; 여기는 탭을 어느 실행이 쥐고 있는지만 안다.
 */
export interface BrowserLease {
  readonly tabId: number | null;
  /** 실행이 어떻게 끝나든 정확히 한 번 부른다. 두 번째부터는 no-op. */
  release(): Promise<void>;
}

export interface BrowserResources {
  /** 잠금 키마다 필요한 탭을 열거나 재사용하고, 로그인 확인이 필요한 키는 확인한 뒤 돌려준다. */
  acquire(input: { operationId: string; lockKeys: readonly OperationLockKey[]; signal: AbortSignal }): Promise<BrowserLease>;
}
