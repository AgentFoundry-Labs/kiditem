/**
 * Outgoing port for text completion (Gemini text models).
 *
 * apps/server/src/ai/AGENTS.md "Transitional shortcuts" 에서 `text-ai.service`
 * 와 `detail-page-ai.service` 가 inline `fetch(...)` 로 Gemini text generation
 * API 를 직접 호출하던 패턴을 캡슐화한다. 모든 Gemini 텍스트 호출은 이 port
 * 를 거쳐야 application service 가 HTTP / SDK / API key 를 알지 않게 된다.
 *
 * Bound in `ai.module.ts` to `GeminiTextCompletionAdapter` via
 * `TEXT_COMPLETION_PORT` token.
 */

export const TEXT_COMPLETION_PORT = Symbol('TEXT_COMPLETION_PORT');

export interface TextCompletionRequest {
  /** System prompt — 항상 명시 (no implicit default). */
  system: string;
  /** User prompt — 보통 raw text 또는 JSON-shape 요청. */
  user: string;
  /** Sampling temperature. caller 가 use-case 별로 결정. */
  temperature: number;
  /**
   * `'application/json'` 으로 지정하면 Gemini 가 JSON-shape 응답을 강제. caller
   * 는 `JSON.parse()` 또는 Zod schema 로 후처리.
   */
  responseMimeType?: 'application/json';
  /**
   * 모델 식별자 (`gemini-2.5-flash` 등). caller 가 ENV 에서 명시적으로 읽어
   * 전달. silent fallback 금지 (apps/server/AGENTS.md No silent model fallback).
   */
  model: string;
  signal?: AbortSignal;
}

export interface TextCompletionResult {
  /** Gemini candidates[0].content.parts[0].text 를 trim 한 결과. */
  text: string;
}

export interface TextCompletionPort {
  complete(request: TextCompletionRequest): Promise<TextCompletionResult>;
}
