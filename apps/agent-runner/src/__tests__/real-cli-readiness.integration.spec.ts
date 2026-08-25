import { afterEach, describe, expect, it } from 'vitest';
import { createServer, type Server } from 'node:http';
import { once } from 'node:events';
import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import type { RunnerCommand, RunnerEvent, RunnerEventBatch, RunnerHello } from '@kiditem/shared/agent-runtime';
import { AttemptExecutor } from '../attempt/attempt-executor';
import { AttemptWorkspaceService } from '../attempt/attempt-workspace.service';
import { RunnerCommandDispatcher } from '../control/runner-command-dispatcher';
import { RunnerEventOutbox } from '../control/runner-event-outbox';
import { MacosProcessSupervisor } from '../platform/macos/macos-process-supervisor';
import type { ProcessCallbacks, ProcessExit, ProcessSupervisor, SupervisedProcess } from '../platform/process-supervisor';
import type { ProviderCommand } from '../provider/provider-command';
import { verifyRunnerRuntimeReadiness } from '../main';
import { createRequestScopedReadinessMcpHandler } from '../../../server/src/agent-os/adapter/in/http/runtime/attempt-mcp-http.controller';
import { AttemptTokenRegistry } from '../../../server/src/agent-os/adapter/out/runtime/runner/attempt-token.registry';
import { RunnerCommandQueue } from '../../../server/src/agent-os/adapter/out/runtime/runner/runner-command.queue';
import { RunnerEventHandlerService } from '../../../server/src/agent-os/adapter/out/runtime/runner/runner-event-handler.service';
import { RunnerLeaseRegistry } from '../../../server/src/agent-os/adapter/out/runtime/runner/runner-lease.registry';
import { CODEX_READINESS_PROVIDER_PROMPT, RunnerReadinessService } from '../../../server/src/agent-os/adapter/out/runtime/runner/runner-readiness.service';

type RealCanaryRuntime = 'codex_cli' | 'claude_cli';
const ALL_REAL_CANARY_RUNTIMES: readonly RealCanaryRuntime[] = Object.freeze(['codex_cli', 'claude_cli']);
const RUNNER_INSTANCE_ID = '818f4eb1-9078-7a1e-9514-b19b5732f5de';
const LEASE_ID = '918f4eb1-9078-7a1e-9514-b19b5732f5de';
const DEPLOY_IDENTITY = '3.4.5:real-cli-canary';
const CANARY_TIMEOUT_MS = 90_000;
const PROVIDER_BASELINE_TIMEOUT_MS = 60_000;
const enabled = process.env.KIDITEM_RUNNER_REAL_CLI_CANARY === '1' && process.platform === 'darwin';
const codexModel = explicitModel('KIDITEM_RUNNER_CODEX_CANARY_MODEL');
const claudeModel = explicitModel('KIDITEM_RUNNER_CLAUDE_CANARY_MODEL');
const selectedCanaryRuntimes = realCliCanaryRuntimes(process.env.KIDITEM_RUNNER_REAL_CLI_CANARY_RUNTIMES);
const realCanaryCases = realCliCanaryCases(selectedCanaryRuntimes ?? [], { codex_cli: codexModel, claude_cli: claudeModel });
const requestedModelsPresent = selectedCanaryRuntimes !== null && realCanaryCases.length === selectedCanaryRuntimes.length;
const realCanary = enabled && requestedModelsPresent ? it : it.skip;
const realProviderBaseline = enabled && requestedModelsPresent ? it : it.skip;
const roots: string[] = [];

afterEach(async () => { await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))); });

describe('real CLI canary runtime selector', () => {
  it.each([
    [undefined, ['codex_cli', 'claude_cli']],
    ['both', ['codex_cli', 'claude_cli']],
    ['codex_cli', ['codex_cli']],
    ['claude_cli', ['claude_cli']],
    ['', null],
    ['codex_cli,claude_cli', null],
    ['unexpected', null],
  ] as const)('maps %j to only the selected runtimes', (value, expected) => {
    expect(realCliCanaryRuntimes(value)).toEqual(expected);
  });

  it('requires only the model for a codex-only selection', () => {
    const selected = realCliCanaryRuntimes('codex_cli');
    expect(selected).not.toBeNull();
    expect(realCliCanaryCases(selected!, { codex_cli: 'gpt-5.6', claude_cli: null }))
      .toEqual([['codex_cli', 'gpt-5.6']]);
  });
});

describe('logged-in real CLI readiness canary', () => {
  const providerBaselineFingerprints = new Map<string, string>();

  it('requires explicit command-scoped model selections when enabled', () => {
    if (!enabled) return;
    if (selectedCanaryRuntimes === null) {
      throw new Error('KIDITEM_RUNNER_REAL_CLI_CANARY_RUNTIMES must be codex_cli, claude_cli, or both');
    }
    for (const runtime of selectedCanaryRuntimes) {
      expect(modelForRuntime(runtime), `set ${runtime === 'codex_cli' ? 'KIDITEM_RUNNER_CODEX_CANARY_MODEL' : 'KIDITEM_RUNNER_CLAUDE_CANARY_MODEL'} explicitly`)
        .toBeTruthy();
    }
  });

  it('uses the exact minimal Codex provider prompt for the provider-only baseline', () => {
    expect(providerOnlyPrompt()).toBe('Return only a valid AgentResultEnvelope JSON object. Do not call any MCP tool.');
    expect(providerOnlyPrompt()).not.toMatch(/readiness|nonce/i);
  });

  const registerRealCanaryTests = (): void => {
    realCanary.each(realCanaryCases)('runs the strict %s MCP canary through a real logged-in CLI', async (runtime, model) => {
    // `/tmp`, `/var`, and `/private/tmp` either traverse symlinks or are
    // group/world writable on macOS. The production protected-path contract
    // rightly rejects those chains, so keep this disposable root beneath the
    // private checked-out workspace and remove it in `afterEach`.
    const attemptRoot = await mkdtemp(join(process.cwd(), `.kiditem-real-${runtime}-`));
    roots.push(attemptRoot);
    await expect(verifyRunnerRuntimeReadiness({ runtimeRoot: resolve(process.cwd(), '../..'), loginRoot: homedir(), platform: 'macos', runtime }))
      .resolves.toMatchObject({
        version: runtime === 'codex_cli' ? '0.149.1' : '2.1.241',
        loginVerified: true,
        nonPersistentSettingsVerified: true,
      });

    const commands = new RunnerCommandQueue({ commandId: commandIds() });
    const tokens = new AttemptTokenRegistry();
    const leases = new RunnerLeaseRegistry({
      commands,
      interruptAttempt: async () => undefined,
      leaseId: () => LEASE_ID,
    });
    const readiness = new RunnerReadinessService({
      leases,
      commands,
      tokens,
      loopbackOrigin: 'http://127.0.0.1:4000',
      canaryId: () => runtime === 'codex_cli'
        ? 'a18f4eb1-9078-7a1e-9514-b19b5732f5de'
        : 'b18f4eb1-9078-7a1e-9514-b19b5732f5de',
      nonce: () => runtime === 'codex_cli'
        ? 'c18f4eb1-9078-7a1e-9514-b19b5732f5de'
        : 'd18f4eb1-9078-7a1e-9514-b19b5732f5de',
    });
    const work = { transitionAttempt: async () => ({ transitioned: true }), finalizeTaskFromAttempt: async () => ({ finalized: true, status: 'completed' as const }) };
    const events = new RunnerEventHandlerService({
      leases,
      commands,
      tokens,
      work,
      capacity: { releaseAttempt: () => undefined },
      output: { publish: () => undefined, finish: () => undefined },
      readiness,
    });
    const lease = leases.hello(hello());
    const { canaryId } = readiness.beginCanary({ runtime, model, deployIdentity: DEPLOY_IDENTITY });
    const start = (await leases.poll({ runnerInstanceId: RUNNER_INSTANCE_ID, leaseId: lease.leaseId }))
      .commands.find((command: RunnerCommand) => command.kind === 'attempt.start');
    if (!start || start.kind !== 'attempt.start') throw new Error('real_canary_start_missing');

    const probeReached = deferred<void>();
    const releaseProbe = deferred<void>();
    const endpoint = await startReadinessEndpoint({
      readiness,
      tokens,
      canaryId,
      leaseId: lease.leaseId,
      onProbe: async () => {
        probeReached.resolve();
        // Codex defers its Runner-owned direct probe until the strict provider
        // result completes, so this must stay non-blocking before terminal
        // success can be emitted. Claude still model-selects the probe during
        // its live turn and therefore keeps the release barrier that proves
        // subsequent steering works.
        if (runtime === 'claude_cli') await releaseProbe.promise;
      },
    });
    const outbox = new RunnerEventOutbox({
      runnerInstanceId: RUNNER_INSTANCE_ID,
      leaseId: lease.leaseId,
      redactionTokens: [start.launch.attemptToken],
    });
    const diagnostic = new SafeProviderDiagnostic();
    const executor = new AttemptExecutor({
      runtimeRoot: resolve(process.cwd(), '../..'),
      workspaces: new AttemptWorkspaceService({ attemptRoot, loginRoot: homedir(), platform: 'macos' }),
      supervisor: new DiagnosticMacosSupervisor(diagnostic),
      emit: (event) => outbox.enqueue(event),
    });
    const dispatcher = new RunnerCommandDispatcher({ executor, outbox });
    let terminal: Extract<RunnerEventBatch['events'][number], { kind: 'attempt.terminal' }> | undefined;
    const flush = async (): Promise<void> => {
      await outbox.flush(async (body) => {
        const batch = JSON.parse(body) as RunnerEventBatch;
        terminal ??= batch.events.find((event: RunnerEvent): event is Extract<RunnerEvent, { kind: 'attempt.terminal' }> => event.kind === 'attempt.terminal');
        return events.handle(batch);
      });
    };

    let phase = 'provider_start';
    try {
      await dispatcher.dispatch(start);
      await flush();
      phase = 'mcp_probe';
      await waitFor(async () => {
        await flush();
        return probeReached.settled || terminal !== undefined || endpoint.legacyNegotiationObserved;
      }, CANARY_TIMEOUT_MS);
      if (endpoint.legacyNegotiationObserved) {
        throw new Error(`real_canary_legacy_mcp_protocol observed=${endpoint.mcpMethods.join(',')}`);
      }
      if (runtime === 'claude_cli') {
        const input = (await leases.poll({ runnerInstanceId: RUNNER_INSTANCE_ID, leaseId: lease.leaseId }))
          .commands.find((command: RunnerCommand) => command.kind === 'attempt.input');
        if (!input || input.kind !== 'attempt.input') throw new Error('real_canary_live_input_missing');
        await dispatcher.dispatch(input);
        await flush();
        releaseProbe.resolve();
      } else {
        expect(commands.take().commands.find((command) => command.kind === 'attempt.input')).toBeUndefined();
      }
      phase = 'terminal_result';
      await waitFor(async () => {
        await flush();
        return terminal !== undefined;
      }, CANARY_TIMEOUT_MS);

      const runtimeErrorReport = diagnostic.terminalRuntimeErrorReport({ terminal, observations: endpoint.observations });
      if (runtimeErrorReport) {
        throw new Error(`real_cli_canary_terminal_runtime_error runtime=${runtime} phase=${phase} ${runtimeErrorReport}`);
      }

      expect(terminal).toMatchObject({
        attemptId: canaryId,
        terminalReason: expect.stringMatching(/^(success|protocol_success)$/),
        result: { outcome: 'completed' },
      });
      expect(endpoint.observations).toEqual(expect.arrayContaining([
        expect.objectContaining({ method: 'tools/list', status: 200, protocolVersion: '2026-07-28' }),
        expect.objectContaining({ method: 'tools/call', status: 200, protocolVersion: '2026-07-28' }),
      ]));
      await expect(readiness.assertRuntime(runtime, model, DEPLOY_IDENTITY)).resolves.toBeUndefined();
      expect(() => tokens.requireReadiness({ raw: start.launch.attemptToken, canaryId, leaseId: lease.leaseId }))
        .toThrow('attempt_token_invalid');
      expect(commands.take().commands).toEqual([]);
      expect(JSON.stringify(commands)).not.toContain(start.launch.attemptToken);
      expect(await readdir(attemptRoot)).toEqual([]);
      console.info(`REAL_CLI_CANARY_SUCCEEDED runtime=${runtime} phase=terminal_result`);
    } catch (error) {
      const blocker = diagnostic.externalBlocker({
        error,
        terminal,
        phase,
        observations: endpoint.observations,
        baselineFingerprint: providerBaselineFingerprints.get(providerBaselineKey(runtime, model)),
      });
      if (!probeReached.settled && blocker) {
        // A CI or implementation Mac may have valid local CLI/login facts but no
        // reachable model service.  Keep the deterministic loopback contract
        // green while making the real CLI attempt and reporting no secret data.
        const observations = endpoint.observations.map((value) => `${value.method}:${value.status}:${value.protocolVersion}`).join(',') || 'none';
        console.info(`REAL_CLI_CANARY_EXTERNAL_BLOCKER runtime=${runtime} phase=${phase} code=${blocker} observations=${observations}`);
        return;
      }
      const contractFailure = diagnostic.contractFailure({ error, phase, observations: endpoint.observations });
      if (contractFailure) {
        const observations = endpoint.observations.map((value) => `${value.method}:${value.status}`).join(',') || 'none';
        throw new Error(`real_cli_canary_contract_failure runtime=${runtime} phase=${phase} code=${contractFailure} app_server=${diagnostic.appServerSummary()} outbound=${diagnostic.outboundSummary()} observations=${observations}`);
      }
      throw error;
    } finally {
      releaseProbe.resolve();
      await executor.shutdown().catch(() => undefined);
      await endpoint.close();
      leases.dispose();
    }
    }, CANARY_TIMEOUT_MS + 20_000);
  };

  realProviderBaseline.each(realCanaryCases)('runs the bounded %s provider baseline without requiring an MCP tool call', async (runtime, model) => {
    const attemptRoot = await mkdtemp(join(process.cwd(), `.kiditem-real-baseline-${runtime}-`));
    roots.push(attemptRoot);
    const commands = new RunnerCommandQueue({ commandId: commandIds() });
    const tokens = new AttemptTokenRegistry();
    const leases = new RunnerLeaseRegistry({
      commands,
      interruptAttempt: async () => undefined,
      leaseId: () => LEASE_ID,
    });
    const readiness = new RunnerReadinessService({
      leases,
      commands,
      tokens,
      loopbackOrigin: 'http://127.0.0.1:4000',
      canaryId: () => runtime === 'codex_cli'
        ? 'f18f4eb1-9078-7a1e-9514-b19b5732f5de'
        : 'f28f4eb1-9078-7a1e-9514-b19b5732f5de',
      nonce: () => runtime === 'codex_cli'
        ? 'f38f4eb1-9078-7a1e-9514-b19b5732f5de'
        : 'f48f4eb1-9078-7a1e-9514-b19b5732f5de',
    });
    const work = { transitionAttempt: async () => ({ transitioned: true }), finalizeTaskFromAttempt: async () => ({ finalized: true, status: 'completed' as const }) };
    const events = new RunnerEventHandlerService({
      leases,
      commands,
      tokens,
      work,
      capacity: { releaseAttempt: () => undefined },
      output: { publish: () => undefined, finish: () => undefined },
      readiness,
    });
    const lease = leases.hello(hello());
    const { canaryId } = readiness.beginCanary({ runtime, model, deployIdentity: DEPLOY_IDENTITY });
    const start = (await leases.poll({ runnerInstanceId: RUNNER_INSTANCE_ID, leaseId: lease.leaseId }))
      .commands.find((command: RunnerCommand) => command.kind === 'attempt.start');
    if (!start || start.kind !== 'attempt.start') throw new Error('real_baseline_start_missing');
    // Keep the production command and isolated workspace construction exactly
    // the same. The prompt deliberately does not require MCP discovery/call,
    // so this separates provider/model reachability from canary choreography.
    const baselineStart = { ...start, launch: { ...start.launch, prompt: providerOnlyPrompt() } };
    const endpoint = await startReadinessEndpoint({
      readiness,
      tokens,
      canaryId,
      leaseId: lease.leaseId,
      onProbe: async () => undefined,
    });
    const outbox = new RunnerEventOutbox({
      runnerInstanceId: RUNNER_INSTANCE_ID,
      leaseId: lease.leaseId,
      redactionTokens: [start.launch.attemptToken],
    });
    const diagnostic = new SafeProviderDiagnostic();
    const executor = new AttemptExecutor({
      runtimeRoot: resolve(process.cwd(), '../..'),
      workspaces: new AttemptWorkspaceService({ attemptRoot, loginRoot: homedir(), platform: 'macos' }),
      supervisor: new DiagnosticMacosSupervisor(diagnostic),
      emit: (event) => outbox.enqueue(event),
    });
    const dispatcher = new RunnerCommandDispatcher({ executor, outbox });
    let terminal: Extract<RunnerEventBatch['events'][number], { kind: 'attempt.terminal' }> | undefined;
    const flush = async (): Promise<void> => {
      await outbox.flush(async (body) => {
        const batch = JSON.parse(body) as RunnerEventBatch;
        terminal ??= batch.events.find((event: RunnerEvent): event is Extract<RunnerEvent, { kind: 'attempt.terminal' }> => event.kind === 'attempt.terminal');
        return events.handle(batch);
      });
    };

    try {
      await dispatcher.dispatch(baselineStart);
      await flush();
      await waitFor(async () => {
        await flush();
        return terminal !== undefined;
      }, PROVIDER_BASELINE_TIMEOUT_MS);

      expect(terminal).toMatchObject({
        attemptId: canaryId,
        terminalReason: expect.stringMatching(/^(success|protocol_success)$/),
        result: { outcome: 'completed' },
      });
      expect(await readdir(attemptRoot)).toEqual([]);
      console.info(`REAL_CLI_PROVIDER_BASELINE_SUCCEEDED runtime=${runtime}`);
    } catch (error) {
      const blocker = diagnostic.providerBaselineExternalBlocker({ error, terminal });
      if (blocker) {
        const fingerprint = diagnostic.baselineFingerprint({ error, terminal });
        if (fingerprint) providerBaselineFingerprints.set(providerBaselineKey(runtime, model), fingerprint);
        console.info(`REAL_CLI_PROVIDER_BASELINE_EXTERNAL_BLOCKER runtime=${runtime} code=${blocker}`);
        return;
      }
      const contractFailure = diagnostic.contractFailure({ error, phase: 'provider_start', observations: endpoint.observations });
      if (contractFailure) throw new Error(`real_cli_provider_baseline_contract_failure runtime=${runtime} code=${contractFailure} app_server=${diagnostic.appServerSummary()}`);
      throw error;
    } finally {
      await executor.shutdown().catch(() => undefined);
      await endpoint.close();
      leases.dispose();
    }
  }, PROVIDER_BASELINE_TIMEOUT_MS + 20_000);

  // Register baselines first. An opaque canary failure is reportable only if
  // this exact runtime/model had the same bounded provider-only fingerprint.
  registerRealCanaryTests();
});

describe('SafeProviderDiagnostic', () => {
  it('classifies a structured provider turn failure without retaining its payload', () => {
    const diagnostic = new SafeProviderDiagnostic();
    diagnostic.observeStdout(`${JSON.stringify({
      jsonrpc: '2.0', method: 'turn/completed',
      params: { threadId: 'thread-id', turn: { id: 'turn-id', status: 'failed', error: 'provider detail that must not escape' } },
    })}\n`);

    expect(diagnostic.providerBaselineExternalBlocker({ error: new Error('irrelevant'), terminal: undefined }))
      .toBe('provider_reported_turn_failure');
    expect(JSON.stringify(diagnostic)).not.toContain('provider detail');
  });

  it('accepts an opaque canary failure only when the provider-only baseline has the same bounded fingerprint', () => {
    const baseline = new SafeProviderDiagnostic();
    const canary = new SafeProviderDiagnostic();
    const failure = `${JSON.stringify({
      jsonrpc: '2.0', method: 'turn/completed',
      params: { turn: { status: 'failed' } },
    })}\n`;
    baseline.observeStdout(failure);
    baseline.observeExit({ code: 0, signal: null });
    canary.observeStdout(failure);
    canary.observeExit({ code: 0, signal: null });
    const input = {
      error: new Error('real_canary_timeout'),
      terminal: undefined,
      phase: 'provider_start',
      observations: [] as McpObservation[],
    };

    expect(baseline.providerBaselineExternalBlocker({ error: input.error, terminal: input.terminal }))
      .toBe('provider_reported_turn_failure');
    expect(canary.externalBlocker(input)).toBeNull();
    expect(canary.externalBlocker({ ...input, baselineFingerprint: 'rpc_error_-32000|provider_exit_0' })).toBeNull();
    expect(canary.externalBlocker({ ...input, baselineFingerprint: 'turn_completed_failed|provider_exit_0' }))
      .toBe('provider_baseline_correlated_failure');
  });

  it('keeps explicit isolated-login failures external without baseline correlation', () => {
    const diagnostic = new SafeProviderDiagnostic();
    diagnostic.observeStderr('login required');

    expect(diagnostic.providerBaselineExternalBlocker({ error: new Error('irrelevant'), terminal: undefined }))
      .toBe('auth_materialization_failed');
    expect(diagnostic.externalBlocker({
      error: new Error('irrelevant'), terminal: undefined, phase: 'provider_start', observations: [],
    })).toBe('auth_materialization_failed');
  });

  it('classifies current Codex unsupported-model phrasing without retaining the provider payload', () => {
    const diagnostic = new SafeProviderDiagnostic();
    const providerPayload = 'Invalid request: the selected model is not supported for this account.';
    diagnostic.observeStdout(`${JSON.stringify({
      jsonrpc: '2.0', method: 'turn/completed',
      params: { turn: { status: 'failed', error: { message: providerPayload, codexErrorInfo: 'other' } } },
    })}\n`);

    expect(diagnostic.providerBaselineExternalBlocker({ error: new Error('irrelevant'), terminal: undefined }))
      .toBe('unsupported_model');
    expect(JSON.stringify(diagnostic)).not.toContain(providerPayload);
  });

  it.each([
    ['login required', 'auth_materialization_failed'],
    ['network connection timed out', 'network_service_unavailable'],
  ] as const)('keeps explicit %s external even when modern discovery never reaches the canary call', (diagnosticText, expected) => {
    const diagnostic = new SafeProviderDiagnostic();
    diagnostic.observeStderr(diagnosticText);

    expect(diagnostic.externalBlocker({
      error: new Error('real_canary_timeout'),
      terminal: undefined,
      phase: 'mcp_probe',
      observations: [{ method: 'tools/list', status: 200, protocolVersion: '2026-07-28' }],
    })).toBe(expected);
  });

  it('does not call a recognized CLI option error external', () => {
    const diagnostic = new SafeProviderDiagnostic();
    diagnostic.observeStdout(`${JSON.stringify({ type: 'error', error: { message: 'CommanderError: unknown option --not-real' } })}\n`);

    expect(diagnostic.contractFailure({ error: new Error('irrelevant'), phase: 'provider_start', observations: [] }))
      .toBe('invalid_cli_option');
  });

  it('keeps a structured readiness-tool allowlist rejection internal before MCP observations', () => {
    const diagnostic = new SafeProviderDiagnostic();
    diagnostic.observeStdout(`${JSON.stringify({
      type: 'error',
      error: { code: -32_000, message: 'Tool mcp__kiditem_attempt__readiness_probe is not allowed by allowedTools' },
    })}\n`);
    const input = { error: new Error('real_canary_timeout'), terminal: undefined, phase: 'mcp_probe', observations: [] };

    expect(diagnostic.externalBlocker(input)).toBeNull();
    expect(diagnostic.contractFailure(input)).toBe('mcp_tool_allowlist_failed');
    expect(diagnostic.providerBaselineExternalBlocker({
      error: new Error('real_canary_timeout'),
      terminal: undefined,
    })).toBeNull();
  });

  it('classifies a provider timeout before completion as incomplete before the readiness probe', () => {
    const diagnostic = new SafeProviderDiagnostic();
    const input = {
      error: new Error('real_canary_timeout'),
      terminal: undefined,
      phase: 'mcp_probe',
      observations: [
        { method: 'tools/list', status: 200, protocolVersion: '2026-07-28' },
        { method: 'tools/list', status: 200, protocolVersion: '2026-07-28' },
      ],
    };

    expect(diagnostic.externalBlocker(input)).toBeNull();
    expect(diagnostic.contractFailure(input)).toBe('provider_turn_incomplete_before_probe');
  });

  it('classifies a completed provider turn without an outbound probe as a Runner dispatch failure', () => {
    const diagnostic = new SafeProviderDiagnostic();
    diagnostic.observeStdout(`${JSON.stringify({
      jsonrpc: '2.0', method: 'turn/completed',
      params: { turn: { status: 'completed' } },
    })}\n`);
    const input = {
      error: new Error('real_canary_timeout'),
      terminal: undefined,
      phase: 'mcp_probe',
      observations: [
        { method: 'tools/list', status: 200, protocolVersion: '2026-07-28' },
        { method: 'tools/list', status: 200, protocolVersion: '2026-07-28' },
      ],
    };

    expect(diagnostic.contractFailure(input)).toBe('runner_probe_dispatch_failed');
  });

  it('records only the allowlisted outbound probe method through supervised input', async () => {
    const diagnostic = new SafeProviderDiagnostic();
    diagnostic.observeStdout(`${JSON.stringify({
      jsonrpc: '2.0', method: 'turn/completed',
      params: { turn: { status: 'completed' } },
    })}\n`);
    const supervisor = new DiagnosticMacosSupervisor(diagnostic, {
      launch: async () => ({ input: async () => undefined, terminate: async () => undefined, onExit: () => undefined }),
      shutdown: async () => undefined,
    });
    const supervised = await supervisor.launch({ executable: 'unused', args: [], cwd: '/', env: {} });
    const raw = 'local-prompt-token-and-arguments-must-not-escape';
    try {
      await supervised.input(`${JSON.stringify({
        jsonrpc: '2.0', id: 'local-turn', method: 'turn/start',
        params: { prompt: raw, token: raw, arguments: { nonce: raw } },
      })}\n`);
      await supervised.input(`${JSON.stringify({
        jsonrpc: '2.0', id: 'local-probe', method: 'mcpServer/tool/call',
        params: { prompt: raw, token: raw, arguments: { nonce: raw } },
      })}\n`);

      const report = diagnostic.terminalRuntimeErrorReport({
        terminal: { kind: 'attempt.terminal', attemptId: '118f4eb1-9078-7a1e-9514-b19b5732f5de', terminalReason: 'runtime_error' },
        observations: [{ method: 'tools/list', status: 200, protocolVersion: '2026-07-28' }],
      });
      expect(diagnostic.contractFailure({
        error: new Error('real_canary_timeout'), phase: 'mcp_probe',
        observations: [
          { method: 'tools/list', status: 200, protocolVersion: '2026-07-28' },
          { method: 'tools/list', status: 200, protocolVersion: '2026-07-28' },
        ],
      })).toBe('mcp_tool_call_failed');
      expect(report).toBe('app_server=turn_completed_completed outbound=mcpServer/tool/call observations=tools/list:200');
      expect(JSON.stringify({ report, diagnostic })).not.toContain(raw);
    } finally {
      await supervised.terminate();
      await supervisor.shutdown();
    }
  });

  it('reports a runtime-error terminal with only bounded app-server and MCP metadata', () => {
    const diagnostic = new SafeProviderDiagnostic();
    diagnostic.observeStdout(`${JSON.stringify({
      jsonrpc: '2.0', method: 'turn/completed',
      params: { turn: { status: 'failed', error: 'provider detail that must not escape' } },
    })}\n`);
    const diagnosticWithTerminalReport = diagnostic as unknown as {
      terminalRuntimeErrorReport?: (input: Readonly<{
        terminal: Extract<RunnerEventBatch['events'][number], { kind: 'attempt.terminal' }> | undefined;
        observations: readonly McpObservation[];
      }>) => string | null;
    };

    const report = diagnosticWithTerminalReport.terminalRuntimeErrorReport?.({
      terminal: { kind: 'attempt.terminal', attemptId: '118f4eb1-9078-7a1e-9514-b19b5732f5de', terminalReason: 'runtime_error' },
      observations: [
        { method: 'tools/list', status: 200, protocolVersion: '2026-07-28' },
        { method: 'tools/call', status: 200, protocolVersion: '2026-07-28' },
      ],
    });

    expect(report).toBe('app_server=turn_completed_failed outbound=none observations=tools/list:200,tools/call:200');
    expect(JSON.stringify({ report, diagnostic })).not.toContain('provider detail');
  });

  it('retains an app-server RPC error code without retaining the error payload', () => {
    const diagnostic = new SafeProviderDiagnostic();
    const raw = 'provider-error-payload-must-not-escape';
    diagnostic.observeStdout(`${JSON.stringify({ jsonrpc: '2.0', error: { code: -32_000, message: raw } })}\n`);

    expect(diagnostic.appServerSummary()).toBe('rpc_error_-32000');
    expect(JSON.stringify(diagnostic)).not.toContain(raw);
  });
});

/**
 * Missing preserves the conservative default `both` behavior. Any supplied
 * empty or unrecognized value fails closed so an operator cannot accidentally
 * run an unscoped provider turn.
 */
export function realCliCanaryRuntimes(value: string | undefined): readonly RealCanaryRuntime[] | null {
  if (value === undefined) return ALL_REAL_CANARY_RUNTIMES;
  switch (value.trim()) {
    case 'both': return ALL_REAL_CANARY_RUNTIMES;
    case 'codex_cli': return Object.freeze(['codex_cli']);
    case 'claude_cli': return Object.freeze(['claude_cli']);
    default: return null;
  }
}

function modelForRuntime(runtime: RealCanaryRuntime): string | null {
  return runtime === 'codex_cli' ? codexModel : claudeModel;
}

function realCliCanaryCases(
  runtimes: readonly RealCanaryRuntime[],
  models: Readonly<Record<RealCanaryRuntime, string | null>>,
): ReadonlyArray<readonly [RealCanaryRuntime, string]> {
  return runtimes.flatMap((runtime) => models[runtime] ? [[runtime, models[runtime]!] as const] : []);
}

function explicitModel(key: 'KIDITEM_RUNNER_CODEX_CANARY_MODEL' | 'KIDITEM_RUNNER_CLAUDE_CANARY_MODEL'): string | null {
  const value = process.env[key]?.trim();
  return value && value.length <= 256 ? value : null;
}

function providerBaselineKey(runtime: 'codex_cli' | 'claude_cli', model: string): string {
  return `${runtime}\u0000${model}`;
}

function hello(): RunnerHello {
  return {
    kind: 'hello', runnerInstanceId: RUNNER_INSTANCE_ID, platform: 'macos', nodeMajor: 22,
    controlRevision: 'kiditem-runner-control-v1', mcpProtocolRevision: '2026-07-28', cliContractIdentity: 'office-cli-contract-v2',
    runtimes: {
      codex_cli: { version: '0.149.1', loginVerified: true, nonPersistentSettingsVerified: true },
      claude_cli: { version: '2.1.241', loginVerified: true, nonPersistentSettingsVerified: true },
    },
  };
}

function commandIds(): () => string {
  let sequence = 0;
  return () => `e18f4eb1-9078-7a1e-9514-${String(sequence++).padStart(12, '0')}`;
}

function deferred<T>(): { promise: Promise<T>; resolve(value?: T): void; readonly settled: boolean } {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let settled = false;
  const promise = new Promise<T>((next) => { resolve = next; });
  return {
    promise,
    resolve(value?: T) { if (!settled) { settled = true; resolve(value as T); } },
    get settled() { return settled; },
  };
}

async function startReadinessEndpoint(input: Readonly<{
  readiness: RunnerReadinessService;
  tokens: AttemptTokenRegistry;
  canaryId: string;
  leaseId: string;
  onProbe: () => Promise<void>;
}>): Promise<{
  close(): Promise<void>;
  readonly mcpMethods: readonly string[];
  readonly observations: readonly McpObservation[];
  readonly legacyNegotiationObserved: boolean;
}> {
  const mcpMethods = new Set<string>(); const observations: McpObservation[] = [];
  const server = createServer(async (request, response) => {
    if (request.method !== 'POST' || request.url !== `/internal/agent-runtime/attempts/${input.canaryId}/mcp`) {
      response.statusCode = 404; response.end(); return;
    }
    let handler: ReturnType<typeof createRequestScopedReadinessMcpHandler> | undefined;
    let observed: string | null = null;
    const protocolVersion = observedProtocolVersion(request.headers['mcp-protocol-version']);
    try {
      const raw = bearer(request.headers.authorization);
      input.tokens.requireReadiness({ raw, canaryId: input.canaryId, leaseId: input.leaseId });
      const binding = input.readiness.canaryMcpBinding({ canaryId: input.canaryId, leaseId: input.leaseId });
      handler = createRequestScopedReadinessMcpHandler({
        nonce: binding.nonce,
        onProbe: async (probe) => { binding.onProbe(probe); await input.onProbe(); },
      });
      const body = await readJson(request);
      observed = observedMcpMethod(body); if (observed) mcpMethods.add(observed);
      const origin = 'http://127.0.0.1:4000';
      const result = await handler.fetch(new Request(`${origin}${request.url}`, {
        method: request.method,
        headers: request.headers as HeadersInit,
        body: JSON.stringify(body),
      }), { parsedBody: body });
      response.statusCode = result.status;
      if (observed) observations.push({ method: observed, status: result.status, protocolVersion });
      result.headers.forEach((value, name) => response.setHeader(name, value));
      response.end(Buffer.from(await result.arrayBuffer()));
    } catch {
      if (observed) observations.push({ method: observed, status: 401, protocolVersion });
      response.statusCode = 401; response.end();
    } finally {
      await handler?.close();
    }
  });
  server.listen(4000, '127.0.0.1');
  await once(server, 'listening');
  return {
    close: () => closeServer(server),
    get mcpMethods() { return [...mcpMethods]; },
    get observations() { return observations.map((value) => ({ ...value })); },
    get legacyNegotiationObserved() {
      return [...mcpMethods].some((value) => value.startsWith('initialize:') && value !== 'initialize:2026-07-28')
        || observations.some((value) => value.protocolVersion !== 'missing' && value.protocolVersion !== '2026-07-28');
    },
  };
}

type McpObservation = Readonly<{ method: string; status: number; protocolVersion: string }>;

function bearer(value: string | string[] | undefined): string {
  if (typeof value !== 'string' || !value.startsWith('Bearer ')) throw new Error('readiness_token_missing');
  const raw = value.slice('Bearer '.length).trim();
  if (!raw) throw new Error('readiness_token_missing');
  return raw;
}

async function readJson(request: AsyncIterable<Uint8Array>): Promise<unknown> {
  const chunks: Buffer[] = [];
  let bytes = 0;
  for await (const chunk of request) {
    bytes += chunk.byteLength;
    if (bytes > 64 * 1024) throw new Error('mcp_request_too_large');
    chunks.push(Buffer.from(chunk));
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

function closeServer(server: Server): Promise<void> {
  return new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
}

function observedMcpMethod(value: unknown): string | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const method = (value as { method?: unknown }).method;
  if (method === 'initialize') {
    const version = (value as { params?: { protocolVersion?: unknown } }).params?.protocolVersion;
    return typeof version === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(version) ? `initialize:${version}` : 'initialize:missing';
  }
  return method === 'notifications/initialized' || method === 'tools/list' || method === 'tools/call' ? method : null;
}

function observedProtocolVersion(value: string | string[] | undefined): string {
  const raw = typeof value === 'string' ? value : null;
  return raw && /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : 'missing';
}

function providerOnlyPrompt(): string {
  return CODEX_READINESS_PROVIDER_PROMPT;
}

async function waitFor(check: () => boolean | Promise<boolean>, timeout: number): Promise<void> {
  const deadline = Date.now() + timeout;
  while (!(await check())) {
    if (Date.now() >= deadline) throw new Error('real_canary_timeout');
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
}

type SafeProviderFailure =
  | 'unsupported_model'
  | 'auth_materialization_failed'
  | 'invalid_cli_option'
  | 'invalid_provider_config'
  | 'invalid_mcp_config'
  | 'invalid_rpc_contract'
  | 'mcp_negotiation_failed'
  | 'mcp_tool_allowlist_failed'
  | 'provider_turn_incomplete_before_probe'
  | 'runner_probe_dispatch_failed'
  | 'mcp_tool_call_failed'
  | 'network_service_unavailable'
  | `provider_exit_${number | 'signal'}`;

const OUTBOUND_READINESS_PROBE_METHOD = 'mcpServer/tool/call';

/**
 * Reads only a bounded provider-process diagnostic long enough to classify it;
 * it never stores, throws, or prints provider stderr, credentials, or tokens.
 */
class SafeProviderDiagnostic {
  private failure: SafeProviderFailure | null = null;
  private readonly appServerSignals = new Set<string>();
  private readonly outboundMethods = new Set<string>();

  observeStdout(value: string): void {
    // App-server stdout is JSON-RPC only. Inspect only the leading framing byte
    // and discard the chunk immediately; never retain model/provider payload.
    if (value.trimStart() && !value.trimStart().startsWith('{')) this.failure ??= 'invalid_rpc_contract';
    for (const line of value.split('\n')) this.observeAppServerRecord(line);
  }

  observeStderr(value: string): void {
    this.observeFailureText(value);
  }

  observeExit(exit: ProcessExit): void {
    this.failure ??= `provider_exit_${exit.code === null ? 'signal' : exit.code}`;
  }

  observeOutboundInput(value: string): void {
    for (const line of value.split('\n')) {
      const method = observedOutboundAppServerMethod(line);
      if (method) this.outboundMethods.add(method);
    }
  }

  appServerSummary(): string {
    return [...this.appServerSignals].sort().join(',') || 'none';
  }

  outboundSummary(): string {
    return [...this.outboundMethods].sort().join(',') || 'none';
  }

  terminalRuntimeErrorReport(input: Readonly<{
    terminal: Extract<RunnerEventBatch['events'][number], { kind: 'attempt.terminal' }> | undefined;
    observations: readonly McpObservation[];
  }>): string | null {
    if (input.terminal?.terminalReason !== 'runtime_error') return null;
    const observations = input.observations.map((value) => `${value.method}:${value.status}`).join(',') || 'none';
    return `app_server=${this.appServerSummary()} outbound=${this.outboundSummary()} observations=${observations}`;
  }

  externalBlocker(input: Readonly<{
    error: unknown;
    terminal: Extract<RunnerEventBatch['events'][number], { kind: 'attempt.terminal' }> | undefined;
    phase: string;
    observations: readonly McpObservation[];
    baselineFingerprint?: string | null;
  }>): 'unsupported_model' | 'auth_materialization_failed' | 'network_service_unavailable' | 'provider_baseline_correlated_failure' | null {
    const explicit = this.explicitExternalBlocker();
    if (explicit) return explicit;
    if (this.contractFailure(input)) return null;
    const fingerprint = this.opaqueFailureFingerprint(input.error, input.terminal);
    if (fingerprint && fingerprint === input.baselineFingerprint) return 'provider_baseline_correlated_failure';
    return null;
  }

  providerBaselineExternalBlocker(input: Readonly<{
    error: unknown;
    terminal: Extract<RunnerEventBatch['events'][number], { kind: 'attempt.terminal' }> | undefined;
  }>): 'unsupported_model' | 'auth_materialization_failed' | 'network_service_unavailable' | 'provider_reported_turn_failure' | 'provider_reported_stream_error' | 'model_service_timeout_without_mcp_requirement' | `provider_exit_${number | 'signal'}` | null {
    const explicit = this.explicitExternalBlocker();
    if (explicit) return explicit;
    if (this.contractFailure({ error: input.error, phase: 'provider_start', observations: [] })) return null;
    if (this.appServerSignals.has('turn_completed_failed') || this.appServerSignals.has('turn_completed_cancelled') || this.appServerSignals.has('turn_completed_interrupted')) {
      return 'provider_reported_turn_failure';
    }
    if ([...this.appServerSignals].some((signal) => signal.startsWith('rpc_error'))) return 'provider_reported_stream_error';
    if (input.error instanceof Error && input.error.message === 'real_canary_timeout' && !input.terminal) {
      return 'model_service_timeout_without_mcp_requirement';
    }
    return providerExitFailure(this.failure);
  }

  baselineFingerprint(input: Readonly<{
    error: unknown;
    terminal: Extract<RunnerEventBatch['events'][number], { kind: 'attempt.terminal' }> | undefined;
  }>): string | null {
    if (this.contractFailure({ error: input.error, phase: 'provider_start', observations: [] })) return null;
    return this.opaqueFailureFingerprint(input.error, input.terminal);
  }

  contractFailure(input: Readonly<{ error: unknown; phase: string; observations: readonly McpObservation[] }>): SafeProviderFailure | null {
    if (
      this.failure === 'invalid_cli_option' || this.failure === 'invalid_provider_config' ||
      this.failure === 'invalid_mcp_config' || this.failure === 'invalid_rpc_contract' ||
      this.failure === 'mcp_negotiation_failed' || this.failure === 'mcp_tool_allowlist_failed'
    ) {
      return this.failure;
    }
    const hasModernList = input.observations.some((value) =>
      value.method === 'tools/list' && value.status === 200 && value.protocolVersion === '2026-07-28',
    );
    const hasModernCall = input.observations.some((value) =>
      value.method === 'tools/call' && value.status === 200 && value.protocolVersion === '2026-07-28',
    );
    if (input.phase === 'mcp_probe' && hasModernList && !hasModernCall) {
      if (!this.appServerSignals.has('turn_completed_completed')) return 'provider_turn_incomplete_before_probe';
      if (!this.outboundMethods.has(OUTBOUND_READINESS_PROBE_METHOD)) return 'runner_probe_dispatch_failed';
      return 'mcp_tool_call_failed';
    }
    if (
      input.phase === 'mcp_probe' && input.error instanceof Error && input.error.message === 'real_canary_timeout' &&
      (
        input.observations.some((value) => (value.method.startsWith('initialize:') && value.method !== 'initialize:2026-07-28') || (value.protocolVersion !== 'missing' && value.protocolVersion !== '2026-07-28')) ||
        input.observations.some((value) => value.status !== 200) ||
        (input.observations.length > 0 && !input.observations.some((value) => value.method === 'tools/list' && value.status === 200 && value.protocolVersion === '2026-07-28'))
      )
    ) return 'mcp_negotiation_failed';
    return null;
  }

  private explicitExternalBlocker(): 'unsupported_model' | 'auth_materialization_failed' | 'network_service_unavailable' | null {
    if (this.failure === 'unsupported_model' || this.failure === 'auth_materialization_failed' || this.failure === 'network_service_unavailable') {
      return this.failure;
    }
    return null;
  }

  private opaqueFailureFingerprint(
    error: unknown,
    terminal: Extract<RunnerEventBatch['events'][number], { kind: 'attempt.terminal' }> | undefined,
  ): string | null {
    const signals = [...this.appServerSignals]
      .filter((signal) => signal.startsWith('turn_completed_') || signal.startsWith('rpc_error'))
      .sort();
    const exit = providerExitFailure(this.failure);
    if (signals.length || exit) return [...signals, ...(exit ? [exit] : [])].join('|');
    if (error instanceof Error && error.message === 'real_canary_timeout' && !terminal) return 'provider_timeout';
    return null;
  }

  private observeFailureText(value: string): void {
    const bounded = value.slice(0, 8_192).toLowerCase();
    if (matches(bounded, ['unknown option', 'unknown argument', 'invalid option', 'invalid argument', 'commandererror', 'commander error'])) {
      this.failure ??= 'invalid_cli_option'; return;
    }
    if (matches(bounded, ['allowedtools', 'allowed tools', 'tool not allowed', 'tool is not allowed', 'tool not permitted'])) {
      this.failure ??= 'mcp_tool_allowlist_failed'; return;
    }
    if (matches(bounded, ['mcp_servers', 'mcp server', 'bearer_token_env_var', 'mcp config'])) {
      this.failure ??= 'invalid_mcp_config'; return;
    }
    if (matches(bounded, ['unknown field', 'strict config', 'toml', 'config error', 'invalid configuration'])) {
      this.failure ??= 'invalid_provider_config'; return;
    }
    if (matches(bounded, ['json-rpc', 'jsonrpc', 'thread/start', 'turn/start', 'rpc error'])) {
      this.failure ??= 'invalid_rpc_contract'; return;
    }
    if (matches(bounded, ['mcp protocol', 'mcp negotiation', 'tools/list', 'initialize request', 'protocol version'])) {
      this.failure ??= 'mcp_negotiation_failed'; return;
    }
    if (matches(bounded, [
      'unsupported model', 'unknown model', 'model not found', 'invalid model',
      'model is not supported', 'model is unsupported', 'model cannot be used',
    ])) {
      this.failure ??= 'unsupported_model'; return;
    }
    if (matches(bounded, ['authentication', 'unauthorized', 'credentials', 'login required', 'not logged in'])) {
      this.failure ??= 'auth_materialization_failed'; return;
    }
    if (matches(bounded, ['network', 'connection refused', 'connection reset', 'timed out', 'timeout', 'dns', 'rate limit', 'http 5', 'http 429'])) {
      this.failure ??= 'network_service_unavailable';
    }
  }

  private observeAppServerRecord(line: string): void {
    const trimmed = line.trim();
    if (!trimmed.startsWith('{') || trimmed.length > 64 * 1024) return;
    let record: { method?: unknown; params?: unknown; error?: unknown };
    try { record = JSON.parse(trimmed) as { method?: unknown; params?: unknown; error?: unknown }; } catch { return; }
    if (record.method === 'turn/completed') {
      const status = objectValue(record.params)?.turn;
      const value = objectValue(status)?.status;
      if (value === 'completed' || value === 'failed' || value === 'interrupted') {
        this.appServerSignals.add(`turn_completed_${value}`);
        if (value === 'failed') this.observeFailureText(JSON.stringify(status));
      }
      return;
    }
    if (!record.error) return;
    this.observeFailureText(JSON.stringify(record.error));
    const code = objectValue(record.error)?.code;
    if (typeof code === 'number' && Number.isSafeInteger(code)) this.appServerSignals.add(`rpc_error_${code}`);
    else this.appServerSignals.add('rpc_error');
  }
}

function providerExitFailure(value: SafeProviderFailure | null): `provider_exit_${number | 'signal'}` | null {
  return value && /^provider_exit_(?:\d+|signal)$/.test(value)
    ? value as `provider_exit_${number | 'signal'}`
    : null;
}

function objectValue(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function observedOutboundAppServerMethod(line: string): typeof OUTBOUND_READINESS_PROBE_METHOD | null {
  const trimmed = line.trim();
  if (!trimmed.startsWith('{') || trimmed.length > 64 * 1024) return null;
  let record: { method?: unknown };
  try { record = JSON.parse(trimmed) as { method?: unknown }; } catch { return null; }
  return record.method === OUTBOUND_READINESS_PROBE_METHOD ? OUTBOUND_READINESS_PROBE_METHOD : null;
}

class DiagnosticMacosSupervisor implements ProcessSupervisor {
  constructor(
    private readonly diagnostic: SafeProviderDiagnostic,
    private readonly delegate: ProcessSupervisor = new MacosProcessSupervisor(),
  ) {}

  async launch(command: ProviderCommand, callbacks: ProcessCallbacks = {}): Promise<SupervisedProcess> {
    const supervised = await this.delegate.launch(command, {
      ...callbacks,
      onStdout: (value) => { this.diagnostic.observeStdout(value); callbacks.onStdout?.(value); },
      onStderr: (value) => { this.diagnostic.observeStderr(value); callbacks.onStderr?.(value); },
      onExit: (exit) => { this.diagnostic.observeExit(exit); callbacks.onExit?.(exit); },
    });
    return {
      input: async (value) => {
        this.diagnostic.observeOutboundInput(value);
        await supervised.input(value);
      },
      terminate: () => supervised.terminate(),
      onExit: (listener) => supervised.onExit(listener),
    };
  }

  shutdown(): Promise<void> { return this.delegate.shutdown(); }
}

function matches(value: string, patterns: readonly string[]): boolean {
  return patterns.some((pattern) => value.includes(pattern));
}
