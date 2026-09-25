import type { OperationLockKey } from '@kiditem/shared/operation';
import { RuntimeError, isRuntimeError } from './errors';
import { SITE_LOGIN_REQUIRED } from './site-caller';

/**
 * 브라우저 자원 — 수집 창·탭·로그인 확인. 이름은 서버 lockKey와 같다
 * (`account:<channelAccountId>`는 그 계정으로 로그인된 탭, `resource:<site>:<id>`는 그 사이트 탭).
 * 동시 실행 거절은 서버 잠금이 한다; 여기는 탭을 어느 실행이 쥐고 있는지만 안다.
 */
export interface BrowserLease {
  readonly tabId: number | null;
  /**
   * 실행이 어떻게 끝나든 정확히 한 번 부른다. 두 번째부터는 no-op. `error`가 운영자가 탭에서 해야 할 일(로그인,
   * 사이트 밖 주소)이면 새로 연 탭을 닫지 않고 앞으로 가져온다 — 그 탭에서 로그인하고 다시 수집한다.
   */
  release(outcome?: { error?: unknown }): Promise<void>;
}

export interface BrowserResources {
  /**
   * 잠금 키마다 필요한 탭을 열거나 재사용하고, 로그인 확인이 필요한 키는 확인한 뒤 돌려준다.
   * `site`는 그 kind의 수집기가 선언한 사이트 이름 — `account:` 키는 그 사이트가 `sites`에 있으면 그 탭을 연다(KID-355).
   */
  acquire(input: { operationId: string; lockKeys: readonly OperationLockKey[]; site?: string | null; signal: AbortSignal }): Promise<BrowserLease>;
}

export const RUNTIME_BROWSER_ALREADY_ACQUIRED = 'RUNTIME_BROWSER_ALREADY_ACQUIRED' as const;
export const RUNTIME_BROWSER_UNAVAILABLE = 'RUNTIME_BROWSER_UNAVAILABLE' as const;

/** 브라우저 자원이 쓰는 `chrome.tabs`의 최소 모양(스펙은 이 경계만 가짜로 둔다). */
export interface BrowserChrome {
  tabs: {
    query(query: { url: string }): Promise<Array<{ id?: number }>>;
    create(properties: { url: string; active?: boolean }): Promise<{ id?: number }>;
    remove(tabId: number): Promise<void>;
    update(tabId: number, properties: { active: boolean }): Promise<unknown>;
  };
}

/** 사이트 이름 → 탭 URL 접두. `sites/*`의 `SiteDefinition.origin`을 입구가 모아 준다(core는 sites를 import하지 않는다). */
export type BrowserSites = Readonly<Record<string, { readonly origin: string }>>;

export interface BrowserResourcesOptions {
  /** `account:<id>` 키가 기본으로 쓰는 사이트(그 계정으로 로그인하는 곳). 수집기가 `sites`에 있는 사이트를 선언하면 그쪽이 먼저다. 둘 다 없으면 account 키는 탭을 잡지 않는다. */
  accountSite?: string;
}

/**
 * lockKey 이름으로 탭을 잡는다. `org`와 `sites`에 없는 `resource` 슬롯(예 `resource:keyword:*`)은 탭이 없다.
 * 사이트 탭은 그 origin의 탭을 재사용하거나 새로 열고, release는 새로 연 탭만 닫는다.
 * 로그인 확인은 아직 하지 않는다 — 로그인이 필요한 kind가 옮겨질 때(KID-359 이후) 여기에 더한다.
 */
export function createBrowserResources(chromeApi: BrowserChrome, sites: BrowserSites, options: BrowserResourcesOptions = {}): BrowserResources {
  const held = new Set<string>();
  return {
    async acquire({ operationId, lockKeys, site = null, signal }) {
      if (held.has(operationId)) {
        throw new RuntimeError(RUNTIME_BROWSER_ALREADY_ACQUIRED, '이 실행은 이미 브라우저 자원을 잡고 있습니다.', { operationId });
      }
      signal.throwIfAborted();
      const accountSite = site !== null && site in sites ? site : (options.accountSite ?? null);
      const siteNames = [...new Set(lockKeys.map((key) => siteOfLockKey(key, accountSite)).filter((name): name is string => name !== null && name in sites))];
      if (siteNames.length > 1) {
        throw new RuntimeError(RUNTIME_BROWSER_UNAVAILABLE, '한 실행이 두 사이트의 탭을 함께 잡을 수 없습니다.', { sites: siteNames });
      }
      held.add(operationId);
      try {
        const tab = siteNames.length === 1 ? await openSiteTab(chromeApi, sites[siteNames[0]].origin) : null;
        let released = false;
        return {
          tabId: tab?.tabId ?? null,
          async release(outcome = {}) {
            if (released) return;
            released = true;
            held.delete(operationId);
            if (!tab?.opened) return;
            if (operatorMustAct(outcome.error)) {
              // 로그인 화면·사이트 밖 주소에서 멈췄다 — 운영자가 이 탭에서 풀도록 남기고 앞으로 가져온다.
              await chromeApi.tabs.update(tab.tabId, { active: true }).catch(() => undefined);
              return;
            }
            await chromeApi.tabs.remove(tab.tabId).catch(() => undefined);
          },
        };
      } catch (error) {
        held.delete(operationId);
        throw error;
      }
    },
  };
}

function siteOfLockKey(key: string, accountSite: string | null): string | null {
  if (key.startsWith('resource:')) return key.split(':')[1] ?? null;
  if (key.startsWith('account:')) return accountSite;
  return null;
}

async function openSiteTab(chromeApi: BrowserChrome, origin: string): Promise<{ tabId: number; opened: boolean }> {
  const base = origin.replace(/\/+$/, '');
  const [existing] = await chromeApi.tabs.query({ url: `${base}/*` });
  if (typeof existing?.id === 'number') return { tabId: existing.id, opened: false };
  const created = await chromeApi.tabs.create({ url: base, active: false });
  if (typeof created.id !== 'number') {
    throw new RuntimeError(RUNTIME_BROWSER_UNAVAILABLE, '사이트 탭을 열지 못했습니다.', { origin: base });
  }
  return { tabId: created.id, opened: true };
}

/**
 * 운영자가 탭에서 해야 할 일로 끝난 실행인가: 사이트 로그인이 필요하거나(`SITE_LOGIN_REQUIRED`) 탭이 사이트 밖 주소로
 * 옮겨 갔다(`reason: 'unexpected_url'`) — `sites/tab-page`의 `leftForOperator`와 같은 판정(core는 sites를 모른다).
 */
export function operatorMustAct(error: unknown): boolean {
  return isRuntimeError(error) && (error.code === SITE_LOGIN_REQUIRED || error.details?.reason === 'unexpected_url');
}
