/**
 * Adapter 인터페이스 — Paperclip 패턴.
 * 각 adapter는 에이전트 실행 런타임을 추상화.
 */

export interface ExecutionContext {
  runId: string;
  agent: {
    id: string;
    name: string;
    type: string;
    permissions: Record<string, unknown>;
  };
  config: Record<string, unknown>;   // adapterConfig from DB
  prompt: string;
  skillPaths: string[];              // 주입할 스킬 디렉토리 경로들
  sessionId?: string;                // resume 시 이전 세션 ID
  timeoutSec: number;
  graceSec: number;
  env: Record<string, string>;
  cwd: string;
  allowedTools: string;
  permissionMode: string;
}

export interface UsageSummary {
  inputTokens?: number;
  outputTokens?: number;
  costCents?: number;
}

export interface ExecutionResult {
  exitCode: number | null;
  signal: string | null;
  timedOut: boolean;
  stdout: string;
  stderr: string;
  sessionIdAfter?: string;
  usage?: UsageSummary;
}

export interface EnvironmentTestResult {
  ok: boolean;
  message: string;
  details?: Record<string, unknown>;
}

export interface AdapterModule {
  type: string;
  execute(ctx: ExecutionContext): Promise<ExecutionResult>;
  testEnvironment?(config: Record<string, unknown>): Promise<EnvironmentTestResult>;
}
