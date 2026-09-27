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
  /** 청크 사이에 progress만 곧바로 올린다(운영자 검증 대기 `attention` 등). 임대도 연장된다. */
  report?(progress: Record<string, unknown>): Promise<void>;
}

/** 수집기가 청크를 다 낸 뒤 finish에 실을 값(생성기 반환값). */
export interface CollectFinish<TResult extends Record<string, unknown> = Record<string, unknown>> {
  /** `reconciling`: 몰에 제출했지만 외부 결과를 못 읽은 등록(KID-364). 없으면 succeeded. */
  outcome?: 'succeeded' | 'reconciling';
  window?: OperationWindow;
  result?: TResult;
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
  /**
   * 청크 스트림. 실행마다 다른 결과(등록 결과처럼 채운 과정이 정하는 것)는 생성기가 끝에 `CollectFinish`로 돌려준다 —
   * `summarize`보다 앞선다.
   */
  collect(plan: TPlan, site: TSite, context: CollectContext): AsyncIterable<CollectedChunk> | AsyncGenerator<CollectedChunk, CollectFinish<TResult> | void, undefined>;
  summarize?(input: { chunks: number; items: number }): { window?: OperationWindow; result?: TResult };
}

/** 사이트가 운영자를 기다리는 까닭(검증 화면). null이면 풀렸다. */
export interface OperatorAttention {
  kind: 'verification';
  site: string;
  label: string;
}

/**
 * 사이트가 운영자를 기다리는 동안 progress에 `attention`을 싣는다(웹이 "탭에서 검증을 통과해 주세요"로 보인다).
 * 처음 알린 시각(`since`)은 다시 알려도 그대로다. 풀리면 `attention: null`.
 */
export function attentionReporter(
  report: ((progress: Record<string, unknown>) => Promise<void>) | undefined,
  base: Record<string, unknown>,
): (attention: OperatorAttention | null) => Promise<void> {
  let since: string | null = null;
  return async (attention) => {
    if (!report) return;
    if (!attention) {
      since = null;
      await report({ ...base, attention: null });
      return;
    }
    since ??= new Date().toISOString();
    await report({ ...base, attention: { ...attention, since } });
  };
}
