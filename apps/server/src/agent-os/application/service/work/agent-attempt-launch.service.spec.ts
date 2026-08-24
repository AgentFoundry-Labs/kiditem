import { describe, expect, it, vi } from 'vitest';
import { AgentAttemptAdmissionService } from './agent-attempt-admission.service';
import { AgentAttemptCapacityService } from './agent-attempt-capacity.service';
import { AgentAttemptLaunchService } from './agent-attempt-launch.service';

describe('AgentAttemptLaunchService', () => {
  it('terminalizes a bound admitted Attempt when the Host Runner is unavailable before command installation', async () => {
    const execution = { start: vi.fn(async () => { throw new Error('runner_not_ready'); }) };
    const work = {
      transitionAttempt: vi.fn(async () => ({ transitioned: true })),
      finalizeTaskFromAttempt: vi.fn(async () => ({ finalized: false, status: null })),
    };
    const admissions = { releaseAttempt: vi.fn() };
    const output = { bind: vi.fn(), finish: vi.fn() };
    const service = new AgentAttemptLaunchService(execution as never, work as never, admissions, output as never, {
      now: () => new Date('2026-08-24T00:00:00.000Z'),
    });

    await expect(service.start(launch({ output: { threadId: 'thread', runId: 'run' } })))
      .rejects.toThrow('runner_not_ready');

    expect(output.bind).toHaveBeenCalledWith({ attemptId: 'attempt', threadId: 'thread', runId: 'run' });
    expect(work.transitionAttempt).toHaveBeenCalledWith(expect.objectContaining({
      attemptId: 'attempt', from: 'starting', to: 'failed',
      error: { code: 'attempt_start_failed', message: 'Attempt failed to start.' },
    }));
    expect(work.finalizeTaskFromAttempt).toHaveBeenCalledWith({
      attemptId: 'attempt', at: new Date('2026-08-24T00:00:00.000Z'),
    });
    expect(output.finish).toHaveBeenCalledWith({ attemptId: 'attempt', outcome: 'failed' });
    expect(admissions.releaseAttempt).toHaveBeenCalledWith('attempt');
  });

  it('shares one failed pre-start cleanup across repeated launch errors', async () => {
    const execution = { start: vi.fn(async () => { throw new Error('runner_not_ready'); }) };
    const work = {
      transitionAttempt: vi.fn(async () => ({ transitioned: true })),
      finalizeTaskFromAttempt: vi.fn(async () => ({ finalized: false, status: null })),
    };
    const admissions = { releaseAttempt: vi.fn() };
    const output = { bind: vi.fn(), finish: vi.fn() };
    const service = new AgentAttemptLaunchService(execution as never, work as never, admissions, output as never);

    await expect(service.start(launch())).rejects.toThrow('runner_not_ready');
    await expect(service.start(launch())).rejects.toThrow('attempt_terminal');

    expect(work.transitionAttempt).toHaveBeenCalledTimes(1);
    expect(work.finalizeTaskFromAttempt).toHaveBeenCalledTimes(1);
    expect(output.finish).toHaveBeenCalledTimes(1);
    expect(admissions.releaseAttempt).toHaveBeenCalledTimes(1);
  });

  it('resumes pre-start cleanup after a capacity-release failure without replaying finished output', async () => {
    const execution = { start: vi.fn(async () => { throw new Error('runner_not_ready'); }) };
    const work = {
      transitionAttempt: vi.fn(async () => ({ transitioned: true })),
      finalizeTaskFromAttempt: vi.fn(async () => ({ finalized: false, status: null })),
    };
    const admissions = {
      releaseAttempt: vi.fn()
        .mockImplementationOnce(() => { throw new Error('capacity_release_failure'); })
        .mockImplementationOnce(() => undefined),
    };
    const output = { bind: vi.fn(), finish: vi.fn() };
    const service = new AgentAttemptLaunchService(execution as never, work as never, admissions, output as never);

    await expect(service.start(launch({ output: { threadId: 'thread', runId: 'run' } })))
      .rejects.toThrow('attempt_start_failed');
    expect(output.finish).toHaveBeenCalledTimes(1);
    expect(admissions.releaseAttempt).toHaveBeenCalledTimes(1);

    await expect(service.failBeforeStart({ attemptId: 'attempt' })).resolves.toBeUndefined();
    expect(work.transitionAttempt).toHaveBeenCalledTimes(1);
    expect(work.finalizeTaskFromAttempt).toHaveBeenCalledTimes(1);
    expect(output.finish).toHaveBeenCalledTimes(1);
    expect(admissions.releaseAttempt).toHaveBeenCalledTimes(2);
  });

  it('retries a staged pre-start cleanup without another caller request or replaying completed stages', async () => {
    vi.useFakeTimers();
    try {
      const execution = { start: vi.fn(async () => { throw new Error('runner_not_ready'); }) };
      const work = {
        transitionAttempt: vi.fn(async () => ({ transitioned: true })),
        finalizeTaskFromAttempt: vi.fn()
          .mockRejectedValueOnce(new Error('transient_finalization_failure'))
          .mockResolvedValueOnce({ finalized: false, status: null }),
      };
      const admissions = { releaseAttempt: vi.fn() };
      const output = { bind: vi.fn(), finish: vi.fn() };
      const service = new AgentAttemptLaunchService(execution as never, work as never, admissions, output as never);

      await expect(service.start(launch({ output: { threadId: 'thread', runId: 'run' } })))
        .rejects.toThrow('attempt_start_failed');
      expect(work.transitionAttempt).toHaveBeenCalledTimes(1);
      expect(work.finalizeTaskFromAttempt).toHaveBeenCalledTimes(1);
      expect(output.finish).not.toHaveBeenCalled();
      expect(admissions.releaseAttempt).not.toHaveBeenCalled();

      await vi.runOnlyPendingTimersAsync();

      expect(work.transitionAttempt).toHaveBeenCalledTimes(1);
      expect(work.finalizeTaskFromAttempt).toHaveBeenCalledTimes(2);
      expect(output.finish).toHaveBeenCalledTimes(1);
      expect(admissions.releaseAttempt).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it('keeps retrying a staged cleanup after its bounded backoff plateau without stranding the Attempt', async () => {
    vi.useFakeTimers();
    try {
      const execution = { start: vi.fn(async () => { throw new Error('runner_not_ready'); }) };
      const work = {
        transitionAttempt: vi.fn(async () => ({ transitioned: true })),
        finalizeTaskFromAttempt: vi.fn()
          .mockRejectedValueOnce(new Error('transient_finalization_failure'))
          .mockRejectedValueOnce(new Error('transient_finalization_failure'))
          .mockRejectedValueOnce(new Error('transient_finalization_failure'))
          .mockRejectedValueOnce(new Error('transient_finalization_failure'))
          .mockRejectedValueOnce(new Error('transient_finalization_failure'))
          .mockRejectedValueOnce(new Error('transient_finalization_failure'))
          .mockResolvedValueOnce({ finalized: false, status: null }),
      };
      const admissions = { releaseAttempt: vi.fn() };
      const output = { bind: vi.fn(), finish: vi.fn() };
      const service = new AgentAttemptLaunchService(execution as never, work as never, admissions, output as never);

      await expect(service.start(launch({ output: { threadId: 'thread', runId: 'run' } })))
        .rejects.toThrow('attempt_start_failed');
      for (let retry = 0; retry < 6; retry += 1) await vi.runOnlyPendingTimersAsync();

      expect(work.transitionAttempt).toHaveBeenCalledTimes(1);
      expect(work.finalizeTaskFromAttempt).toHaveBeenCalledTimes(7);
      expect(output.finish).toHaveBeenCalledTimes(1);
      expect(admissions.releaseAttempt).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it.each(['attempt_prompt_invalid', 'runner_command_backpressure'])(
    'uses the same bounded cleanup for a pre-command %s failure',
    async (failure) => {
      const execution = { start: vi.fn(async () => { throw new Error(`${failure}: raw provider stderr must not escape`); }) };
      const work = {
        transitionAttempt: vi.fn(async () => ({ transitioned: true })),
        finalizeTaskFromAttempt: vi.fn(async () => ({ finalized: false, status: null })),
      };
      const admissions = { releaseAttempt: vi.fn() };
      const output = { bind: vi.fn(), finish: vi.fn() };
      const service = new AgentAttemptLaunchService(execution as never, work as never, admissions, output as never);

      await expect(service.start(launch())).rejects.toThrow('attempt_start_failed');

      expect(work.transitionAttempt).toHaveBeenCalledWith(expect.objectContaining({
        error: { code: 'attempt_start_failed', message: 'Attempt failed to start.' },
      }));
      expect(work.finalizeTaskFromAttempt).toHaveBeenCalledTimes(1);
      expect(output.finish).toHaveBeenCalledWith({ attemptId: 'attempt', outcome: 'failed' });
      expect(admissions.releaseAttempt).toHaveBeenCalledTimes(1);
    },
  );

  it('returns a real single-slot CLI admission after repeated pre-command launch failure', async () => {
    const capacity = new AgentAttemptCapacityService(1);
    const admissions = new AgentAttemptAdmissionService(capacity, {
      admitRootAttempt: vi.fn(async () => ({
        session: { id: 'session', organizationId: 'org' },
        task: { id: 'task', organizationId: 'org', sessionId: 'session' },
        attempt: { id: 'attempt', ordinal: 1 },
      })),
    } as never);
    await admissions.root({} as never);
    const service = new AgentAttemptLaunchService(
      { start: vi.fn(async () => { throw new Error('runner_not_ready'); }) } as never,
      {
        transitionAttempt: vi.fn(async () => ({ transitioned: true })),
        finalizeTaskFromAttempt: vi.fn(async () => ({ finalized: false, status: null })),
      } as never,
      admissions,
      { bind: vi.fn(), finish: vi.fn() } as never,
    );

    await expect(service.start(launch())).rejects.toThrow('runner_not_ready');
    await expect(service.start(launch())).rejects.toThrow('attempt_terminal');

    const next = capacity.tryReserve();
    next.release();
  });
});

function launch(overrides: { output?: { threadId: string; runId: string } } = {}) {
  return {
    attemptId: 'attempt',
    sessionId: 'session',
    taskId: 'task',
    agentVersionId: 'version',
    organizationId: 'org',
    userId: 'user',
    runtime: 'codex_cli' as const,
    profile: { model: 'gpt-5' },
    prompt: 'durable work',
    instructionProfileRef: 'agent-config/prompts/agents/operator.md',
    capabilityKeys: ['sourcing.scrapeProductUrl'],
    ...overrides,
  };
}
