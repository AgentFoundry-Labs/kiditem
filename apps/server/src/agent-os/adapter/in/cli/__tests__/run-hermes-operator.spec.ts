import { NestFactory } from '@nestjs/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AGENT_OS_REPOSITORY_PORT } from '../../../../application/port/out/repository/agent-os-repository.port';
import { AgentRunCoordinator } from '../../../../application/service/agent-run-coordinator.service';
import {
  formatRunHermesOperatorResult,
  parseRunHermesOperatorArgs,
  runHermesOperatorCli,
  validateRunHermesOperatorEnv,
} from '../run-hermes-operator';

vi.mock('@nestjs/core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@nestjs/core')>();
  return {
    ...actual,
    NestFactory: {
      ...actual.NestFactory,
      createApplicationContext: vi.fn(),
    },
  };
});

const originalEnv = { ...process.env };
const originalExitCode = process.exitCode;

function mockApplicationContext(input: {
  request: { conversationId: string | null; agentType: string } | null;
  result?: {
    executed: boolean;
    requestId?: string;
    runId?: string;
    reason?: string;
    errorCode?: string;
  };
}) {
  const repository = {
    findRunRequestById: vi.fn().mockResolvedValue(input.request),
  };
  const runner = {
    executeRequest: vi.fn().mockResolvedValue(
      input.result ?? {
        executed: true,
        requestId: 'request-operator-1',
        runId: 'run-operator-1',
      },
    ),
  };
  const app = {
    get: vi.fn((token: unknown) => {
      if (token === AGENT_OS_REPOSITORY_PORT) return repository;
      if (token === AgentRunCoordinator) return runner;
      throw new Error('Unexpected provider token');
    }),
    close: vi.fn().mockResolvedValue(undefined),
  };

  vi.mocked(NestFactory.createApplicationContext).mockResolvedValue(
    app as Awaited<ReturnType<typeof NestFactory.createApplicationContext>>,
  );

  return { app, repository, runner };
}

function validArgs() {
  return [
    '--organization-id',
    'org-1',
    '--conversation-id',
    'conversation-1',
    '--request-id',
    'request-operator-1',
  ];
}

describe('run-hermes-operator CLI helpers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env = {
      ...originalEnv,
      AGENT_OS_HERMES_MODEL: 'anthropic/claude-sonnet-4',
    };
    process.exitCode = originalExitCode;
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    process.exitCode = originalExitCode;
    vi.restoreAllMocks();
  });

  it('requires organization, conversation, and request flags', () => {
    expect(() =>
      parseRunHermesOperatorArgs([
        '--conversation-id',
        'conversation-1',
        '--request-id',
        'request-operator-1',
      ]),
    ).toThrow('Missing required flag: --organization-id');
    expect(() =>
      parseRunHermesOperatorArgs([
        '--organization-id',
        'org-1',
        '--request-id',
        'request-operator-1',
      ]),
    ).toThrow('Missing required flag: --conversation-id');
    expect(() =>
      parseRunHermesOperatorArgs([
        '--organization-id',
        'org-1',
        '--conversation-id',
        'conversation-1',
      ]),
    ).toThrow('Missing required flag: --request-id');

    expect(parseRunHermesOperatorArgs(validArgs())).toEqual({
      organizationId: 'org-1',
      conversationId: 'conversation-1',
      requestId: 'request-operator-1',
      workerId: 'agent-os-hermes-cli',
    });
  });

  it('fails before boot when the explicit Hermes model is missing', () => {
    expect(() =>
      validateRunHermesOperatorEnv({
        AGENT_OS_HERMES_MODEL: '',
      }),
    ).toThrow('AGENT_OS_HERMES_MODEL is required for the Hermes Operator harness.');
  });

  it('rejects requests outside the given conversation', async () => {
    const { app, runner } = mockApplicationContext({
      request: {
        conversationId: 'conversation-other',
        agentType: 'manager',
      },
    });

    await expect(runHermesOperatorCli(validArgs())).rejects.toThrow(
      'Agent OS request not found for the given conversation.',
    );
    expect(runner.executeRequest).not.toHaveBeenCalled();
    expect(app.close).toHaveBeenCalled();
  });

  it('rejects non-manager requests', async () => {
    const { app, runner } = mockApplicationContext({
      request: {
        conversationId: 'conversation-1',
        agentType: 'sourcing',
      },
    });

    await expect(runHermesOperatorCli(validArgs())).rejects.toThrow(
      'Hermes Operator harness can only run manager requests.',
    );
    expect(runner.executeRequest).not.toHaveBeenCalled();
    expect(app.close).toHaveBeenCalled();
  });

  it('forces the Hermes runtime env before booting the Nest application context', async () => {
    process.env.AGENT_OS_OPERATOR_RUNTIME = 'openai_responses';
    mockApplicationContext({
      request: {
        conversationId: 'conversation-1',
        agentType: 'manager',
      },
    });
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);

    await runHermesOperatorCli(validArgs());

    expect(process.env.AGENT_OS_OPERATOR_RUNTIME).toBe('hermes');
    expect(NestFactory.createApplicationContext).toHaveBeenCalledWith(
      expect.any(Function),
      { logger: ['error', 'warn', 'log'] },
    );
    expect(log).toHaveBeenCalledOnce();
  });

  it('surfaces a missing Hermes binary as operator_runtime_unavailable', async () => {
    mockApplicationContext({
      request: {
        conversationId: 'conversation-1',
        agentType: 'manager',
      },
      result: {
        executed: true,
        requestId: 'request-operator-1',
        runId: 'run-operator-1',
        errorCode: 'operator_runtime_unavailable',
      },
    });
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);

    await runHermesOperatorCli(validArgs());

    expect(JSON.parse(log.mock.calls[0]?.[0] as string)).toMatchObject({
      runtime: 'hermes',
      errorCode: 'operator_runtime_unavailable',
    });
  });

  it('surfaces non-JSON Hermes output as a failed decision rejection run', async () => {
    mockApplicationContext({
      request: {
        conversationId: 'conversation-1',
        agentType: 'manager',
      },
      result: {
        executed: true,
        requestId: 'request-operator-1',
        runId: 'run-operator-1',
        reason: 'operator.decision_rejected',
        errorCode: 'operator_decision_invalid_json',
      },
    });
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);

    await runHermesOperatorCli(validArgs());

    expect(JSON.parse(log.mock.calls[0]?.[0] as string)).toMatchObject({
      runtime: 'hermes',
      executed: true,
      reason: 'operator.decision_rejected',
      errorCode: 'operator_decision_invalid_json',
    });
  });

  it('formats the inspectable execution result with Hermes runtime metadata', () => {
    const formatted = formatRunHermesOperatorResult({
      conversationId: 'conversation-1',
      model: 'anthropic/claude-sonnet-4',
      result: {
        executed: true,
        requestId: 'request-operator-1',
        runId: 'run-operator-1',
      },
    });

    expect(JSON.parse(formatted)).toEqual({
      runtime: 'hermes',
      model: 'anthropic/claude-sonnet-4',
      executed: true,
      requestId: 'request-operator-1',
      runId: 'run-operator-1',
      reason: null,
      errorCode: null,
      inspectPath: '/agent-os?conversationId=conversation-1',
    });
  });
});
