import type { OperationChunkKind, OperationKind, OperationWindow } from '@kiditem/shared/operation';
import type { SiteCaller } from '../core/site-caller';

/** 수집기가 내는 청크 하나. runner가 (chunkKind, 순번)으로 서버에 올린다. 순번은 runner가 매긴다. */
export interface CollectedChunk {
  chunkKind: OperationChunkKind;
  payload: unknown[];
  progress?: Record<string, unknown>;
}

export interface CollectContext {
  signal: AbortSignal;
  /** 사이트 탭이 필요한 kind만 non-null. */
  tabId: number | null;
}

/**
 * 수집기 = 서버 kind 문자열과 같은 이름의 폴더 하나. 서버·탭·토큰을 모른다.
 * `plan`은 begin 응답 `operation.plan`(owner가 정한 범위), `site`는 그 kind의 사이트 호출기.
 * 끝나면 finish에 실을 `window`·`result`를 돌려준다.
 */
export interface Collector<
  TPlan = Record<string, unknown>,
  TResult extends Record<string, unknown> = Record<string, unknown>,
  TSite = SiteCaller | null,
> {
  readonly kind: OperationKind;
  /** 이 kind가 쓰는 사이트(`sites/<site>`) — 없으면 null(더미 kind). */
  readonly site: string | null;
  /**
   * `site`는 입구가 그 사이트로 조립해 넘기는 핸들이다. 수집기는 sites를 import하지 못하므로 필요한 모양을 자기
   * 폴더에 인터페이스로 선언하고(`TSite`), 입구가 `sites/<site>`의 구현을 넘긴다(KID-354).
   */
  collect(plan: TPlan, site: TSite, context: CollectContext): AsyncIterable<CollectedChunk>;
  summarize?(input: { chunks: number; items: number }): { window?: OperationWindow; result?: TResult };
}
