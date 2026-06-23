import { spawn } from 'node:child_process';
import { Injectable, Optional } from '@nestjs/common';
import { AgentOsRuntimeError } from '../../../domain/agent-os.errors';
import { HermesRuntimeProfileService } from './hermes-runtime-profile.service';

const DEFAULT_HERMES_PATH = 'hermes';
const DEFAULT_TIMEOUT_MS = 60_000;
const DEFAULT_MAX_OUTPUT_BYTES = 262_144;
const DEFAULT_MAX_CONCURRENT_RUNS = 1;
const TIMEOUT_SIGKILL_GRACE_MS = 250;
const TIMEOUT_FORCE_SETTLE_GRACE_MS = 250;
const KIDITEM_AGENT_OS_TOOLSET = 'kiditem-agent-os';
const PROCESS_ENV_ALLOWLIST = [
  'PATH',
  'HOME',
  'LANG',
  'LC_ALL',
  'TERM',
  'SHELL',
] as const;
const ADAPTER_CONTROLLED_ENV_KEYS = new Set([
  'HERMES_HOME',
  'HERMES_INFERENCE_MODEL',
  'HERMES_INFERENCE_PROVIDER',
  'KIDITEM_AGENT_OS_ORGANIZATION_ID',
  'KIDITEM_AGENT_OS_CONVERSATION_ID',
  'KIDITEM_AGENT_OS_TASK_SESSION_ID',
  'KIDITEM_AGENT_OS_REQUEST_ID',
  'KIDITEM_AGENT_OS_RUN_ID',
  'KIDITEM_AGENT_OS_AGENT_INSTANCE_ID',
  'KIDITEM_AGENT_OS_AGENT_TYPE',
  'KIDITEM_AGENT_OS_REQUESTED_BY_USER_ID',
]);
const SAFE_ENV_KEY_PATTERN = /^[A-Z_][A-Z0-9_]*$/;
const SECRET_INPUT_ENV_PATTERNS = [
  /(^|_)(API_)?KEY$/,
  /(^|_)TOKEN$/,
  /(^|_)SECRET($|_)/,
  /(^|_)PASSWORD$/,
  /(^|_)PASS$/,
  /(^|_)CREDENTIALS?$/,
  /(^|_)COOKIE$/,
  /(^|_)AUTH($|_)/,
  /(^|_)PRIVATE($|_)/,
  /^AWS_/,
  /^GITHUB_/,
  /^ANTHROPIC_/,
  /^OPENAI_/,
  /^GOOGLE_/,
  /^AZURE_/,
  /^SUPABASE_/,
  /^DATABASE_URL$/,
  /^REDIS_URL$/,
  /^SENTRY_DSN$/,
  /^STRIPE_/,
  /^SLACK_/,
  /^HF_/,
  /^HUGGINGFACE_/,
] as const;
const ENV_ASSIGNMENT_PATTERN =
  /\b([A-Z][A-Z0-9_]*)=("[^"]*"|'[^']*'|[^\s]+)/g;
const HERMES_STDOUT_METADATA_PATTERNS = [
  /^session_id:\s*\S+/i,
  /^⚠\s+tirith security scanner enabled\b/i,
] as const;

export interface HermesProcessStartInput {
  command: string;
  args: string[];
  cwd: string;
  env: Record<string, string>;
}

export interface HermesProcessResult {
  stdout: string;
  stderr: string;
  exitCode: number | null;
  signal: NodeJS.Signals | null;
  durationMs: number;
  timedOut: boolean;
}

export interface HermesProcessRunner {
  run(
    input: HermesProcessStartInput,
    timeoutMs: number,
  ): Promise<HermesProcessResult>;
}

export interface HermesOperatorRuntimeInput {
  organizationId: string;
  conversationId: string;
  requestId: string;
  runId: string | null;
  agentInstanceId: string;
  agentType: string;
  taskSessionId: string;
  requestedByUserId?: string | null;
  prompt: string;
  hermesPath?: string;
  hermesHome?: string;
  cwd?: string;
  timeoutMs?: number;
  model?: string;
  provider?: string;
  toolsets?: string[];
  env?: Record<string, string>;
  enableKidItemMcp?: boolean;
}

export interface HermesOperatorRuntimeResult {
  provider: 'hermes';
  rawOutput: string;
  stderr: string;
  durationMs: number;
}

let activeHermesRuns = 0;

function stringField(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0
    ? value.trim()
    : null;
}

function positiveIntEnv(value: string | undefined, fallback: number): number {
  if (!value) return fallback;
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function maxOutputBytes(): number {
  return positiveIntEnv(
    process.env.AGENT_OS_HERMES_MAX_OUTPUT_BYTES,
    DEFAULT_MAX_OUTPUT_BYTES,
  );
}

function maxConcurrentRuns(): number {
  return positiveIntEnv(
    process.env.AGENT_OS_HERMES_MAX_CONCURRENT_RUNS,
    DEFAULT_MAX_CONCURRENT_RUNS,
  );
}

function isUtf8ContinuationByte(byte: number): boolean {
  return (byte & 0xc0) === 0x80;
}

function utf8SequenceLength(leadingByte: number): number {
  if ((leadingByte & 0x80) === 0) return 1;
  if ((leadingByte & 0xe0) === 0xc0) return 2;
  if ((leadingByte & 0xf0) === 0xe0) return 3;
  if ((leadingByte & 0xf8) === 0xf0) return 4;
  return 1;
}

function safeUtf8PrefixLength(buffer: Buffer, maxBytes: number): number {
  let end = Math.min(Math.max(maxBytes, 0), buffer.byteLength);
  if (end === 0) return 0;

  let sequenceStart = end - 1;
  while (
    sequenceStart > 0 &&
    isUtf8ContinuationByte(buffer[sequenceStart] ?? 0)
  ) {
    sequenceStart -= 1;
  }

  const expectedLength = utf8SequenceLength(buffer[sequenceStart] ?? 0);
  const actualLength = end - sequenceStart;
  if (actualLength < expectedLength) {
    end = sequenceStart;
  }

  return end;
}

function capBufferOutput(buffer: Buffer, maxBytes: number): string {
  const prefixLength = safeUtf8PrefixLength(buffer, maxBytes);
  return buffer.subarray(0, prefixLength).toString('utf8');
}

function capOutput(value: string, maxBytes = maxOutputBytes()): string {
  const buffer = Buffer.from(value);
  if (buffer.byteLength <= maxBytes) {
    return value;
  }
  return capBufferOutput(buffer, maxBytes);
}

function normalizeHermesStdout(value: string): string {
  const lines = value.split(/\r?\n/).filter((line) => {
    const trimmed = line.trim();
    return !HERMES_STDOUT_METADATA_PATTERNS.some((pattern) =>
      pattern.test(trimmed),
    );
  });
  return lines.join('\n').trim();
}

class CappedUtf8OutputBuffer {
  private readonly chunks: Buffer[] = [];
  private byteLength = 0;

  constructor(private readonly maxBytes: number) {}

  append(chunk: Buffer | string): void {
    if (this.byteLength >= this.maxBytes) return;

    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    const remainingBytes = this.maxBytes - this.byteLength;
    const cappedChunk =
      buffer.byteLength > remainingBytes
        ? buffer.subarray(0, remainingBytes)
        : buffer;

    this.chunks.push(cappedChunk);
    this.byteLength += cappedChunk.byteLength;
  }

  toString(): string {
    if (this.chunks.length === 0) return '';
    const buffer =
      this.chunks.length === 1
        ? this.chunks[0]
        : Buffer.concat(this.chunks, this.byteLength);
    return capBufferOutput(buffer, this.maxBytes);
  }
}

function redactRuntimeError(message: string): string {
  return message
    .replace(ENV_ASSIGNMENT_PATTERN, (match, key: string) =>
      isSecretEnvKey(key) ? `${key}=[REDACTED]` : match,
    )
    .replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/gi, 'Bearer [REDACTED]')
    .replace(/sk-[A-Za-z0-9_-]+/gi, 'sk-[REDACTED]')
    .replace(/secret-token-[A-Za-z0-9._-]+/gi, 'secret-token-[REDACTED]')
    .replace(/github_pat_[A-Za-z0-9_]+/g, 'github_pat_[REDACTED]')
    .replace(/\bAKIA[0-9A-Z]{12,}\b/g, 'AKIA[REDACTED]')
    .replace(/\bAIza[A-Za-z0-9_-]{8,}\b/g, 'AIza[REDACTED]')
    .replace(/\bxoxb-[A-Za-z0-9-]+/g, 'xoxb-[REDACTED]');
}

function compactRuntimeError(stderr: string): string {
  return (
    redactRuntimeError(capOutput(stderr)).trim() ||
    'Hermes Operator runtime failed.'
  );
}

function isMissingBinary(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: unknown }).code === 'ENOENT'
  );
}

function isTimedOut(result: HermesProcessResult): boolean {
  return result.timedOut === true;
}

function isSecretEnvKey(key: string): boolean {
  return SECRET_INPUT_ENV_PATTERNS.some((pattern) => pattern.test(key));
}

function isSafeInputEnvKey(key: string): boolean {
  return (
    SAFE_ENV_KEY_PATTERN.test(key) &&
    !ADAPTER_CONTROLLED_ENV_KEYS.has(key) &&
    !isSecretEnvKey(key)
  );
}

function buildEnv(
  input: HermesOperatorRuntimeInput,
  model: string,
  profileEnv: Record<string, string>,
) {
  const env: Record<string, string> = {};

  for (const key of PROCESS_ENV_ALLOWLIST) {
    const value = process.env[key];
    if (typeof value === 'string') {
      env[key] = value;
    }
  }

  for (const [key, value] of Object.entries(input.env ?? {})) {
    if (typeof value === 'string' && isSafeInputEnvKey(key)) {
      env[key] = value;
    }
  }

  const hermesHome = stringField(input.hermesHome);
  if (hermesHome) {
    env.HERMES_HOME = hermesHome;
  }
  env.KIDITEM_AGENT_OS_ORGANIZATION_ID = input.organizationId;
  env.KIDITEM_AGENT_OS_CONVERSATION_ID = input.conversationId;
  env.KIDITEM_AGENT_OS_TASK_SESSION_ID = input.taskSessionId;
  env.KIDITEM_AGENT_OS_REQUEST_ID = input.requestId;
  env.KIDITEM_AGENT_OS_RUN_ID = input.runId ?? '';
  env.KIDITEM_AGENT_OS_AGENT_INSTANCE_ID = input.agentInstanceId;
  env.KIDITEM_AGENT_OS_AGENT_TYPE = input.agentType;
  if (input.requestedByUserId) {
    env.KIDITEM_AGENT_OS_REQUESTED_BY_USER_ID = input.requestedByUserId;
  }

  for (const [key, value] of Object.entries(profileEnv)) {
    if (typeof value === 'string') {
      env[key] = value;
    }
  }

  env.HERMES_INFERENCE_MODEL = model;
  const provider = stringField(input.provider);
  if (provider) {
    env.HERMES_INFERENCE_PROVIDER = provider;
  }

  return env;
}

function resolveToolsets(input: {
  requestedToolsets?: string[];
  profileToolsets: string[];
}): string[] {
  const toolsets = input.requestedToolsets ?? input.profileToolsets;
  if (
    toolsets.includes(KIDITEM_AGENT_OS_TOOLSET) &&
    (toolsets.length !== 1 || toolsets[0] !== KIDITEM_AGENT_OS_TOOLSET)
  ) {
    throw new AgentOsRuntimeError(
      'operator_runtime_mixed_toolsets_denied',
      'KidItem Agent OS MCP sessions must use the kiditem-agent-os toolset alone.',
    );
  }
  return toolsets;
}

export class SpawnHermesProcessRunner implements HermesProcessRunner {
  run(
    input: HermesProcessStartInput,
    timeoutMs: number,
  ): Promise<HermesProcessResult> {
    const startedAt = Date.now();
    const outputLimit = maxOutputBytes();

    return new Promise((resolve, reject) => {
      const stdout = new CappedUtf8OutputBuffer(outputLimit);
      const stderr = new CappedUtf8OutputBuffer(outputLimit);
      let settled = false;
      let timedOut = false;
      let timeout: NodeJS.Timeout | null = null;
      let sigkillTimeout: NodeJS.Timeout | null = null;
      let forceSettleTimeout: NodeJS.Timeout | null = null;

      const clearTimers = () => {
        if (timeout) clearTimeout(timeout);
        if (sigkillTimeout) clearTimeout(sigkillTimeout);
        if (forceSettleTimeout) clearTimeout(forceSettleTimeout);
      };

      const resolveResult = (
        exitCode: number | null,
        signal: NodeJS.Signals | null,
      ) => {
        if (settled) return;
        settled = true;
        clearTimers();
        resolve({
          stdout: stdout.toString(),
          stderr: stderr.toString(),
          exitCode,
          signal,
          durationMs: Date.now() - startedAt,
          timedOut,
        });
      };

      const child = spawn(input.command, input.args, {
        cwd: input.cwd,
        env: input.env,
        stdio: ['ignore', 'pipe', 'pipe'],
        shell: false,
      });

      timeout = setTimeout(() => {
        timedOut = true;
        child.kill('SIGTERM');
        sigkillTimeout = setTimeout(() => {
          if (settled) return;
          child.kill('SIGKILL');
          forceSettleTimeout = setTimeout(() => {
            resolveResult(null, 'SIGKILL');
          }, TIMEOUT_FORCE_SETTLE_GRACE_MS);
        }, TIMEOUT_SIGKILL_GRACE_MS);
      }, timeoutMs);

      child.stdout?.on('data', (chunk: Buffer | string) => {
        stdout.append(chunk);
      });
      child.stderr?.on('data', (chunk: Buffer | string) => {
        stderr.append(chunk);
      });
      child.on('error', (error) => {
        if (settled) return;
        settled = true;
        clearTimers();
        reject(error);
      });
      child.on('close', (exitCode, signal) => {
        resolveResult(exitCode, signal);
      });
    });
  }
}

@Injectable()
export class HermesOperatorRuntimeAdapter {
  constructor(
    @Optional()
    private readonly runner: HermesProcessRunner =
      new SpawnHermesProcessRunner(),
    @Optional()
    private readonly profileService: HermesRuntimeProfileService =
      new HermesRuntimeProfileService(),
  ) {}

  async decide(
    input: HermesOperatorRuntimeInput,
  ): Promise<HermesOperatorRuntimeResult> {
    const model = stringField(input.model);
    if (!model) {
      throw new AgentOsRuntimeError(
        'operator_runtime_model_required',
        'Hermes Operator runtime requires an explicit model.',
      );
    }

    const concurrencyLimit = maxConcurrentRuns();
    if (activeHermesRuns >= concurrencyLimit) {
      throw new AgentOsRuntimeError(
        'operator_runtime_busy',
        'Hermes Operator runtime is already at its configured concurrency limit.',
      );
    }

    activeHermesRuns += 1;
    let result: HermesProcessResult;
    try {
      const profile = await this.profileService.prepare({
        organizationId: input.organizationId,
        conversationId: input.conversationId,
        requestId: input.requestId,
        runId: input.runId,
        agentInstanceId: input.agentInstanceId,
        agentType: input.agentType,
        taskSessionId: input.taskSessionId,
        requestedByUserId: input.requestedByUserId,
        enableKidItemMcp: input.enableKidItemMcp,
      });

      const toolsets = resolveToolsets({
        requestedToolsets: input.toolsets,
        profileToolsets: profile.toolsets,
      });
      const provider = stringField(input.provider);
      const args = [
        'chat',
        '-q',
        input.prompt,
        '--model',
        model,
        '--toolsets',
        toolsets.join(','),
        '-Q',
        '--ignore-rules',
      ];
      if (provider) {
        args.push('--provider', provider);
      }
      result = await this.runner.run(
        {
          command: stringField(input.hermesPath) ?? DEFAULT_HERMES_PATH,
          args,
          cwd: input.cwd ?? process.cwd(),
          env: buildEnv(input, model, profile.env),
        },
        input.timeoutMs ?? DEFAULT_TIMEOUT_MS,
      );
    } catch (error) {
      if (isMissingBinary(error)) {
        throw new AgentOsRuntimeError(
          'operator_runtime_unavailable',
          'Hermes runtime binary was not found. Set AGENT_OS_HERMES_PATH or install hermes.',
        );
      }
      throw error;
    } finally {
      activeHermesRuns -= 1;
    }

    const stdout = normalizeHermesStdout(capOutput(result.stdout));
    const stderr = capOutput(result.stderr);

    if (isTimedOut(result)) {
      throw new AgentOsRuntimeError(
        'operator_runtime_timeout',
        'Hermes Operator runtime timed out.',
      );
    }

    if (result.exitCode !== 0) {
      throw new AgentOsRuntimeError(
        'operator_runtime_failed',
        compactRuntimeError(stderr),
      );
    }

    if (!stdout.trim()) {
      throw new AgentOsRuntimeError(
        'operator_runtime_empty',
        'Hermes Operator runtime returned no final agent message.',
      );
    }

    return {
      provider: 'hermes',
      rawOutput: stdout,
      stderr,
      durationMs: result.durationMs,
    };
  }
}
