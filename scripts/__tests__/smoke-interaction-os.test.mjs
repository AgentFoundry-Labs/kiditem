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

  const conversationId = 'interaction-os-smoke-conversation-id';
  const title = 'Interaction OS smoke';
  const preference = {
    schemaVersion: 1,
    contexts: {
      general: {
        codex_cli: { model: 'gpt-5.6', reasoningEffort: 'low' },
      },
    },
  };
  const requests = [];
  const responses = [
    { body: [] },
    { status: 201, body: { id: conversationId } },
    { status: 201, body: { id: conversationId } },
    { status: 409, body: { statusCode: 409, message: 'Conflict' } },
    { body: preference },
    { body: preference },
    { body: preference },
    { body: [] },
    { body: { jsonrpc: '2.0', id: 1, result: { supportedVersions: ['2026-07-28'] } } },
    {
      body: {
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
    },
    {
      body: {
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
    },
    {
      body: {
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
    },
    {
      body: {
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
    },
    { status: 204 },
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
      const values = [
        'conversation-id',
        'approval-request-smoke-id',
        'approval-purchase-order-smoke-id',
      ];
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
      const response = responses.shift();
      assert.notEqual(response, undefined, 'the smoke must not add another request beyond its exact disposable cleanup');
      return new Response(response.body === undefined ? null : JSON.stringify(response.body), {
        status: response.status ?? 200,
        headers: { 'content-type': 'application/json' },
      });
    },
  });

  assert.deepEqual(result, {
    conversationId,
    mcpProtocolVersion: '2026-07-28',
    approval: { status: 'pending', url: 'http://web.test/agent-os?invocationId=invocation-smoke-id' },
  });
  assert.equal(responses.length, 0);
  assert.ok(conversationId.length <= 200);
  assert.ok(title.length <= 200);
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
      { method: 'POST', path: '/api/agent-os/conversations', mcpMethod: null, mcpName: null },
      { method: 'POST', path: '/api/agent-os/conversations', mcpMethod: null, mcpName: null },
      { method: 'GET', path: '/api/agent-os/conversation-preferences', mcpMethod: null, mcpName: null },
      { method: 'PUT', path: '/api/agent-os/conversation-preferences', mcpMethod: null, mcpName: null },
      { method: 'GET', path: '/api/agent-os/conversation-preferences', mcpMethod: null, mcpName: null },
      { method: 'GET', path: `/api/agent-os/conversations/${conversationId}/history`, mcpMethod: null, mcpName: null },
      { method: 'POST', path: '/internal/agent-runtime/mcp', mcpMethod: 'server/discover', mcpName: null },
      { method: 'POST', path: '/internal/agent-runtime/mcp', mcpMethod: 'tools/list', mcpName: null },
      { method: 'POST', path: '/internal/agent-runtime/mcp', mcpMethod: 'tools/call', mcpName: 'readiness_probe' },
      { method: 'POST', path: '/internal/agent-runtime/mcp', mcpMethod: 'tools/call', mcpName: 'capability_invoke' },
      { method: 'POST', path: '/internal/agent-runtime/mcp', mcpMethod: 'tools/call', mcpName: 'capability_invoke' },
      { method: 'DELETE', path: `/api/agent-os/conversations/${conversationId}`, mcpMethod: null, mcpName: null },
    ],
  );

  for (const request of [...requests.slice(0, 8), requests.at(-1)]) {
    assert.equal(request.headers.authorization, 'Bearer browser-smoke-token');
  }
  for (const request of requests.slice(8, -1)) {
    assert.equal(request.headers.authorization, 'Bearer execution-smoke-token');
    assert.equal(request.headers['mcp-protocol-version'], '2026-07-28');
  }

  const create = { conversationId, runtime: 'codex_cli', agentKey: null, title };
  assert.deepEqual(requests[1].body, create);
  assert.deepEqual(requests[2].body, create);
  assert.deepEqual(requests[3].body, { ...create, title: `${title} drift` });
  assert.deepEqual(requests[5].body, {
    context: 'general',
    runtime: 'codex_cli',
    model: 'gpt-5.6',
    reasoningEffort: 'low',
  });
  assert.deepEqual(requests[10].body.params.arguments, {});
  assert.deepEqual(requests[11].body.params.arguments, {
    capabilityKey: 'analytics.readOverview',
    input: { period: 'today' },
  });
  assert.deepEqual(requests[12].body.params.arguments, {
    capabilityKey: 'supply.submit_purchase_order',
    requestKey: 'approval-request-smoke-id',
    actingAgentKey: 'supply',
    input: { purchaseOrderId: 'approval-purchase-order-smoke-id' },
  });
});

test('rejects a replay create response that diverges from its disposable reservation and deletes only that reservation', async () => {
  const smoke = await import(`${smokeModuleUrl.href}?smoke-replay-id=${Date.now()}`);
  const conversationId = 'interaction-os-smoke-conversation-id';
  const requests = [];
  const responses = [
    { body: [] },
    { status: 201, body: { id: conversationId } },
    { status: 201, body: { id: 'different-conversation-id' } },
    { status: 204 },
  ];

  await assert.rejects(
    smoke.runInteractionOsSmoke({
      environment: {
        NODE_ENV: 'test',
        KIDITEM_INTERACTION_SMOKE_API_BASE_URL: 'http://web.test',
        KIDITEM_INTERACTION_SMOKE_MCP_BASE_URL: 'http://api.test:4000',
        KIDITEM_INTERACTION_SMOKE_BROWSER_AUTHORIZATION: 'Bearer browser-smoke-token',
        KIDITEM_INTERACTION_SMOKE_EXECUTION_BEARER: 'execution-smoke-token',
      },
      randomId: (() => {
        const values = ['conversation-id', 'approval-request-smoke-id', 'approval-purchase-order-smoke-id'];
        return () => values.shift() ?? 'unexpected-id';
      })(),
      fetch: async (url, init = {}) => {
        requests.push({
          url: String(url),
          method: init.method ?? 'GET',
          body: init.body ? JSON.parse(String(init.body)) : undefined,
        });
        const response = responses.shift();
        assert.notEqual(response, undefined, 'the smoke must not call provider history after an invalid replay response');
        return new Response(response.body === undefined ? null : JSON.stringify(response.body), {
          status: response.status ?? 200,
          headers: { 'content-type': 'application/json' },
        });
      },
    }),
    /interaction_smoke_conversation_create_replay_id_invalid/,
  );

  assert.equal(responses.length, 0);
  assert.deepEqual(
    requests.map((request) => ({ method: request.method, path: new URL(request.url).pathname })),
    [
      { method: 'GET', path: '/api/agent-os/conversations' },
      { method: 'POST', path: '/api/agent-os/conversations' },
      { method: 'POST', path: '/api/agent-os/conversations' },
      { method: 'DELETE', path: `/api/agent-os/conversations/${conversationId}` },
    ],
  );
});
