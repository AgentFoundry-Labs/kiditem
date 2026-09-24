import {
  CLIENT_CAPABILITIES_META_KEY,
  PROTOCOL_VERSION_META_KEY,
} from '@modelcontextprotocol/server';
import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { canonicalOwnerInputHash } from '../../../../common/owner-idempotency-key';
import {
  CapabilityInvocationService,
  OwnerKnownFailureError,
} from '../../../application/service/capability-invocation.service';
import { AgentOsError } from '../../../domain/agent-os.errors';
import { GatewayMcpActiveTurnInactiveError } from '../../out/runtime/gateway/gateway-mcp-runtime.registry';
import { FINAL_CAPABILITY_DEFINITIONS } from '../../../domain/catalog/final-capability.catalog';
import {
  CAPABILITY_MCP_TOOL_NAMES,
  MCP_JSON_SCHEMA_DIALECT,
  MCP_PROTOCOL_VERSION,
} from './capability-mcp-wire-contract';
import {
  createRequestScopedCapabilityMcpHandler,
  type CapabilityMcpDependencies,
} from './kiditem-agent-os-mcp-server';

const ORGANIZATION_ID = '00000000-0000-4000-8000-000000000001';
const USER_ID = '00000000-0000-4000-8000-000000000002';
const INVOCATION_ID = '00000000-0000-4000-8000-000000000003';
const READ_CAPABILITY = 'analytics.readOverview';
const MUTATION_CAPABILITY = 'supply.create_purchase_order_draft';
const MUTATION_RESULT_CAPABILITY = 'channels.submit_wing_thumbnail';
const AMBIGUOUS_CAPABILITY = 'supply.submit_purchase_order';
const CONFLICT_CAPABILITY = 'supply.request_key_conflict';
const PROVIDER_FAILURE_CAPABILITY = 'sourcing.provider_failure';
const OWNER_SAFE_FAILURE = 'Provider rejected before commit.';

describe('KidItem stateless capability MCP server', () => {
  it('keeps protocol discovery inactive-safe but resolves active turn authority lazily for every actual tool callback', async () => {
    const { dependencies } = makeHandler();
    let active: ReturnType<typeof activeTurn> | null = null;
    const handler = createRequestScopedCapabilityMcpHandler(dependencies, (() => {
      if (!active) throw new GatewayMcpActiveTurnInactiveError();
      return active;
    }) as never);

    try {
      const tools = await call(handler, 'tools/list', {});
      expect(tools.result.tools.map((tool: { name: string }) => tool.name)).toEqual(CAPABILITY_MCP_TOOL_NAMES);

      const inactive = await call(handler, 'tools/call', {
        name: 'readiness_probe',
        arguments: {},
      });
      expect(inactive.result).toMatchObject({
        isError: true,
        structuredContent: { kind: 'error', error: { code: 'MCP_ACTIVE_TURN_INACTIVE' } },
      });

      active = { ...activeTurn(), executionId: 'execution-live' };
      const catalog = await call(handler, 'tools/call', {
        name: 'capability_catalog_search',
        arguments: {},
      });
      expect(catalog.result.structuredContent.capabilities).toHaveLength(FINAL_CAPABILITY_DEFINITIONS.length);

      await call(handler, 'tools/call', {
        name: 'capability_invoke',
        arguments: { capabilityKey: READ_CAPABILITY, input: { period: 'month' } },
      });
      expect(dependencies.invocations.invoke).toHaveBeenCalledWith(expect.objectContaining({
        organizationId: ORGANIZATION_ID,
        executionId: 'execution-live',
      }));
    } finally {
      await handler.close();
    }
  });

  it('serves exactly four modern tools from independent request handlers and advertises 2020-12 strict contracts', async () => {
    const { handler, dependencies } = makeHandler();
    try {
      const toolList = await call(handler, 'tools/list', {});
      const toolNames = toolList.result.tools.map((tool: { name: string }) => tool.name);

      expect(toolNames).toEqual(CAPABILITY_MCP_TOOL_NAMES);
      expect(toolNames).not.toEqual(expect.arrayContaining([
        'delegate_agent',
        'create_child_task',
        'wait_for_approval',
        'wait_for_operation',
        'submit_result',
        'continue_attempt',
      ]));
      for (const tool of toolList.result.tools) {
        expect(tool.inputSchema.$schema).toBe(MCP_JSON_SCHEMA_DIALECT);
        expect(tool.inputSchema.additionalProperties).toBe(false);
      }

      const catalog = await call(handler, 'tools/call', {
        name: 'capability_catalog_search',
        arguments: {},
      });
      const entries = catalog.result.structuredContent.capabilities;
      expect(entries).toHaveLength(FINAL_CAPABILITY_DEFINITIONS.length);
      expect(entries.map((entry: { key: string }) => entry.key)).toEqual(
        FINAL_CAPABILITY_DEFINITIONS.map(({ key }) => key),
      );
      expect(entries.filter((entry: { key: string }) => entry.key.startsWith('sourcing.')))
        .toHaveLength(7);
      expect(entries.find((entry: { key: string }) => entry.key === 'sourcing.ingestCandidate'))
        .toMatchObject({
          inputSchema: expect.objectContaining({
            $schema: MCP_JSON_SCHEMA_DIALECT,
            additionalProperties: false,
          }),
          outputSchema: expect.objectContaining({
            $schema: MCP_JSON_SCHEMA_DIALECT,
            additionalProperties: false,
          }),
        });
      expect(dependencies.invocations.invoke).not.toHaveBeenCalled();
    } finally {
      await handler.close();
    }
  });

  it('maps read results and publishes approval locators from the authoritative active turn', async () => {
    const { handler, dependencies } = makeHandler();
    try {
      const read = await call(handler, 'tools/call', {
        name: 'capability_invoke',
        arguments: {
          capabilityKey: READ_CAPABILITY,
          input: { period: 'month' },
        },
      });
      expect(read.result.structuredContent).toMatchObject({
        kind: 'completed',
        invocation: null,
        result: { resourceRefs: [] },
      });

      const pending = await call(handler, 'tools/call', {
        name: 'capability_invoke',
        arguments: {
          capabilityKey: MUTATION_CAPABILITY,
          requestKey: 'purchase-order-1',
          actingAgentKey: 'supply',
          input: { purchaseOrderId: '00000000-0000-4000-8000-000000000005' },
        },
      });
      expect(pending.result.resultType).toBe('complete');
      expect(pending.result.structuredContent).toMatchObject({
        kind: 'pending',
        invocation: {
          id: INVOCATION_ID,
          status: 'pending',
          approvalStatus: 'pending',
          retryWithSameRequestKey: true,
        },
      });
      expect(dependencies.approvalEvents.publish).toHaveBeenCalledOnce();
      expect(dependencies.approvalEvents.publish).toHaveBeenCalledWith({
        organizationId: ORGANIZATION_ID,
        initiatingUserId: USER_ID,
        conversationId: 'conversation-1',
        turnId: 'turn-1',
        invocationId: INVOCATION_ID,
      });

      const ambiguous = await call(handler, 'tools/call', {
        name: 'capability_invoke',
        arguments: {
          capabilityKey: AMBIGUOUS_CAPABILITY,
          requestKey: 'purchase-order-1',
          actingAgentKey: 'supply',
          input: { purchaseOrderId: '00000000-0000-4000-8000-000000000005' },
        },
      });
      expect(ambiguous.result.structuredContent).toMatchObject({
        kind: 'pending',
        invocation: {
          id: INVOCATION_ID,
          status: 'pending',
          retryWithSameRequestKey: true,
        },
      });

      const conflict = await call(handler, 'tools/call', {
        name: 'capability_invoke',
        arguments: {
          capabilityKey: CONFLICT_CAPABILITY,
          requestKey: 'purchase-order-1',
          actingAgentKey: 'supply',
          input: {},
        },
      });
      expect(conflict.result).toMatchObject({
        isError: true,
        structuredContent: {
          kind: 'error',
          error: { code: 'REQUEST_KEY_CONFLICT' },
        },
      });

      const invocation = await call(handler, 'tools/call', {
        name: 'invocation_status',
        arguments: { invocationId: INVOCATION_ID },
      });
      expect(invocation.result.structuredContent.invocation).toMatchObject({
        id: INVOCATION_ID,
        retryWithSameRequestKey: true,
      });

    } finally {
      await handler.close();
    }
  });

  it('never exposes owner-local mutation output through the MCP receipt', async () => {
    const { handler } = makeHandler();
    try {
      const mutation = await call(handler, 'tools/call', {
        name: 'capability_invoke',
        arguments: {
          capabilityKey: MUTATION_RESULT_CAPABILITY,
          requestKey: 'wing-thumbnail-1',
          actingAgentKey: 'merchandising',
          input: { generationId: '00000000-0000-4000-8000-000000000005' },
        },
      });

      expect(mutation.result.structuredContent).toMatchObject({
        kind: 'completed',
        invocation: { id: INVOCATION_ID, status: 'pending' },
        result: {
          summary: 'Thumbnail registration completed.',
          resourceRefs: [],
        },
      });
      expect(mutation.result.structuredContent.result).not.toHaveProperty('output');
    } finally {
      await handler.close();
    }
  });

  it('rejects legacy/unbound shapes and top-level invoke drift before a capability port is called', async () => {
    const { handler, dependencies } = makeHandler();
    try {
      const legacy = await rawCall(handler, {
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: {
          protocolVersion: '2025-11-25',
          capabilities: {},
          clientInfo: { name: 'legacy', version: '1' },
        },
      });
      expect(legacy.status).toBe(400);
      expect((await legacy.json()).error.code).toBe(-32020);

      const malformed = await call(handler, 'tools/call', {
        name: 'capability_invoke',
        arguments: {
          capabilityKey: READ_CAPABILITY,
          input: { period: 'month' },
          unexpected: true,
        },
      });
      expect(malformed.result.isError).toBe(true);
      expect(dependencies.invocations.invoke).not.toHaveBeenCalled();
    } finally {
      await handler.close();
    }
  });

  it('keeps definitive provider diagnostics out of the durable and MCP-visible failure path', async () => {
    const providerDiagnostic = 'provider echo: secretKey=secret-key';
    const input = { attempt: 'provider-create' };
    const canonicalInput = { attempt: 'provider-create' };
    const pending = {
      ...invocationRecord(),
      capabilityKey: PROVIDER_FAILURE_CAPABILITY,
      actingAgentKey: 'sourcing',
      requestKey: 'provider-failure-1',
      canonicalInput,
      inputHash: canonicalOwnerInputHash(canonicalInput),
      approvalInputHash: null,
      approvalRequestedAt: null,
      approvalExpiresAt: null,
    };
    const repository = {
      findById: vi.fn().mockResolvedValue(pending),
      admit: vi.fn().mockResolvedValue({ kind: 'created', invocation: pending }),
      recordSucceeded: vi.fn(),
      recordKnownFailure: vi.fn(async ({ error }: { error: unknown }) => ({
        ...pending,
        status: 'failed' as const,
        error,
        finishedAt: new Date('2026-08-25T04:00:00.000Z'),
      })),
    };
    const definition = {
      key: PROVIDER_FAILURE_CAPABILITY,
      ownerDomain: 'sourcing',
      ownerInputPort: PROVIDER_FAILURE_CAPABILITY,
      description: 'Provider failure regression.',
      inputSchema: z.object({ attempt: z.string() }).strict(),
      outputSchema: z.object({ candidateId: z.string().uuid() }).strict(),
      effects: ['db_write'] as const,
      approvalRisk: 'low' as const,
      idempotency: 'required' as const,
    };
    const owner = {
      capabilityKey: definition.key,
      invoke: vi.fn().mockRejectedValue(Object.assign(
        new OwnerKnownFailureError(OWNER_SAFE_FAILURE),
        { cause: new Error(providerDiagnostic) },
      )),
    };
    const invocations = new CapabilityInvocationService(
      repository as never,
      {
        resolveDefinition: (key: string) => key === definition.key ? definition : null,
        resolveImplementation: (key: string) => key === definition.key ? owner : null,
      } as never,
    );
    const handler = createRequestScopedCapabilityMcpHandler({
      invocations,
      capabilities: {
        listDefinitions: () => FINAL_CAPABILITY_DEFINITIONS.slice(),
        resolveDefinition: () => null,
      },
      readiness: {
        probe: () => ({
          protocolVersion: MCP_PROTOCOL_VERSION,
          sdkGeneration: 'v2' as const,
          protocolNegotiation: 'auto' as const,
          toolNames: CAPABILITY_MCP_TOOL_NAMES,
        }),
      },
      approvalEvents: { publish: vi.fn() },
    }, () => activeTurn());

    try {
      const response = await call(handler, 'tools/call', {
        name: 'capability_invoke',
        arguments: {
          capabilityKey: definition.key,
          requestKey: pending.requestKey,
          actingAgentKey: 'sourcing',
          input,
        },
      });

      expect(repository.recordKnownFailure).toHaveBeenCalledWith(expect.objectContaining({
        error: {
          code: 'OWNER_KNOWN_FAILURE',
          message: OWNER_SAFE_FAILURE,
        },
      }));
      expect(response.result).toMatchObject({
        isError: true,
        structuredContent: {
          kind: 'error',
          error: {
            code: 'OWNER_KNOWN_FAILURE',
            message: OWNER_SAFE_FAILURE,
          },
        },
      });
      expect(JSON.stringify({
        persistence: repository.recordKnownFailure.mock.calls,
        publicResult: response.result,
      })).not.toContain(providerDiagnostic);
    } finally {
      await handler.close();
    }
  });

  it('requires no MCP session: legacy initialize rejects, while fresh discover/list/call handlers negotiate independently', async () => {
    const createHandler = vi.fn(() => makeHandler().handler);
    const initializeHandler = createHandler();
    try {
      const initialize = await initializeHandler.fetch(new Request('http://127.0.0.1/internal/agent-runtime/mcp', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: 'initialize',
          params: {
            protocolVersion: '2025-11-25',
            capabilities: {},
            clientInfo: { name: 'legacy', version: '1' },
          },
        }),
      }));
      expect(initialize.status).toBe(400);
      expect(initialize.headers.get('mcp-session-id')).toBeNull();
    } finally {
      await initializeHandler.close();
    }

    const discoverHandler = createHandler();
    const listHandler = createHandler();
    const callHandler = createHandler();
    try {
      const discover = await call(discoverHandler, 'server/discover', {});
      const list = await call(listHandler, 'tools/list', {});
      const readiness = await call(callHandler, 'tools/call', {
        name: 'readiness_probe',
        arguments: {},
      });

      expect(discover.result.supportedVersions).toContain(MCP_PROTOCOL_VERSION);
      expect(discover.headers.get('mcp-session-id')).toBeNull();
      expect(list.result.tools.map((tool: { name: string }) => tool.name))
        .toEqual(CAPABILITY_MCP_TOOL_NAMES);
      expect(readiness.result.structuredContent).toMatchObject({
        protocolVersion: MCP_PROTOCOL_VERSION,
      });
      expect(createHandler).toHaveBeenCalledTimes(4);
    } finally {
      await discoverHandler.close();
      await listHandler.close();
      await callHandler.close();
    }
  });
});

function makeHandler(): {
  handler: ReturnType<typeof createRequestScopedCapabilityMcpHandler>;
  dependencies: CapabilityMcpDependencies & {
    invocations: { invoke: ReturnType<typeof vi.fn>; get: ReturnType<typeof vi.fn> };
    approvalEvents: { publish: ReturnType<typeof vi.fn> };
  };
} {
  const invocation = invocationRecord();
  const dependencies = {
    invocations: {
      invoke: vi.fn(async ({ capabilityKey }: { capabilityKey: string }) => {
        if (capabilityKey === CONFLICT_CAPABILITY) {
          throw new AgentOsError('REQUEST_KEY_CONFLICT', 'requestKey was already used with different input.');
        }
        if (capabilityKey === AMBIGUOUS_CAPABILITY) {
          throw Object.assign(
            new AgentOsError('OWNER_RESULT_AMBIGUOUS', 'Owner result is ambiguous.'),
            { invocationId: INVOCATION_ID },
          );
        }
        if (capabilityKey === MUTATION_CAPABILITY) {
          return {
            kind: 'input_required' as const,
            invocationId: INVOCATION_ID,
            status: 'pending' as const,
            approvalStatus: 'pending' as const,
            approvalExpiresAt: new Date('2026-08-26T00:00:00.000Z'),
          };
        }
        if (capabilityKey === MUTATION_RESULT_CAPABILITY) {
          return {
            kind: 'completed' as const,
            invocationId: INVOCATION_ID,
            status: 'succeeded' as const,
            result: {
              summary: 'Thumbnail registration completed.',
              resourceRefs: [],
              output: { screenshotPath: '/tmp/host-only/wing-capture.png' },
            },
          };
        }
        return {
          kind: 'completed' as const,
          result: {
            summary: 'Overview read.',
            resourceRefs: [],
            output: { period: 'month' },
          },
        };
      }),
      get: vi.fn(async () => ({ ...invocation, approvalStatus: 'pending' as const })),
    },
    capabilities: {
      listDefinitions: () => FINAL_CAPABILITY_DEFINITIONS.slice(),
      resolveDefinition: (key: string) => FINAL_CAPABILITY_DEFINITIONS.find((item) => item.key === key) ?? null,
    },
    approvalEvents: {
      publish: vi.fn(),
    },
    readiness: {
      probe: () => ({
        protocolVersion: MCP_PROTOCOL_VERSION,
        sdkGeneration: 'v2' as const,
        protocolNegotiation: 'auto' as const,
        toolNames: CAPABILITY_MCP_TOOL_NAMES,
      }),
    },
  } as unknown as CapabilityMcpDependencies & {
    invocations: { invoke: ReturnType<typeof vi.fn>; get: ReturnType<typeof vi.fn> };
    approvalEvents: { publish: ReturnType<typeof vi.fn> };
  };
  return {
    handler: createRequestScopedCapabilityMcpHandler(dependencies, () => activeTurn()),
    dependencies,
  };
}

async function call(
  handler: ReturnType<typeof createRequestScopedCapabilityMcpHandler>,
  method: string,
  params: Record<string, unknown>,
) {
  const response = await rawCall(handler, modernRequest(method, params));
  expect(response.status).toBe(200);
  return Object.assign(await response.json(), { headers: response.headers }) as any;
}

function rawCall(
  handler: ReturnType<typeof createRequestScopedCapabilityMcpHandler>,
  body: Record<string, unknown>,
) {
  return handler.fetch(new Request('http://127.0.0.1/internal/agent-runtime/mcp', {
    method: 'POST',
    headers: requestHeaders(body),
    body: JSON.stringify(body),
  }), { parsedBody: body });
}

function modernRequest(method: string, params: Record<string, unknown>) {
  return {
    jsonrpc: '2.0',
    id: 1,
    method,
    params: {
      ...params,
      _meta: {
        [PROTOCOL_VERSION_META_KEY]: MCP_PROTOCOL_VERSION,
        [CLIENT_CAPABILITIES_META_KEY]: { elicitation: { url: {} } },
      },
    },
  };
}

function requestHeaders(body: Record<string, unknown>) {
  const method = body.method as string;
  const headers: Record<string, string> = {
    'content-type': 'application/json',
    'mcp-protocol-version': MCP_PROTOCOL_VERSION,
    'mcp-method': method,
  };
  if (method === 'tools/call') {
    headers['mcp-name'] = (body.params as { name?: string }).name ?? '';
  }
  return headers;
}

function invocationRecord() {
  return {
    id: INVOCATION_ID,
    organizationId: ORGANIZATION_ID,
    initiatingUserId: USER_ID,
    capabilityKey: MUTATION_CAPABILITY,
    actingAgentKey: 'supply',
    requestKey: 'purchase-order-1',
    canonicalInput: { purchaseOrderId: '00000000-0000-4000-8000-000000000005' },
    inputHash: 'a'.repeat(64),
    status: 'pending' as const,
    approvalInputHash: 'a'.repeat(64),
    approvalRequestedAt: new Date('2026-08-25T00:00:00.000Z'),
    approvalExpiresAt: new Date('2026-08-26T00:00:00.000Z'),
    approvalDecision: null,
    approvalDecidedByUserId: null,
    approvalDecisionReason: null,
    approvalDecidedAt: null,
    result: null,
    error: null,
    createdAt: new Date('2026-08-25T00:00:00.000Z'),
    updatedAt: new Date('2026-08-25T00:00:00.000Z'),
    finishedAt: null,
  };
}

function activeTurn() {
  return {
    executionId: 'execution-1',
    installationId: 'installation-1',
    gatewayInstanceId: 'gateway-1',
    organizationId: ORGANIZATION_ID,
    initiatingUserId: USER_ID,
    conversationId: 'conversation-1',
    turnId: 'turn-1',
  };
}
