import { describe, expect, it } from 'vitest';

describe('Gateway control contract', () => {
  it('accepts only the eight bounded Gateway command shapes', async () => {
    const { GatewayCommandSchema } = await import('./control');
    const base = { commandId: 'command-1' };

    const commands = [
      { ...base, kind: 'conversation.list' },
      { ...base, kind: 'conversation.create', runtime: 'codex_cli', agentKey: null },
      { ...base, kind: 'conversation.history', conversationId: 'conversation-1' },
      { ...base, kind: 'conversation.rename', conversationId: 'conversation-1', title: 'Renamed' },
      { ...base, kind: 'conversation.delete', conversationId: 'conversation-1' },
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
      'turn.start',
      'turn.input',
      'turn.interrupt',
    ]);
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
