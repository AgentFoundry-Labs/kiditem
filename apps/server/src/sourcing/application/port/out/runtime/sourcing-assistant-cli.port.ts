export const SOURCING_ASSISTANT_CLI_PORT = Symbol('SourcingAssistantCliPort');

export interface SourcingAssistantCliRequest {
  /** 검색된 내부 문서로 이미 채워진 최종 프롬프트. 어댑터는 내용을 해석하지 않는다. */
  prompt: string;
  /**
   * 사용할 모델. 필수다.
   *
   * 루트 AGENTS.md: "Missing model selection is an explicit error; do not use silent
   * `model || default` fallback." 어댑터가 기본값을 채우지 않는다.
   */
  model: string;
  timeoutMs: number;
}

export type SourcingAssistantCliFailureReason =
  /** CLI 실행 파일을 찾지 못함. 설치 안 됨. */
  | 'cli_not_found'
  /** CLI 는 떴지만 인증이 안 됨. 운영자가 `claude login` 을 해야 한다. */
  | 'unauthenticated'
  /** 시간 초과. */
  | 'timeout'
  /** 그 외 실행 실패. */
  | 'execution_failed';

export interface SourcingAssistantCliSuccess {
  ok: true;
  text: string;
  model: string;
  durationMs: number;
}

export interface SourcingAssistantCliFailure {
  ok: false;
  reason: SourcingAssistantCliFailureReason;
  message: string;
  durationMs: number;
}

export type SourcingAssistantCliResult = SourcingAssistantCliSuccess | SourcingAssistantCliFailure;

/**
 * 로컬 CLI 프로세스로 LLM 을 호출하는 실행 경계.
 *
 * HTTP API 키가 아니라 운영자 머신에 이미 로그인된 CLI 세션을 쓴다. 실패를 예외로
 * 던지지 않고 결과 타입으로 돌려주는 이유는, 인증 실패 시에도 검색 결과만으로
 * 답을 구성해야 하기 때문이다.
 */
export interface SourcingAssistantCliPort {
  run(request: SourcingAssistantCliRequest): Promise<SourcingAssistantCliResult>;
}
