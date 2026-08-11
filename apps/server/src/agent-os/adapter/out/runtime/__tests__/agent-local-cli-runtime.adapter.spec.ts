import { EventEmitter } from 'node:events';
import { access, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PassThrough } from 'node:stream';
import { afterEach, describe, expect, it, vi } from 'vitest';

const { spawnMock } = vi.hoisted(() => ({ spawnMock: vi.fn() }));

vi.mock('node:child_process', () => ({
  spawn: spawnMock,
}));

import {
  AgentLocalCliRuntimeAdapter,
  claudeMcpConfig,
  codexMcpConfigOverrides,
  readBoundedOutputFile,
  verifyAgentLocalCliAnswer,
  type AgentLocalCliAnswer,
} from '../agent-local-cli-runtime.adapter';
import { AgentLocalProcessRegistry } from '../agent-local-process-registry';
import type { AgentRuntimeExecutionContext } from '../../../../application/port/out/runtime/agent-runtime.port';

const CONTEXT = {
  organizationId: 'org-1',
  requestId: 'request-1',
  runId: 'run-1',
};

function answer(
  overrides: Partial<AgentLocalCliAnswer> = {},
): AgentLocalCliAnswer {
  return {
    text: '근거가 있는 답변',
    citationIds: ['evidence-1'],
    dataGaps: [],
    resourceRefs: [],
    operationRunId: null,
    ...overrides,
  };
}

function evidenceArtifact(overrides: Record<string, unknown> = {}) {
  return {
    id: 'artifact-1',
    organizationId: 'org-1',
    conversationId: 'conversation-1',
    agentInstanceId: 'instance-1',
    requestId: 'request-1',
    runId: 'run-1',
    toolInvocationId: 'invocation-1',
    artifactType: 'sourcing_evidence_document',
    targetDomain: 'sourcing',
    targetModel: 'evidence_document',
    targetId: 'evidence-1',
    title: '검증된 근거',
    href: '/api/evidence/evidence-1',
    summary: {},
    status: 'active',
    createdAt: new Date('2026-08-10T00:00:00.000Z'),
    updatedAt: new Date('2026-08-10T00:00:00.000Z'),
    ...overrides,
  };
}

function localContext(
  overrides: Partial<AgentRuntimeExecutionContext> = {},
): AgentRuntimeExecutionContext {
  return {
    organizationId: 'org-1',
    agentInstanceId: 'instance-1',
    agentType: 'sourcing',
    requestId: 'request-1',
    runId: 'run-1',
    taskSessionId: 'session-1',
    taskKey: 'default',
    adapterType: 'codex_cli',
    model: 'gpt-5.6-terra',
    modelPlan: { primary: 'gpt-5.6-terra' },
    promptPath: 'agent-config/prompts/agents/sourcing.md',
    conversationId: 'conversation-1',
    requestedByUserId: 'user-1',
    playbookKey: 'sourcing_workspace_question_v1',
    planStepKey: 'sourcing_agent',
    skillKeys: [],
    outputSchemaPath: 'agent-config/schemas/sourcing-agent-answer.schema.json',
    input: { userMessage: 'Find products.' },
    trustLevel: 0,
    runtimeConfig: {},
    ...overrides,
  };
}

function lifecycleRepository(input?: {
  requestStatus?: string;
  runStatus?: string;
}) {
  return {
    findRunRequestById: vi.fn().mockResolvedValue({
      id: 'request-1',
      organizationId: 'org-1',
      agentInstanceId: 'instance-1',
      status: input?.requestStatus ?? 'claimed',
    }),
    findRunById: vi.fn().mockResolvedValue({
      id: 'run-1',
      organizationId: 'org-1',
      requestId: 'request-1',
      agentInstanceId: 'instance-1',
      status: input?.runStatus ?? 'running',
    }),
    appendRunEvent: vi.fn().mockResolvedValue(undefined),
  };
}

function resolvedAssets() {
  return {
    promptPath: 'agent-config/prompts/agents/sourcing.md',
    prompt: 'Use evidence.',
    promptSha256: 'prompt-sha',
    skills: [],
    outputSchemaPath: 'agent-config/schemas/sourcing-agent-answer.schema.json',
    outputSchemaVersion: 'sourcing-agent-answer.v1',
    outputSchema: { type: 'object' },
    outputSchemaSha256: 'schema-sha',
  };
}

function mcpDescriptor() {
  return {
    name: 'kiditem',
    command: 'node',
    args: ['mcp-server.js'],
    env: {},
  };
}

function childProcess(pid: number) {
  const child = new EventEmitter() as EventEmitter & {
    pid: number;
    stdout: PassThrough;
    stderr: PassThrough;
    stdin: PassThrough;
    kill: ReturnType<typeof vi.fn>;
  };
  child.pid = pid;
  child.stdout = new PassThrough();
  child.stderr = new PassThrough();
  child.stdin = new PassThrough();
  child.kill = vi.fn();
  return child;
}

async function executionOutcome(
  execution: Promise<unknown>,
  deadlineMs = 100,
): Promise<{ status: 'resolved' | 'rejected' | 'hung'; error?: unknown }> {
  return Promise.race([
    execution.then(
      () => ({ status: 'resolved' as const }),
      (error: unknown) => ({ status: 'rejected' as const, error }),
    ),
    new Promise<{ status: 'hung' }>((resolveOutcome) => {
      setTimeout(() => resolveOutcome({ status: 'hung' }), deadlineMs);
    }),
  ]);
}

function runtimeHarness(
  provider: 'codex_cli' | 'claude_cli',
  timeoutMs: number,
) {
  vi.stubEnv('AGENT_RUNTIME_EXECUTION_TIMEOUT_MS', String(timeoutMs));
  const killProcessGroup = vi.fn();
  const processes = new AgentLocalProcessRegistry({
    capacity: 1,
    capacityWaitMs: 5_000,
    killGraceMs: 5,
    killExitWaitMs: 5,
    killProcessGroup,
  });
  const repository = lifecycleRepository();
  const assets = { resolve: vi.fn().mockResolvedValue(resolvedAssets()) };
  const mcpSessions = {
    prepare: vi.fn().mockResolvedValue(mcpDescriptor()),
  };
  const adapter = new AgentLocalCliRuntimeAdapter(
    repository as never,
    assets as never,
    mcpSessions as never,
    processes,
  );
  return {
    adapter,
    processes,
    killProcessGroup,
    context: localContext({
      adapterType: provider,
      model: provider === 'codex_cli' ? 'gpt-5.6-terra' : 'claude-sonnet-4-6',
      modelPlan: {
        primary:
          provider === 'codex_cli' ? 'gpt-5.6-terra' : 'claude-sonnet-4-6',
      },
    }),
  };
}

describe('AgentLocalCliRuntimeAdapter verification', () => {
  afterEach(() => {
    spawnMock.mockReset();
    vi.unstubAllEnvs();
  });

  it('does not spawn a CLI after cancellation during pre-spawn preparation', async () => {
    spawnMock.mockReset();
    spawnMock.mockImplementation(() => {
      throw new Error('unexpected spawn');
    });
    const processes = new AgentLocalProcessRegistry({
      capacity: 1,
      capacityWaitMs: 5_000,
      killGraceMs: 20,
      killProcessGroup: vi.fn(),
    });
    const repository = lifecycleRepository();
    const assets = {
      resolve: vi.fn().mockResolvedValue(resolvedAssets()),
    };
    const mcpSessions = {
      prepare: vi.fn().mockImplementation(async () => {
        await processes.cancel('run-1', 'user_cancelled');
        return mcpDescriptor();
      }),
    };
    const adapter = new AgentLocalCliRuntimeAdapter(
      repository as never,
      assets as never,
      mcpSessions as never,
      processes,
    );

    await expect(adapter.execute(localContext())).rejects.toMatchObject({
      code: 'user_cancelled',
    });

    expect(spawnMock).not.toHaveBeenCalled();
    expect(repository.appendRunEvent).not.toHaveBeenCalled();
    expect(processes.reasonFor('run-1')).toBeNull();
  });

  it('durably fences a cancelled request before local preparation', async () => {
    spawnMock.mockImplementation(() => {
      throw new Error('unexpected spawn');
    });
    const processes = new AgentLocalProcessRegistry({
      capacity: 1,
      capacityWaitMs: 5_000,
      killGraceMs: 20,
      killProcessGroup: vi.fn(),
    });
    const repository = lifecycleRepository({
      requestStatus: 'cancelled',
      runStatus: 'cancelled',
    });
    const assets = { resolve: vi.fn().mockResolvedValue(resolvedAssets()) };
    const mcpSessions = {
      prepare: vi.fn().mockResolvedValue(mcpDescriptor()),
    };
    const adapter = new AgentLocalCliRuntimeAdapter(
      repository as never,
      assets as never,
      mcpSessions as never,
      processes,
    );

    await expect(adapter.execute(localContext())).rejects.toMatchObject({
      code: 'user_cancelled',
    });

    expect(repository.findRunRequestById).toHaveBeenCalledWith({
      organizationId: 'org-1',
      requestId: 'request-1',
    });
    expect(repository.findRunById).toHaveBeenCalledWith({
      organizationId: 'org-1',
      runId: 'run-1',
    });
    expect(assets.resolve).not.toHaveBeenCalled();
    expect(mcpSessions.prepare).not.toHaveBeenCalled();
    expect(spawnMock).not.toHaveBeenCalled();
    expect(processes.reasonFor('run-1')).toBeNull();
  });

  it('rejects timeout after the bounded kill deadline when close never arrives', async () => {
    const versionChild = childProcess(700);
    const runtimeChild = childProcess(701);
    spawnMock
      .mockImplementationOnce(() => {
        queueMicrotask(() => {
          versionChild.stdout.write('codex-cli 0.147.0\n');
          versionChild.emit('close', 0);
        });
        return versionChild;
      })
      .mockReturnValueOnce(runtimeChild);
    const { adapter, processes, killProcessGroup, context } = runtimeHarness(
      'codex_cli',
      5,
    );
    const execution = adapter.execute(context);
    const outcomePromise = executionOutcome(execution);
    await vi.waitFor(() => expect(spawnMock).toHaveBeenCalledTimes(2));
    const runDirectory = (
      spawnMock.mock.calls[1]?.[2] as { cwd: string } | undefined
    )?.cwd;

    const outcome = await outcomePromise;
    try {
      expect(outcome).toMatchObject({
        status: 'rejected',
        error: expect.objectContaining({ code: 'timeout' }),
      });
    } finally {
      runtimeChild.emit('close', null, 'SIGKILL');
      await execution.catch(() => undefined);
    }

    expect(killProcessGroup).toHaveBeenNthCalledWith(1, 701, 'SIGTERM');
    expect(killProcessGroup).toHaveBeenNthCalledWith(2, 701, 'SIGKILL');
    await expect(access(runDirectory!)).rejects.toThrow();
    const release = await processes.acquire('run-2');
    release();
  });

  it('rejects external cancellation after the bounded kill deadline when close never arrives', async () => {
    const versionChild = childProcess(800);
    const runtimeChild = childProcess(801);
    spawnMock
      .mockImplementationOnce(() => {
        queueMicrotask(() => {
          versionChild.stdout.write('claude-code 2.1.0\n');
          versionChild.emit('close', 0);
        });
        return versionChild;
      })
      .mockReturnValueOnce(runtimeChild);
    const { adapter, processes, killProcessGroup, context } = runtimeHarness(
      'claude_cli',
      1_000,
    );
    const execution = adapter.execute(context);
    const outcomePromise = executionOutcome(execution);
    await vi.waitFor(() => expect(spawnMock).toHaveBeenCalledTimes(2));
    const runDirectory = (
      spawnMock.mock.calls[1]?.[2] as { cwd: string } | undefined
    )?.cwd;

    await expect(
      adapter.cancel({
        organizationId: 'org-1',
        requestId: 'request-1',
        runId: 'run-1',
        reason: 'user_cancelled',
      }),
    ).resolves.toBe(true);
    const outcome = await outcomePromise;
    try {
      expect(outcome).toMatchObject({
        status: 'rejected',
        error: expect.objectContaining({ code: 'user_cancelled' }),
      });
    } finally {
      runtimeChild.emit('close', null, 'SIGKILL');
      await execution.catch(() => undefined);
    }

    expect(killProcessGroup).toHaveBeenNthCalledWith(1, 801, 'SIGTERM');
    expect(killProcessGroup).toHaveBeenNthCalledWith(2, 801, 'SIGKILL');
    await expect(access(runDirectory!)).rejects.toThrow();
    const release = await processes.acquire('run-2');
    release();
  });

  it('keeps the MCP child isolated from the operator home in both CLI configs', () => {
    const descriptor = {
      name: 'kiditem' as const,
      command: 'node',
      args: ['mcp-server.js'],
      env: {
        HOME: '/tmp/kiditem-run/mcp-home',
        CODEX_HOME: '/tmp/kiditem-run/mcp-home',
      },
    };

    const claudeConfig = claudeMcpConfig(descriptor);
    const codexOverrides = codexMcpConfigOverrides(descriptor);

    expect(claudeConfig.mcpServers.kiditem.env).toMatchObject({
      HOME: '/tmp/kiditem-run/mcp-home',
      CODEX_HOME: '/tmp/kiditem-run/mcp-home',
    });
    expect(codexOverrides).toContain(
      'mcp_servers.kiditem.env.HOME="/tmp/kiditem-run/mcp-home"',
    );
    expect(codexOverrides).toContain(
      'mcp_servers.kiditem.env.CODEX_HOME="/tmp/kiditem-run/mcp-home"',
    );
    expect(codexOverrides).toContain(
      'mcp_servers.kiditem.default_tools_approval_mode="approve"',
    );
    expect(JSON.stringify(claudeConfig)).not.toContain('/Users/operator');
    expect(codexOverrides.join('\n')).not.toContain('/Users/operator');
  });

  it('rejects an oversized final output file before parsing it', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'agent-output-test-'));
    const outputFile = join(directory, 'output.json');
    try {
      await writeFile(outputFile, '{"text":"oversized"}');

      await expect(readBoundedOutputFile(outputFile, 8)).rejects.toMatchObject({
        code: 'output_limit',
      });
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it('verifies citation ids against same-run evidence artifacts and deduplicates retrieval counts', () => {
    const result = verifyAgentLocalCliAnswer({
      context: CONTEXT,
      answer: answer(),
      artifacts: [evidenceArtifact()],
      toolInvocations: [
        {
          capabilityKey: 'sourcing.retrieveWorkspaceEvidence',
          status: 'succeeded',
          outputSummary: { documentCount: 2 },
        },
        {
          capabilityKey: 'sourcing.retrieveWorkspaceEvidence',
          status: 'succeeded',
          outputSummary: { documentCount: 7 },
        },
      ],
      provider: 'codex_cli',
      model: 'gpt-5.6-sol',
    });

    expect(result).toMatchObject({
      schemaVersion: 'sourcing-agent-answer.v1',
      text: '근거가 있는 답변',
      invalidCitationIds: [],
      documentCount: 7,
      provider: 'codex_cli',
      model: 'gpt-5.6-sol',
    });
    expect(result.citations).toHaveLength(1);
  });

  it('rejects duplicate or invented citations without copying evidence content', () => {
    expect(() =>
      verifyAgentLocalCliAnswer({
        context: CONTEXT,
        answer: answer({ citationIds: ['unknown', 'unknown'] }),
        artifacts: [evidenceArtifact()],
        toolInvocations: [],
        provider: 'claude_cli',
        model: 'claude-sonnet-4-6',
      }),
    ).toThrow(
      expect.objectContaining({ code: 'citation_verification_failed' }),
    );
  });

  it('accepts no citation only with a data gap or a verified resource reference', () => {
    expect(() =>
      verifyAgentLocalCliAnswer({
        context: CONTEXT,
        answer: answer({ citationIds: [], dataGaps: [], resourceRefs: [] }),
        artifacts: [],
        toolInvocations: [],
        provider: 'codex_cli',
        model: 'gpt-5.6-sol',
      }),
    ).toThrow(expect.objectContaining({ code: 'citation_required' }));

    expect(
      verifyAgentLocalCliAnswer({
        context: CONTEXT,
        answer: answer({
          citationIds: [],
          dataGaps: ['가격 근거가 없습니다.'],
        }),
        artifacts: [],
        toolInvocations: [],
        provider: 'codex_cli',
        model: 'gpt-5.6-sol',
      }).dataGaps,
    ).toEqual(['가격 근거가 없습니다.']);
  });

  it('requires operationRunId to match a verified resource ref and same-run artifact', () => {
    expect(() =>
      verifyAgentLocalCliAnswer({
        context: CONTEXT,
        answer: answer({
          citationIds: [],
          resourceRefs: [{ kind: 'operation_run', id: 'operation-1' }],
          operationRunId: '11111111-1111-4111-8111-111111111111',
        }),
        artifacts: [
          evidenceArtifact({
            id: 'artifact-operation',
            artifactType: 'operation_run',
            targetId: 'operation-1',
          }),
        ],
        toolInvocations: [],
        provider: 'codex_cli',
        model: 'gpt-5.6-sol',
      }),
    ).toThrow(
      expect.objectContaining({ code: 'resource_verification_failed' }),
    );
  });

  it('uses the same-run collection artifact instead of a model-copied operation id', () => {
    const operationRunId = '11111111-1111-4111-8111-111111111111';
    const copiedWrongId = '22222222-2222-4222-8222-222222222222';

    const result = verifyAgentLocalCliAnswer({
      context: CONTEXT,
      answer: answer({
        text: `Operations 실행 ID: ${copiedWrongId}`,
        citationIds: [],
        dataGaps: [],
        resourceRefs: [{ kind: 'operation_run', id: copiedWrongId }],
        operationRunId: copiedWrongId,
      }),
      artifacts: [
        evidenceArtifact({
          id: 'artifact-operation',
          artifactType: 'operation_run',
          targetId: operationRunId,
        }),
      ],
      toolInvocations: [
        {
          capabilityKey: 'sourcing.refreshCollection',
          status: 'succeeded',
          outputSummary: { operationRunId, status: 'queued' },
        },
      ],
      provider: 'codex_cli',
      model: 'gpt-5.6-sol',
    });

    expect(result.operationRunId).toBe(operationRunId);
    expect(result.resourceRefs).toContainEqual({
      kind: 'operation_run',
      id: operationRunId,
    });
    expect(result.text).toBe(`Operations 실행 ID: ${operationRunId}`);
  });
});
