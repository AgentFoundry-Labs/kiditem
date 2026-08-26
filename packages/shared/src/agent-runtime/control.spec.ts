import { describe, expect, it } from 'vitest';

describe('Gateway control contract', () => {
  it('round-trips only the ten bounded Gateway command shapes, including browser-addressed conversations and preference requests', async () => {
    const { GatewayCommandSchema } = await import('./control');
    const base = { commandId: 'command-1' };
    const preferences = {
      schemaVersion: 1,
      contexts: {
        general: {
          codex_cli: { model: 'gpt-5.6', reasoningEffort: 'medium' },
          claude_cli: { model: 'claude-sonnet-5', reasoningEffort: 'high' },
        },
      },
    };
    const conversationCreate = {
      ...base,
      kind: 'conversation.create',
      conversationId: 'browser-reserved-conversation-1',
      runtime: 'codex_cli',
      agentKey: null,
      title: 'New conversation',
    };
    const preferencesGet = { ...base, kind: 'conversation.preferences.get' };
    const preferencesSet = {
      ...base,
      kind: 'conversation.preferences.set',
      context: 'general',
      runtime: 'codex_cli',
      model: 'gpt-5.6',
      reasoningEffort: 'medium',
    };
    const commands = [
      { ...base, kind: 'conversation.list' },
      conversationCreate,
      { ...base, kind: 'conversation.history', conversationId: 'conversation-1' },
      { ...base, kind: 'conversation.rename', conversationId: 'conversation-1', title: 'Renamed' },
      { ...base, kind: 'conversation.delete', conversationId: 'conversation-1' },
      preferencesGet,
      preferencesSet,
      {
        ...base,
        kind: 'turn.start',
        conversationId: 'conversation-1',
        turnId: 'turn-1',
        message: 'Summarize the open sourcing work.',
        model: 'gpt-5.6',
        reasoningEffort: 'medium',
        executionBinding: 'binding-1',
      },
      { ...base, kind: 'turn.input', conversationId: 'conversation-1', turnId: 'turn-1', message: 'Use the latest supplier facts.' },
      { ...base, kind: 'turn.interrupt', conversationId: 'conversation-1', turnId: 'turn-1' },
    ];

    expect(commands.map((command) => GatewayCommandSchema.parse(command).kind)).toEqual([
      'conversation.list',
      'conversation.create',
      'conversation.history',
      'conversation.rename',
      'conversation.delete',
      'conversation.preferences.get',
      'conversation.preferences.set',
      'turn.start',
      'turn.input',
      'turn.interrupt',
    ]);
    expect(GatewayCommandSchema.parse(conversationCreate)).toEqual(conversationCreate);
    expect(GatewayCommandSchema.parse(preferencesGet)).toEqual(preferencesGet);
    expect(GatewayCommandSchema.parse(preferencesSet)).toEqual(preferencesSet);
    expect(GatewayCommandSchema.safeParse({ ...base, kind: 'conversation.preferences.loaded', preferences }).success).toBe(false);
    expect(GatewayCommandSchema.safeParse({ ...base, kind: 'conversation.preferences.updated', preferences }).success).toBe(false);
    expect(GatewayCommandSchema.safeParse({ ...preferencesSet, organizationId: 'organization-1' }).success).toBe(false);
    expect(GatewayCommandSchema.safeParse({ ...preferencesSet, userId: 'user-1' }).success).toBe(false);
  });

  it('round-trips strict preference result events and keeps them outside the command union', async () => {
    const { GatewayEventSchema } = await import('./control');
    const preferences = {
      schemaVersion: 1,
      contexts: {
        general: {
          codex_cli: { model: 'gpt-5.6', reasoningEffort: 'medium' },
        },
      },
    };
    const loaded = {
      kind: 'conversation.preferences.loaded',
      commandId: 'command-1',
      preferences,
    };
    const updated = {
      kind: 'conversation.preferences.updated',
      commandId: 'command-1',
      preferences,
    };

    expect(GatewayEventSchema.parse(loaded)).toEqual(loaded);
    expect(GatewayEventSchema.parse(updated)).toEqual(updated);
    expect(GatewayEventSchema.safeParse({
      kind: 'conversation.preferences.loaded',
      preferences,
    }).success).toBe(false);
    for (const forbidden of [
      { organizationId: 'organization-1' },
      { userId: 'user-1' },
      { unexpected: true },
      { preferences: { ...preferences, unexpected: true } },
    ]) {
      expect(GatewayEventSchema.safeParse({ ...loaded, ...forbidden }).success).toBe(false);
    }
  });

  it('rejects raw process, environment, workspace, MCP, and auth authority from Nest', async () => {
    const { GatewayCommandSchema } = await import('./control');
    const turn = {
      kind: 'turn.start',
      commandId: 'command-1',
      conversationId: 'conversation-1',
      turnId: 'turn-1',
      message: 'Hello',
      model: 'gpt-5.6',
      reasoningEffort: 'medium',
      executionBinding: 'binding-1',
    };

    for (const forbidden of [
      { executable: '/bin/sh' },
      { command: 'curl' },
      { args: ['--unsafe'] },
      { env: { SECRET: 'value' } },
      { workspace: '/tmp/workspace' },
      { mcpUrl: 'http://127.0.0.1:4000/internal/agent-runtime/mcp' },
      { authorization: 'Bearer secret' },
      { shell: 'echo unsafe' },
      { developerInstructions: 'untrusted profile text' },
      { instructionProfile: 'untrusted profile text' },
      { agentProfile: 'untrusted profile text' },
    ]) {
      expect(GatewayCommandSchema.safeParse({ ...turn, ...forbidden }).success).toBe(false);
    }
  });

  it('uses stable bounded polling and retry-safe event acknowledgement envelopes without a lease', async () => {
    const {
      GatewayCommandBatchSchema,
      GatewayEventAcknowledgementSchema,
      GatewayEventBatchSchema,
      GatewayPollSchema,
    } = await import('./control');

    expect(GatewayPollSchema.parse({
      kind: 'poll',
      gatewayInstanceId: 'gateway-1',
      platform: 'macos',
      runtimeTrain: {
        controlRevision: 'kiditem-gateway-control-v1',
        mcpProtocolRevision: '2026-07-28',
        nodeMajor: 22,
        codexVersion: '0.149.1',
        claudeVersion: '2.1.245',
      },
    })).not.toHaveProperty('leaseId');

    expect(GatewayCommandBatchSchema.parse({ commands: [] })).toEqual({ commands: [] });
    expect(GatewayEventBatchSchema.parse({
      gatewayInstanceId: 'gateway-1',
      eventSeq: 1,
      events: [{ kind: 'command.ack', commandId: 'command-1' }],
    })).not.toHaveProperty('leaseId');
    expect(GatewayEventAcknowledgementSchema.parse({ eventSeq: 1, accepted: true })).toEqual({ eventSeq: 1, accepted: true });
  });

  it('keeps the Gateway client deadline safely beyond the server long-poll and bounds event posts independently', async () => {
    const {
      GATEWAY_CONTROL_CLIENT_POLL_TIMEOUT_MS,
      GATEWAY_CONTROL_EVENT_TIMEOUT_MS,
      GATEWAY_CONTROL_POLL_WAIT_MS,
    } = await import('./control');

    expect(GATEWAY_CONTROL_POLL_WAIT_MS).toBe(25_000);
    expect(GATEWAY_CONTROL_CLIENT_POLL_TIMEOUT_MS).toBeGreaterThan(GATEWAY_CONTROL_POLL_WAIT_MS);
    expect(GATEWAY_CONTROL_EVENT_TIMEOUT_MS).toBeLessThan(GATEWAY_CONTROL_CLIENT_POLL_TIMEOUT_MS);
  });

  it('reports the exact provider model and effort catalog or a bounded unavailable code', async () => {
    const { GatewayEventSchema } = await import('./control');

    expect(GatewayEventSchema.parse({
      kind: 'gateway.readiness',
      readiness: [
        {
          runtime: 'codex_cli',
          ready: true,
          readiness: {
            runtime: 'codex_cli',
            version: '0.149.1',
            models: ['gpt-5.6'],
            reasoningEfforts: ['low', 'high'],
            modelReasoningEfforts: [{ model: 'gpt-5.6', reasoningEfforts: ['low', 'high'] }],
            loginVerified: true,
            mcpProtocolRevision: '2026-07-28',
          },
        },
        { runtime: 'claude_cli', ready: false, code: 'gateway_provider_unavailable' },
      ],
    })).toMatchObject({ kind: 'gateway.readiness' });

    expect(GatewayEventSchema.safeParse({
      kind: 'gateway.readiness',
      readiness: [
        { runtime: 'codex_cli', ready: false, code: 'gateway_provider_unavailable' },
        { runtime: 'codex_cli', ready: false, code: 'gateway_provider_unavailable' },
      ],
    }).success).toBe(false);
  });
});
