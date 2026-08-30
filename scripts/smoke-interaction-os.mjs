#!/usr/bin/env node

import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const productionValues = new Set(['production', 'office']);
const SMOKE_CONVERSATION_ID_PREFIX = 'interaction-os-smoke-';
const SMOKE_CONVERSATION_ID_MAX_LENGTH = 200;
const SMOKE_CONVERSATION_TITLE = 'Interaction OS smoke';
const SMOKE_CONVERSATION_DRIFT_TITLE = `${SMOKE_CONVERSATION_TITLE} drift`;

/**
 * Reads only the caller-injected browser boundary. MCP transport identity is
 * process-owned by the Gateway and is intentionally not a smoke input.
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
  const runtime = environment.KIDITEM_INTERACTION_SMOKE_RUNTIME?.trim() || 'codex_cli';
  if (runtime !== 'codex_cli' && runtime !== 'claude_cli') {
    throw new Error('interaction_smoke_runtime_invalid');
  }

  return Object.freeze({
    apiBaseUrl,
    runtime,
    browserAuthorization: authorization(
      environment.KIDITEM_INTERACTION_SMOKE_BROWSER_AUTHORIZATION,
      'browser_authorization',
    ),
  });
}

/**
 * Performs one bounded authenticated facade check and deletes only its
 * disposable provider conversation. MCP admission is exercised through the
 * real Gateway/provider turn in browser QA and the loopback integration gate;
 * this caller never impersonates the Gateway process.
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
  const conversation = disposableConversation(randomId, config.runtime);
  let deleteDisposableConversation = false;

  const gatewayReadiness = await requestJson(fetchImplementation, apiUrl(config, '/api/agent-os/conversations'), {
    method: 'GET',
    headers: browserHeaders,
  }, 'gateway_readiness');
  if (!Array.isArray(gatewayReadiness)) {
    throw new Error('interaction_smoke_gateway_readiness_invalid');
  }

  try {
    const createdPayload = await requestJson(fetchImplementation, apiUrl(config, '/api/agent-os/conversations'), {
      method: 'POST',
      headers: { ...browserHeaders, 'content-type': 'application/json' },
      body: JSON.stringify(conversation.create),
    }, 'conversation_create');
    deleteDisposableConversation = true;
    assertConversationId(createdPayload, conversation.id, 'conversation_create');

    const replay = await requestJson(fetchImplementation, apiUrl(config, '/api/agent-os/conversations'), {
      method: 'POST',
      headers: { ...browserHeaders, 'content-type': 'application/json' },
      body: JSON.stringify(conversation.create),
    }, 'conversation_create_replay');
    assertConversationId(replay, conversation.id, 'conversation_create_replay');

    await requestExactStatus(fetchImplementation, apiUrl(config, '/api/agent-os/conversations'), {
      method: 'POST',
      headers: { ...browserHeaders, 'content-type': 'application/json' },
      body: JSON.stringify({ ...conversation.create, title: SMOKE_CONVERSATION_DRIFT_TITLE }),
    }, 409, 'conversation_create_drift');

    const preferences = await requestJson(fetchImplementation, apiUrl(config, '/api/agent-os/conversation-preferences'), {
      method: 'GET',
      headers: browserHeaders,
    }, 'conversation_preferences_read');
    const preference = currentPreference(preferences, config.runtime, 'conversation_preferences_read');

    const updatedPreferences = await requestJson(fetchImplementation, apiUrl(config, '/api/agent-os/conversation-preferences'), {
      method: 'PUT',
      headers: { ...browserHeaders, 'content-type': 'application/json' },
      body: JSON.stringify(preference),
    }, 'conversation_preferences_set');
    assertCurrentPreference(updatedPreferences, preference, 'conversation_preferences_set');

    const reloadedPreferences = await requestJson(fetchImplementation, apiUrl(config, '/api/agent-os/conversation-preferences'), {
      method: 'GET',
      headers: browserHeaders,
    }, 'conversation_preferences_reread');
    assertCurrentPreference(reloadedPreferences, preference, 'conversation_preferences_reread');

    const history = await requestCopilotkitSse(fetchImplementation, apiUrl(config, '/api/copilotkit'), {
      method: 'POST',
      headers: { ...browserHeaders, 'content-type': 'application/json' },
      body: JSON.stringify(copilotkitConnectRequest(conversation.id, preference)),
    }, 'conversation_history_reconnect');
    if (history.trim()) throw new Error('interaction_smoke_conversation_history_reconnect_not_empty');

    return Object.freeze({
      conversationId: conversation.id,
    });
  } finally {
    if (deleteDisposableConversation) {
      await requestNoContent(fetchImplementation, apiUrl(
        config,
        `/api/agent-os/conversations/${encodeURIComponent(conversation.id)}`,
      ), {
        method: 'DELETE',
        headers: browserHeaders,
      }, 'conversation_delete');
    }
  }
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

async function requestCopilotkitSse(fetchImplementation, url, init, label) {
  let response;
  try {
    response = await fetchImplementation(url, init);
  } catch {
    throw new Error(`interaction_smoke_${label}_unreachable`);
  }
  if (!response || typeof response.ok !== 'boolean') {
    throw new Error(`interaction_smoke_${label}_response_invalid`);
  }
  if (!response.ok) {
    throw new Error(`interaction_smoke_${label}_http_${safeStatus(response.status)}`);
  }
  const contentType = response.headers?.get?.('content-type');
  if (typeof contentType !== 'string' || !contentType.toLowerCase().includes('text/event-stream')) {
    throw new Error(`interaction_smoke_${label}_content_type_invalid`);
  }
  try {
    const stream = await response.text();
    if (typeof stream !== 'string') throw new Error('stream_invalid');
    return stream;
  } catch {
    throw new Error(`interaction_smoke_${label}_stream_invalid`);
  }
}

async function requestExactStatus(fetchImplementation, url, init, expectedStatus, label) {
  let response;
  try {
    response = await fetchImplementation(url, init);
  } catch {
    throw new Error(`interaction_smoke_${label}_unreachable`);
  }
  if (!response || typeof response.status !== 'number') {
    throw new Error(`interaction_smoke_${label}_response_invalid`);
  }
  if (response.status !== expectedStatus) {
    throw new Error(`interaction_smoke_${label}_http_${safeStatus(response.status)}`);
  }
}

async function requestNoContent(fetchImplementation, url, init, label) {
  let response;
  try {
    response = await fetchImplementation(url, init);
  } catch {
    throw new Error(`interaction_smoke_${label}_unreachable`);
  }
  if (!response || typeof response.ok !== 'boolean') {
    throw new Error(`interaction_smoke_${label}_response_invalid`);
  }
  if (!response.ok) {
    throw new Error(`interaction_smoke_${label}_http_${safeStatus(response.status)}`);
  }
}

function apiUrl(config, pathname) {
  return new URL(pathname, config.apiBaseUrl).toString();
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

function disposableConversation(randomId, runtime) {
  const suffix = smokeId(randomId);
  const id = `${SMOKE_CONVERSATION_ID_PREFIX}${suffix.slice(0, SMOKE_CONVERSATION_ID_MAX_LENGTH - SMOKE_CONVERSATION_ID_PREFIX.length)}`;
  return Object.freeze({
    id,
    create: Object.freeze({
      conversationId: id,
      runtime,
      agentKey: null,
      title: SMOKE_CONVERSATION_TITLE,
    }),
  });
}

function assertConversationId(value, expectedId, label) {
  const conversation = asRecord(value, label);
  if (requiredString(conversation.id, `${label}_id`) !== expectedId) {
    throw new Error(`interaction_smoke_${label}_id_invalid`);
  }
}

function currentPreference(value, runtime, label) {
  const preferences = asRecord(value, label);
  const contexts = asRecord(preferences.contexts, `${label}_contexts`);
  const general = asRecord(contexts.general, `${label}_general`);
  const setting = asRecord(general[runtime], `${label}_runtime`);
  if (preferences.schemaVersion !== 1) {
    throw new Error(`interaction_smoke_${label}_invalid`);
  }
  return Object.freeze({
    context: 'general',
    runtime,
    model: requiredString(setting.model, `${label}_model`),
    reasoningEffort: requiredString(setting.reasoningEffort, `${label}_reasoning_effort`),
  });
}

function assertCurrentPreference(value, expected, label) {
  const current = currentPreference(value, expected.runtime, label);
  if (current.model !== expected.model || current.reasoningEffort !== expected.reasoningEffort) {
    throw new Error(`interaction_smoke_${label}_invalid`);
  }
}

function copilotkitConnectRequest(conversationId, preference) {
  const reconnectSuffix = '-connect';
  return {
    method: 'agent/connect',
    params: { agentId: 'conversation' },
    body: {
      threadId: conversationId,
      runId: `${conversationId.slice(0, SMOKE_CONVERSATION_ID_MAX_LENGTH - reconnectSuffix.length)}${reconnectSuffix}`,
      state: {},
      messages: [],
      tools: [],
      context: [],
      forwardedProps: {
        model: preference.model,
        reasoningEffort: preference.reasoningEffort,
      },
    },
  };
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
