import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';

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

const CONTEXT = {
  organizationId: 'org-1',
  requestId: 'request-1',
  runId: 'run-1',
};

function answer(overrides: Partial<AgentLocalCliAnswer> = {}): AgentLocalCliAnswer {
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

describe('AgentLocalCliRuntimeAdapter verification', () => {
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
    const repository = {
      appendRunEvent: vi.fn(),
    };
    const assets = {
      resolve: vi.fn().mockResolvedValue({
        promptPath: 'agent-config/prompts/agents/sourcing.md',
        prompt: 'Use evidence.',
        promptSha256: 'prompt-sha',
        skills: [],
        outputSchemaPath: 'agent-config/schemas/sourcing-agent-answer.schema.json',
        outputSchemaVersion: 'sourcing-agent-answer.v1',
        outputSchema: { type: 'object' },
        outputSchemaSha256: 'schema-sha',
      }),
    };
    const mcpSessions = {
      prepare: vi.fn().mockImplementation(async () => {
        await processes.cancel('run-1', 'user_cancelled');
        return {
          name: 'kiditem',
          command: 'node',
          args: ['mcp-server.js'],
          env: {},
        };
      }),
    };
    const adapter = new AgentLocalCliRuntimeAdapter(
      repository as never,
      assets as never,
      mcpSessions as never,
      processes,
    );

    await expect(
      adapter.execute({
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
        skillKeys: [],
        outputSchemaPath:
          'agent-config/schemas/sourcing-agent-answer.schema.json',
        input: { userMessage: 'Find products.' },
        trustLevel: 0,
        runtimeConfig: {},
      }),
    ).rejects.toMatchObject({ code: 'user_cancelled' });

    expect(spawnMock).not.toHaveBeenCalled();
    expect(repository.appendRunEvent).not.toHaveBeenCalled();
    expect(processes.reasonFor('run-1')).toBeNull();
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
    ).toThrow(expect.objectContaining({ code: 'citation_verification_failed' }));
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
    ).toThrow(expect.objectContaining({ code: 'resource_verification_failed' }));
  });
});
