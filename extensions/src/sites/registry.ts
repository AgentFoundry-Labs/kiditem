import type { SiteCallerDeps } from '../core/site-caller';
import type { TabPages } from './tab-page';

/**
 * 사이트 등록표(KID-355). 사이트 모듈(`sites/<site>`)이 파일 끝에서 자기 이름으로 등록하고, 입구는 수집기가 선언한
 * `site` 이름으로 찾아 조립한다 — 사이트를 더할 때 입구의 분기를 고치지 않는다(여러 트랙이 같은 파일을 고치지 않게).
 */
export interface SiteDeps extends SiteCallerDeps {
  tabs: TabPages;
  randomId(): string;
}

/** 브라우저 자원이 잡은 탭. 운영자 탭에 묶이는 사이트(상품 페이지)만 쓴다. */
export interface SiteLease {
  tabId: number | null;
}

export interface SiteFactory {
  readonly name: string;
  /** `account:` 잠금이 이 사이트의 탭을 열어야 할 때만 둔다(그 탭의 URL 접두). */
  readonly origin?: string;
  /** 실행마다 새 핸들을 만든다(호출기 간격 기록은 실행 안에서만). 모양은 사이트마다 다르다. */
  create(deps: SiteDeps, lease: SiteLease): unknown;
}

const sites = new Map<string, SiteFactory>();

export function registerSite(factory: SiteFactory): void {
  if (sites.has(factory.name)) throw new Error(`duplicate site: ${factory.name}`);
  sites.set(factory.name, factory);
}

export function siteFactoryFor(name: string): SiteFactory | null {
  return sites.get(name) ?? null;
}

export function registeredSites(): SiteFactory[] {
  return [...sites.values()].sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
}
