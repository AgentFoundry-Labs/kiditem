/**
 * Adapter 인터페이스 — Paperclip 패턴.
 * 각 adapter는 에이전트 실행 런타임을 추상화.
 *
 * Immutable ExecutionContext: Claude Code DeepImmutable 패턴 적용.
 * ctx 객체는 생성 후 변경 불가. session retry 시 새 객체 생성.
 *
 * Streaming: execute()는 AsyncGenerator<StreamEvent, ExecutionResult>.
 * 실행 중 토큰 카운트 등 이벤트를 yield, 완료 시 ExecutionResult를 return.
 * collectResult()로 기존처럼 Promise<ExecutionResult>로 사용 가능.
 */

import type { ResolvedPermissions } from '../../../../agent-registry/permissions/hierarchy.validator';

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
  readonly maxOutputTokens: number;
  readonly resolvedPermissions?: ResolvedPermissions;
}

interface UsageSummary {
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
  stopReason?: string;
}

export interface StreamEvent {
  type: 'token_count' | 'content' | 'error';
  data: unknown;
}

export interface EnvironmentTestResult {
  ok: boolean;
  message: string;
  details?: Record<string, unknown>;
}

export interface AdapterModule {
  type: string;
  execute(ctx: ExecutionContext): AsyncGenerator<StreamEvent, ExecutionResult>;
  testEnvironment?(config: Record<string, unknown>): Promise<EnvironmentTestResult>;
}

/** Consume a streaming adapter generator and return just the final result. */
export async function collectResult(
  gen: AsyncGenerator<StreamEvent, ExecutionResult>,
): Promise<ExecutionResult> {
  let iter: IteratorResult<StreamEvent, ExecutionResult>;
  do {
    iter = await gen.next();
  } while (!iter.done);
  return iter.value;
}
