import { describe, expect, it, vi } from 'vitest';
import { AgentJudgmentSubmissionService } from '../agent-judgment-submission.service';
import type { AgentJudgmentSubmissionTransactionPort } from '../../port/out/transaction/session-control/agent-judgment-submission.transaction.port';

const version = {
  id: 'version-1', agentDefinitionKey: 'ad_strategy', version: 1,
  runtimeType: 'isolated_cli', modelIdentity: 'model-1', capabilityKeys: [], policyDocument: {},
};

describe('AgentJudgmentSubmissionService', () => {
  it('submits the official graph transaction then drains its canonical execution', async () => {
    const transaction: AgentJudgmentSubmissionTransactionPort = {
      submit: vi.fn().mockResolvedValue({
        sessionId: 'session-1', taskId: 'task-1', executionId: 'execution-1',
      }),
    };
    const dispatch = { dispatch: vi.fn().mockResolvedValue({ operationsRunId: 'operation-1' }) };
    const service = new AgentJudgmentSubmissionService(transaction, dispatch as never);

    await expect(service.submit({
      organization: 'organizations/org-1' as never,
      actor: 'users/user-1' as never,
      agentDefinition: 'agentDefinitions/ad_strategy' as never,
      objective: 'Create a strategy.', resourceRefs: [], idempotencyKey: 'ad-strategy-1' as never,
    })).resolves.toEqual({
      session: 'organizations/org-1/agentSessions/session-1',
      task: 'organizations/org-1/agentSessions/session-1/tasks/task-1',
      execution: 'organizations/org-1/agentSessions/session-1/executions/execution-1',
      operation: 'organizations/org-1/operations/operation-1',
    });

    expect(transaction.submit).toHaveBeenCalledWith(expect.objectContaining({
      organizationId: 'org-1', userId: 'user-1', agentDefinitionKey: 'ad_strategy',
      objective: 'Create a strategy.', resourceRefs: [],
    }));
    expect(dispatch.dispatch).toHaveBeenCalledWith({
      organizationId: 'org-1', sessionId: 'session-1', taskId: 'task-1', executionId: 'execution-1', requestedByUserId: 'user-1',
    });
  });

  it('rejects an unbounded objective before authorizing work', async () => {
    const service = new AgentJudgmentSubmissionService({} as never, {} as never);
    await expect(service.submit({
      organization: 'organizations/org-1' as never, actor: 'users/user-1' as never,
      agentDefinition: 'agentDefinitions/ad_strategy' as never, objective: '', resourceRefs: [], idempotencyKey: 'x' as never,
    })).rejects.toThrow('AGENT_JUDGMENT_OBJECTIVE_INVALID');
  });
});
