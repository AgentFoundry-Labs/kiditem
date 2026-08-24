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

function validLaunch() {
  return {
    attemptId: ATTEMPT_ID,
    runtime: 'codex_cli',
    model: 'gpt-5.6',
    prompt: 'Inspect the current task and return a concise result.',
    workspacePolicy: 'empty_ephemeral_v1',
    timeoutMs: 30_000,
    mcpUrl: 'http://127.0.0.1:4401/api/internal/agent-runtime/attempts/111/mcp',
    attemptToken: ATTEMPT_TOKEN,
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

  it('accepts only unauthenticated HTTP loopback MCP URLs', () => {
    for (const value of [
      'http://127.0.0.1:4401/api/internal/agent-runtime/attempts/111/mcp',
      'http://[::1]:4401/api/internal/agent-runtime/attempts/111/mcp',
    ]) {
      expect(LoopbackHttpUrlSchema.safeParse(value).success).toBe(true);
    }

    for (const value of [
      'https://127.0.0.1:4401/mcp',
      'http://localhost:4401/mcp',
      'http://192.168.1.10:4401/mcp',
      'http://runner:secret@127.0.0.1:4401/mcp',
      'http://127.0.0.1:4401/mcp?trace=1',
      'http://127.0.0.1:4401/mcp#fragment',
    ]) {
      expect(LoopbackHttpUrlSchema.safeParse(value).success).toBe(false);
    }
  });

  it('strictly accepts the supported Runner hello and lease response', () => {
    expect(RunnerPollRequestSchema.safeParse(validHello()).success).toBe(true);
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

  it('rejects unknown and recursively forbidden launch/control property names', () => {
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
              output: { nested: { providerCredential: 'never accepted' } },
            },
          },
        ],
      }).success,
    ).toBe(false);
  });

  it('bounds start command batches to eight commands', () => {
    const command = validStartCommand();
    expect(
      RunnerCommandBatchSchema.safeParse({ commands: Array.from({ length: 8 }, () => command) })
        .success,
    ).toBe(true);
    expect(
      RunnerCommandBatchSchema.safeParse({ commands: Array.from({ length: 9 }, () => command) })
        .success,
    ).toBe(false);
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

  it('bounds event batches and parses terminal results through AgentResultEnvelope', () => {
    expect(
      RunnerEventBatchSchema.safeParse({
        runnerInstanceId: RUNNER_ID,
        leaseId: LEASE_ID,
        eventSeq: 1,
        events: Array.from({ length: 32 }, () => validOutputEvent()),
      }).success,
    ).toBe(true);
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
