/**
 * Adapter 인터페이스 — Paperclip 패턴.
 * 각 adapter는 에이전트 실행 런타임을 추상화.
 *
 * Immutable ExecutionContext: Claude Code DeepImmutable 패턴 적용.
 * ctx 객체는 생성 후 변경 불가. session retry 시 새 객체 생성.
 */

export interface ExecutionContext {
  readonly runId: string;
  readonly agent: Readonly<{
    id: string;
    name: string;
    type: string;
    permissions: Record<string, unknown>;
  }>;
  readonly config: Readonly<Record<string, unknown>>;
  readonly prompt: string;
  readonly skillPaths: readonly string[];
  readonly sessionId?: string;
  readonly timeoutSec: number;
  readonly graceSec: number;
  readonly env: Readonly<Record<string, string>>;
  readonly cwd: string;
  readonly allowedTools: string;
  readonly permissionMode: string;
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
