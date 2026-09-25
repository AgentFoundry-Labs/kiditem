import type { SiteCaller, SiteCallerOptions } from '../core/site-caller';

/**
 * 사이트 = 외부 사이트 하나(`wing`, `ad-center`, …)의 API·DOM 읽기·쓰기만.
 * 업무 판단(무엇을 언제 모을지)은 수집기에, 서버 통신은 core에 있다.
 * content script는 API가 없어 DOM을 읽어야 할 때만 두고, 페이지 주입은 파일 주입만(`func.toString()` 금지).
 */
export interface SiteDefinition {
  readonly name: string;
  /** 이 사이트의 탭이 열려야 하는 URL 접두. 브라우저 자원이 탭을 열 때 쓴다. */
  readonly origin: string;
  readonly caller: SiteCallerOptions;
}

export interface Site {
  readonly definition: SiteDefinition;
  caller(tabId: number | null): SiteCaller;
}
