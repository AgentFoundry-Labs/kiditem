import { describe, expect, it, vi } from 'vitest';
import { AgentWorkController } from './agent-work.controller';

const organizationId = '018f4eb1-9078-7a1e-9514-b19b5732f5de';
const user = { id: '118f4eb1-9078-7a1e-9514-b19b5732f5de' };
const sessionId = '218f4eb1-9078-7a1e-9514-b19b5732f5de';
const taskId = '318f4eb1-9078-7a1e-9514-b19b5732f5de';
const attemptId = '418f4eb1-9078-7a1e-9514-b19b5732f5de';
const predecessorAttemptId = '518f4eb1-9078-7a1e-9514-b19b5732f5de';

describe('AgentWorkController transport-only intake', () => {
  it('forwards the REST root coordinate and leaves admission and launch to the common intake Module', async () => {
    const fixture = controllerFixture();
    fixture.intake.startRoot.mockResolvedValue(rootAdmission());

    await expect(fixture.controller.start({ objective: 'Research backpacks' }, organizationId, user as never))
      .resolves.toMatchObject({ attempt: { id: attemptId } });

    expect(fixture.intake.startRoot).toHaveBeenCalledWith({
      principal: { organizationId, userId: user.id },
      objective: 'Research backpacks',
      completionCriteria: undefined,
      input: undefined,
    });
    expect(fixture.commands.root).not.toHaveBeenCalled();
  });

  it('forwards the REST continuation coordinate and leaves immutable version resolution to the common intake Module', async () => {
    const fixture = controllerFixture();
    fixture.intake.continue.mockResolvedValue({ attemptId, sessionId, taskId, ordinal: 2 });

    await expect(fixture.controller.continue(
      sessionId,
      taskId,
      { predecessorAttemptId, prompt: 'Continue' },
      organizationId,
      user as never,
    )).resolves.toMatchObject({ attemptId });

    expect(fixture.intake.continue).toHaveBeenCalledWith({
      principal: { organizationId, userId: user.id },
      sessionId,
      taskId,
      predecessorAttemptId,
      prompt: 'Continue',
      reopen: undefined,
    });
    expect(fixture.commands.followUp).not.toHaveBeenCalled();
  });

  it('interrupts every Attempt atomically cancelled by the durable transition without trusting a stale pre-read', async () => {
    const fixture = controllerFixture();
    fixture.queries.liveAttempt.mockResolvedValue(null);
    fixture.commands.transition.mockResolvedValue({
      status: 'cancelled',
      cancelledAttemptIds: [attemptId, predecessorAttemptId],
    });
    fixture.executor.interrupt
      .mockRejectedValueOnce(new Error('already_terminal'))
      .mockResolvedValueOnce(undefined);

    await expect(fixture.controller.cancel(sessionId, taskId, organizationId, user as never))
      .resolves.toEqual({ status: 'cancelled' });

    expect(fixture.queries.liveAttempt).not.toHaveBeenCalled();
    expect(fixture.executor.interrupt).toHaveBeenCalledTimes(2);
    expect(fixture.executor.interrupt).toHaveBeenNthCalledWith(1, attemptId);
    expect(fixture.executor.interrupt).toHaveBeenNthCalledWith(2, predecessorAttemptId);
  });
});

function controllerFixture() {
  const queries = {
    projection: vi.fn(),
    liveAttempt: vi.fn(),
  };
  const commands = { root: vi.fn(), followUp: vi.fn(), transition: vi.fn(), decide: vi.fn(), delete: vi.fn() };
  const executor = { interrupt: vi.fn(async () => undefined) };
  const intake = { startRoot: vi.fn(), continue: vi.fn() };
  const Controller = AgentWorkController as unknown as new (...args: unknown[]) => AgentWorkController;
  return {
    controller: new Controller(queries, commands, executor, intake),
    queries,
    commands,
    executor,
    intake,
  };
}

function rootAdmission() {
  return {
    session: { id: sessionId, organizationId },
    task: { id: taskId, organizationId, sessionId },
    attempt: { id: attemptId, ordinal: 1 },
  };
}
