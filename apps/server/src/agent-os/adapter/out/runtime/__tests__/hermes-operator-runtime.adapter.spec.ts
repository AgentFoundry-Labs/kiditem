import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AgentOsRuntimeError } from '../../../../domain/agent-os.errors';
import {
  HermesOperatorRuntimeAdapter,
  SpawnHermesProcessRunner,
  type HermesOperatorRuntimeInput,
  type HermesProcessRunner,
  type HermesProcessStartInput,
} from '../hermes-operator-runtime.adapter';
import type { HermesRuntimeProfile } from '../hermes-runtime-profile.service';

const originalEnv = { ...process.env };

const baseInput: HermesOperatorRuntimeInput = {
  organizationId: 'org-1',
  conversationId: 'conversation-1',
  requestId: 'request-1',
  runId: null,
  agentInstanceId: 'agent-instance-1',
  agentType: 'manager',
  taskSessionId: 'task-session-1',
  requestedByUserId: 'user-1',
  prompt: 'Return strict JSON only.',
  hermesPath: '/opt/homebrew/bin/hermes',
  hermesHome: '/tmp/kiditem-hermes-home',
  cwd: '/tmp/kiditem',
  timeoutMs: 12_000,
  model: 'anthropic/claude-sonnet-4',
  provider: 'openai-codex',
};

interface ProfileServiceLike {
  prepare: ReturnType<typeof vi.fn>;
}

const defaultProfile: HermesRuntimeProfile = {
  hermesHome: '/tmp/profile-home/org-org-1/session-task-session-1',
  configPath: '/tmp/profile-home/org-org-1/session-task-session-1/config.yaml',
  toolsets: ['skills'],
  env: {
    HERMES_HOME: '/tmp/profile-home/org-org-1/session-task-session-1',
    KIDITEM_AGENT_OS_ORGANIZATION_ID: 'org-1',
    KIDITEM_AGENT_OS_CONVERSATION_ID: 'conversation-1',
    KIDITEM_AGENT_OS_TASK_SESSION_ID: 'task-session-1',
    KIDITEM_AGENT_OS_REQUEST_ID: 'request-1',
    KIDITEM_AGENT_OS_RUN_ID: '',
    KIDITEM_AGENT_OS_AGENT_INSTANCE_ID: 'agent-instance-1',
    KIDITEM_AGENT_OS_AGENT_TYPE: 'manager',
    KIDITEM_AGENT_OS_REQUESTED_BY_USER_ID: 'user-1',
  },
};

function makeProfileService(
  profile: HermesRuntimeProfile = defaultProfile,
): ProfileServiceLike {
  return {
    prepare: vi.fn().mockResolvedValue(profile),
  };
}

function makeAdapter(
  runner: HermesProcessRunner,
  profileService: ProfileServiceLike = makeProfileService(),
): HermesOperatorRuntimeAdapter {
  const Adapter = HermesOperatorRuntimeAdapter as unknown as new (
    runner: HermesProcessRunner,
    profileService: ProfileServiceLike,
  ) => HermesOperatorRuntimeAdapter;
  return new Adapter(runner, profileService);
}

function successfulResult(stdout = '{"decisionType":"ask_user"}') {
  return {
    stdout,
    stderr: 'diagnostic output',
    exitCode: 0,
    signal: null,
    durationMs: 42,
    timedOut: false,
  };
}

function makeRunner(
  result = successfulResult(),
): HermesProcessRunner & { calls: HermesProcessStartInput[] } {
  const calls: HermesProcessStartInput[] = [];
  return {
    calls,
    run: vi.fn(async (input: HermesProcessStartInput) => {
      calls.push(input);
      return result;
    }),
  };
}

describe('HermesOperatorRuntimeAdapter', () => {
  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it('fails closed when no explicit model is supplied', async () => {
    const runner = makeRunner();
    const profileService = makeProfileService();
    const adapter = makeAdapter(runner, profileService);

    await expect(
      adapter.decide({ ...baseInput, model: '   ' }),
    ).rejects.toEqual(
      new AgentOsRuntimeError(
        'operator_runtime_model_required',
        'Hermes Operator runtime requires an explicit model.',
      ),
    );
    expect(runner.run).not.toHaveBeenCalled();
    expect(profileService.prepare).not.toHaveBeenCalled();
  });

  it('invokes hermes chat -q with model, toolsets, cwd, timeout, and runtime env', async () => {
    const runner = makeRunner();
    const adapter = makeAdapter(runner);

    const result = await adapter.decide({
      ...baseInput,
      toolsets: ['skills', 'ops'],
    });

    expect(runner.run).toHaveBeenCalledWith(
      {
        command: '/opt/homebrew/bin/hermes',
        args: [
          'chat',
          '-q',
          'Return strict JSON only.',
          '--model',
          'anthropic/claude-sonnet-4',
          '--toolsets',
          'skills,ops',
          '-Q',
          '--ignore-rules',
          '--provider',
          'openai-codex',
        ],
        cwd: '/tmp/kiditem',
        env: expect.objectContaining({
          HERMES_HOME: '/tmp/profile-home/org-org-1/session-task-session-1',
          HERMES_INFERENCE_MODEL: 'anthropic/claude-sonnet-4',
          HERMES_INFERENCE_PROVIDER: 'openai-codex',
          KIDITEM_AGENT_OS_ORGANIZATION_ID: 'org-1',
          KIDITEM_AGENT_OS_CONVERSATION_ID: 'conversation-1',
          KIDITEM_AGENT_OS_TASK_SESSION_ID: 'task-session-1',
          KIDITEM_AGENT_OS_REQUEST_ID: 'request-1',
          KIDITEM_AGENT_OS_RUN_ID: '',
          KIDITEM_AGENT_OS_AGENT_INSTANCE_ID: 'agent-instance-1',
          KIDITEM_AGENT_OS_AGENT_TYPE: 'manager',
          KIDITEM_AGENT_OS_REQUESTED_BY_USER_ID: 'user-1',
        }),
      },
      12_000,
    );
    expect(result).toEqual({
      provider: 'hermes',
      rawOutput: '{"decisionType":"ask_user"}',
      stderr: 'diagnostic output',
      durationMs: 42,
      sessionId: null,
      inputTokens: undefined,
      outputTokens: undefined,
      cachedInputTokens: undefined,
      costMicros: undefined,
      transcriptEvents: [
        {
          type: 'assistant',
          message: '{"decisionType":"ask_user"}',
          data: { line: 1, durationMs: 42 },
        },
      ],
    });
  });

  it('returns parsed session id, token usage, and cost metadata', async () => {
    const runner = makeRunner(
      successfulResult(
        [
          'session_id: hermes-session-999',
          '{"type":"token_usage","input_tokens":41,"output_tokens":9,"cached_input_tokens":3,"cost_micros":"1200"}',
          '{"decisionType":"delegate","targetAgentType":"sourcing"}',
        ].join('\n'),
      ),
    );
    const adapter = makeAdapter(runner);

    const result = await adapter.decide(baseInput);

    expect(result).toEqual({
      provider: 'hermes',
      rawOutput: '{"decisionType":"delegate","targetAgentType":"sourcing"}',
      stderr: 'diagnostic output',
      durationMs: 42,
      sessionId: 'hermes-session-999',
      inputTokens: 41,
      outputTokens: 9,
      cachedInputTokens: 3,
      costMicros: 1200n,
      transcriptEvents: [
        {
          type: 'assistant',
          message: '{"decisionType":"delegate","targetAgentType":"sourcing"}',
          data: { line: 3, durationMs: 42 },
        },
      ],
    });
  });

  it('returns stderr metadata without treating stderr text as final output', async () => {
    const runner = makeRunner({
      ...successfulResult('Operator finished.'),
      stderr: [
        'session_id: hermes-session-stderr',
        '{"type":"token_usage","input_tokens":5,"output_tokens":2,"cached_input_tokens":1,"cost_micros":"17"}',
        'diagnostic output that should stay out of final text',
      ].join('\n'),
    });
    const adapter = makeAdapter(runner);

    const result = await adapter.decide(baseInput);

    expect(result).toEqual({
      provider: 'hermes',
      rawOutput: 'Operator finished.',
      stderr: [
        'session_id: hermes-session-stderr',
        '{"type":"token_usage","input_tokens":5,"output_tokens":2,"cached_input_tokens":1,"cost_micros":"17"}',
        'diagnostic output that should stay out of final text',
      ].join('\n'),
      durationMs: 42,
      sessionId: 'hermes-session-stderr',
      inputTokens: 5,
      outputTokens: 2,
      cachedInputTokens: 1,
      costMicros: 17n,
      transcriptEvents: [
        {
          type: 'assistant',
          message: 'Operator finished.',
          data: { line: 1, durationMs: 42 },
        },
      ],
    });
  });

  it('passes --resume when a Hermes session id is available', async () => {
    const runner = makeRunner();
    const adapter = makeAdapter(runner);

    await adapter.decide({
      ...baseInput,
      resumeSessionId: 'hermes-session-existing',
    });

    expect(runner.calls[0]?.args).toEqual([
      'chat',
      '-q',
      'Return strict JSON only.',
      '--model',
      'anthropic/claude-sonnet-4',
      '--toolsets',
      'skills',
      '-Q',
      '--ignore-rules',
      '--resume',
      'hermes-session-existing',
      '--provider',
      'openai-codex',
    ]);
  });

  it('fails closed when KidItem MCP is mixed with other Hermes toolsets', async () => {
    const runner = makeRunner();
    const adapter = makeAdapter(runner);

    await expect(
      adapter.decide({
        ...baseInput,
        toolsets: ['skills', 'kiditem-agent-os'],
      }),
    ).rejects.toEqual(
      new AgentOsRuntimeError(
        'operator_runtime_mixed_toolsets_denied',
        'KidItem Agent OS MCP sessions must use the kiditem-agent-os toolset alone.',
      ),
    );

    expect(runner.run).not.toHaveBeenCalled();
  });

  it('prepares an isolated profile and merges profile env into the subprocess env', async () => {
    const runner = makeRunner();
    const profileService = makeProfileService({
      ...defaultProfile,
      toolsets: ['skills', 'profile-extra'],
    });
    const adapter = makeAdapter(runner, profileService);

    await adapter.decide({
      ...baseInput,
      toolsets: undefined,
      env: {
        CUSTOM_SAFE_ENV: 'allowed',
        CUSTOM_API_KEY: 'custom-api-key-secret',
      },
    });

    expect(profileService.prepare).toHaveBeenCalledWith({
      organizationId: 'org-1',
      conversationId: 'conversation-1',
      requestId: 'request-1',
      runId: null,
      agentInstanceId: 'agent-instance-1',
      agentType: 'manager',
      taskSessionId: 'task-session-1',
      requestedByUserId: 'user-1',
    });
    expect(runner.calls[0]?.args).toEqual([
      'chat',
      '-q',
      'Return strict JSON only.',
      '--model',
      'anthropic/claude-sonnet-4',
      '--toolsets',
      'skills,profile-extra',
      '-Q',
      '--ignore-rules',
      '--provider',
      'openai-codex',
    ]);
    expect(runner.calls[0]?.env).toMatchObject({
      CUSTOM_SAFE_ENV: 'allowed',
      HERMES_HOME: '/tmp/profile-home/org-org-1/session-task-session-1',
      HERMES_INFERENCE_MODEL: 'anthropic/claude-sonnet-4',
      HERMES_INFERENCE_PROVIDER: 'openai-codex',
      KIDITEM_AGENT_OS_ORGANIZATION_ID: 'org-1',
      KIDITEM_AGENT_OS_CONVERSATION_ID: 'conversation-1',
      KIDITEM_AGENT_OS_TASK_SESSION_ID: 'task-session-1',
      KIDITEM_AGENT_OS_REQUEST_ID: 'request-1',
      KIDITEM_AGENT_OS_RUN_ID: '',
      KIDITEM_AGENT_OS_AGENT_INSTANCE_ID: 'agent-instance-1',
      KIDITEM_AGENT_OS_AGENT_TYPE: 'manager',
      KIDITEM_AGENT_OS_REQUESTED_BY_USER_ID: 'user-1',
    });
    expect(runner.calls[0]?.env.CUSTOM_API_KEY).toBeUndefined();
  });

  it('uses default toolsets when none are supplied', async () => {
    const runner = makeRunner();
    const adapter = makeAdapter(runner);

    await adapter.decide(baseInput);

    expect(runner.calls[0]?.args).toEqual([
      'chat',
      '-q',
      'Return strict JSON only.',
      '--model',
      'anthropic/claude-sonnet-4',
      '--toolsets',
      'skills',
      '-Q',
      '--ignore-rules',
      '--provider',
      'openai-codex',
    ]);
  });

  it('strips Hermes quiet-mode stdout metadata before returning raw output', async () => {
    const runner = makeRunner(
      successfulResult(`session_id: 20260604_082943_284216
{"decisionType":"ask_user","question":"어떤 카테고리로 볼까요?","reason":"카테고리 확인이 필요합니다."}
`),
    );
    const adapter = makeAdapter(runner);

    const result = await adapter.decide(baseInput);

    expect(result.rawOutput).toBe(
      '{"decisionType":"ask_user","question":"어떤 카테고리로 볼까요?","reason":"카테고리 확인이 필요합니다."}',
    );
  });

  it('builds subprocess env from an allowlist plus safe input env and excludes input secrets', async () => {
    process.env = {
      PATH: '/usr/local/bin:/usr/bin',
      CUSTOM_SAFE_ENV: 'allowed',
      OPENAI_API_KEY: 'sk-process-secret',
      ANTHROPIC_API_KEY: 'sk-ant-process-secret',
      AWS_SECRET_ACCESS_KEY: 'aws-process-secret',
      GITHUB_TOKEN: 'github-process-secret',
      SECRET_TOKEN: 'secret-token-process',
    };
    const runner = makeRunner();
    const profileEnvWithoutRequestedByUserId = { ...defaultProfile.env };
    delete profileEnvWithoutRequestedByUserId[
      'KIDITEM_AGENT_OS_REQUESTED_BY_USER_ID'
    ];
    const adapter = makeAdapter(
      runner,
      makeProfileService({
        ...defaultProfile,
        env: profileEnvWithoutRequestedByUserId,
      }),
    );

    await adapter.decide({
      ...baseInput,
      hermesHome: undefined,
      requestedByUserId: null,
      env: {
        ...process.env,
        CUSTOM_API_KEY: 'custom-api-key-secret',
        CUSTOM_TOKEN: 'custom-token-secret',
        NON_STRING_ENV: 42,
        HERMES_HOME: '/tmp/not-from-source-env',
        HERMES_INFERENCE_PROVIDER: 'anthropic',
      } as unknown as Record<string, string>,
    });

    const env = runner.calls[0]?.env;
    expect(env).toMatchObject({
      PATH: '/usr/local/bin:/usr/bin',
      CUSTOM_SAFE_ENV: 'allowed',
      HERMES_HOME: '/tmp/profile-home/org-org-1/session-task-session-1',
      HERMES_INFERENCE_MODEL: 'anthropic/claude-sonnet-4',
      HERMES_INFERENCE_PROVIDER: 'openai-codex',
    });
    expect(env?.OPENAI_API_KEY).toBeUndefined();
    expect(env?.ANTHROPIC_API_KEY).toBeUndefined();
    expect(env?.AWS_SECRET_ACCESS_KEY).toBeUndefined();
    expect(env?.GITHUB_TOKEN).toBeUndefined();
    expect(env?.SECRET_TOKEN).toBeUndefined();
    expect(env?.CUSTOM_API_KEY).toBeUndefined();
    expect(env?.CUSTOM_TOKEN).toBeUndefined();
    expect(env?.NON_STRING_ENV).toBeUndefined();
    expect(env?.KIDITEM_AGENT_OS_REQUESTED_BY_USER_ID).toBeUndefined();
  });

  it('does not pass server secrets to the Hermes subprocess when the KidItem MCP toolset is active', async () => {
    process.env = {
      ...originalEnv,
      PATH: '/usr/local/bin:/usr/bin',
      NODE_ENV: 'production',
      DATABASE_URL: 'postgresql://app:db-secret@db.example/kiditem',
      SUPABASE_URL: 'https://kiditem.supabase.co',
      S3_SECRET_KEY: 's3-secret',
      GEMINI_API_KEY: 'gemini-secret',
      NAVER_SEARCHAD_SECRET_KEY: 'naver-secret',
      TMAPI_TOKEN: 'tmapi-secret',
      AGENT_OS_OPERATOR_RUNTIME: 'hermes_tool_loop',
      AGENT_OS_HERMES_LEAF_AGENT_TYPES: 'sourcing,listing',
      AGENT_OS_HERMES_PROVIDER: 'openai-codex',
      AGENT_OS_HERMES_MODEL: 'gpt-5.5',
      AGENT_OS_HERMES_PATH: '/opt/homebrew/bin/hermes',
      AGENT_OS_HERMES_HOME: '/tmp/kiditem-hermes',
      AGENT_OS_HERMES_AUTH_HOME: '/Users/test/.hermes',
      AGENT_OS_HERMES_TIMEOUT_MS: '180000',
      AGENT_OS_HERMES_MAX_OUTPUT_BYTES: '524288',
      AGENT_OS_HERMES_MAX_CONCURRENT_RUNS: '1',
      OPENAI_API_KEY: 'sk-process-secret',
      ANTHROPIC_API_KEY: 'anthropic-process-secret',
      GITHUB_TOKEN: 'github-process-secret',
      AWS_SECRET_ACCESS_KEY: 'aws-secret',
    };
    const enabledRunner = makeRunner();
    const adapter = makeAdapter(
      enabledRunner,
      makeProfileService({
        ...defaultProfile,
        toolsets: ['kiditem-agent-os'],
      }),
    );

    await adapter.decide(baseInput);

    expect(enabledRunner.calls[0]?.env).toMatchObject({
      HERMES_HOME: '/tmp/profile-home/org-org-1/session-task-session-1',
      KIDITEM_AGENT_OS_ORGANIZATION_ID: 'org-1',
      KIDITEM_AGENT_OS_CONVERSATION_ID: 'conversation-1',
      KIDITEM_AGENT_OS_REQUEST_ID: 'request-1',
    });
    expect(enabledRunner.calls[0]?.env.NODE_ENV).toBeUndefined();
    expect(enabledRunner.calls[0]?.env.DATABASE_URL).toBeUndefined();
    expect(enabledRunner.calls[0]?.env.SUPABASE_URL).toBeUndefined();
    expect(enabledRunner.calls[0]?.env.S3_SECRET_KEY).toBeUndefined();
    expect(enabledRunner.calls[0]?.env.GEMINI_API_KEY).toBeUndefined();
    expect(enabledRunner.calls[0]?.env.NAVER_SEARCHAD_SECRET_KEY).toBeUndefined();
    expect(enabledRunner.calls[0]?.env.TMAPI_TOKEN).toBeUndefined();
    expect(enabledRunner.calls[0]?.env.AGENT_OS_HERMES_AUTH_HOME).toBeUndefined();
    expect(enabledRunner.calls[0]?.env.OPENAI_API_KEY).toBeUndefined();
    expect(enabledRunner.calls[0]?.env.ANTHROPIC_API_KEY).toBeUndefined();
    expect(enabledRunner.calls[0]?.env.GITHUB_TOKEN).toBeUndefined();
    expect(enabledRunner.calls[0]?.env.AWS_SECRET_ACCESS_KEY).toBeUndefined();

    const disabledRunner = makeRunner();
    const disabledAdapter = makeAdapter(disabledRunner);

    await disabledAdapter.decide(baseInput);

    expect(disabledRunner.calls[0]?.env.DATABASE_URL).toBeUndefined();
    expect(disabledRunner.calls[0]?.env.SUPABASE_URL).toBeUndefined();
    expect(disabledRunner.calls[0]?.env.S3_SECRET_KEY).toBeUndefined();
    expect(disabledRunner.calls[0]?.env.GEMINI_API_KEY).toBeUndefined();
    expect(
      disabledRunner.calls[0]?.env.AGENT_OS_HERMES_LEAF_AGENT_TYPES,
    ).toBeUndefined();
  });

  it('fails closed when the Hermes binary is missing', async () => {
    const missingBinary = Object.assign(new Error('spawn hermes ENOENT'), {
      code: 'ENOENT',
    });
    const runner: HermesProcessRunner = {
      run: vi.fn().mockRejectedValue(missingBinary),
    };
    const adapter = makeAdapter(runner);

    await expect(adapter.decide(baseInput)).rejects.toEqual(
      new AgentOsRuntimeError(
        'operator_runtime_unavailable',
        'Hermes runtime binary was not found. Set AGENT_OS_HERMES_PATH or install hermes.',
      ),
    );
  });

  it('maps a killed subprocess result to operator_runtime_timeout', async () => {
    const runner = makeRunner({
      stdout: '',
      stderr: 'timed out',
      exitCode: null,
      signal: 'SIGTERM',
      durationMs: 12_000,
      timedOut: true,
    });
    const adapter = makeAdapter(runner);

    await expect(adapter.decide(baseInput)).rejects.toEqual(
      new AgentOsRuntimeError(
        'operator_runtime_timeout',
        'Hermes Operator runtime timed out.',
      ),
    );
  });

  it('default process runner kills subprocesses when the timeout elapses', async () => {
    const runner = new SpawnHermesProcessRunner();

    const result = await runner.run(
      {
        command: process.execPath,
        args: ['-e', 'setTimeout(() => {}, 5_000)'],
        cwd: process.cwd(),
        env: { PATH: process.env.PATH ?? '' },
      },
      10,
    );

    expect(result.exitCode).toBeNull();
    expect(result.signal).toBe('SIGTERM');
    expect(result.timedOut).toBe(true);
  });

  it('default process runner escalates to SIGKILL when a subprocess traps SIGTERM', async () => {
    const runner = new SpawnHermesProcessRunner();

    const result = await runner.run(
      {
        command: process.execPath,
        args: [
          '-e',
          [
            "process.on('SIGTERM', () => process.stderr.write('trapped sigterm\\n'));",
            'setInterval(() => {}, 1_000);',
          ].join(''),
        ],
        cwd: process.cwd(),
        env: { PATH: process.env.PATH ?? '' },
      },
      1_000,
    );

    expect(result.exitCode).toBeNull();
    expect(result.signal).toBe('SIGKILL');
    expect(result.timedOut).toBe(true);
  });

  it('maps non-zero exit to a failed runtime error with redacted stderr', async () => {
    const runner = makeRunner({
      stdout: '',
      stderr:
        [
          [
            'ERROR: Authorization Bearer ey.secret sk-live-secret',
            'secret-token-runtime github_pat_runtime AKIAIOSFODNN7EXAMPLE',
            'AIzaSyRuntimeSecret xoxb-runtime-secret leaked.',
          ].join(' '),
          'OPENAI_API_KEY=sk-openai-secret',
          'ANTHROPIC_API_KEY=sk-ant-secret',
          'AWS_SECRET_ACCESS_KEY=aws-secret-value',
          'GITHUB_TOKEN=github-token-value',
          'CUSTOM_API_KEY=custom-api-key-value',
          'CUSTOM_SECRET_KEY=custom-secret-key-value',
          'STRIPE_SECRET_KEY=stripe-secret-key-value',
          'DATABASE_URL=postgresql://app:db-secret@localhost:5432/kiditem',
          'REDIS_URL=redis://:redis-secret@localhost:6379/0',
          'SENTRY_DSN=https://public:sentry-secret@sentry.example/1',
        ].join('\n'),
      exitCode: 2,
      signal: null,
      durationMs: 20,
      timedOut: false,
    });
    const adapter = makeAdapter(runner);

    try {
      await adapter.decide(baseInput);
      throw new Error('expected failure');
    } catch (error) {
      expect(error).toMatchObject({ code: 'operator_runtime_failed' });
      expect((error as Error).message).toContain('Bearer [REDACTED]');
      expect((error as Error).message).toContain('sk-[REDACTED]');
      expect((error as Error).message).toContain('secret-token-[REDACTED]');
      expect((error as Error).message).toContain('OPENAI_API_KEY=[REDACTED]');
      expect((error as Error).message).toContain(
        'ANTHROPIC_API_KEY=[REDACTED]',
      );
      expect((error as Error).message).toContain(
        'AWS_SECRET_ACCESS_KEY=[REDACTED]',
      );
      expect((error as Error).message).toContain('GITHUB_TOKEN=[REDACTED]');
      expect((error as Error).message).toContain('CUSTOM_API_KEY=[REDACTED]');
      expect((error as Error).message).toContain(
        'CUSTOM_SECRET_KEY=[REDACTED]',
      );
      expect((error as Error).message).toContain(
        'STRIPE_SECRET_KEY=[REDACTED]',
      );
      expect((error as Error).message).toContain('DATABASE_URL=[REDACTED]');
      expect((error as Error).message).toContain('REDIS_URL=[REDACTED]');
      expect((error as Error).message).toContain('SENTRY_DSN=[REDACTED]');
      expect((error as Error).message).not.toContain('ey.secret');
      expect((error as Error).message).not.toContain('sk-live-secret');
      expect((error as Error).message).not.toContain('secret-token-runtime');
      expect((error as Error).message).not.toContain('github_pat_runtime');
      expect((error as Error).message).not.toContain('AKIAIOSFODNN7EXAMPLE');
      expect((error as Error).message).not.toContain('AIzaSyRuntimeSecret');
      expect((error as Error).message).not.toContain('xoxb-runtime-secret');
      expect((error as Error).message).not.toContain('sk-openai-secret');
      expect((error as Error).message).not.toContain('sk-ant-secret');
      expect((error as Error).message).not.toContain('aws-secret-value');
      expect((error as Error).message).not.toContain('github-token-value');
      expect((error as Error).message).not.toContain('custom-api-key-value');
      expect((error as Error).message).not.toContain('custom-secret-key-value');
      expect((error as Error).message).not.toContain(
        'stripe-secret-key-value',
      );
      expect((error as Error).message).not.toContain('db-secret');
      expect((error as Error).message).not.toContain('redis-secret');
      expect((error as Error).message).not.toContain('sentry-secret');
    }
  });

  it('does not classify a non-timeout SIGTERM result as operator_runtime_timeout', async () => {
    const runner = makeRunner({
      stdout: '',
      stderr: 'terminated by operator',
      exitCode: null,
      signal: 'SIGTERM',
      durationMs: 120,
      timedOut: false,
    });
    const adapter = makeAdapter(runner);

    await expect(adapter.decide(baseInput)).rejects.toEqual(
      new AgentOsRuntimeError(
        'operator_runtime_failed',
        'terminated by operator',
      ),
    );
  });

  it('rejects successful runs with empty stdout', async () => {
    const runner = makeRunner({
      stdout: '  \n\t',
      stderr: '',
      exitCode: 0,
      signal: null,
      durationMs: 10,
      timedOut: false,
    });
    const adapter = makeAdapter(runner);

    await expect(adapter.decide(baseInput)).rejects.toEqual(
      new AgentOsRuntimeError(
        'operator_runtime_empty',
        'Hermes Operator runtime returned no final agent message.',
      ),
    );
  });

  it('caps stdout and stderr before returning or embedding them in errors', async () => {
    process.env.AGENT_OS_HERMES_MAX_OUTPUT_BYTES = '8';
    const successRunner = makeRunner({
      stdout: '1234567890',
      stderr: 'abcdefghij',
      exitCode: 0,
      signal: null,
      durationMs: 8,
      timedOut: false,
    });
    const successAdapter = makeAdapter(successRunner);

    await expect(successAdapter.decide(baseInput)).resolves.toMatchObject({
      rawOutput: '12345678',
      stderr: 'abcdefgh',
    });

    const failedRunner = makeRunner({
      stdout: '',
      stderr: 'abcdefghijkl secret-token-after-cap',
      exitCode: 1,
      signal: null,
      durationMs: 8,
      timedOut: false,
    });
    const failedAdapter = makeAdapter(failedRunner);

    try {
      await failedAdapter.decide(baseInput);
      throw new Error('expected failure');
    } catch (error) {
      expect(error).toMatchObject({ code: 'operator_runtime_failed' });
      expect((error as Error).message).toContain('abcdefgh');
      expect((error as Error).message).not.toContain('ijkl');
      expect((error as Error).message).not.toContain('secret-token-after-cap');
    }
  });

  it('caps output without splitting Korean UTF-8 characters', async () => {
    process.env.AGENT_OS_HERMES_MAX_OUTPUT_BYTES = '5';
    const runner = makeRunner({
      stdout: '한글',
      stderr: '가나다',
      exitCode: 0,
      signal: null,
      durationMs: 8,
      timedOut: false,
    });
    const adapter = makeAdapter(runner);

    await expect(adapter.decide(baseInput)).resolves.toMatchObject({
      rawOutput: '한',
      stderr: '가',
    });
  });

  it.each([
    [
      'runner rejection',
      () => Promise.reject(new Error('transport failed')),
      null,
      'transport failed',
    ],
    [
      'timeout',
      () =>
        Promise.resolve({
          stdout: '',
          stderr: 'timed out',
          exitCode: null,
          signal: 'SIGKILL',
          durationMs: 12_000,
          timedOut: true,
        }),
      'operator_runtime_timeout',
      null,
    ],
    [
      'nonzero exit',
      () =>
        Promise.resolve({
          stdout: '',
          stderr: 'boom',
          exitCode: 1,
          signal: null,
          durationMs: 20,
          timedOut: false,
        }),
      'operator_runtime_failed',
      null,
    ],
    [
      'empty stdout',
      () =>
        Promise.resolve({
          stdout: '  ',
          stderr: '',
          exitCode: 0,
          signal: null,
          durationMs: 10,
          timedOut: false,
        }),
      'operator_runtime_empty',
      null,
    ],
  ])(
    'releases the concurrency slot after %s',
    async (_caseName, failure, expectedCode, expectedMessage) => {
      process.env.AGENT_OS_HERMES_MAX_CONCURRENT_RUNS = '1';
      const runner: HermesProcessRunner = {
        run: vi
          .fn()
          .mockImplementationOnce(() => failure())
          .mockResolvedValueOnce(successfulResult()),
      };
      const adapter = makeAdapter(runner);

      if (expectedCode) {
        await expect(adapter.decide(baseInput)).rejects.toMatchObject({
          code: expectedCode,
        });
      } else {
        await expect(adapter.decide(baseInput)).rejects.toThrow(
          expectedMessage,
        );
      }
      await expect(adapter.decide(baseInput)).resolves.toMatchObject({
        provider: 'hermes',
      });
      expect(runner.run).toHaveBeenCalledTimes(2);
    },
  );

  it('fails closed with operator_runtime_busy at configured concurrency limit', async () => {
    process.env.AGENT_OS_HERMES_MAX_CONCURRENT_RUNS = '1';
    let releaseFirstRun!: () => void;
    const runner: HermesProcessRunner = {
      run: vi.fn(
        () =>
          new Promise((resolve) => {
            releaseFirstRun = () => resolve(successfulResult());
          }),
      ),
    };
    const adapter = makeAdapter(runner);

    const firstTurn = adapter.decide(baseInput);
    await vi.waitFor(() => expect(runner.run).toHaveBeenCalledTimes(1));

    await expect(adapter.decide(baseInput)).rejects.toEqual(
      new AgentOsRuntimeError(
        'operator_runtime_busy',
        'Hermes Operator runtime is already at its configured concurrency limit.',
      ),
    );

    releaseFirstRun();
    await expect(firstTurn).resolves.toMatchObject({ provider: 'hermes' });
    expect(runner.run).toHaveBeenCalledTimes(1);
  });
});
