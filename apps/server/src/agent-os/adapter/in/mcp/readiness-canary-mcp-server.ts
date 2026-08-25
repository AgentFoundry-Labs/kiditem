import { Injectable } from '@nestjs/common';
import {
  CLIENT_CAPABILITIES_META_KEY,
  PROTOCOL_VERSION_META_KEY,
  type McpHttpHandler,
} from '@modelcontextprotocol/server';
import {
  CAPABILITY_MCP_TOOL_NAMES,
  MCP_PROTOCOL_VERSION,
} from './capability-mcp-wire-contract';

export interface McpRuntimeReadiness {
  protocolVersion: typeof MCP_PROTOCOL_VERSION;
  sdkGeneration: 'v2';
  protocolNegotiation: 'auto';
  toolNames: typeof CAPABILITY_MCP_TOOL_NAMES;
}

/**
 * Runtime-owned readiness state. It intentionally has no database, transport
 * session, or provider dependency: only the exact supported v2 contract is
 * considered ready.
 */
@Injectable()
export class McpRuntimeReadinessService {
  constructor(private readonly environment: NodeJS.ProcessEnv = process.env) {}

  probe(): McpRuntimeReadiness {
    const sdkGeneration = this.environment.MCP_SDK_GENERATION;
    const protocolNegotiation = this.environment.MCP_PROTOCOL_NEGOTIATION;
    if (sdkGeneration !== 'v2' || protocolNegotiation !== 'auto') {
      throw new McpRuntimeReadinessError();
    }
    return {
      protocolVersion: MCP_PROTOCOL_VERSION,
      sdkGeneration: 'v2',
      protocolNegotiation: 'auto',
      toolNames: CAPABILITY_MCP_TOOL_NAMES,
    };
  }
}

export class McpRuntimeReadinessError extends Error {
  readonly code = 'MCP_RUNTIME_NOT_READY';

  constructor() {
    super('MCP runtime requires MCP_SDK_GENERATION=v2 and MCP_PROTOCOL_NEGOTIATION=auto.');
    this.name = 'McpRuntimeReadinessError';
  }
}

/**
 * A canary has no separate MCP endpoint or authority. Callers use this probe
 * alongside independent initialize/tools/list/tools/call requests.
 */
export function assertMcpReadinessCanary(
  readiness: Pick<McpRuntimeReadinessService, 'probe'>,
): McpRuntimeReadiness {
  const probe = readiness.probe();
  if (
    probe.protocolVersion !== MCP_PROTOCOL_VERSION
    || probe.sdkGeneration !== 'v2'
    || probe.protocolNegotiation !== 'auto'
    || probe.toolNames.join(',') !== CAPABILITY_MCP_TOOL_NAMES.join(',')
  ) {
    throw new McpRuntimeReadinessError();
  }
  return probe;
}

export interface McpReadinessCanaryInput {
  /** Must construct a fresh `createMcpHandler(..., { legacy: 'reject' })` handler per call. */
  createHandler: () => McpHttpHandler;
  /** A non-mutating test composition supplies an approval-pending capability call. */
  inputRequiredCall: { name: string; arguments: Record<string, unknown> };
}

/**
 * Exercises the actual MCP v2 wire rather than inspecting server source.
 * Protocol 2026-07-28 replaces successful `initialize` with `server/discover`;
 * this canary deliberately proves a legacy initialize cannot silently fall
 * back, then performs self-contained modern discovery/list/call exchanges.
 */
export async function runMcpReadinessCanary(input: McpReadinessCanaryInput): Promise<void> {
  const legacyInitialize = await send(input.createHandler, {
    jsonrpc: '2.0',
    id: 1,
    method: 'initialize',
    params: {
      protocolVersion: '2025-11-25',
      capabilities: {},
      clientInfo: { name: 'legacy-canary', version: '1' },
    },
  }, false);
  if (legacyInitialize.status !== 400) throw new McpRuntimeReadinessError();

  const discover = await modernCall(input.createHandler, 'server/discover', {});
  const supportedVersions = asRecord(discover.result).supportedVersions;
  if (!Array.isArray(supportedVersions) || !supportedVersions.includes(MCP_PROTOCOL_VERSION)) {
    throw new McpRuntimeReadinessError();
  }

  const tools = await modernCall(input.createHandler, 'tools/list', {});
  const names = asRecord(tools.result).tools;
  if (!Array.isArray(names) || names.map(toolName).join(',') !== CAPABILITY_MCP_TOOL_NAMES.join(',')) {
    throw new McpRuntimeReadinessError();
  }

  const readiness = await modernCall(input.createHandler, 'tools/call', {
    name: 'readiness_probe',
    arguments: {},
  });
  const readinessContent = asRecord(asRecord(readiness.result).structuredContent);
  if (
    readinessContent.protocolVersion !== MCP_PROTOCOL_VERSION
    || readinessContent.sdkGeneration !== 'v2'
    || readinessContent.protocolNegotiation !== 'auto'
  ) {
    throw new McpRuntimeReadinessError();
  }

  const inputRequired = await modernCall(input.createHandler, 'tools/call', input.inputRequiredCall);
  const pending = asRecord(inputRequired.result);
  if (pending.resultType !== 'input_required' || !isInputRequiredApproval(pending.inputRequests)) {
    throw new McpRuntimeReadinessError();
  }
}

async function modernCall(
  createHandler: () => McpHttpHandler,
  method: string,
  params: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const response = await send(createHandler, {
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
  }, true);
  if (response.status !== 200) throw new McpRuntimeReadinessError();
  const payload = asRecord(await response.json());
  if ('error' in payload) throw new McpRuntimeReadinessError();
  return payload;
}

async function send(
  createHandler: () => McpHttpHandler,
  body: Record<string, unknown>,
  modern: boolean,
): Promise<Response> {
  const handler = createHandler();
  try {
    const method = String(body.method);
    const headers: Record<string, string> = { 'content-type': 'application/json' };
    if (modern) {
      headers['mcp-protocol-version'] = MCP_PROTOCOL_VERSION;
      headers['mcp-method'] = method;
      if (method === 'tools/call') {
        headers['mcp-name'] = String((body.params as { name?: unknown }).name ?? '');
      }
    }
    return await handler.fetch(new Request('http://127.0.0.1/internal/agent-runtime/mcp', {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    }), { parsedBody: body });
  } finally {
    await handler.close();
  }
}

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new McpRuntimeReadinessError();
  }
  return value as Record<string, unknown>;
}

function toolName(value: unknown): string {
  return asRecord(value).name as string;
}

function isInputRequiredApproval(value: unknown): boolean {
  const requests = asRecord(value);
  const approval = asRecord(requests.approval);
  const params = asRecord(approval.params);
  return approval.method === 'elicitation/create'
    && params.mode === 'url'
    && typeof params.url === 'string';
}
