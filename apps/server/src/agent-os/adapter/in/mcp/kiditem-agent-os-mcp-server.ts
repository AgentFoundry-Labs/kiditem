import { Inject, Injectable } from '@nestjs/common';
import {
  createMcpHandler,
  McpServer,
  type McpHttpHandler,
} from '@modelcontextprotocol/server';
import {
  CapabilityInvocationApprovalStatusSchema,
  CapabilityResultReceiptSchema,
  type CapabilityResultEnvelope,
  type CapabilityResultReceipt,
} from '@kiditem/shared/agent-interaction';
import { MUTATION_EFFECTS } from '../../../../common/capability-definition';
import {
  CAPABILITY_INVOCATION_PORT,
  type CapabilityInvocationPort,
} from '../../../application/port/in/capability/capability-invocation.port';
import {
  CAPABILITY_APPROVAL_EVENT_PORT,
  type CapabilityApprovalEventPort,
} from '../../../application/port/out/event/capability-approval-event.port';
import { CapabilityInvocationRecordSchema } from '../../../application/port/out/capability-invocation.repository.port';
import { AgentCapabilityRegistry } from '../../../application/service/agent-capability-registry.service';
import { AgentOsError } from '../../../domain/agent-os.errors';
import {
  GatewayMcpActiveTurnInactiveError,
  type ResolvedGatewayMcpActiveTurn,
} from '../../out/runtime/gateway/gateway-mcp-runtime.registry';
import {
  CAPABILITY_MCP_TOOL_NAMES,
  CapabilityMcpWireInputSchemas,
  CapabilityMcpWireOutputSchemas,
  capabilityDefinitionToCatalogEntry,
  MCP_PROTOCOL_VERSION,
  type CapabilityCatalogEntry,
} from './capability-mcp-wire-contract';
import { McpRuntimeReadinessService } from './readiness-canary-mcp-server';

export interface CapabilityMcpDependencies {
  invocations: CapabilityInvocationPort;
  capabilities: Pick<AgentCapabilityRegistry, 'listDefinitions' | 'resolveDefinition'>;
  readiness: Pick<McpRuntimeReadinessService, 'probe'>;
  approvalEvents: Pick<CapabilityApprovalEventPort, 'publish'>;
}

export type ResolveGatewayMcpActiveTurn = () => ResolvedGatewayMcpActiveTurn;

/**
 * Creates one server for one HTTP request. Transport authentication happens at
 * ingress; each actual tool callback resolves the current active turn lazily.
 */
export function createKidItemAgentOsMcpServer(
  dependencies: CapabilityMcpDependencies,
  resolveActiveTurn: ResolveGatewayMcpActiveTurn,
): McpServer {
  const server = new McpServer(
    { name: 'kiditem-capability-mcp', version: '2.0.0' },
    { supportedProtocolVersions: [MCP_PROTOCOL_VERSION] },
  );

  server.registerTool('capability_catalog_search', {
    description: 'Search all currently discoverable KidItem capability contracts.',
    inputSchema: CapabilityMcpWireInputSchemas.capability_catalog_search,
    outputSchema: CapabilityMcpWireOutputSchemas.capability_catalog_search,
  }, async ({ query }) => {
    try {
      resolveActiveTurn();
      return structuredResult({ capabilities: searchCatalog(dependencies.capabilities.listDefinitions(), query) });
    } catch (error) {
      return structuredError(error, 'MCP_ACTIVE_TURN_INACTIVE');
    }
  });

  server.registerTool('capability_invoke', {
    description: 'Invoke one capability using its strict owner-domain input schema.',
    inputSchema: CapabilityMcpWireInputSchemas.capability_invoke,
    outputSchema: CapabilityMcpWireOutputSchemas.capability_invoke,
  }, async (input) => invokeCapability(
    dependencies,
    resolveActiveTurn,
    input,
  ));

  server.registerTool('invocation_status', {
    description: 'Read the durable receipt for one exact mutation admission.',
    inputSchema: CapabilityMcpWireInputSchemas.invocation_status,
    outputSchema: CapabilityMcpWireOutputSchemas.invocation_status,
  }, async ({ invocationId }) => {
    try {
      const active = resolveActiveTurn();
      const invocation = await getInvocation(dependencies.invocations, active.organizationId, invocationId);
      return structuredResult({ invocation: invocationStatus(invocation) });
    } catch (error) {
      return structuredError(error, 'INVOCATION_NOT_FOUND');
    }
  });

  server.registerTool('readiness_probe', {
    description: 'Verify the exact stateless MCP v2 capability runtime contract.',
    inputSchema: CapabilityMcpWireInputSchemas.readiness_probe,
    outputSchema: CapabilityMcpWireOutputSchemas.readiness_probe,
  }, async () => {
    try {
      resolveActiveTurn();
      return structuredResult(dependencies.readiness.probe());
    } catch (error) {
      return structuredError(error, 'MCP_RUNTIME_NOT_READY');
    }
  });

  return server;
}

/** Nest-facing factory with application ports only; no owner service or Prisma import belongs here. */
@Injectable()
export class KidItemAgentOsMcpServer {
  constructor(
    @Inject(CAPABILITY_INVOCATION_PORT)
    private readonly invocations: CapabilityInvocationPort,
    private readonly capabilities: AgentCapabilityRegistry,
    private readonly readiness: McpRuntimeReadinessService,
    @Inject(CAPABILITY_APPROVAL_EVENT_PORT)
    private readonly approvalEvents: CapabilityApprovalEventPort,
  ) {}

  createHandler(resolveActiveTurn: ResolveGatewayMcpActiveTurn): McpHttpHandler {
    const dependencies: CapabilityMcpDependencies = {
      invocations: this.invocations,
      capabilities: this.capabilities,
      readiness: this.readiness,
      approvalEvents: this.approvalEvents,
    };
    return createRequestScopedCapabilityMcpHandler(dependencies, resolveActiveTurn);
  }
}

/**
 * Modern requests get a newly constructed server and no retained transport
 * state. A 2025 request is rejected rather than silently receiving a fallback.
 */
export function createRequestScopedCapabilityMcpHandler(
  dependencies: CapabilityMcpDependencies,
  resolveActiveTurn: ResolveGatewayMcpActiveTurn,
): McpHttpHandler {
  return createMcpHandler((context) => {
    if (context.era !== 'modern') {
      throw new Error('capability_mcp_legacy_rejected');
    }
    return createKidItemAgentOsMcpServer(dependencies, resolveActiveTurn);
  }, { legacy: 'reject', responseMode: 'json' });
}

async function invokeCapability(
  dependencies: CapabilityMcpDependencies,
  resolveActiveTurn: ResolveGatewayMcpActiveTurn,
  input: {
    requestKey?: string;
    actingAgentKey?: string;
    capabilityKey: string;
    input: unknown;
  },
) {
  let active: ResolvedGatewayMcpActiveTurn | null = null;
  try {
    active = resolveActiveTurn();
    const outcome = await dependencies.invocations.invoke({
      organizationId: active.organizationId,
      initiatingUserId: active.initiatingUserId,
      executionId: active.executionId,
      capabilityKey: input.capabilityKey,
      ...(input.requestKey === undefined ? {} : { requestKey: input.requestKey }),
      ...(input.actingAgentKey === undefined ? {} : { actingAgentKey: input.actingAgentKey }),
      input: input.input,
    });
    if (outcome.kind === 'input_required') {
      dependencies.approvalEvents.publish({
        organizationId: active.organizationId,
        initiatingUserId: active.initiatingUserId,
        conversationId: active.conversationId,
        turnId: active.turnId,
        invocationId: outcome.invocationId,
      });
      return structuredResult({
        kind: 'pending' as const,
        invocation: invocationReceipt(await getInvocation(
          dependencies.invocations,
          active.organizationId,
          outcome.invocationId,
        )),
      });
    }

    const invocation = outcome.invocationId
      ? invocationReceipt(await getInvocation(
        dependencies.invocations,
        active.organizationId,
        outcome.invocationId,
      ))
      : null;
    return structuredResult({
      kind: 'completed' as const,
      invocation,
      result: outcome.invocationId
        ? ownerResultReceipt(outcome.result)
        : outcome.result,
    });
  } catch (error) {
    if (isOwnerResultAmbiguous(error) && active) {
      try {
        const invocation = await getInvocation(
          dependencies.invocations,
          active.organizationId,
          error.invocationId,
        );
        return structuredResult({
          kind: 'pending' as const,
          invocation: invocationReceipt(invocation),
        });
      } catch {
        return structuredError(error, 'OWNER_RESULT_AMBIGUOUS');
      }
    }
    return structuredError(error, 'CAPABILITY_RUNTIME_ERROR');
  }
}

function searchCatalog(
  definitions: ReturnType<AgentCapabilityRegistry['listDefinitions']>,
  query: string | undefined,
): CapabilityCatalogEntry[] {
  const normalized = query?.trim().toLowerCase();
  return definitions
    .filter((definition) => !normalized || [
      definition.key,
      definition.ownerDomain,
      definition.description,
    ].some((value) => value.toLowerCase().includes(normalized)))
    .map(capabilityDefinitionToCatalogEntry);
}

/** The persisted record plus the approval state the service derived when reading it. */
const CapabilityInvocationStatusViewSchema = CapabilityInvocationRecordSchema.extend({
  approvalStatus: CapabilityInvocationApprovalStatusSchema,
});

async function getInvocation(
  invocations: Pick<CapabilityInvocationPort, 'get'>,
  organizationId: string,
  invocationId: string,
) {
  const parsed = CapabilityInvocationStatusViewSchema.safeParse(await invocations.get({
    organizationId,
    invocationId,
  }));
  if (!parsed.success) {
    throw new AgentOsError('INVOCATION_STATUS_INVALID', 'Capability invocation status is invalid.');
  }
  return parsed.data;
}

function invocationReceipt(invocation: {
  id: string;
  status: 'pending' | 'succeeded' | 'failed';
  approvalStatus: 'not_required' | 'pending' | 'approved' | 'rejected' | 'expired';
}) {
  return {
    id: invocation.id,
    status: invocation.status,
    approvalStatus: invocation.approvalStatus,
    retryWithSameRequestKey: invocation.status === 'pending',
  };
}

function invocationStatus(invocation: {
  id: string;
  status: 'pending' | 'succeeded' | 'failed';
  approvalStatus: 'not_required' | 'pending' | 'approved' | 'rejected' | 'expired';
  result: CapabilityResultReceipt | null;
  error: { code: string; message: string } | null;
  approvalExpiresAt: Date | null;
}) {
  return {
    ...invocationReceipt(invocation),
    result: invocation.result,
    error: invocation.error,
    approvalExpiresAt: invocation.approvalExpiresAt?.toISOString() ?? null,
  };
}

/** Mutation execution details stay owner-side; MCP receives its stable receipt. */
function ownerResultReceipt(result: CapabilityResultEnvelope): CapabilityResultReceipt {
  return CapabilityResultReceiptSchema.parse({
    summary: result.summary,
    resourceRefs: result.resourceRefs,
  });
}

function structuredResult<T>(structuredContent: T) {
  return {
    content: [{ type: 'text' as const, text: JSON.stringify(structuredContent) }],
    structuredContent,
  };
}

function structuredError(error: unknown, fallbackCode: string) {
  const structuredContent = {
    kind: 'error' as const,
    error: stableError(error, fallbackCode),
  };
  return {
    ...structuredResult(structuredContent),
    isError: true,
  };
}

function stableError(error: unknown, fallbackCode: string): { code: string; message: string } {
  if (error instanceof GatewayMcpActiveTurnInactiveError) {
    return {
      code: error.code,
      message: 'No active turn is available for this conversation.',
    };
  }
  if (error instanceof AgentOsError) {
    return {
      code: boundedCode(error.code, 'CAPABILITY_RUNTIME_ERROR'),
      message: boundedMessage(error.message, error.code),
    };
  }
  return {
    code: fallbackCode,
    message: fallbackCode === 'INVOCATION_NOT_FOUND'
        ? 'Capability invocation was not found.'
        : 'Capability runtime request could not be completed.',
  };
}

function isOwnerResultAmbiguous(
  error: unknown,
): error is AgentOsError & { invocationId: string } {
  return error instanceof AgentOsError
    && error.code === 'OWNER_RESULT_AMBIGUOUS'
    && typeof (error as { invocationId?: unknown }).invocationId === 'string';
}

function boundedMessage(message: string, fallback: string): string {
  const normalized = message.trim();
  return normalized ? normalized.slice(0, 1_000) : fallback;
}

function boundedCode(code: string, fallback: string): string {
  const normalized = code.trim();
  return normalized ? normalized.slice(0, 128) : fallback;
}

export function capabilityIsMutation(effects: readonly string[]): boolean {
  return effects.some((effect) => MUTATION_EFFECTS.has(effect as never));
}

/** Kept exportable for canary tests to lock the exact public tool list. */
export const KIDITEM_CAPABILITY_MCP_TOOL_NAMES = CAPABILITY_MCP_TOOL_NAMES;
