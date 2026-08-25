import { describe, expect, it } from 'vitest';
import { AgentWorkQueryService } from './agent-work-query.service';

describe('AgentWorkQueryService durable facts', () => {
  it('returns a source-fact work view without Task presentation state', async () => {
    const repository = {
      loadOwnedWorkView: async () => ({
        id: 'session-1',
        createdAt: new Date(),
        updatedAt: new Date(),
        tasks: [
          {
            id: 'task-1',
            parentTaskId: null,
            objective: 'Research supplier evidence',
            completionCriteria: 'Return a decision',
            status: 'open',
            assignedAgentVersion: { agentDefinitionKey: 'sourcing' },
            attempts: [{
              id: 'attempt-1',
              ordinal: 1,
              status: 'process_interrupted',
              result: {
                outcome: 'needs_input',
                summary: 'Choose one of the discovered suppliers.',
                resourceRefs: [{ kind: 'candidate', id: 'candidate-1' }],
                operationRefs: [{ kind: 'operation', id: 'operation-1', status: 'queued' }],
                needsInput: { code: 'supplier_choice', prompt: 'Choose a supplier.' },
              },
              error: null,
            }],
            invocations: [{
              id: 'invocation-1',
              capabilityKey: 'sourcing.inspectCandidate',
              status: 'succeeded',
              result: { summary: 'Candidate inspected.', resourceRefs: [], operationRefs: [] },
              error: null,
              approval: {
                id: 'approval-1',
                invocationId: 'invocation-1',
                inputHash: 'a'.repeat(64),
                status: 'approved',
                expiresAt: new Date('2030-01-01T00:00:00.000Z'),
              },
            }],
          },
          {
            id: 'task-child-1',
            parentTaskId: 'task-1',
            objective: 'Inspect candidate evidence',
            completionCriteria: 'Return a bounded result',
            status: 'completed',
            assignedAgentVersion: { agentDefinitionKey: 'sourcing' },
            attempts: [{
              id: 'attempt-child-1',
              ordinal: 1,
              status: 'succeeded',
              result: { outcome: 'completed', summary: 'Child evidence complete.', resourceRefs: [], operationRefs: [] },
              error: null,
            }],
            invocations: [],
          },
        ],
      }),
    };
    const operations = { get: async () => ({ status: 'running' }) };
    const service = new AgentWorkQueryService(repository as never, operations as never);

    const view = await (service as unknown as {
      view(input: { organizationId: string; userId: string; sessionId: string }): Promise<{
        tasks: Array<Record<string, unknown>>;
      }>;
    }).view({
      organizationId: 'org-1',
      userId: 'user-1',
      sessionId: 'session-1',
    });

    expect(view.tasks[0]).toMatchObject({
      agentDefinitionKey: 'sourcing',
      status: 'open',
      latestAttempt: {
        id: 'attempt-1',
        status: 'process_interrupted',
        result: {
          summary: 'Choose one of the discovered suppliers.',
          needsInput: { code: 'supplier_choice', prompt: 'Choose a supplier.' },
        },
      },
      approvals: [{ id: 'approval-1', status: 'approved' }],
      invocations: [{ id: 'invocation-1', capabilityKey: 'sourcing.inspectCandidate', status: 'succeeded' }],
      childTasks: [{ id: 'task-child-1', status: 'completed' }],
      resourceRefs: [{ kind: 'candidate', id: 'candidate-1' }],
      operationRefs: [{ kind: 'operation', id: 'operation-1', status: 'running' }],
    });
    expect(view.tasks[0]).not.toHaveProperty('presentation');
  });

  it('keeps an older pending approval in the bounded facts view after newer terminal approvals', async () => {
    const terminalInvocations = Array.from({ length: 24 }, (_, index) => ({
      id: `terminal-invocation-${index}`,
      capabilityKey: 'supply.create_purchase_order_draft',
      status: 'succeeded',
      result: null,
      error: null,
      approval: {
        id: `terminal-approval-${index}`,
        invocationId: `terminal-invocation-${index}`,
        inputHash: 'a'.repeat(64),
        status: 'approved',
        expiresAt: null,
      },
    }));
    const pendingInvocation = {
      id: 'pending-invocation',
      capabilityKey: 'supply.create_purchase_order_draft',
      status: 'approval_pending',
      result: null,
      error: null,
      approval: {
        id: 'pending-approval',
        invocationId: 'pending-invocation',
        inputHash: 'b'.repeat(64),
        status: 'pending',
        expiresAt: new Date('2030-01-01T00:00:00.000Z'),
      },
    };
    const repository = {
      loadOwnedWorkView: async () => ({
        id: 'session-1',
        createdAt: new Date(),
        updatedAt: new Date(),
        tasks: [{
          id: 'task-1',
          parentTaskId: null,
          objective: 'Approve supplier purchase order',
          completionCriteria: 'Return a durable outcome',
          status: 'open',
          attempts: [],
          invocations: [...terminalInvocations, pendingInvocation],
        }],
      }),
    };
    const service = new AgentWorkQueryService(repository as never);

    const view = await (service as unknown as {
      view(input: { organizationId: string; userId: string; sessionId: string }): Promise<{
        tasks: Array<{ approval: { id: string; status: string } | null; approvals: Array<{ id: string; status: string }> }>;
      }>;
    }).view({ organizationId: 'org-1', userId: 'user-1', sessionId: 'session-1' });

    expect(view.tasks[0].approval).toEqual({
      id: 'pending-approval',
      invocationId: 'pending-invocation',
      inputHash: 'b'.repeat(64),
      status: 'pending',
      expiresAt: new Date('2030-01-01T00:00:00.000Z'),
    });
    expect(view.tasks[0].approvals).toHaveLength(24);
    expect(view.tasks[0].approvals).toContainEqual(expect.objectContaining({
      id: 'pending-approval',
      status: 'pending',
    }));
  });

  it('builds a bounded explicit Continue prompt from durable work facts without prior raw input', async () => {
    const repository = {
      loadOwnedWorkView: async () => ({
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

  it('rejects an empty Continue prompt before an Attempt can be admitted', async () => {
    const service = new AgentWorkQueryService({} as never);

    await expect(service.continuationContext({ organizationId: 'org-1', userId: 'user-1', sessionId: 'session-1', taskId: 'task-1', prompt: '  ' })).rejects.toThrow('attempt_prompt_required');
  });

  it('uses the Operations-owned current run state in the factual work view', async () => {
    const repository = {
      loadOwnedWorkView: async () => ({ id: 'session-1', createdAt: new Date(), updatedAt: new Date(), tasks: [{
        id: 'task-1', parentTaskId: null, objective: 'Refresh', completionCriteria: 'Done', status: 'open',
        attempts: [{ id: 'attempt-1', ordinal: 1, status: 'exited', result: { summary: 'Queued', operationRefs: [{ kind: 'operation', id: 'run-1', status: 'completed' }] } }], invocations: [],
      }] }),
    };
    const operations = { get: async () => ({ status: 'running' }) };
    const service = new AgentWorkQueryService(repository as never, operations as never);

    const view = await (service as unknown as {
      view(input: { organizationId: string; userId: string; sessionId: string }): Promise<{
        tasks: Array<{ operationRefs: Array<{ status: string }> }>;
      }>;
    }).view({ organizationId: 'org-1', userId: 'user-1', sessionId: 'session-1' });

    expect(view.tasks[0]).toMatchObject({ operationRefs: [{ status: 'running' }] });
  });

  it('keeps an owner status read failure as an explicit factual operation error', async () => {
    const repository = {
      loadOwnedWorkView: async () => ({ id: 'session-1', createdAt: new Date(), updatedAt: new Date(), tasks: [{
        id: 'task-1', parentTaskId: null, objective: 'Refresh', completionCriteria: 'Done', status: 'open',
        attempts: [{ id: 'attempt-1', ordinal: 1, status: 'succeeded', result: { summary: 'Queued', operationRefs: [{ kind: 'operation', id: 'run-1', status: 'succeeded' }] } }], invocations: [],
      }] }),
    };
    const operations = { get: async () => { throw new Error('operations_read_failed'); } };
    const service = new AgentWorkQueryService(repository as never, operations as never);

    const view = await (service as unknown as {
      view(input: { organizationId: string; userId: string; sessionId: string }): Promise<{
        tasks: Array<{ operationRefs: Array<{ status: string; error: { code: string } }> }>;
      }>;
    }).view({ organizationId: 'org-1', userId: 'user-1', sessionId: 'session-1' });

    expect(view.tasks[0]).toMatchObject({
      operationRefs: [{ status: 'unavailable', error: { code: 'operation_status_unavailable' } }],
    });
  });
});
