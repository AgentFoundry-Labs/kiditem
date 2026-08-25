import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';
import { describe, expect, it, vi } from 'vitest';
import type { RunnerCommand, RunnerHello } from '@kiditem/shared/agent-runtime';
import { RunnerCommandDispatcher } from '../control/runner-command-dispatcher';
import { RunnerControlClient } from '../control/runner-control.client';
import { RunnerEventOutbox } from '../control/runner-event-outbox';
import { AttemptTokenRegistry } from '../../../server/src/agent-os/adapter/out/runtime/runner/attempt-token.registry';
import { HostRunnerControlSession } from '../../../server/src/agent-os/adapter/out/runtime/runner/host-runner-control-session.module';
import { RunnerInstallationTokenService } from '../../../server/src/agent-os/adapter/out/runtime/runner/runner-installation-token.service';
import { createRequestScopedReadinessMcpHandler } from '../../../server/src/agent-os/adapter/in/http/runtime/attempt-mcp-http.controller';
import { RunnerControlController } from '../../../server/src/agent-os/adapter/in/http/runtime/runner-control.controller';

const INSTALLATION_TOKEN = 'A'.repeat(43);
const RUNNER_INSTANCE_ID = '018f4eb1-9078-7a1e-9514-b19b5732f5de';
const LEASE_ID = '118f4eb1-9078-7a1e-9514-b19b5732f5de';

describe('Runner ↔ Nest loopback readiness', () => {
  it.each([
    ['codex_cli', 'gpt-loopback', '218f4eb1-9078-7a1e-9514-b19b5732f5de', '51e975ef-c0a7-4ab1-8007-47c0fd563505'],
    ['claude_cli', 'claude-loopback', '318f4eb1-9078-7a1e-9514-b19b5732f5de', '61e975ef-c0a7-4ab1-8007-47c0fd563505'],
  ] as const)('runs a strict scoped %s canary over ordinary control commands and leaves no token-bearing command', async (runtime, model, canaryId, nonce) => {
    const tokens = new AttemptTokenRegistry();
    const work = {
      reconcile: vi.fn(async () => ({ reconciled: 0, attemptIds: [] })),
      transitionAttempt: vi.fn(async () => ({ transitioned: true })),
      finalizeTaskFromAttempt: vi.fn(async () => ({ finalized: true, status: 'completed' })),
      transitionTask: vi.fn(async () => ({ status: 'completed' })),
      deleteTerminalSession: vi.fn(async () => ({ deleted: true })),
    };
    const control = new HostRunnerControlSession({
      tokens,
      work,
      capacity: { releaseAttempt: vi.fn() },
      output: { publish: vi.fn(), finish: vi.fn() },
      loopbackOrigin: 'http://127.0.0.1:4000',
      commandQueue: { commandId: commandIds() },
      leaseId: () => LEASE_ID,
      canaryId: () => canaryId,
      nonce: () => nonce,
    });
    const installation = new RunnerInstallationTokenService({
      tokenFilePath: '/runner-token',
      readFile: async () => INSTALLATION_TOKEN,
    });
    await installation.initialize();
    const controller = new RunnerControlController(
      installation,
      control.http,
      { getAgentAttemptRuntimeReadiness: vi.fn(async () => ({ status: 'probing', agents: [] })) } as never,
    );
    const client = new RunnerControlClient({
      controlOrigin: 'http://127.0.0.1:4000',
      token: INSTALLATION_TOKEN,
      fetch: nestLoopbackFetch(controller),
    });

    const lease = await client.hello(hello());
    expect(lease).toMatchObject({ runnerInstanceId: RUNNER_INSTANCE_ID, leaseId: LEASE_ID, status: 'probing' });
    control.readiness.beginCanary({ runtime, model, deployIdentity: '3.4.5:abc123' });

    const outbox = new RunnerEventOutbox({ runnerInstanceId: RUNNER_INSTANCE_ID, leaseId: lease.leaseId });
    const executor = { start: vi.fn(async () => undefined), input: vi.fn(async () => undefined), interrupt: vi.fn(async () => undefined) };
    const dispatcher = new RunnerCommandDispatcher({ executor, outbox });
    const start = (await client.poll({ kind: 'poll', runnerInstanceId: RUNNER_INSTANCE_ID, leaseId: lease.leaseId }))!.commands[0]!;
    const rawReadinessToken = (start as { launch: { attemptToken: string } }).launch.attemptToken;

    await dispatcher.dispatch(start);
    await outbox.flush((body) => client.postEventBody(body));
    expect(executor.start).toHaveBeenCalledWith(expect.objectContaining({
      attemptId: canaryId,
      runtime,
      mcpProtocolRevision: '2026-07-28',
      cliContractIdentity: 'office-cli-contract-v2',
    }));

    const mcpHandler = createRequestScopedReadinessMcpHandler(
      control.readiness.canaryMcpBinding({ canaryId, leaseId: lease.leaseId }),
    );
    const mcpClient = pinnedModernMcpClient();
    try {
      await mcpClient.connect(transportFor(mcpHandler));
      expect(mcpClient.getProtocolEra()).toBe('modern');
      expect((await mcpClient.listTools()).tools.map((tool) => tool.name)).toEqual(['readiness_probe']);
      await expect(mcpClient.callTool({ name: 'readiness_probe', arguments: { nonce } }))
        .resolves.toMatchObject({ structuredContent: { nonce } });
    } finally {
      await mcpClient.close();
      await mcpHandler.close();
    }

    if (runtime === 'claude_cli') {
      const input = (await client.poll({ kind: 'poll', runnerInstanceId: RUNNER_INSTANCE_ID, leaseId: lease.leaseId }))!.commands
        .find((command: RunnerCommand) => command.kind === 'attempt.input')!;
      await dispatcher.dispatch(input);
      await outbox.flush((body) => client.postEventBody(body));
      expect(executor.input).toHaveBeenCalledWith(canaryId, expect.stringContaining('AgentResultEnvelope'));
    } else {
      expect(executor.input).not.toHaveBeenCalled();
    }

    outbox.enqueue({
      kind: 'attempt.terminal',
      attemptId: canaryId,
      terminalReason: 'protocol_success',
      result: { outcome: 'completed', summary: 'loopback canary complete', resourceRefs: [], operationRefs: [] },
    });
    await outbox.flush((body) => client.postEventBody(body));

    await expect(control.readiness.assertRuntime(runtime, model, '3.4.5:abc123')).resolves.toBeUndefined();
    expect(control.attempts.requireReady()).toEqual({ runnerInstanceId: RUNNER_INSTANCE_ID, leaseId: lease.leaseId });
    expect(() => tokens.requireReadiness({ raw: rawReadinessToken, canaryId, leaseId: lease.leaseId }))
      .toThrow('attempt_token_invalid');
    expect(work.transitionAttempt).not.toHaveBeenCalled();
    expect(work.finalizeTaskFromAttempt).not.toHaveBeenCalled();
    control.dispose();
  });
});

function hello(): RunnerHello {
  return {
    kind: 'hello',
    runnerInstanceId: RUNNER_INSTANCE_ID,
    platform: 'macos',
    nodeMajor: 22,
    controlRevision: 'kiditem-runner-control-v1',
    mcpProtocolRevision: '2026-07-28',
    cliContractIdentity: 'office-cli-contract-v2',
    runtimes: {
      codex_cli: { version: '0.149.1', loginVerified: true, nonPersistentSettingsVerified: true },
      claude_cli: { version: '2.1.245', loginVerified: true, nonPersistentSettingsVerified: true },
    },
  };
}

function commandIds(): () => string {
  let sequence = 0;
  return () => `418f4eb1-9078-7a1e-9514-${String(sequence++).padStart(12, '0')}`;
}

function pinnedModernMcpClient(): Client {
  return new Client(
    { name: 'runner-loopback-canary', version: '1.0.0' },
    { versionNegotiation: { mode: { pin: '2026-07-28' } } },
  );
}

function transportFor(handler: { fetch(request: Request, options?: unknown): Promise<Response> }): StreamableHTTPClientTransport {
  return new StreamableHTTPClientTransport(new URL('http://runner-loopback.test/mcp'), {
    fetch: (input, init) => {
      const request = input instanceof Request
        ? input
        : new Request(input instanceof URL ? input : String(input), init);
      return handler.fetch(request);
    },
  });
}

function nestLoopbackFetch(controller: RunnerControlController): typeof fetch {
  return async (url, init) => {
    const path = new URL(String(url)).pathname;
    const body = JSON.parse(String(init?.body ?? '{}'));
    const headers = new Headers(init?.headers);
    const response = responseRecorder();
    const request = { headers: { authorization: headers.get('authorization') ?? undefined } };
    try {
      if (path.endsWith('/commands:poll')) await controller.poll(body, request as never, response.value as never);
      else if (path.endsWith('/events')) await controller.events(body, request as never, response.value as never);
      else return new Response(null, { status: 404 });
      return response.toFetchResponse();
    } catch {
      return new Response(null, { status: 401 });
    }
  };
}

function responseRecorder(): {
  value: { status(code: number): unknown; json(value: unknown): unknown; end(): unknown };
  toFetchResponse(): Response;
} {
  let status = 200;
  let body: unknown;
  const value = {
    status(code: number) { status = code; return value; },
    json(next: unknown) { body = next; return value; },
    end() { return value; },
  };
  return {
    value,
    toFetchResponse: () => body === undefined
      ? new Response(null, { status })
      : new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } }),
  };
}
