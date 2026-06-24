import { describe, expect, it, vi } from 'vitest';
import { AgentOsRuntimeError } from '../../../domain/agent-os.errors';
import type { AgentCapabilityHandler } from '../../port/out/capability/agent-capability-handler.port';
import { AgentCapabilityRegistry } from '../agent-capability-registry.service';
import { AgentToolRouter } from '../agent-tool-router.service';
import {
  AgentOsMcpToolExecutor,
  type AgentOsMcpExecutionContext,
} from '../agent-os-mcp-tool-executor.service';
import { KidItemMcpToolRegistry } from '../kiditem-mcp-tool-registry.service';
import { OperatorContextBuilder } from '../operator-context-builder.service';

const mcpContext: AgentOsMcpExecutionContext = {
  organizationId: 'org-1',
  conversationId: 'conversation-1',
  requestId: 'request-1',
  runId: 'run-1',
  agentInstanceId: 'agent-1',
  agentType: 'sourcing',
  requestedByUserId: 'user-1',
};

function createExecutor() {
  const contextBuilder = {
    build: vi.fn(),
  } as unknown as OperatorContextBuilder;
  const toolRegistry = {
    listTools: vi.fn(),
    listToolsForContext: vi.fn(),
    resolveTool: vi.fn(),
    resolveCapabilityKey: vi.fn(),
  } as unknown as KidItemMcpToolRegistry;
  const toolRouter = {
    invoke: vi.fn(),
  } as unknown as AgentToolRouter;

  return {
    contextBuilder,
    toolRegistry,
    toolRouter,
    executor: new AgentOsMcpToolExecutor(
      contextBuilder,
      toolRegistry,
      toolRouter,
    ),
  };
}

function handler(key: string): AgentCapabilityHandler {
  return {
    key,
    ownerDomain: key.split('.')[0] ?? 'agent-os',
    executionKind: 'tool',
    inputSchema: {} as AgentCapabilityHandler['inputSchema'],
    outputSchema: {} as AgentCapabilityHandler['outputSchema'],
    sideEffects: ['read'],
    approvalRisk: 'none',
    idempotencyKey: () => null,
    execute: async () => ({}),
  };
}

describe('AgentOsMcpToolExecutor', () => {
  it('reads bounded operator context through OperatorContextBuilder', async () => {
    const { contextBuilder, executor } = createExecutor();
    const sanitizedContext = {
      conversation: { id: 'conversation-1', title: 'Launch', rootRequestId: 'request-1' },
      rootRequest: {
        id: 'request-1',
        payload: {
          accessToken: '[REDACTED]',
        },
      },
      recentMessages: [{ id: 'message-1', content: 'safe context' }],
    };
    vi.mocked(contextBuilder.build).mockResolvedValue(
      sanitizedContext as Awaited<ReturnType<OperatorContextBuilder['build']>>,
    );

    await expect(
      executor.execute({
        context: mcpContext,
        toolName: 'kiditem_context_read',
        arguments: {},
      }),
    ).resolves.toBe(sanitizedContext);

    expect(contextBuilder.build).toHaveBeenCalledWith({
      organizationId: 'org-1',
      conversationId: 'conversation-1',
      requestId: 'request-1',
    });
  });

  it('lists curated MCP capabilities from KidItemMcpToolRegistry', async () => {
    const { executor, toolRegistry } = createExecutor();
    const tools = [
      {
        name: 'kiditem__sourcing_score_opportunities',
        capabilityKey: 'sourcing.score_opportunities',
        ownerDomain: 'sourcing',
        approvalRisk: 'none',
        sideEffects: ['read'],
      },
    ];
    vi.mocked(toolRegistry.listToolsForContext).mockReturnValue(
      tools as ReturnType<KidItemMcpToolRegistry['listToolsForContext']>,
    );

    await expect(
      executor.execute({
        context: mcpContext,
        toolName: 'kiditem_capabilities_list',
        arguments: {},
      }),
    ).resolves.toEqual({ items: tools });
  });

  it('denies Operator-only task creation to leaf agents before delegation', async () => {
    const { executor, toolRouter } = createExecutor();

    await expect(
      executor.execute({
        context: { ...mcpContext, agentType: 'sourcing' },
        toolName: 'agent_os_create_task',
        arguments: {
          agentType: 'listing',
          playbookKey: 'manual_product_intake_from_url_v1',
          taskInput: { productName: 'Toy car' },
        },
      }),
    ).rejects.toMatchObject<Partial<AgentOsRuntimeError>>({
      name: 'AgentOsRuntimeError',
      code: 'mcp_operator_tool_denied',
    });
    expect(toolRouter.invoke).not.toHaveBeenCalled();
  });

  it('requires Operator-created tasks to include explicit playbookKey, taskInput, and executeMode', async () => {
    const { contextBuilder, toolRegistry, toolRouter } = createExecutor();
    const delegation = { delegate: vi.fn() };
    const executor = new AgentOsMcpToolExecutor(
      contextBuilder,
      toolRegistry,
      toolRouter,
      undefined,
      delegation as never,
    );

    await expect(
      executor.execute({
        context: { ...mcpContext, agentType: 'manager' },
        toolName: 'agent_os_create_task',
        arguments: {
          agentType: 'sourcing',
          taskInput: { sourceUrl: 'https://detail.1688.com/offer/1.html' },
          executeMode: 'queued',
        },
      }),
    ).rejects.toMatchObject<Partial<AgentOsRuntimeError>>({
      code: 'mcp_create_task_input_invalid',
    });

    await expect(
      executor.execute({
        context: { ...mcpContext, agentType: 'manager' },
        toolName: 'agent_os_create_task',
        arguments: {
          agentType: 'sourcing',
          playbookKey: 'manual_product_intake_from_url_v1',
          executeMode: 'queued',
        },
      }),
    ).rejects.toMatchObject<Partial<AgentOsRuntimeError>>({
      code: 'mcp_create_task_input_invalid',
    });

    await expect(
      executor.execute({
        context: { ...mcpContext, agentType: 'manager' },
        toolName: 'agent_os_create_task',
        arguments: {
          agentType: 'sourcing',
          playbookKey: 'manual_product_intake_from_url_v1',
          taskInput: { sourceUrl: 'https://detail.1688.com/offer/1.html' },
        },
      }),
    ).rejects.toMatchObject<Partial<AgentOsRuntimeError>>({
      code: 'mcp_create_task_input_invalid',
    });

    expect(delegation.delegate).not.toHaveBeenCalled();
  });

  it('rejects playbook and agent mismatches before delegation', async () => {
    const { contextBuilder, toolRegistry, toolRouter } = createExecutor();
    const delegation = { delegate: vi.fn() };
    const executor = new AgentOsMcpToolExecutor(
      contextBuilder,
      toolRegistry,
      toolRouter,
      undefined,
      delegation as never,
    );

    await expect(
      executor.execute({
        context: { ...mcpContext, agentType: 'manager' },
        toolName: 'agent_os_create_task',
        arguments: {
          agentType: 'order',
          playbookKey: 'manual_product_intake_from_url_v1',
          planStepKey: 'scrape_url',
          executeMode: 'queued',
          taskInput: {},
        },
      }),
    ).rejects.toMatchObject<Partial<AgentOsRuntimeError>>({
      code: 'mcp_create_task_input_invalid',
    });

    expect(delegation.delegate).not.toHaveBeenCalled();
  });

  it('queues child tasks unless Hermes explicitly asks for inline execution', async () => {
    const { contextBuilder, toolRegistry, toolRouter } = createExecutor();
    const delegation = {
      delegate: vi.fn().mockResolvedValue({
        ok: true,
        requestId: 'request-sourcing-1',
      }),
    };
    const runner = { executeRequest: vi.fn() };
    const executor = new AgentOsMcpToolExecutor(
      contextBuilder,
      toolRegistry,
      toolRouter,
      undefined,
      delegation as never,
      undefined,
      runner as never,
    );

    await expect(
      executor.execute({
        context: { ...mcpContext, agentType: 'manager' },
        toolName: 'agent_os_create_task',
        arguments: {
          agentType: 'sourcing',
          playbookKey: 'manual_product_intake_from_url_v1',
          planStepKey: 'sourcing_agent',
          displayName: 'Sourcing Agent',
          executeMode: 'queued',
          taskInput: {
            sourceUrl: 'https://detail.1688.com/offer/1.html',
          },
        },
      }),
    ).resolves.toMatchObject({
      status: 'queued',
      taskId: 'request-sourcing-1',
      summary: {
        agentType: 'sourcing',
        playbookKey: 'manual_product_intake_from_url_v1',
        executeMode: 'queued',
      },
    });

    expect(runner.executeRequest).not.toHaveBeenCalled();
  });

  it('invokes first-class domain MCP tools by resolved capability allowlist', async () => {
    const { executor, toolRegistry, toolRouter } = createExecutor();
    vi.mocked(toolRegistry.resolveTool).mockReturnValue({
      descriptor: {
        name: 'sourcing_scrape_url',
        capabilityKey: 'sourcing.scrapeProductUrl',
        ownerDomain: 'sourcing',
        approvalRisk: 'none',
        sideEffects: ['browser', 'external_io'],
      },
      handler: handler('sourcing.scrapeProductUrl'),
    });
    vi.mocked(toolRouter.invoke).mockResolvedValue({
      status: 'succeeded',
      invocation: {
        id: 'tool-invocation-1',
        approvalRequestId: null,
      },
      artifacts: [
        {
          id: 'artifact-1',
          artifactType: 'sourcing_candidate',
          title: '1688 candidate',
          summary: { candidateId: 'candidate-1' },
          href: '/sourcing/candidates/candidate-1',
          targetDomain: 'sourcing',
          targetModel: 'SourcingCandidate',
        },
      ],
    } as Awaited<ReturnType<AgentToolRouter['invoke']>>);

    await expect(
      executor.execute({
        context: mcpContext,
        toolName: 'sourcing_scrape_url',
        arguments: {
          sourceUrl: 'https://detail.1688.com/offer/767987154308.html',
        },
      }),
    ).resolves.toEqual({
      status: 'succeeded',
      invocationId: 'tool-invocation-1',
      approvalRequestId: null,
      artifactIds: ['artifact-1'],
      artifacts: [
        {
          id: 'artifact-1',
          artifactType: 'sourcing_candidate',
          title: '1688 candidate',
          summary: { candidateId: 'candidate-1' },
        },
      ],
    });

    expect(toolRegistry.resolveTool).toHaveBeenCalledWith(
      'sourcing_scrape_url',
      mcpContext,
    );
    expect(toolRouter.invoke).toHaveBeenCalledWith({
      organizationId: 'org-1',
      conversationId: 'conversation-1',
      requestId: 'request-1',
      runId: 'run-1',
      agentInstanceId: 'agent-1',
      agentType: 'sourcing',
      requestedByUserId: 'user-1',
      capabilityKey: 'sourcing.scrapeProductUrl',
      input: {
        sourceUrl: 'https://detail.1688.com/offer/767987154308.html',
      },
    });
  });

  it('projects sourcing scrape artifacts into listing generation package input', async () => {
    const { contextBuilder, toolRegistry, toolRouter } = createExecutor();
    const repository = {
      listArtifacts: vi.fn().mockResolvedValue([
        {
          id: 'artifact-sourcing-1',
          artifactType: 'sourcing_scrape_snapshot',
          summary: {
            scraped_data: {
              title: '어린이 RC 탱크 장난감',
              category_name: '遥控车',
              images: [
                'https://cdn.example.com/tank-1.jpg',
                'https://cdn.example.com/tank-2.jpg',
              ],
              sku_list: [
                { specAttrs: '노란색' },
                { specAttrs: '블루' },
              ],
              specs: [
                { key: '적용 연령', value: '어린이 (4-6 세)' },
                { key: '포장', value: '컬러 박스' },
              ],
            },
          },
        },
      ]),
    };
    const executor = new AgentOsMcpToolExecutor(
      contextBuilder,
      toolRegistry,
      toolRouter,
      undefined,
      undefined,
      repository as never,
    );
    vi.mocked(toolRegistry.resolveTool).mockReturnValue({
      descriptor: {
        name: 'listing_create_generation_package',
        capabilityKey: 'product_listing.create_generation_package',
        ownerDomain: 'sourcing',
        approvalRisk: 'low',
        sideEffects: ['db_write', 'job_enqueue'],
      },
      handler: handler('product_listing.create_generation_package'),
    });
    vi.mocked(toolRouter.invoke).mockResolvedValue({
      status: 'succeeded',
      invocation: {
        id: 'tool-invocation-listing-1',
        approvalRequestId: null,
      },
      artifacts: [
        {
          id: 'artifact-listing-1',
          artifactType: 'listing_prep_package',
          title: '어린이 RC 탱크 장난감 등록 준비 패키지',
          summary: { candidateId: 'candidate-1' },
          href: '/sourcing/candidates/candidate-1',
          targetDomain: 'sourcing',
          targetModel: 'ProductGenerationPackage',
        },
      ],
    } as Awaited<ReturnType<AgentToolRouter['invoke']>>);

    await expect(
      executor.execute({
        context: { ...mcpContext, agentType: 'listing' },
        toolName: 'listing_create_generation_package',
        arguments: {
          sourceArtifactIds: ['artifact-sourcing-1'],
          channel: 'coupang',
        },
      }),
    ).resolves.toMatchObject({
      status: 'succeeded',
      invocationId: 'tool-invocation-listing-1',
      artifactIds: ['artifact-listing-1'],
    });

    expect(repository.listArtifacts).toHaveBeenCalledWith({
      organizationId: 'org-1',
      conversationId: 'conversation-1',
    });
    expect(toolRouter.invoke).toHaveBeenCalledWith(
      expect.objectContaining({
        capabilityKey: 'product_listing.create_generation_package',
        input: expect.objectContaining({
          sourceArtifactIds: ['artifact-sourcing-1'],
          channel: 'coupang',
          productName: '어린이 RC 탱크 장난감',
          category: '遥控车',
          imageUrls: [
            'https://cdn.example.com/tank-1.jpg',
            'https://cdn.example.com/tank-2.jpg',
          ],
          thumbnailUrl: 'https://cdn.example.com/tank-1.jpg',
          thumbnailUrls: [
            'https://cdn.example.com/tank-1.jpg',
            'https://cdn.example.com/tank-2.jpg',
          ],
          optionNames: ['노란색', '블루'],
          description: '적용 연령: 어린이 (4-6 세)\n포장: 컬러 박스',
        }),
      }),
    );
  });

  it('projects sourcing candidate artifacts into listing generation package input', async () => {
    const { contextBuilder, toolRegistry, toolRouter } = createExecutor();
    const repository = {
      listArtifacts: vi.fn().mockResolvedValue([
        {
          id: 'artifact-candidate-1',
          conversationId: 'conversation-1',
          artifactType: 'sourcing_candidate',
          summary: {
            candidateSource: 'sourcing.scrapeProductUrl',
            scraped_data: {
              product_id: '767987154308',
              title: '어린이 RC 자동차',
              images: ['https://cdn.example.com/rc-car.jpg'],
            },
          },
        },
      ]),
    };
    const executor = new AgentOsMcpToolExecutor(
      contextBuilder,
      toolRegistry,
      toolRouter,
      undefined,
      undefined,
      repository as never,
    );
    vi.mocked(toolRegistry.resolveTool).mockReturnValue({
      descriptor: {
        name: 'listing_create_generation_package',
        capabilityKey: 'product_listing.create_generation_package',
        ownerDomain: 'sourcing',
        approvalRisk: 'low',
        sideEffects: ['db_write', 'job_enqueue'],
      },
      handler: handler('product_listing.create_generation_package'),
    });
    vi.mocked(toolRouter.invoke).mockResolvedValue({
      status: 'succeeded',
      invocation: {
        id: 'tool-invocation-listing-candidate',
        approvalRequestId: null,
      },
      artifacts: [],
    } as Awaited<ReturnType<AgentToolRouter['invoke']>>);

    await executor.execute({
      context: { ...mcpContext, agentType: 'listing' },
      toolName: 'listing_create_generation_package',
      arguments: {
        sourceArtifactIds: ['artifact-candidate-1'],
      },
    });

    expect(toolRouter.invoke).toHaveBeenCalledWith(
      expect.objectContaining({
        capabilityKey: 'product_listing.create_generation_package',
        input: expect.objectContaining({
          sourceArtifactIds: ['artifact-candidate-1'],
          productName: '어린이 RC 자동차',
          imageUrls: ['https://cdn.example.com/rc-car.jpg'],
          thumbnailUrl: 'https://cdn.example.com/rc-car.jpg',
        }),
      }),
    );
  });

  it('does not project listing input from source URL matches outside the active conversation', async () => {
    const { contextBuilder, toolRegistry, toolRouter } = createExecutor();
    const repository = {
      listArtifacts: vi.fn().mockResolvedValue([
        {
          id: 'artifact-from-previous-conversation',
          conversationId: 'conversation-previous',
          artifactType: 'sourcing_scrape_snapshot',
          summary: {
            scraped_data: {
              source_url: 'https://detail.1688.com/offer/767987154308.html',
              title: '원격 제어 탱크 장난감',
              images: ['https://cdn.example.com/tank.jpg'],
            },
          },
        },
      ]),
    };
    const executor = new AgentOsMcpToolExecutor(
      contextBuilder,
      toolRegistry,
      toolRouter,
      undefined,
      undefined,
      repository as never,
    );
    vi.mocked(toolRegistry.resolveTool).mockReturnValue({
      descriptor: {
        name: 'listing_create_generation_package',
        capabilityKey: 'product_listing.create_generation_package',
        ownerDomain: 'sourcing',
        approvalRisk: 'low',
        sideEffects: ['db_write', 'job_enqueue'],
      },
      handler: handler('product_listing.create_generation_package'),
    });
    vi.mocked(toolRouter.invoke).mockResolvedValue({
      status: 'succeeded',
      invocation: {
        id: 'tool-invocation-listing-2',
        approvalRequestId: null,
      },
      artifacts: [],
    } as Awaited<ReturnType<AgentToolRouter['invoke']>>);

    await executor.execute({
      context: { ...mcpContext, agentType: 'listing' },
      toolName: 'listing_create_generation_package',
      arguments: {
        sourceTaskId: 'request-from-current-conversation',
        sourceUrl: 'https://detail.1688.com/offer/767987154308.html',
        marketplace: 'coupang',
      },
    });

    expect(toolRouter.invoke).toHaveBeenCalledWith(
      expect.objectContaining({
        capabilityKey: 'product_listing.create_generation_package',
        input: {
          sourceTaskId: 'request-from-current-conversation',
          sourceUrl: 'https://detail.1688.com/offer/767987154308.html',
          marketplace: 'coupang',
        },
      }),
    );
    expect(repository.listArtifacts).toHaveBeenCalledWith({
      organizationId: 'org-1',
      conversationId: 'conversation-1',
    });
  });

  it('rejects finalize_task artifactIds outside the current conversation', async () => {
    const { contextBuilder, toolRegistry, toolRouter } = createExecutor();
    const repository = {
      listArtifacts: vi.fn().mockResolvedValue([
        {
          id: 'artifact-visible-1',
          conversationId: 'conversation-1',
        },
      ]),
      appendRunEvent: vi.fn(),
    };
    const executor = new AgentOsMcpToolExecutor(
      contextBuilder,
      toolRegistry,
      toolRouter,
      undefined,
      undefined,
      repository as never,
    );

    await expect(
      executor.execute({
        context: mcpContext,
        toolName: 'agent_os_finalize_task',
        arguments: {
          status: 'succeeded',
          artifactIds: ['artifact-visible-1', 'artifact-other-conversation'],
          summary: 'done',
        },
      }),
    ).rejects.toMatchObject<Partial<AgentOsRuntimeError>>({
      code: 'mcp_finalize_artifact_not_visible',
    });

    expect(repository.listArtifacts).toHaveBeenCalledWith({
      organizationId: 'org-1',
      conversationId: 'conversation-1',
    });
    expect(repository.appendRunEvent).not.toHaveBeenCalled();
  });

  it('maps inline child requires_approval execution to waiting_approval', async () => {
    const { contextBuilder, toolRegistry, toolRouter } = createExecutor();
    const delegation = {
      delegate: vi.fn().mockResolvedValue({
        ok: true,
        requestId: 'request-order-1',
      }),
    };
    const runner = {
      executeRequest: vi.fn().mockResolvedValue({
        executed: true,
        requestId: 'request-order-1',
        runId: 'run-order-1',
        reason: 'requires_approval',
      }),
    };
    const executor = new AgentOsMcpToolExecutor(
      contextBuilder,
      toolRegistry,
      toolRouter,
      undefined,
      delegation as never,
      undefined,
      runner as never,
    );

    await expect(
      executor.execute({
        context: { ...mcpContext, agentType: 'manager' },
        toolName: 'agent_os_create_task',
        arguments: {
          agentType: 'sourcing',
          playbookKey: 'manual_product_intake_from_url_v1',
          planStepKey: 'sourcing_agent',
          executeMode: 'inline',
          taskInput: {
            sourceUrl: 'https://detail.1688.com/offer/1.html',
          },
        },
      }),
    ).resolves.toMatchObject({
      status: 'waiting_approval',
      taskId: 'request-order-1',
      invocationId: 'run-order-1',
    });
  });

  it('persists Operator user-input requests as approval pauses', async () => {
    const { contextBuilder, toolRegistry, toolRouter } = createExecutor();
    const repository = {
      markRequestStatus: vi.fn().mockResolvedValue({}),
      appendRunEvent: vi.fn().mockResolvedValue({}),
    };
    const executor = new AgentOsMcpToolExecutor(
      contextBuilder,
      toolRegistry,
      toolRouter,
      undefined,
      undefined,
      repository as never,
    );

    await expect(
      executor.execute({
        context: { ...mcpContext, agentType: 'manager' },
        toolName: 'agent_os_request_user_input',
        arguments: {
          question: '이 상품으로 진행할까요?',
          reason: '상품 선택 확인이 필요합니다.',
        },
      }),
    ).resolves.toEqual({
      status: 'waiting_approval',
      summary: {
        question: '이 상품으로 진행할까요?',
        reason: '상품 선택 확인이 필요합니다.',
      },
    });

    expect(repository.markRequestStatus).toHaveBeenCalledWith({
      organizationId: 'org-1',
      requestId: 'request-1',
      status: 'requires_approval',
      errorCode: 'user_input_required',
      errorMessage: '상품 선택 확인이 필요합니다.',
    });
    expect(repository.appendRunEvent).toHaveBeenCalledWith({
      organizationId: 'org-1',
      runId: 'run-1',
      agentInstanceId: 'agent-1',
      type: 'agent_os.task_finalized',
      data: {
        finalizationTool: 'agent_os_request_user_input',
        status: 'waiting_approval',
        artifactIds: [],
        summary: {
          question: '이 상품으로 진행할까요?',
          reason: '상품 선택 확인이 필요합니다.',
        },
        error: null,
      },
    });
  });

  it('proves a capability is exposed before invoking AgentToolRouter with MCP context ids', async () => {
    const { executor, toolRegistry, toolRouter } = createExecutor();
    vi.mocked(toolRegistry.resolveCapabilityKey).mockReturnValue({
      descriptor: {
        name: 'kiditem__sourcing_score_opportunities',
        capabilityKey: 'sourcing.score_opportunities',
        ownerDomain: 'sourcing',
        approvalRisk: 'none',
        sideEffects: ['read'],
      },
      handler: handler('sourcing.score_opportunities'),
    });
    vi.mocked(toolRouter.invoke).mockResolvedValue({
      status: 'succeeded',
      invocation: {
        id: 'tool-invocation-1',
        approvalRequestId: null,
      },
      artifacts: [
        {
          id: 'artifact-1',
          artifactType: 'sourcing_recommendation',
          title: 'Top candidates',
          summary: { count: 3 },
          href: 'https://internal.example/artifacts/artifact-1',
          targetDomain: 'sourcing',
          targetModel: 'SourcingRecommendation',
        },
      ],
    } as Awaited<ReturnType<AgentToolRouter['invoke']>>);

    await expect(
      executor.execute({
        context: mcpContext,
        toolName: 'kiditem_capability_invoke',
        arguments: {
          capabilityKey: 'sourcing.score_opportunities',
          input: { candidates: ['candidate-1'] },
        },
      }),
    ).resolves.toEqual({
      status: 'succeeded',
      invocationId: 'tool-invocation-1',
      approvalRequestId: null,
      artifactIds: ['artifact-1'],
      artifacts: [
        {
          id: 'artifact-1',
          artifactType: 'sourcing_recommendation',
          title: 'Top candidates',
          summary: { count: 3 },
        },
      ],
    });

    expect(toolRegistry.resolveCapabilityKey).toHaveBeenCalledWith(
      'sourcing.score_opportunities',
    );
    expect(toolRouter.invoke).toHaveBeenCalledWith({
      organizationId: 'org-1',
      conversationId: 'conversation-1',
      requestId: 'request-1',
      runId: 'run-1',
      agentInstanceId: 'agent-1',
      agentType: 'sourcing',
      requestedByUserId: 'user-1',
      capabilityKey: 'sourcing.score_opportunities',
      input: { candidates: ['candidate-1'] },
    });
    expect(
      vi.mocked(toolRegistry.resolveCapabilityKey).mock.invocationCallOrder[0],
    ).toBeLessThan(vi.mocked(toolRouter.invoke).mock.invocationCallOrder[0]);
  });

  it('rejects a registered but non-allowlisted capability before AgentToolRouter.invoke', async () => {
    const contextBuilder = {
      build: vi.fn(),
    } as unknown as OperatorContextBuilder;
    const capabilityRegistry = new AgentCapabilityRegistry();
    capabilityRegistry.register(handler('sourcing.internal_admin'));
    const toolRegistry = new KidItemMcpToolRegistry(capabilityRegistry);
    const toolRouter = {
      invoke: vi.fn(),
    } as unknown as AgentToolRouter;
    const executor = new AgentOsMcpToolExecutor(
      contextBuilder,
      toolRegistry,
      toolRouter,
    );

    await expect(
      executor.execute({
        context: mcpContext,
        toolName: 'kiditem_capability_invoke',
        arguments: {
          capabilityKey: 'sourcing.internal_admin',
          input: {},
        },
      }),
    ).rejects.toMatchObject<Partial<AgentOsRuntimeError>>({
      name: 'AgentOsRuntimeError',
      code: 'mcp_capability_not_exposed',
    });

    expect(toolRouter.invoke).not.toHaveBeenCalled();
  });

  it('rejects a registered collision capability before AgentToolRouter.invoke', async () => {
    const contextBuilder = {
      build: vi.fn(),
    } as unknown as OperatorContextBuilder;
    const capabilityRegistry = new AgentCapabilityRegistry();
    capabilityRegistry.register(handler('supplier1688.match_products'));
    capabilityRegistry.register(handler('supplier1688:match_products'));
    const toolRegistry = new KidItemMcpToolRegistry(capabilityRegistry);
    const toolRouter = {
      invoke: vi.fn(),
    } as unknown as AgentToolRouter;
    const executor = new AgentOsMcpToolExecutor(
      contextBuilder,
      toolRegistry,
      toolRouter,
    );

    await expect(
      executor.execute({
        context: mcpContext,
        toolName: 'kiditem_capability_invoke',
        arguments: {
          capabilityKey: 'supplier1688:match_products',
          input: {},
        },
      }),
    ).rejects.toMatchObject<Partial<AgentOsRuntimeError>>({
      name: 'AgentOsRuntimeError',
      code: 'mcp_capability_not_exposed',
    });

    expect(toolRouter.invoke).not.toHaveBeenCalled();
  });

  it('returns approval pauses as structured MCP results', async () => {
    const { executor, toolRegistry, toolRouter } = createExecutor();
    vi.mocked(toolRegistry.resolveCapabilityKey).mockReturnValue({
      descriptor: {
        name: 'kiditem__supply_submit_purchase_order',
        capabilityKey: 'supply.submit_purchase_order',
        ownerDomain: 'supply',
        approvalRisk: 'high',
        sideEffects: ['external_write'],
      },
      handler: handler('supply.submit_purchase_order'),
    });
    vi.mocked(toolRouter.invoke).mockResolvedValue({
      status: 'waiting_approval',
      invocation: {
        id: 'tool-approval-1',
        approvalRequestId: 'approval-1',
      },
      artifacts: [],
    } as Awaited<ReturnType<AgentToolRouter['invoke']>>);

    await expect(
      executor.execute({
        context: mcpContext,
        toolName: 'kiditem_capability_invoke',
        arguments: {
          capabilityKey: 'supply.submit_purchase_order',
          input: { purchaseOrderId: '0187e942-9098-7382-9a22-c5b821f2f5d1' },
        },
      }),
    ).resolves.toEqual({
      status: 'waiting_approval',
      invocationId: 'tool-approval-1',
      approvalRequestId: 'approval-1',
      artifactIds: [],
      artifacts: [],
    });
  });

  it.each(['delegate_task', 'terminal.exec', 'file.write', 'browser_navigate'])(
    'rejects unknown MCP tool %s',
    async (toolName) => {
      const { executor, toolRouter } = createExecutor();

      await expect(
        executor.execute({
          context: mcpContext,
          toolName,
          arguments: {},
        }),
      ).rejects.toMatchObject<Partial<AgentOsRuntimeError>>({
        name: 'AgentOsRuntimeError',
        code: 'mcp_tool_not_registered',
      });
      expect(toolRouter.invoke).not.toHaveBeenCalled();
    },
  );
});
