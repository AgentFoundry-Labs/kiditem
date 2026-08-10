/**
 * Entry RAG의 선택적 요약 생성 경계.
 *
 * runtime/model은 HTTP 요청이 아니라 서버 설정에서만 고른다. 외부 수집 텍스트는
 * untrusted input이므로, adapter는 provider별로 도구 표면을 비활성화한 상태에서
 * 최종 텍스트만 돌려준다.
 */
export const SOURCING_ASSISTANT_GENERATION_PORT = Symbol('SourcingAssistantGenerationPort');

export type SourcingAssistantRuntime = 'claude' | 'codex';

export interface SourcingAssistantGenerationRequest {
  runtime: SourcingAssistantRuntime;
  /** 필수 설정값. adapter가 임의의 모델을 채우지 않는다. */
  model: string;
  prompt: string;
  timeoutMs: number;
}

export type SourcingAssistantGenerationFailureReason =
  | 'cli_not_found'
  | 'unauthenticated'
  | 'timeout'
  | 'output_limit'
  | 'busy'
  | 'execution_failed';

export interface SourcingAssistantGenerationSuccess {
  ok: true;
  runtime: SourcingAssistantRuntime;
  model: string;
  text: string;
  durationMs: number;
}

export interface SourcingAssistantGenerationFailure {
  ok: false;
  runtime: SourcingAssistantRuntime;
  reason: SourcingAssistantGenerationFailureReason;
  /** 서버 로그 전용 진단값. HTTP 응답에 그대로 싣지 않는다. */
  message: string;
  durationMs: number;
}

export type SourcingAssistantGenerationResult =
  | SourcingAssistantGenerationSuccess
  | SourcingAssistantGenerationFailure;

export interface SourcingAssistantGenerationPort {
  run(request: SourcingAssistantGenerationRequest): Promise<SourcingAssistantGenerationResult>;
}
