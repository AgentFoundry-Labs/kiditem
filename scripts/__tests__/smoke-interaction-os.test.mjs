import assert from 'node:assert/strict';
import test from 'node:test';

const smokeModuleUrl = new URL('../smoke-interaction-os.mjs', import.meta.url);

test('runs one provider-native Gateway and stateless MCP smoke sequence without deciding the pending mutation', async () => {
  const priorEnvironment = process.env.KIDITEM_ENV;
  process.env.KIDITEM_ENV = 'office';
  let smoke;
  try {
    smoke = await import(`${smokeModuleUrl.href}?smoke-test=${Date.now()}`);
  } finally {
    if (priorEnvironment === undefined) delete process.env.KIDITEM_ENV;
    else process.env.KIDITEM_ENV = priorEnvironment;
  }

  const requests = [];
  const responses = [
    [],
    { id: 'conversation-smoke-id' },
    [],
    { jsonrpc: '2.0', id: 1, result: { supportedVersions: ['2026-07-28'] } },
    {
      jsonrpc: '2.0',
      id: 2,
      result: {
        tools: [
          { name: 'capability_catalog_search' },
          { name: 'capability_invoke' },
          { name: 'invocation_status' },
          { name: 'operation_status' },
          { name: 'readiness_probe' },
        ],
      },
    },
    {
      jsonrpc: '2.0',
      id: 3,
      result: {
        structuredContent: {
          protocolVersion: '2026-07-28',
          sdkGeneration: 'v2',
          protocolNegotiation: 'auto',
        },
      },
    },
    {
      jsonrpc: '2.0',
      id: 4,
      result: {
        structuredContent: {
          kind: 'completed',
          invocation: null,
          result: { summary: 'read complete', resourceRefs: [], operationRefs: [] },
        },
      },
    },
    {
      jsonrpc: '2.0',
      id: 5,
      result: {
        resultType: 'input_required',
        inputRequests: {
          approval: {
            method: 'elicitation/create',
            params: { mode: 'url', url: 'http://web.test/agent-os?invocationId=invocation-smoke-id' },
          },
        },
      },
    },
  ];

  const result = await smoke.runInteractionOsSmoke({
    environment: {
      NODE_ENV: 'test',
      KIDITEM_INTERACTION_SMOKE_API_BASE_URL: 'http://web.test',
      KIDITEM_INTERACTION_SMOKE_MCP_BASE_URL: 'http://api.test:4000',
      KIDITEM_INTERACTION_SMOKE_BROWSER_AUTHORIZATION: 'Bearer browser-smoke-token',
      KIDITEM_INTERACTION_SMOKE_EXECUTION_BEARER: 'execution-smoke-token',
    },
    randomId: (() => {
      const values = ['approval-request-smoke-id', 'approval-purchase-order-smoke-id'];
      return () => values.shift() ?? 'unexpected-id';
    })(),
    fetch: async (url, init = {}) => {
      const request = {
        url: String(url),
        method: init.method ?? 'GET',
        headers: Object.fromEntries(new Headers(init.headers).entries()),
        body: init.body ? JSON.parse(String(init.body)) : undefined,
      };
      requests.push(request);
      const body = responses.shift();
      assert.notEqual(body, undefined, 'the smoke must not add another request after approval becomes pending');
      return new Response(JSON.stringify(body), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    },
  });

  assert.deepEqual(result, {
    conversationId: 'conversation-smoke-id',
    mcpProtocolVersion: '2026-07-28',
    approval: { status: 'pending', url: 'http://web.test/agent-os?invocationId=invocation-smoke-id' },
  });
  assert.equal(responses.length, 0);
  assert.deepEqual(
    requests.map((request) => ({
      method: request.method,
      path: new URL(request.url).pathname,
      mcpMethod: request.headers['mcp-method'] ?? null,
      mcpName: request.headers['mcp-name'] ?? null,
    })),
    [
      { method: 'GET', path: '/api/agent-os/conversations', mcpMethod: null, mcpName: null },
      { method: 'POST', path: '/api/agent-os/conversations', mcpMethod: null, mcpName: null },
      { method: 'GET', path: '/api/agent-os/conversations/conversation-smoke-id/history', mcpMethod: null, mcpName: null },
      { method: 'POST', path: '/internal/agent-runtime/mcp', mcpMethod: 'server/discover', mcpName: null },
      { method: 'POST', path: '/internal/agent-runtime/mcp', mcpMethod: 'tools/list', mcpName: null },
      { method: 'POST', path: '/internal/agent-runtime/mcp', mcpMethod: 'tools/call', mcpName: 'readiness_probe' },
      { method: 'POST', path: '/internal/agent-runtime/mcp', mcpMethod: 'tools/call', mcpName: 'capability_invoke' },
      { method: 'POST', path: '/internal/agent-runtime/mcp', mcpMethod: 'tools/call', mcpName: 'capability_invoke' },
    ],
  );

  for (const request of requests.slice(0, 3)) {
    assert.equal(request.headers.authorization, 'Bearer browser-smoke-token');
  }
  for (const request of requests.slice(3)) {
    assert.equal(request.headers.authorization, 'Bearer execution-smoke-token');
    assert.equal(request.headers['mcp-protocol-version'], '2026-07-28');
  }

  assert.deepEqual(requests[5].body.params.arguments, {});
  assert.deepEqual(requests[6].body.params.arguments, {
    capabilityKey: 'analytics.readOverview',
    input: { period: 'today' },
  });
  assert.deepEqual(requests[7].body.params.arguments, {
    capabilityKey: 'supply.submit_purchase_order',
    requestKey: 'approval-request-smoke-id',
    actingAgentKey: 'supply',
    input: { purchaseOrderId: 'approval-purchase-order-smoke-id' },
  });
});
