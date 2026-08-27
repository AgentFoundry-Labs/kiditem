import assert from 'node:assert/strict';
import test from 'node:test';

const smokeModuleUrl = new URL('../smoke-interaction-os.mjs', import.meta.url);

function fixtureResponse(response) {
  return new Response(response.text ?? (response.body === undefined ? null : JSON.stringify(response.body)), {
    status: response.status ?? 200,
    headers: { 'content-type': response.contentType ?? 'application/json' },
  });
}

test('connects the exact fresh Conversation SQLite namespace over the authenticated CopilotKit SSE seam without caller-owned MCP authority', async () => {
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
    { contentType: 'text/event-stream', text: '' },
    { status: 204 },
  ];

  const result = await smoke.runInteractionOsSmoke({
    environment: {
      NODE_ENV: 'test',
      KIDITEM_INTERACTION_SMOKE_API_BASE_URL: 'http://web.test',
      KIDITEM_INTERACTION_SMOKE_BROWSER_AUTHORIZATION: 'Bearer browser-smoke-token',
    },
    randomId: () => 'conversation-id',
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
      return fixtureResponse(response);
    },
  });

  assert.deepEqual(result, {
    conversationId,
  });
  assert.equal(responses.length, 0);
  assert.ok(conversationId.length <= 200);
  assert.ok(title.length <= 200);
  assert.deepEqual(
    requests.map((request) => ({
      method: request.method,
      path: new URL(request.url).pathname,
    })),
    [
      { method: 'GET', path: '/api/agent-os/conversations' },
      { method: 'POST', path: '/api/agent-os/conversations' },
      { method: 'POST', path: '/api/agent-os/conversations' },
      { method: 'POST', path: '/api/agent-os/conversations' },
      { method: 'GET', path: '/api/agent-os/conversation-preferences' },
      { method: 'PUT', path: '/api/agent-os/conversation-preferences' },
      { method: 'GET', path: '/api/agent-os/conversation-preferences' },
      { method: 'POST', path: '/api/copilotkit' },
      { method: 'DELETE', path: `/api/agent-os/conversations/${conversationId}` },
    ],
  );

  for (const request of requests) {
    assert.equal(request.headers.authorization, 'Bearer browser-smoke-token');
    assert.equal(new URL(request.url).pathname.startsWith('/internal/'), false);
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
  assert.deepEqual(requests[7].body, {
    method: 'agent/connect',
    params: { agentId: 'conversation' },
    body: {
      threadId: conversationId,
      runId: `${conversationId}-connect`,
      state: {},
      messages: [],
      tools: [],
      context: [],
      forwardedProps: { model: 'gpt-5.6', reasoningEffort: 'low' },
    },
  });
});

test('rejects an empty-array pseudo-history even when it is labelled as CopilotKit SSE and still deletes only its disposable Conversation', async () => {
  const smoke = await import(`${smokeModuleUrl.href}?smoke-empty-history=${Date.now()}`);
  const conversationId = 'interaction-os-smoke-conversation-id';
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
    { contentType: 'text/event-stream', text: '[]' },
    { status: 204 },
  ];

  await assert.rejects(
    smoke.runInteractionOsSmoke({
      environment: {
        NODE_ENV: 'test',
        KIDITEM_INTERACTION_SMOKE_API_BASE_URL: 'http://web.test',
        KIDITEM_INTERACTION_SMOKE_BROWSER_AUTHORIZATION: 'Bearer browser-smoke-token',
      },
      randomId: () => 'conversation-id',
      fetch: async (url, init = {}) => {
        requests.push({
          url: String(url),
          method: init.method ?? 'GET',
          headers: Object.fromEntries(new Headers(init.headers).entries()),
          body: init.body ? JSON.parse(String(init.body)) : undefined,
        });
        const response = responses.shift();
        assert.notEqual(response, undefined, 'the smoke must not add another request beyond its exact disposable cleanup');
        return fixtureResponse(response);
      },
    }),
    /interaction_smoke_conversation_history_reconnect_not_empty/,
  );

  assert.equal(responses.length, 0);
  assert.deepEqual(
    requests.map((request) => ({ method: request.method, path: new URL(request.url).pathname })),
    [
      { method: 'GET', path: '/api/agent-os/conversations' },
      { method: 'POST', path: '/api/agent-os/conversations' },
      { method: 'POST', path: '/api/agent-os/conversations' },
      { method: 'POST', path: '/api/agent-os/conversations' },
      { method: 'GET', path: '/api/agent-os/conversation-preferences' },
      { method: 'PUT', path: '/api/agent-os/conversation-preferences' },
      { method: 'GET', path: '/api/agent-os/conversation-preferences' },
      { method: 'POST', path: '/api/copilotkit' },
      { method: 'DELETE', path: `/api/agent-os/conversations/${conversationId}` },
    ],
  );
  assert.equal(requests[7].headers.authorization, 'Bearer browser-smoke-token');
  assert.equal(new URL(requests[7].url).pathname.startsWith('/internal/'), false);
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
        KIDITEM_INTERACTION_SMOKE_BROWSER_AUTHORIZATION: 'Bearer browser-smoke-token',
      },
      randomId: () => 'conversation-id',
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
