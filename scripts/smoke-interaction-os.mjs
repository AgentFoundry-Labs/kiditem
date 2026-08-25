#!/usr/bin/env node

import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

export const MCP_PROTOCOL_VERSION = '2026-07-28';
export const CAPABILITY_MCP_TOOL_NAMES = Object.freeze([
  'capability_catalog_search',
  'capability_invoke',
  'invocation_status',
  'operation_status',
  'readiness_probe',
]);

const productionValues = new Set(['production', 'office']);
const MCP_PROTOCOL_VERSION_META_KEY = 'io.modelcontextprotocol/protocolVersion';
const MCP_CLIENT_CAPABILITIES_META_KEY = 'io.modelcontextprotocol/clientCapabilities';

/**
 * Reads only caller-injected coordinates. The smoke never provisions a
 * browser credential, Gateway credential, or execution bearer itself.
 */
export function interactionSmokeConfigFromEnvironment(environment = process.env) {
  if ([environment.NODE_ENV, environment.KIDITEM_ENV, environment.DEPLOYMENT_ENV]
    .some((value) => productionValues.has(value ?? ''))) {
    throw new Error('interaction smoke refuses production-like environments');
  }

  const apiBaseUrl = baseUrl(
    environment.KIDITEM_INTERACTION_SMOKE_API_BASE_URL ?? 'http://127.0.0.1:4000',
    'api_base_url',
  );
  const mcpBaseUrl = baseUrl(
    environment.KIDITEM_INTERACTION_SMOKE_MCP_BASE_URL ?? apiBaseUrl,
    'mcp_base_url',
  );
  const runtime = environment.KIDITEM_INTERACTION_SMOKE_RUNTIME?.trim() || 'codex_cli';
  if (runtime !== 'codex_cli' && runtime !== 'claude_cli') {
    throw new Error('interaction_smoke_runtime_invalid');
  }

  return Object.freeze({
    apiBaseUrl,
    mcpBaseUrl,
    runtime,
    browserAuthorization: authorization(
      environment.KIDITEM_INTERACTION_SMOKE_BROWSER_AUTHORIZATION,
      'browser_authorization',
    ),
    executionAuthorization: authorization(
      environment.KIDITEM_INTERACTION_SMOKE_EXECUTION_BEARER,
      'execution_bearer',
    ),
  });
}

/**
 * Performs one bounded live check. The pending mutation stops at URL-mode
 * approval; this flow never sends a decision or starts another request.
 */
export async function runInteractionOsSmoke({
  environment = process.env,
  fetch: fetchImplementation = globalThis.fetch,
  randomId = randomUUID,
} = {}) {
  if (typeof fetchImplementation !== 'function') {
    throw new Error('interaction_smoke_fetch_unavailable');
  }
  if (typeof randomId !== 'function') {
    throw new Error('interaction_smoke_random_id_unavailable');
  }

  const config = interactionSmokeConfigFromEnvironment(environment);
  const browserHeaders = { authorization: config.browserAuthorization };

  const gatewayReadiness = await requestJson(fetchImplementation, apiUrl(config, '/api/agent-os/conversations'), {
    method: 'GET',
    headers: browserHeaders,
  }, 'gateway_readiness');
  if (!Array.isArray(gatewayReadiness)) {
    throw new Error('interaction_smoke_gateway_readiness_invalid');
  }

  const created = asRecord(await requestJson(fetchImplementation, apiUrl(config, '/api/agent-os/conversations'), {
    method: 'POST',
    headers: { ...browserHeaders, 'content-type': 'application/json' },
    body: JSON.stringify({ runtime: config.runtime, agentKey: null }),
  }, 'conversation_create'), 'conversation_create');
  const conversationId = requiredString(created.id, 'conversation_id');

  const history = await requestJson(fetchImplementation, apiUrl(
    config,
    `/api/agent-os/conversations/${encodeURIComponent(conversationId)}/history`,
  ), {
    method: 'GET',
    headers: browserHeaders,
  }, 'conversation_history');
  if (!Array.isArray(history)) {
    throw new Error('interaction_smoke_conversation_history_invalid');
  }

  const discovery = mcpResult(await mcpCall(fetchImplementation, config, 1, 'server/discover', {}), 'discovery');
  const supportedVersions = asRecord(discovery, 'discovery').supportedVersions;
  if (!Array.isArray(supportedVersions) || !supportedVersions.includes(MCP_PROTOCOL_VERSION)) {
    throw new Error('interaction_smoke_mcp_discovery_invalid');
  }

  const toolList = mcpResult(await mcpCall(fetchImplementation, config, 2, 'tools/list', {}), 'tools_list');
  const tools = asRecord(toolList, 'tools_list').tools;
  if (!Array.isArray(tools) || tools.map(toolName).join(',') !== CAPABILITY_MCP_TOOL_NAMES.join(',')) {
    throw new Error('interaction_smoke_mcp_tools_invalid');
  }

  const readiness = structuredContent(
    mcpResult(await mcpCall(fetchImplementation, config, 3, 'tools/call', {
      name: 'readiness_probe',
      arguments: {},
    }), 'mcp_readiness'),
    'mcp_readiness',
  );
  if (
    readiness.protocolVersion !== MCP_PROTOCOL_VERSION
    || readiness.sdkGeneration !== 'v2'
    || readiness.protocolNegotiation !== 'auto'
  ) {
    throw new Error('interaction_smoke_mcp_readiness_invalid');
  }

  const read = structuredContent(
    mcpResult(await mcpCall(fetchImplementation, config, 4, 'tools/call', {
      name: 'capability_invoke',
      arguments: {
        capabilityKey: 'analytics.readOverview',
        input: { period: 'today' },
      },
    }), 'read_invocation'),
    'read_invocation',
  );
  if (read.kind !== 'completed' || !asRecord(read.result, 'read_result')) {
    throw new Error('interaction_smoke_read_invocation_invalid');
  }

  const approvalRequestKey = smokeId(randomId);
  const approvalPurchaseOrderId = smokeId(randomId);
  const approval = asRecord(
    mcpResult(await mcpCall(fetchImplementation, config, 5, 'tools/call', {
      name: 'capability_invoke',
      arguments: {
        capabilityKey: 'supply.submit_purchase_order',
        requestKey: approvalRequestKey,
        actingAgentKey: 'supply',
        input: { purchaseOrderId: approvalPurchaseOrderId },
      },
    }), 'approval_pending'),
    'approval_pending',
  );
  const approvalRequest = asRecord(asRecord(approval.inputRequests, 'approval_requests').approval, 'approval_request');
  const approvalParams = asRecord(approvalRequest.params, 'approval_params');
  const approvalUrl = requiredString(approvalParams.url, 'approval_url');
  if (
    approval.resultType !== 'input_required'
    || approvalRequest.method !== 'elicitation/create'
    || approvalParams.mode !== 'url'
  ) {
    throw new Error('interaction_smoke_approval_pending_invalid');
  }

  return Object.freeze({
    conversationId,
    mcpProtocolVersion: MCP_PROTOCOL_VERSION,
    approval: Object.freeze({ status: 'pending', url: approvalUrl }),
  });
}

async function mcpCall(fetchImplementation, config, id, method, params) {
  const tool = method === 'tools/call' ? requiredString(params.name, 'mcp_tool_name') : null;
  const payload = {
    jsonrpc: '2.0',
    id,
    method,
    params: {
      ...params,
      _meta: {
        [MCP_PROTOCOL_VERSION_META_KEY]: MCP_PROTOCOL_VERSION,
        [MCP_CLIENT_CAPABILITIES_META_KEY]: { elicitation: { url: {} } },
      },
    },
  };
  return requestJson(fetchImplementation, apiUrl(config, '/internal/agent-runtime/mcp', true), {
    method: 'POST',
    headers: {
      authorization: config.executionAuthorization,
      'content-type': 'application/json',
      'mcp-protocol-version': MCP_PROTOCOL_VERSION,
      'mcp-method': method,
      ...(tool ? { 'mcp-name': tool } : {}),
    },
    body: JSON.stringify(payload),
  }, 'mcp_request');
}

async function requestJson(fetchImplementation, url, init, label) {
  let response;
  try {
    response = await fetchImplementation(url, init);
  } catch {
    throw new Error(`interaction_smoke_${label}_unreachable`);
  }
  if (!response || typeof response.ok !== 'boolean') {
    throw new Error(`interaction_smoke_${label}_response_invalid`);
  }

  let payload;
  try {
    payload = await response.json();
  } catch {
    throw new Error(`interaction_smoke_${label}_json_invalid`);
  }
  if (!response.ok) {
    throw new Error(`interaction_smoke_${label}_http_${safeStatus(response.status)}`);
  }
  return payload;
}

function mcpResult(payload, label) {
  const response = asRecord(payload, label);
  if ('error' in response) throw new Error(`interaction_smoke_${label}_error`);
  return asRecord(response.result, label);
}

function structuredContent(result, label) {
  return asRecord(result.structuredContent, `${label}_content`);
}

function apiUrl(config, pathname, mcp = false) {
  return new URL(pathname, mcp ? config.mcpBaseUrl : config.apiBaseUrl).toString();
}

function baseUrl(value, label) {
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`interaction_smoke_${label}_invalid`);
  }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash || url.pathname !== '/') {
    throw new Error(`interaction_smoke_${label}_invalid`);
  }
  return url.origin;
}

function authorization(value, label) {
  const credential = requiredString(value, label);
  return credential.startsWith('Bearer ') ? credential : `Bearer ${credential}`;
}

function requiredString(value, label) {
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error(`interaction_smoke_${label}_required`);
  }
  return value.trim();
}

function asRecord(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`interaction_smoke_${label}_invalid`);
  }
  return value;
}

function toolName(value) {
  return asRecord(value, 'mcp_tool').name;
}

function smokeId(randomId) {
  try {
    return requiredString(randomId(), 'random_id');
  } catch {
    throw new Error('interaction_smoke_random_id_invalid');
  }
}

function safeStatus(value) {
  return Number.isInteger(value) && value >= 100 && value <= 599 ? value : 'invalid';
}

const scriptPath = fileURLToPath(import.meta.url);
const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : null;
if (invokedPath === scriptPath) {
  void runInteractionOsSmoke().then(
    () => process.stdout.write('interaction Gateway smoke passed\n'),
    (error) => {
      process.stderr.write(`${error instanceof Error ? error.message : 'interaction_smoke_failed'}\n`);
      process.exitCode = 1;
    },
  );
}
