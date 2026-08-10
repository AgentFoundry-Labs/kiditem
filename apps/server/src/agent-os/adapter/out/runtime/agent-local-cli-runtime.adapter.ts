import { spawn, type ChildProcess } from 'node:child_process';
import {
  chmod,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  stat,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Inject, Injectable } from '@nestjs/common';
import {
  AGENT_OS_REPOSITORY_PORT,
  type AgentOsRepositoryPort,
} from '../../../application/port/out/repository/agent-os-repository.port';
import {
  AGENT_RUNTIME_ASSETS_PORT,
  type AgentRuntimeAssetsPort,
  type ResolvedAgentRuntimeAssets,
} from '../../../application/port/out/runtime/agent-runtime-assets.port';
import {
  AGENT_MCP_SESSION_PORT,
  type AgentMcpSessionDescriptor,
  type AgentMcpSessionPort,
} from '../../../application/port/out/runtime/agent-mcp-session.port';
import type {
  AgentRuntimeExecutionContext,
  AgentRuntimeResult,
  CancelAgentRuntimeInput,
} from '../../../application/port/out/runtime/agent-runtime.port';
import { resolveAgentLocalCliRuntimeConfig } from '../../../application/service/agent-runtime.config';
import { modelFacingMcpToolNamesForAgentType } from '../../../application/service/kiditem-mcp-tool-registry.service';
import { AgentOsRuntimeError } from '../../../domain/agent-os.errors';
import { findAgentDefinitionByType } from '../../../domain/agent-definition.registry';
import {
  AgentLocalCliAnswerSchema,
  verifyAgentLocalCliAnswer,
  type AgentLocalCliAnswer,
} from './agent-local-cli-answer';
import {
  buildAgentLocalCliCommand,
  filterLocalCliEnvironment,
  type AgentLocalCliProvider,
} from './agent-local-cli-command';
import { AgentLocalProcessRegistry } from './agent-local-process-registry';

export { verifyAgentLocalCliAnswer } from './agent-local-cli-answer';
export type { AgentLocalCliAnswer } from './agent-local-cli-answer';

function buildPrompt(
  assets: ResolvedAgentRuntimeAssets,
  userMessage: string,
  allowedMcpToolNames: string[],
): string {
  return [
    assets.prompt.trim(),
    ...assets.skills.map(
      (skill) => `\n## Runtime skill: ${skill.key}@${skill.version}\n${skill.content.trim()}`,
    ),
    `\n## Available KidItem MCP tools\n${allowedMcpToolNames.join('\n')}`,
    `\n## User message\n${userMessage}`,
  ].join('\n');
}

export function claudeMcpConfig(descriptor: AgentMcpSessionDescriptor) {
  return {
    mcpServers: {
      kiditem: {
        command: descriptor.command,
        args: descriptor.args,
        env: descriptor.env,
      },
    },
  };
}

export function codexMcpConfigOverrides(
  descriptor: AgentMcpSessionDescriptor,
): string[] {
  return [
    `mcp_servers.kiditem.command=${JSON.stringify(descriptor.command)}`,
    `mcp_servers.kiditem.args=${JSON.stringify(descriptor.args)}`,
    ...Object.entries(descriptor.env).map(
      ([key, value]) =>
        `mcp_servers.kiditem.env.${key}=${JSON.stringify(value)}`,
    ),
  ];
}

interface ProcessOutput {
  stdout: string;
}

function stableProcessError(
  code: string,
  message: string,
): AgentOsRuntimeError {
  return new AgentOsRuntimeError(code, message);
}

export function classifyLocalCliFailure(error: unknown): AgentOsRuntimeError {
  if (error instanceof AgentOsRuntimeError) return error;
  const candidate = error as NodeJS.ErrnoException & { statusCode?: number };
  if (candidate?.code === 'ENOENT') {
    return stableProcessError('cli_not_found', 'The configured local CLI is not installed.');
  }
  const message = error instanceof Error ? error.message : String(error);
  if (
    candidate?.statusCode === 401 ||
    candidate?.statusCode === 403 ||
    /authenticate|authentication|unauthorized|oauth|login|token|api key/i.test(
      message,
    )
  ) {
    return stableProcessError(
      'unauthenticated',
      'The local CLI session is not authenticated.',
    );
  }
  return stableProcessError('execution_failed', 'The local CLI execution failed.');
}

const versionCache = new Map<AgentLocalCliProvider, Promise<string>>();

async function resolveCliVersion(
  provider: AgentLocalCliProvider,
  env: Record<string, string>,
  cwd: string,
): Promise<string> {
  const cached = versionCache.get(provider);
  if (cached) return cached;
  const promise = new Promise<string>((resolveVersion) => {
    const bin = provider === 'claude_cli' ? 'claude' : 'codex';
    let child: ChildProcess;
    try {
      child = spawn(bin, ['--version'], {
        cwd,
        env,
        shell: false,
        stdio: ['ignore', 'pipe', 'ignore'],
        windowsHide: true,
      });
    } catch {
      resolveVersion('unknown');
      return;
    }
    let output = '';
    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      resolveVersion('unknown');
    }, 2_000);
    timer.unref?.();
    child.stdout?.on('data', (chunk: Buffer) => {
      if (output.length < 512) output += chunk.toString('utf8').slice(0, 512);
    });
    child.once('error', () => {
      clearTimeout(timer);
      resolveVersion('unknown');
    });
    child.once('close', (code) => {
      clearTimeout(timer);
      const lines = output.trim().split(/\r?\n/);
      resolveVersion(code === 0 && lines.length === 1 && lines[0] ? lines[0] : 'unknown');
    });
  });
  versionCache.set(provider, promise);
  void promise.then((version) => {
    if (version === 'unknown' && versionCache.get(provider) === promise) {
      versionCache.delete(provider);
    }
  });
  return promise;
}

function parseClaudeResult(stdout: string): {
  answer: AgentLocalCliAnswer;
  inputTokens?: number;
  outputTokens?: number;
  cachedInputTokens?: number;
  costMicros?: bigint;
} {
  const envelope = JSON.parse(stdout) as Record<string, unknown>;
  if (envelope.is_error) {
    const error = new Error(
      typeof envelope.result === 'string' ? envelope.result : 'Claude CLI failed.',
    ) as Error & { statusCode?: number };
    if (typeof envelope.api_error_status === 'number') {
      error.statusCode = envelope.api_error_status;
    }
    throw error;
  }
  const raw = envelope.structured_output ?? envelope.result;
  const decoded = typeof raw === 'string' ? JSON.parse(raw) : raw;
  const usage =
    envelope.usage && typeof envelope.usage === 'object'
      ? (envelope.usage as Record<string, unknown>)
      : {};
  const totalCostUsd = envelope.total_cost_usd;
  return {
    answer: AgentLocalCliAnswerSchema.parse(decoded),
    inputTokens: finiteNonNegativeNumber(usage.input_tokens),
    outputTokens: finiteNonNegativeNumber(usage.output_tokens),
    cachedInputTokens: finiteNonNegativeNumber(usage.cache_read_input_tokens),
    costMicros:
      typeof totalCostUsd === 'number' &&
      Number.isFinite(totalCostUsd) &&
      totalCostUsd >= 0
        ? BigInt(Math.round(totalCostUsd * 1_000_000))
        : undefined,
  };
}

function parseCodexTelemetry(stdout: string) {
  let inputTokens: number | undefined;
  let outputTokens: number | undefined;
  let cachedInputTokens: number | undefined;
  for (const line of stdout.split(/\r?\n/)) {
    if (!line.trim()) continue;
    let event: Record<string, unknown>;
    try {
      event = JSON.parse(line) as Record<string, unknown>;
    } catch {
      continue;
    }
    if (event.type !== 'turn.completed') continue;
    const usage =
      event.usage && typeof event.usage === 'object'
        ? (event.usage as Record<string, unknown>)
        : event;
    inputTokens = finiteNonNegativeNumber(usage.input_tokens);
    outputTokens = finiteNonNegativeNumber(usage.output_tokens);
    cachedInputTokens = finiteNonNegativeNumber(usage.cached_input_tokens);
  }
  return { inputTokens, outputTokens, cachedInputTokens };
}

function finiteNonNegativeNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0
    ? value
    : undefined;
}

export async function readBoundedOutputFile(
  outputFile: string,
  limitBytes: number,
): Promise<string> {
  let fileStat;
  try {
    fileStat = await stat(outputFile);
  } catch {
    throw new AgentOsRuntimeError(
      'execution_failed',
      'Codex CLI did not produce a readable final output.',
    );
  }
  if (fileStat.size > limitBytes) {
    throw new AgentOsRuntimeError(
      'output_limit',
      'Local CLI final output exceeded the configured limit.',
    );
  }
  try {
    return await readFile(outputFile, 'utf8');
  } catch {
    throw new AgentOsRuntimeError(
      'execution_failed',
      'Codex CLI did not produce a readable final output.',
    );
  }
}

@Injectable()
export class AgentLocalCliRuntimeAdapter {
  private readonly config = resolveAgentLocalCliRuntimeConfig();

  constructor(
    @Inject(AGENT_OS_REPOSITORY_PORT)
    private readonly repository: AgentOsRepositoryPort,
    @Inject(AGENT_RUNTIME_ASSETS_PORT)
    private readonly assets: AgentRuntimeAssetsPort,
    @Inject(AGENT_MCP_SESSION_PORT)
    private readonly mcpSessions: AgentMcpSessionPort,
    private readonly processes: AgentLocalProcessRegistry,
  ) {}

  async execute(context: AgentRuntimeExecutionContext): Promise<AgentRuntimeResult> {
    if (context.adapterType !== 'claude_cli' && context.adapterType !== 'codex_cli') {
      throw new AgentOsRuntimeError(
        'runtime_adapter_unsupported',
        'Agent local CLI runtime supports only claude_cli or codex_cli.',
      );
    }
    if (!context.conversationId) {
      throw new AgentOsRuntimeError(
        'conversation_required',
        'Local CLI execution requires conversationId.',
      );
    }
    if (!context.outputSchemaPath) {
      throw new AgentOsRuntimeError(
        'output_schema_required',
        'Local CLI execution requires outputSchemaPath.',
      );
    }
    const userMessage = context.input.userMessage;
    if (typeof userMessage !== 'string' || !userMessage.trim()) {
      throw new AgentOsRuntimeError(
        'user_message_required',
        'Local CLI execution requires input.userMessage.',
      );
    }

    const provider = context.adapterType;
    const release = await this.processes.acquire(context.runId);
    let runDirectory: string | null = null;
    try {
      runDirectory = await mkdtemp(join(tmpdir(), 'kiditem-agent-run-'));
      await chmod(runDirectory, 0o700);
      const mcpHomeDirectory = join(runDirectory, 'mcp-home');
      await mkdir(mcpHomeDirectory, { mode: 0o700 });
      const [resolvedAssets, mcp] = await Promise.all([
        this.assets.resolve({
          agentType: context.agentType,
          promptPath: context.promptPath,
          skillKeys: context.skillKeys,
          outputSchemaPath: context.outputSchemaPath,
        }),
        this.mcpSessions.prepare({
          organizationId: context.organizationId,
          conversationId: context.conversationId,
          requestId: context.requestId,
          runId: context.runId,
          agentInstanceId: context.agentInstanceId,
          agentType: context.agentType,
          requestedByUserId: context.requestedByUserId,
          homeDirectory: mcpHomeDirectory,
        }),
      ]);
      const allowedMcpToolNames = modelFacingMcpToolNamesForAgentType(
        context.agentType,
      );
      const capabilityKeys =
        findAgentDefinitionByType(context.agentType)?.defaultToolPolicies
          .filter((policy) => policy.effect !== 'deny')
          .map((policy) => policy.toolKey) ?? [];
      const prompt = buildPrompt(resolvedAssets, userMessage, allowedMcpToolNames);
      const schemaFile = join(runDirectory, 'output.schema.json');
      const outputFile = join(runDirectory, 'output.json');
      const claudeMcpConfigFile = join(runDirectory, 'mcp.json');
      await Promise.all([
        writeFile(schemaFile, JSON.stringify(resolvedAssets.outputSchema), {
          mode: 0o600,
        }),
        writeFile(claudeMcpConfigFile, JSON.stringify(claudeMcpConfig(mcp)), {
          mode: 0o600,
        }),
        writeFile(outputFile, '', { mode: 0o600 }),
      ]);
      const cliEnvironment = filterLocalCliEnvironment(provider, process.env);
      const cliVersion = await resolveCliVersion(
        provider,
        cliEnvironment,
        runDirectory,
      );
      await this.repository.appendRunEvent({
        organizationId: context.organizationId,
        runId: context.runId,
        agentInstanceId: context.agentInstanceId,
        type: 'run.runtime_resolved',
        data: {
          provider,
          model: context.model,
          cliVersion,
          promptSha256: resolvedAssets.promptSha256,
          schemaSha256: resolvedAssets.outputSchemaSha256,
          skillKeys: resolvedAssets.skills.map((skill) => skill.key),
          skills: resolvedAssets.skills.map((skill) => ({
            key: skill.key,
            version: skill.version,
            sha256: skill.sha256,
          })),
          capabilityKeys,
          mcpToolNames: allowedMcpToolNames,
        },
      });
      const command = buildAgentLocalCliCommand({
        provider,
        model: context.model,
        workingDirectory: runDirectory,
        hostEnvironment: process.env,
        prompt,
        outputSchema: resolvedAssets.outputSchema,
        outputSchemaFile: schemaFile,
        outputFile,
        claudeMcpConfigFile,
        codexMcpConfigOverrides: codexMcpConfigOverrides(mcp),
        allowedMcpToolNames,
        claudeMaxBudgetUsd: this.config.claudeMaxBudgetUsd,
      });
      const processOutput = await this.executeCommand(context.runId, command);
      let answer: AgentLocalCliAnswer;
      let telemetry: {
        inputTokens?: number;
        outputTokens?: number;
        cachedInputTokens?: number;
        costMicros?: bigint;
      };
      if (provider === 'claude_cli') {
        const parsed = parseClaudeResult(processOutput.stdout);
        answer = parsed.answer;
        telemetry = parsed;
      } else {
        const outputText = await readBoundedOutputFile(
          outputFile,
          this.config.outputFileLimitBytes,
        );
        answer = AgentLocalCliAnswerSchema.parse(JSON.parse(outputText));
        telemetry = parseCodexTelemetry(processOutput.stdout);
      }
      const [artifacts, toolInvocations] = await Promise.all([
        this.repository.listArtifacts({
          organizationId: context.organizationId,
          requestId: context.requestId,
          runId: context.runId,
        }),
        this.repository.listToolInvocations({
          organizationId: context.organizationId,
          requestId: context.requestId,
          runId: context.runId,
        }),
      ]);
      let output: ReturnType<typeof verifyAgentLocalCliAnswer>;
      try {
        output = verifyAgentLocalCliAnswer({
          context,
          answer,
          artifacts,
          toolInvocations,
          provider,
          model: context.model,
        });
      } catch (error: unknown) {
        const code =
          error instanceof AgentOsRuntimeError
            ? error.code
            : 'citation_verification_failed';
        await this.repository.appendRunEvent({
          organizationId: context.organizationId,
          runId: context.runId,
          agentInstanceId: context.agentInstanceId,
          type: 'run.citation_verification_failed',
          level: 'error',
          data: {
            errorCode: code,
            citationIds: answer.citationIds,
            resourceRefs: answer.resourceRefs,
          },
        });
        throw error;
      }
      if (output.invalidCitationIds.length > 0) {
        await this.repository.appendRunEvent({
          organizationId: context.organizationId,
          runId: context.runId,
          agentInstanceId: context.agentInstanceId,
          type: 'run.citation_verification_failed',
          level: 'warning',
          data: {
            errorCode: 'citation_verification_failed',
            citationIds: output.invalidCitationIds,
          },
        });
      }
      await this.repository.appendRunEvent({
        organizationId: context.organizationId,
        runId: context.runId,
        agentInstanceId: context.agentInstanceId,
        type: 'run.citation_verified',
        data: {
          citationCount: output.citations.length,
          invalidCitationIds: output.invalidCitationIds,
          resourceRefCount: output.resourceRefs.length,
          documentCount: output.documentCount,
        },
      });
      return {
        output,
        provider,
        inputTokens: telemetry.inputTokens,
        outputTokens: telemetry.outputTokens,
        cachedInputTokens: telemetry.cachedInputTokens,
        costMicros: telemetry.costMicros,
      };
    } catch (error: unknown) {
      throw classifyLocalCliFailure(error);
    } finally {
      release();
      if (runDirectory) {
        await rm(runDirectory, { recursive: true, force: true }).catch(
          () => undefined,
        );
      }
    }
  }

  cancel(input: CancelAgentRuntimeInput): Promise<boolean> {
    return this.processes.cancel(input.runId, input.reason);
  }

  private executeCommand(
    runId: string,
    command: ReturnType<typeof buildAgentLocalCliCommand>,
  ): Promise<ProcessOutput> {
    return new Promise((resolveExecution, rejectExecution) => {
      let child: ChildProcess;
      try {
        child = spawn(command.bin, command.args, {
          cwd: command.cwd,
          env: command.env,
          detached: true,
          shell: false,
          stdio: ['pipe', 'pipe', 'pipe'],
          windowsHide: true,
        });
      } catch (error: unknown) {
        rejectExecution(error);
        return;
      }
      this.processes.attach(runId, child);
      let stdout = '';
      let stderr = Buffer.alloc(0);
      let stdoutBytes = 0;
      let settled = false;
      const settle = (action: () => void) => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        this.processes.detach(runId);
        action();
      };
      const timeout = setTimeout(() => {
        void this.processes.cancel(runId, 'timeout').catch(() => undefined);
      }, this.config.executionTimeoutMs);
      timeout.unref?.();
      child.stdout?.on('data', (chunk: Buffer) => {
        stdoutBytes += chunk.byteLength;
        if (stdoutBytes > this.config.stdoutLimitBytes) {
          void this.processes
            .cancel(runId, 'output_limit')
            .catch(() => undefined);
          return;
        }
        stdout += chunk.toString('utf8');
      });
      child.stderr?.on('data', (chunk: Buffer) => {
        const remaining = this.config.stderrLimitBytes - stderr.byteLength;
        if (remaining <= 0) return;
        stderr = Buffer.concat([stderr, chunk.subarray(0, remaining)]);
      });
      child.once('error', (error) => settle(() => rejectExecution(error)));
      child.once('close', (exitCode) => {
        settle(() => {
          const reason = this.processes.reasonFor(runId);
          if (reason) {
            rejectExecution(
              new AgentOsRuntimeError(
                reason,
                reason === 'user_cancelled'
                  ? 'The Agent OS run was cancelled.'
                  : reason === 'process_interrupted'
                    ? 'The local Agent OS process was interrupted.'
                    : reason === 'timeout'
                      ? 'The local CLI execution timed out.'
                      : 'The local CLI output exceeded its limit.',
              ),
            );
            return;
          }
          if (exitCode !== 0) {
            rejectExecution(
              new Error(
                stderr.toString('utf8').trim() ||
                  'Local CLI exited unsuccessfully.',
              ),
            );
            return;
          }
          resolveExecution({ stdout });
        });
      });
      child.stdin?.on('error', () => undefined);
      child.stdin?.end(command.stdin);
    });
  }
}
