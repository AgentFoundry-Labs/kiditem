import { NestFactory } from '@nestjs/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AgentConversationService } from '../../../../application/service/agent-conversation.service';
import { AgentRunExecutor } from '../../../../application/service/agent-run-executor.service';
import { AgentRunGraphService } from '../../../../application/service/agent-run-graph.service';
import {
  assertHermesToolLoopE2eArtifacts,
  assertHermesToolLoopE2eResult,
  buildHermesToolLoopE2eMessage,
  parseHermesToolLoopE2eEnv,
  runHermesToolLoopE2e,
} from '../run-hermes-tool-loop-e2e';

vi.mock('@nestjs/core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@nestjs/core')>();
  return {
    ...actual,
    NestFactory: {
      ...actual.NestFactory,
      createApplicationContext: vi.fn(),
    },
  };
});

const originalEnv = { ...process.env };

function mockApplicationContext() {
  const conversations = {
    startConversation: vi.fn().mockResolvedValue({
      conversation: { id: 'conversation-1' },
      rootRequestId: 'request-operator-1',
    }),
  };
  const executor = {
    executeRequest: vi.fn().mockResolvedValue({
      executed: true,
      requestId: 'request-operator-1',
      runId: 'run-operator-1',
    }),
  };
  const graph = {
    getConversationGraph: vi.fn().mockResolvedValue({
      artifacts: [
        {
          id: 'artifact-candidate-1',
          artifactType: 'sourcing_candidate',
          summary: { candidateId: 'candidate-1' },
        },
        {
          id: 'artifact-listing-1',
          artifactType: 'listing_prep_package',
          summary: {
            detailGenerationId: 'detail-generation-1',
            thumbnailGenerationId: 'thumbnail-generation-1',
          },
        },
      ],
    }),
  };
  const app = {
    get: vi.fn((token: unknown) => {
      if (token === AgentConversationService) return conversations;
      if (token === AgentRunExecutor) return executor;
      if (token === AgentRunGraphService) return graph;
      throw new Error('Unexpected provider token');
    }),
    close: vi.fn().mockResolvedValue(undefined),
  };

  vi.mocked(NestFactory.createApplicationContext).mockResolvedValue(
    app as Awaited<ReturnType<typeof NestFactory.createApplicationContext>>,
  );

  return { app, conversations, executor, graph };
}

describe('run-hermes-tool-loop-e2e', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    vi.restoreAllMocks();
  });

  it('asks Hermes to decide the Agent sequence and forbids external submissions', () => {
    const message = buildHermesToolLoopE2eMessage(
      'https://detail.1688.com/offer/1.html',
    );

    expect(message).toContain('Hermes Operator가 필요한 Agent를 직접 판단');
    expect(message).toContain('listing prep package');
    expect(message).toContain('쿠팡 제출');
    expect(message).toContain('하지 마');
    expect(message).toContain('https://detail.1688.com/offer/1.html');
  });

  it('requires live e2e organization and user ids from env', () => {
    expect(() => parseHermesToolLoopE2eEnv({})).toThrow(
      'Set AGENT_OS_E2E_ORGANIZATION_ID and AGENT_OS_E2E_USER_ID before running Hermes e2e.',
    );

    expect(
      parseHermesToolLoopE2eEnv({
        AGENT_OS_E2E_ORGANIZATION_ID: 'org-1',
        AGENT_OS_E2E_USER_ID: 'user-1',
      }),
    ).toEqual({
      organizationId: 'org-1',
      userId: 'user-1',
    });
  });

  it('fails e2e validation when the executor reports an errorCode', () => {
    expect(() =>
      assertHermesToolLoopE2eResult({
        executed: true,
        requestId: 'request-operator-1',
        runId: 'run-operator-1',
        errorCode: 'operator_runtime_finalization_missing',
      }),
    ).toThrow(
      'Hermes tool-loop e2e failed with operator_runtime_finalization_missing.',
    );
  });

  it('fails e2e validation when the executor pauses for approval', () => {
    expect(() =>
      assertHermesToolLoopE2eResult({
        executed: true,
        requestId: 'request-operator-1',
        runId: 'run-operator-1',
        reason: 'requires_approval',
      }),
    ).toThrow('Hermes tool-loop e2e paused for approval.');
  });

  it('fails e2e artifact validation when the listing package is missing draft references', () => {
    expect(() =>
      assertHermesToolLoopE2eArtifacts({
        artifacts: [
          {
            id: 'artifact-candidate-1',
            artifactType: 'sourcing_candidate',
            summary: { candidateId: 'candidate-1' },
          },
          {
            id: 'artifact-listing-1',
            artifactType: 'listing_prep_package',
            summary: { detailGenerationId: 'detail-generation-1' },
          },
        ],
      }),
    ).toThrow(
      'Hermes tool-loop e2e listing prep package is missing thumbnail draft reference.',
    );
  });

  it('starts a neutral Agent OS conversation and executes the Operator root request in Hermes tool-loop mode', async () => {
    process.env.AGENT_OS_HERMES_MODEL = 'gpt-5.5';
    const { app, conversations, executor, graph } = mockApplicationContext();

    const result = await runHermesToolLoopE2e({
      organizationId: 'org-1',
      userId: 'user-1',
      url: 'https://detail.1688.com/offer/1.html',
    });

    expect(process.env.AGENT_OS_OPERATOR_RUNTIME).toBe('hermes_tool_loop');
    expect(conversations.startConversation).toHaveBeenCalledWith({
      organizationId: 'org-1',
      userId: 'user-1',
      content: expect.stringContaining('https://detail.1688.com/offer/1.html'),
    });
    expect(executor.executeRequest).toHaveBeenCalledWith(
      'hermes-tool-loop-e2e',
      'org-1',
      'request-operator-1',
    );
    expect(graph.getConversationGraph).toHaveBeenCalledWith({
      organizationId: 'org-1',
      conversationId: 'conversation-1',
    });
    expect(result).toEqual({
      conversationId: 'conversation-1',
      rootRequestId: 'request-operator-1',
      result: {
        executed: true,
        requestId: 'request-operator-1',
        runId: 'run-operator-1',
      },
      artifactSummary: {
        sourcingCandidateArtifactId: 'artifact-candidate-1',
        listingPrepPackageArtifactId: 'artifact-listing-1',
        detailDraftRef: 'detail-generation-1',
        thumbnailDraftRef: 'thumbnail-generation-1',
      },
      inspectPath: '/agent-os?conversationId=conversation-1',
    });
    expect(app.close).toHaveBeenCalled();
  });
});
