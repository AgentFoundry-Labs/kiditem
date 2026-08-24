import { describe, expect, it } from 'vitest';
import {
  AttemptLaunchSpecSchema,
  LoopbackHttpUrlSchema,
  OpaqueBearerSchema,
  RunnerCommandBatchSchema,
  RunnerEventAcknowledgementSchema,
  RunnerEventBatchSchema,
  RunnerLeaseResponseSchema,
  RunnerPollRequestSchema,
} from './control';

const ATTEMPT_ID = '11111111-1111-4111-8111-111111111111';
const COMMAND_ID = '22222222-2222-4222-8222-222222222222';
const RUNNER_ID = '33333333-3333-4333-8333-333333333333';
const LEASE_ID = '44444444-4444-4444-8444-444444444444';
const ATTEMPT_TOKEN = 'a'.repeat(43);
const FORBIDDEN_CONTROL_PROPERTY_NAMES = [
  'command',
  'executable',
  'shell',
  'args',
  'env',
  'cwd',
  'path',
  'loginHome',
  'organization',
  'organizationId',
  'organizationAuthority',
  'user',
  'userId',
  'userAuthority',
  'session',
  'sessionId',
  'sessionAuthority',
  'signingSecret',
  'runnerCredential',
  'integrationPassword',
  'runnerPassphrase',
  'runnerAccessToken',
  'runnerBearerToken',
  'runnerOAuthToken',
  'runnerApiToken',
  'runnerApiKey',
  'runnerPrivateKey',
  'refreshToken',
  'connectionString',
  'connectionUrl',
  'connectionDsn',
] as const;

function validLaunch() {
  return {
    attemptId: ATTEMPT_ID,
    runtime: 'codex_cli',
    model: 'gpt-5.6',
    prompt: 'Inspect the current task and return a concise result.',
    workspacePolicy: 'empty_ephemeral_v1',
    timeoutMs: 30_000,
    mcpUrl: `http://127.0.0.1:4000/internal/agent-runtime/attempts/${ATTEMPT_ID}/mcp`,
    attemptToken: ATTEMPT_TOKEN,
    mcpToolScope: 'business',
    mcpProtocolRevision: '2026-07-28',
    cliContractIdentity: 'office-cli-contract-v2',
  };
}

function validHello() {
  return {
    kind: 'hello',
    runnerInstanceId: RUNNER_ID,
    platform: 'macos',
    nodeMajor: 22,
    controlRevision: 'kiditem-runner-control-v1',
    mcpProtocolRevision: '2026-07-28',
    cliContractIdentity: 'office-cli-contract-v2',
    runtimes: {
      codex_cli: {
        version: '0.149.1',
        loginVerified: true,
        nonPersistentSettingsVerified: true,
      },
      claude_cli: {
        version: '2.1.241',
        loginVerified: true,
        nonPersistentSettingsVerified: true,
      },
    },
  };
}

function validPoll() {
  return {
    kind: 'poll',
    runnerInstanceId: RUNNER_ID,
    leaseId: LEASE_ID,
  };
}

function validStartCommand() {
  return {
    kind: 'attempt.start',
    commandId: COMMAND_ID,
    attemptId: ATTEMPT_ID,
    deadlineAt: '2026-08-24T01:00:00.000Z',
    commandHash: 'a'.repeat(64),
    launch: validLaunch(),
  };
}

function validOutputEvent(output = 'partial response') {
  return {
    kind: 'attempt.output',
    attemptId: ATTEMPT_ID,
    output,
  };
}

describe('native Runner control protocol', () => {
  it('accepts only the exact opaque bearer form', () => {
    expect(OpaqueBearerSchema.safeParse(ATTEMPT_TOKEN).success).toBe(true);
    expect(OpaqueBearerSchema.safeParse(`${ATTEMPT_TOKEN}=`).success).toBe(false);
    expect(OpaqueBearerSchema.safeParse('a'.repeat(42)).success).toBe(false);
  });

  it('accepts only the fixed unauthenticated sibling HTTP MCP endpoint', () => {
    for (const value of [
      `http://127.0.0.1:4000/internal/agent-runtime/attempts/${ATTEMPT_ID}/mcp`,
    ]) {
      expect(LoopbackHttpUrlSchema.safeParse(value).success).toBe(true);
    }

    for (const value of [
      `http://127.0.0.1:4401/api/internal/agent-runtime/attempts/${ATTEMPT_ID}/mcp`,
      `http://127.0.0.1:4000/api/internal/agent-runtime/attempts/${ATTEMPT_ID}/mcp`,
      `http://[::1]:4000/internal/agent-runtime/attempts/${ATTEMPT_ID}/mcp`,
      `https://127.0.0.1:4000/internal/agent-runtime/attempts/${ATTEMPT_ID}/mcp`,
      `http://localhost:4000/internal/agent-runtime/attempts/${ATTEMPT_ID}/mcp`,
      `http://192.168.1.10:4000/internal/agent-runtime/attempts/${ATTEMPT_ID}/mcp`,
      `http://runner:secret@127.0.0.1:4000/internal/agent-runtime/attempts/${ATTEMPT_ID}/mcp`,
      `http://127.0.0.1:4000/internal/agent-runtime/attempts/${ATTEMPT_ID}/mcp?trace=1`,
      `http://127.0.0.1:4000/internal/agent-runtime/attempts/${ATTEMPT_ID}/mcp#fragment`,
      '',
      'not a url',
    ]) {
      expect(() => LoopbackHttpUrlSchema.safeParse(value)).not.toThrow();
      expect(LoopbackHttpUrlSchema.safeParse(value).success).toBe(false);
    }
  });

  it.each([
    ['hello', validHello()],
    ['poll', validPoll()],
  ] as const)('accepts the valid %s Runner request discriminant', (_kind, request) => {
    expect(RunnerPollRequestSchema.safeParse(request).success).toBe(true);
  });

  it('strictly accepts the supported Runner lease response', () => {
    expect(
      RunnerLeaseResponseSchema.safeParse({
        runnerInstanceId: RUNNER_ID,
        leaseId: LEASE_ID,
        status: 'probing',
        leaseTtlMs: 30_000,
        controlRevision: 'kiditem-runner-control-v1',
      }).success,
    ).toBe(true);
    expect(
      RunnerPollRequestSchema.safeParse({ ...validHello(), unknown: true }).success,
    ).toBe(false);
  });

  it.each(FORBIDDEN_CONTROL_PROPERTY_NAMES)(
    'recursively rejects the forbidden control property name %s',
    (propertyName) => {
      expect(
        RunnerEventBatchSchema.safeParse({
          runnerInstanceId: RUNNER_ID,
          leaseId: LEASE_ID,
          eventSeq: 1,
          events: [
            {
              kind: 'attempt.terminal',
              attemptId: ATTEMPT_ID,
              terminalReason: 'success',
              result: {
                outcome: 'completed',
                summary: 'Done.',
                resourceRefs: [],
                operationRefs: [],
                output: { nested: { [propertyName]: 'never accepted' } },
              },
            },
          ],
        }).success,
      ).toBe(false);
    },
  );

  it('rejects unknown control fields while preserving legitimate protocol identifiers', () => {
    expect(
      AttemptLaunchSpecSchema.safeParse({ ...validLaunch(), path: '/tmp/attempt' }).success,
    ).toBe(false);
    expect(
      RunnerPollRequestSchema.safeParse({
        ...validHello(),
        runtimes: {
          ...validHello().runtimes,
          codex_cli: {
            ...validHello().runtimes.codex_cli,
            loginHome: '/Users/runner',
          },
        },
      }).success,
    ).toBe(false);
    expect(
      RunnerEventBatchSchema.safeParse({
        runnerInstanceId: RUNNER_ID,
        leaseId: LEASE_ID,
        eventSeq: 1,
        events: [
          {
            kind: 'attempt.terminal',
            attemptId: ATTEMPT_ID,
            terminalReason: 'success',
            result: {
              outcome: 'completed',
              summary: 'Done.',
              resourceRefs: [],
              operationRefs: [],
              output: {
                nested: {
                  eventHash: 'event-hash',
                  bodyHash: 'body-hash',
                  contentHash: 'content-hash',
                  resultHash: 'result-hash',
                  hmacDigest: 'non-secret-digest',
                  commandId: COMMAND_ID,
                  workspacePolicy: 'empty_ephemeral_v1',
                  attemptToken: ATTEMPT_TOKEN,
                },
              },
            },
          },
        ],
      }).success,
    ).toBe(true);
  });

  it('requires an explicit business or readiness-only MCP tool scope on every launch', () => {
    expect(AttemptLaunchSpecSchema.safeParse({ ...validLaunch(), mcpToolScope: 'business' }).success).toBe(true);
    expect(AttemptLaunchSpecSchema.safeParse({ ...validLaunch(), mcpToolScope: 'readiness_canary' }).success).toBe(true);
    expect(AttemptLaunchSpecSchema.safeParse({ ...validLaunch(), mcpToolScope: 'all_tools' }).success).toBe(false);
    const { mcpToolScope: _scope, ...withoutScope } = validLaunch();
    expect(AttemptLaunchSpecSchema.safeParse(withoutScope).success).toBe(false);
  });

  it.each([
    ['model minimum', { model: '' }, false],
    ['model maximum', { model: 'm'.repeat(256) }, true],
    ['model above maximum', { model: 'm'.repeat(257) }, false],
    ['prompt minimum', { prompt: '' }, false],
    ['prompt maximum', { prompt: 'p'.repeat(24_000) }, true],
    ['prompt above maximum', { prompt: 'p'.repeat(24_001) }, false],
    ['timeout below minimum', { timeoutMs: 999 }, false],
    ['timeout minimum', { timeoutMs: 1_000 }, true],
    ['timeout maximum', { timeoutMs: 30 * 60_000 }, true],
    ['timeout above maximum', { timeoutMs: 30 * 60_000 + 1 }, false],
    ['workspace literal', { workspacePolicy: 'empty_ephemeral_v1' }, true],
    ['unknown workspace literal', { workspacePolicy: 'client_path' }, false],
    ['protocol revision', { mcpProtocolRevision: '2026-07-28' }, true],
    ['unknown protocol revision', { mcpProtocolRevision: '2026-07-29' }, false],
    ['CLI contract identity', { cliContractIdentity: 'office-cli-contract-v2' }, true],
    ['unknown CLI contract identity', { cliContractIdentity: 'office-cli-contract-v3' }, false],
  ] as const)(
    'enforces the launch %s boundary',
    (_name, override, expected) => {
      expect(AttemptLaunchSpecSchema.safeParse({ ...validLaunch(), ...override }).success).toBe(
        expected,
      );
    },
  );

  it.each([
    [8, true],
    [9, false],
  ])('bounds start command batches to %i entries', (size, expected) => {
    const command = validStartCommand();
    expect(
      RunnerCommandBatchSchema.safeParse({ commands: Array.from({ length: size }, () => command) })
        .success,
    ).toBe(expected);
  });

  it('bounds individual and aggregate live output to 128 KiB', () => {
    const kib = 1024;
    const atLimit = 'x'.repeat(128 * kib);
    expect(
      RunnerEventBatchSchema.safeParse({
        runnerInstanceId: RUNNER_ID,
        leaseId: LEASE_ID,
        eventSeq: 1,
        events: [validOutputEvent(atLimit)],
      }).success,
    ).toBe(true);
    expect(
      RunnerEventBatchSchema.safeParse({
        runnerInstanceId: RUNNER_ID,
        leaseId: LEASE_ID,
        eventSeq: 1,
        events: [validOutputEvent(`${atLimit}x`)],
      }).success,
    ).toBe(false);
    expect(
      RunnerEventBatchSchema.safeParse({
        runnerInstanceId: RUNNER_ID,
        leaseId: LEASE_ID,
        eventSeq: 1,
        events: [validOutputEvent('x'.repeat(70 * kib)), validOutputEvent('x'.repeat(70 * kib))],
      }).success,
    ).toBe(false);
  });

  it.each([
    [32, true],
    [33, false],
  ])('bounds event batches to %i entries', (size, expected) => {
    expect(
      RunnerEventBatchSchema.safeParse({
        runnerInstanceId: RUNNER_ID,
        leaseId: LEASE_ID,
        eventSeq: 1,
        events: Array.from({ length: size }, () => validOutputEvent()),
      }).success,
    ).toBe(expected);
  });

  it('parses terminal results through AgentResultEnvelope', () => {
    expect(
      RunnerEventBatchSchema.safeParse({
        runnerInstanceId: RUNNER_ID,
        leaseId: LEASE_ID,
        eventSeq: 1,
        events: Array.from({ length: 33 }, () => validOutputEvent()),
      }).success,
    ).toBe(false);
    expect(
      RunnerEventBatchSchema.safeParse({
        runnerInstanceId: RUNNER_ID,
        leaseId: LEASE_ID,
        eventSeq: 1,
        events: [
          {
            kind: 'attempt.terminal',
            attemptId: ATTEMPT_ID,
            terminalReason: 'success',
            result: { raw: 'provider JSON is never accepted' },
          },
        ],
      }).success,
    ).toBe(false);
  });

  it('accepts a strict event acknowledgement', () => {
    expect(
      RunnerEventAcknowledgementSchema.safeParse({ eventSeq: 3, accepted: true }).success,
    ).toBe(true);
    expect(
      RunnerEventAcknowledgementSchema.safeParse({ eventSeq: 3, accepted: true, extra: true })
        .success,
    ).toBe(false);
  });
});
