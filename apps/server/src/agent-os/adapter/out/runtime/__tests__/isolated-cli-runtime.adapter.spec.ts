import { describe, expect, it, vi } from 'vitest';
import type { AgentDurableRuntimeExecutionContext } from '../../../../application/port/out/runtime/agent-durable-runtime.port';
import {
  IsolatedCliRuntimeAdapter,
  isolatedCliRunRootFromEnvironment,
  type IsolatedCliFilesystem,
  type IsolatedCliTransport,
} from '../isolated-cli-runtime.adapter';
import { CodexCliRuntimeAdapter } from '../codex-cli-runtime.adapter';
import { ClaudeCliRuntimeAdapter } from '../claude-cli-runtime.adapter';

const EXECUTION_ID = '11111111-1111-4111-8111-111111111111';
const ATTEMPT_ID = '22222222-2222-4222-8222-222222222222';

function context(attemptId = ATTEMPT_ID, runtimeType = 'codex_cli'): AgentDurableRuntimeExecutionContext {
  return {
    organizationId: '33333333-3333-4333-8333-333333333333',
    sessionId: '44444444-4444-4444-8444-444444444444',
    sessionTaskId: '55555555-5555-4555-8555-555555555555',
    executionId: EXECUTION_ID,
    attemptId,
    startIntentId: '88888888-8888-4888-8888-888888888888',
    runtimeCredentialGeneration: 0,
    agentDefinitionKey: 'operator',
    agentVersionId: '66666666-6666-4666-8666-666666666666',
    runtimeType,
    modelIdentity: 'model-1',
    capabilityKeys: ['analytics.readOverview'],
    policySnapshotId: '77777777-7777-4777-8777-777777777777',
    promptPackage: {
      prompt: 'prompt', promptSha256: 'a'.repeat(64),
      summaryPrompt: 'summary', summaryPromptSha256: 'b'.repeat(64),
      skills: [], outputSchema: null,
    },
    conversationView: { throughSequence: '1', summary: null, turns: [] },
    currentInput: {}, currentResourceRefs: [],
  };
}

function memoryFs(): IsolatedCliFilesystem & {
  writes: Map<string, { value: string; mode?: number }>;
  directories: Array<{ path: string; mode: number }>;
  chmod: ReturnType<typeof vi.fn>;
} {
  const writes = new Map<string, { value: string; mode?: number }>();
  const directories: Array<{ path: string; mode: number }> = [];
  return {
    writes, directories,
    mkdir: vi.fn(async (path, options) => { directories.push({ path, mode: options.mode }); }),
    writeFile: vi.fn(async (path, value, options) => { writes.set(path, { value, mode: options.mode }); }),
    chmod: vi.fn(async () => undefined),
  };
}

function transport(version = 'codex-cli 1.2.3'): IsolatedCliTransport {
  return {
    probeVersion: vi.fn().mockResolvedValue(version),
    start: vi.fn().mockResolvedValue({
      nativeSessionId: 'native-session-1', pid: 42,
      processStartIdentity: 'proc-start-42', reconnectSecret: 'resume-1', generation: 2,
    }),
    connect: vi.fn().mockReturnValue((async function* () {
      yield { kind: 'terminal', status: 'completed' as const, output: { ok: true } };
    })()),
    inspect: vi.fn().mockResolvedValue({ status: 'running' }),
    interrupt: vi.fn().mockResolvedValue(undefined),
    cancel: vi.fn().mockResolvedValue(undefined),
    readProcessStartIdentity: vi.fn().mockResolvedValue('proc-start-42'),
  };
}

describe('isolated CLI durable runtime', () => {
  it('creates attempt-isolated owner-only homes and strips ambient authority', async () => {
    const fs = memoryFs();
    const cli = transport();
    const originalHome = process.env.HOME;
    const adapter = new CodexCliRuntimeAdapter({
      filesystem: fs,
      transport: cli,
      runRoot: '/var/lib/kiditem-agent-runs',
      handleCipher: { encrypt: () => 'vault://cli/1', decrypt: () => 'resume-1' },
      runtimeCredential: () => 'runtime-token',
      mcpConfig: () => ({ schemaVersion: 1, servers: [] }),
      ambientEnv: {
        PATH: '/bin', LANG: 'ko_KR.UTF-8', HOME: '/operator',
        DATABASE_URL: 'postgres://secret', AWS_SECRET_ACCESS_KEY: 'cloud-secret',
        OPENAI_API_KEY: 'model-secret', ANTHROPIC_API_KEY: 'model-secret-2',
      },
    });
    await adapter.assertReady();
    const handle = await adapter.start(context());
    expect(cli.start).toHaveBeenCalledWith(expect.objectContaining({
      binary: 'codex',
      cwd: `/var/lib/kiditem-agent-runs/${EXECUTION_ID}/${ATTEMPT_ID}/work`,
      env: expect.objectContaining({
        HOME: `/var/lib/kiditem-agent-runs/${EXECUTION_ID}/${ATTEMPT_ID}/home`,
        KIDITEM_RUNTIME_CREDENTIAL: 'runtime-token',
      }),
    }));
    const childEnv = vi.mocked(cli.start).mock.calls[0][0].env;
    expect(childEnv).not.toHaveProperty('DATABASE_URL');
    expect(childEnv).not.toHaveProperty('AWS_SECRET_ACCESS_KEY');
    expect(childEnv).not.toHaveProperty('OPENAI_API_KEY');
    expect(childEnv).not.toHaveProperty('ANTHROPIC_API_KEY');
    expect(process.env.HOME).toBe(originalHome);
    expect(fs.directories.every((entry) => entry.mode === 0o700)).toBe(true);
    expect(fs.directories).toContainEqual({
      path: `/var/lib/kiditem-agent-runs/${EXECUTION_ID}/${ATTEMPT_ID}/home/.config`,
      mode: 0o700,
    });
    expect(fs.chmod).toHaveBeenCalledWith(
      `/var/lib/kiditem-agent-runs/${EXECUTION_ID}/${ATTEMPT_ID}/home`,
      0o700,
    );
    expect(fs.chmod).toHaveBeenCalledWith(
      `/var/lib/kiditem-agent-runs/${EXECUTION_ID}/${ATTEMPT_ID}/home/.config`,
      0o700,
    );
    expect([...fs.writes.values()].every((entry) => entry.mode === 0o600)).toBe(true);
    expect(handle).toMatchObject({
      externalRunId: 'native-session-1', encryptedHandleRef: 'vault://cli/1', generation: 2,
    });

    await adapter.start(context('88888888-8888-4888-8888-888888888888'));
    expect(vi.mocked(cli.start).mock.calls[1][0].cwd).not.toBe(vi.mocked(cli.start).mock.calls[0][0].cwd);
  });

  it('reconnects after recreation and rejects PID reuse before cancel', async () => {
    const fs = memoryFs();
    const cli = transport();
    const cipherValues = new Map([['vault://cli/1', JSON.stringify({
      reconnectSecret: 'resume-1', nativeSessionId: 'native-session-1', pid: 42,
      processStartIdentity: 'proc-start-42', executableVersion: 'codex-cli 1.2.3',
      organizationId: '33333333-3333-4333-8333-333333333333', sessionId: '44444444-4444-4444-8444-444444444444',
      startIntentId: '88888888-8888-4888-8888-888888888888', runtimeCredentialGeneration: 0,
      mcpToolSet: { schemaVersion: 1, servers: [] },
    })]]);
    const options = {
      filesystem: fs, transport: cli, runRoot: '/tmp/runs', ambientEnv: { PATH: '/bin' },
      handleCipher: {
        encrypt: vi.fn(() => 'vault://cli/1'),
        decrypt: vi.fn((ref: string) => cipherValues.get(ref) ?? ''),
      },
      runtimeCredential: () => 'runtime-token',
      mcpConfig: () => ({ schemaVersion: 1 as const, servers: [] }),
    };
    const first = new CodexCliRuntimeAdapter(options);
    await first.assertReady();
    const handle = await first.start(context());
    const recreated = new CodexCliRuntimeAdapter(options);
    expect(await recreated.inspect(handle)).toEqual({ status: 'running' });
    const events = [];
    for await (const event of recreated.connect(handle)) events.push(event);
    expect(events).toHaveLength(1);
    await recreated.cancel(handle);
    expect(cli.cancel).toHaveBeenCalledTimes(1);
    vi.mocked(cli.readProcessStartIdentity).mockResolvedValueOnce('reused-pid-start');
    await expect(recreated.cancel({ ...handle, generation: 3 })).rejects.toThrow('CLI_PROCESS_IDENTITY_MISMATCH');
    expect(cli.cancel).toHaveBeenCalledTimes(1);
  });

  it('re-probes the exact CLI version before a recreated adapter resumes a native session', async () => {
    const fs = memoryFs();
    const initialCli = transport('codex-cli 1.2.3');
    const cipherValues = new Map([['vault://cli/1', JSON.stringify({
      reconnectSecret: 'resume-1', nativeSessionId: 'native-session-1', pid: 42,
      processStartIdentity: 'proc-start-42', executableVersion: 'codex-cli 1.2.3',
      organizationId: '33333333-3333-4333-8333-333333333333', sessionId: '44444444-4444-4444-8444-444444444444',
      startIntentId: '88888888-8888-4888-8888-888888888888', runtimeCredentialGeneration: 0,
      mcpToolSet: { schemaVersion: 1, servers: [] },
    })]]);
    const options = {
      filesystem: fs, transport: initialCli, runRoot: '/tmp/runs', ambientEnv: { PATH: '/bin' },
      handleCipher: {
        encrypt: vi.fn(() => 'vault://cli/1'),
        decrypt: vi.fn((ref: string) => cipherValues.get(ref) ?? ''),
      },
      runtimeCredential: () => 'runtime-token',
      mcpConfig: () => ({ schemaVersion: 1 as const, servers: [] }),
    };
    const first = new CodexCliRuntimeAdapter(options);
    await first.assertReady();
    const handle = await first.start(context());

    const upgradedCli = transport('codex-cli 1.2.4');
    const recreated = new CodexCliRuntimeAdapter({ ...options, transport: upgradedCli });
    await expect(recreated.inspect(handle)).rejects.toThrow(
      'CLI_RUNTIME_VERSION_CHANGED',
    );
    expect(upgradedCli.inspect).not.toHaveBeenCalled();
  });

  it('reissues an exact attempt credential and rewrites only the scoped MCP config before native resume', async () => {
    const fs = memoryFs();
    const cli = transport();
    const credentials = vi
      .fn()
      .mockReturnValueOnce('initial-attempt-credential')
      .mockReturnValueOnce('reconnect-attempt-credential');
    const cipherValues = new Map([['vault://cli/1', JSON.stringify({
      reconnectSecret: 'resume-1', nativeSessionId: 'native-session-1', pid: 42,
      processStartIdentity: 'proc-start-42', executableVersion: 'codex-cli 1.2.3',
      organizationId: '33333333-3333-4333-8333-333333333333', sessionId: '44444444-4444-4444-8444-444444444444',
      startIntentId: '88888888-8888-4888-8888-888888888888', runtimeCredentialGeneration: 0,
      mcpToolSet: {
        schemaVersion: 1,
        servers: [{ key: 'kiditem', tools: ['analytics_read_overview'] }],
      },
    })]]);
    const options = {
      filesystem: fs, transport: cli, runRoot: '/tmp/runs', ambientEnv: { PATH: '/bin' },
      handleCipher: {
        encrypt: vi.fn(() => 'vault://cli/1'),
        decrypt: vi.fn((ref: string) => cipherValues.get(ref) ?? ''),
      },
      runtimeCredential: credentials,
      mcpConfig: () => ({
        schemaVersion: 1 as const,
        servers: [{ key: 'kiditem', credential: 'initial-attempt-credential', tools: ['analytics_read_overview'] }],
      }),
    };
    const first = new CodexCliRuntimeAdapter(options);
    await first.assertReady();
    const handle = await first.start(context());
    const directoriesBeforeReconnect = fs.directories.length;

    const recreated = new CodexCliRuntimeAdapter(options);
    for await (const _event of recreated.connect(handle)) {
      // Fully drain the reconnect stream so its setup runs.
    }

    expect(credentials).toHaveBeenLastCalledWith({
      organizationId: '33333333-3333-4333-8333-333333333333',
      sessionId: '44444444-4444-4444-8444-444444444444',
      executionId: EXECUTION_ID,
      attemptId: ATTEMPT_ID,
      startIntentId: '88888888-8888-4888-8888-888888888888',
      runtimeCredentialGeneration: 0,
    });
    expect(vi.mocked(cli.connect).mock.calls[0][1]).toMatchObject({
      env: expect.objectContaining({
        KIDITEM_RUNTIME_CREDENTIAL: 'reconnect-attempt-credential',
      }),
    });
    expect(
      fs.writes.get(`/tmp/runs/${EXECUTION_ID}/${ATTEMPT_ID}/state/mcp.json`),
    ).toMatchObject({
      mode: 0o600,
      value: JSON.stringify({
        schemaVersion: 1,
        servers: [{
          key: 'kiditem',
          credential: 'reconnect-attempt-credential',
          tools: ['analytics_read_overview'],
        }],
      }),
    });
    expect(fs.directories.slice(directoriesBeforeReconnect)).toContainEqual({
      path: `/tmp/runs/${EXECUTION_ID}/${ATTEMPT_ID}/state`,
      mode: 0o700,
    });
  });

  it('accepts only an absolute worker-owned run root and a strict generated MCP config', async () => {
    expect(isolatedCliRunRootFromEnvironment({})).toBe(
      '/var/lib/kiditem-agent-runs',
    );
    expect(() => isolatedCliRunRootFromEnvironment({
      AGENT_DURABLE_RUNTIME_RUN_ROOT: 'relative-runs',
    })).toThrow('CLI_RUNTIME_RUN_ROOT_INVALID');

    const fs = memoryFs();
    const cli = transport();
    const adapter = new CodexCliRuntimeAdapter({
      filesystem: fs,
      transport: cli,
      runRoot: '/tmp/runs',
      handleCipher: { encrypt: (value) => value, decrypt: (value) => value },
      runtimeCredential: () => 'runtime-token',
      mcpConfig: () => ({
        schemaVersion: 1,
        servers: [{
          key: 'kiditem',
          credential: 'runtime-token',
          tools: ['analytics_read_overview'],
          untrustedServerOption: 'forbidden',
        }],
      } as never),
      ambientEnv: { PATH: '/bin' },
    });
    await adapter.assertReady();

    await expect(adapter.start(context())).rejects.toThrow();
    expect(cli.start).not.toHaveBeenCalled();
  });

  it('fails readiness for an incompatible exact CLI version without fallback', async () => {
    const adapter = new CodexCliRuntimeAdapter({
      filesystem: memoryFs(), transport: transport('codex-cli 0.1.0'), runRoot: '/tmp/runs',
      handleCipher: { encrypt: (value) => value, decrypt: (value) => value },
      runtimeCredential: () => 'runtime-token', mcpConfig: () => ({ schemaVersion: 1, servers: [] }),
      ambientEnv: { PATH: '/bin' },
    });
    await expect(adapter.assertReady()).rejects.toThrow('CLI_RUNTIME_VERSION_INCOMPATIBLE');
    await expect(adapter.start(context())).rejects.toThrow('CLI_RUNTIME_NOT_READY');
  });

  it('keeps Codex and Claude command/resume semantics exact and rejects unsafe binaries', () => {
    const common = {
      filesystem: memoryFs(), transport: transport(), runRoot: '/tmp/runs',
      handleCipher: { encrypt: (value: string) => value, decrypt: (value: string) => value },
      runtimeCredential: () => 'token', mcpConfig: () => ({ schemaVersion: 1 as const, servers: [] }),
      ambientEnv: { PATH: '/bin' },
    };
    expect(new CodexCliRuntimeAdapter(common).command()).toEqual({
      binary: 'codex', startArgs: ['exec', '--json'], resumeArgs: ['exec', 'resume', '--json'],
    });
    expect(new ClaudeCliRuntimeAdapter({ ...common, transport: transport('claude 2.3.4') }).command()).toEqual({
      binary: 'claude', startArgs: ['--print', '--output-format', 'stream-json'],
      resumeArgs: ['--resume', '--print', '--output-format', 'stream-json'],
    });
    expect(() => new IsolatedCliRuntimeAdapter({
      ...common,
      runtimeType: 'unsafe', binary: '/tmp/agent', allowedBinary: 'codex',
      versionPattern: /^codex-cli 1\./, startArgs: [], resumeArgs: [],
    })).toThrow('CLI_RUNTIME_BINARY_NOT_ALLOWLISTED');
  });
});
