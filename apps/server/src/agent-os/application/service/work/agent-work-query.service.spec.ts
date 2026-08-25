import { describe, expect, it } from 'vitest';
import { AgentWorkQueryService } from './agent-work-query.service';

describe('AgentWorkQueryService continuation context', () => {
  it('projects the immutable assigned Agent definition for durable-session UI pinning', async () => {
    const repository = {
      loadOwnedProjection: async () => ({
        id: 'session-1',
        createdAt: new Date(),
        updatedAt: new Date(),
        tasks: [{
          id: 'task-1',
          parentTaskId: null,
          objective: 'Research supplier evidence',
          completionCriteria: 'Return a decision',
          status: 'open',
          assignedAgentVersion: { agentDefinitionKey: 'sourcing' },
          attempts: [],
          invocations: [],
        }],
      }),
    };
    const service = new AgentWorkQueryService(repository as never);

    const projection = await service.projection({
      organizationId: 'org-1',
      userId: 'user-1',
      sessionId: 'session-1',
    }) as { tasks: Array<{ agentDefinitionKey: string }> };

    expect(projection.tasks[0]?.agentDefinitionKey).toBe('sourcing');
  });

  it('builds a bounded successor prompt from durable work facts without prior raw input', async () => {
    const repository = {
      loadOwnedProjection: async () => ({
        id: 'session-1', createdAt: new Date(), updatedAt: new Date(), tasks: [{
          id: 'task-1', objective: 'Review supplier evidence', completionCriteria: 'Return an outcome', input: { secret: 'must-not-appear' }, status: 'open', parentTaskId: null,
          attempts: [{ id: 'attempt-1', ordinal: 1, status: 'process_interrupted', result: { summary: 'Collected two references.', resourceRefs: [{ kind: 'candidate', id: 'candidate-1' }], operationRefs: [] }, error: null }],
          invocations: [{ capabilityKey: 'sourcing.refreshValidation', status: 'succeeded', result: { summary: 'Validation persisted.' }, error: null }],
        }],
      }),
    };
    const service = new AgentWorkQueryService(repository as never);

    const context = await service.continuationContext({ organizationId: 'org-1', userId: 'user-1', sessionId: 'session-1', taskId: 'task-1', prompt: 'Continue with validation.' });

    expect(context.prompt).toContain('Review supplier evidence');
    expect(context.prompt).toContain('Collected two references.');
    expect(context.prompt).toContain('Continue with validation.');
    expect(context.prompt).toContain('Validation persisted.');
    expect(context.prompt).not.toContain('must-not-appear');
    expect(context.input).toEqual(expect.objectContaining({ prompt: 'Continue with validation.', resourceRefs: [{ kind: 'candidate', id: 'candidate-1' }] }));
  });

  it('rejects an empty successor prompt before an Attempt can be admitted', async () => {
    const service = new AgentWorkQueryService({} as never);

    await expect(service.continuationContext({ organizationId: 'org-1', userId: 'user-1', sessionId: 'session-1', taskId: 'task-1', prompt: '  ' })).rejects.toThrow('attempt_prompt_required');
  });

  it('uses the Operations-owned current run state rather than a stale invocation ref', async () => {
    const repository = {
      loadOwnedProjection: async () => ({ id: 'session-1', createdAt: new Date(), updatedAt: new Date(), tasks: [{
        id: 'task-1', parentTaskId: null, objective: 'Refresh', completionCriteria: 'Done', status: 'open',
        attempts: [{ id: 'attempt-1', ordinal: 1, status: 'exited', result: { summary: 'Queued', operationRefs: [{ kind: 'operation', id: 'run-1', status: 'completed' }] } }], invocations: [],
      }] }),
    };
    const operations = { get: async () => ({ status: 'running' }) };
    const service = new AgentWorkQueryService(repository as never, operations as never);

    const projection = await service.projection({ organizationId: 'org-1', userId: 'user-1', sessionId: 'session-1' }) as { tasks: Array<{ presentation: string; operationRefs: Array<{ status: string }> }> };

    expect(projection.tasks[0]).toMatchObject({ presentation: 'awaiting_operation', operationRefs: [{ status: 'running' }] });
  });

  it('keeps an owner status read failure recoverable instead of misclassifying the task as needs_continue', async () => {
    const repository = {
      loadOwnedProjection: async () => ({ id: 'session-1', createdAt: new Date(), updatedAt: new Date(), tasks: [{
        id: 'task-1', parentTaskId: null, objective: 'Refresh', completionCriteria: 'Done', status: 'open',
        attempts: [{ id: 'attempt-1', ordinal: 1, status: 'succeeded', result: { summary: 'Queued', operationRefs: [{ kind: 'operation', id: 'run-1', status: 'succeeded' }] } }], invocations: [],
      }] }),
    };
    const operations = { get: async () => { throw new Error('operations_read_failed'); } };
    const service = new AgentWorkQueryService(repository as never, operations as never);

    const projection = await service.projection({ organizationId: 'org-1', userId: 'user-1', sessionId: 'session-1' }) as {
      tasks: Array<{ presentation: string; operationRefs: Array<{ status: string; error: { code: string } }> }>;
    };

    expect(projection.tasks[0]).toMatchObject({
      presentation: 'awaiting_operation',
      operationRefs: [{ status: 'unavailable', error: { code: 'operation_status_unavailable' } }],
    });
  });
});
