import { Inject, Injectable, NotFoundException, Optional } from '@nestjs/common';
import { OPERATION_RUNNER_PORT, type OperationRunnerPort } from '../../../../operations/application/port/in/operation-runner.port';
import { AGENT_WORK_QUERY_REPOSITORY_PORT, type AgentWorkQueryRepositoryPort } from '../../port/out/work/agent-work-query-repository.port';
import type { AgentWorkQueryPort } from '../../port/in/work/agent-work-query.port';

/** Application projection boundary; persistence remains behind the out port. */
@Injectable()
export class AgentWorkQueryService implements AgentWorkQueryPort {
  constructor(
    @Inject(AGENT_WORK_QUERY_REPOSITORY_PORT) private readonly repository: AgentWorkQueryRepositoryPort,
    @Optional() @Inject(OPERATION_RUNNER_PORT) private readonly operations?: Pick<OperationRunnerPort, 'get'>,
  ) {}
  async projection(input: { organizationId: string; userId: string; sessionId: string }): Promise<unknown> {
    const session = await this.repository.loadOwnedProjection(input) as { id: string; createdAt: Date; updatedAt: Date; tasks: Array<Record<string, unknown>> } | null;
    if (!session) throw new NotFoundException('agent_session_not_found');
    return {
      session: { id: session.id, createdAt: session.createdAt, updatedAt: session.updatedAt },
      tasks: await Promise.all(session.tasks.map((task) => projectTask(task, session.tasks, input.organizationId, this.operations))),
    };
  }
  activeVersion(agentDefinitionKey: string) { return this.repository.activeVersion(agentDefinitionKey); }
  taskVersion(input: { organizationId: string; userId: string; sessionId: string; taskId: string }) { return this.repository.taskVersion(input); }
  liveAttempt(input: { organizationId: string; userId: string; sessionId: string; taskId: string; attemptId?: string }) { return this.repository.liveAttempt(input); }
  threadContinuation(input: { organizationId: string; userId: string; sessionId: string }) { return this.repository.threadContinuation(input); }
  async continuationContext(input: { organizationId: string; userId: string; sessionId: string; taskId: string; prompt: string }): Promise<{ prompt: string; input: { prompt: string; resourceRefs: unknown[]; operationRefs: unknown[] } }> {
    const userPrompt = input.prompt.trim();
    if (!userPrompt) throw new NotFoundException('attempt_prompt_required');
    const session = await this.repository.loadOwnedProjection(input) as { tasks?: Array<Record<string, unknown>> } | null;
    const task = session?.tasks?.find((candidate) => candidate.id === input.taskId);
    if (!task) throw new NotFoundException('agent_task_not_found');
    const attempts = Array.isArray(task.attempts) ? task.attempts as Array<Record<string, unknown>> : [];
    const latest = attempts[0];
    const latestResult = latest?.result && typeof latest.result === 'object' ? latest.result as Record<string, unknown> : null;
    const invocations = Array.isArray(task.invocations) ? task.invocations as Array<Record<string, unknown>> : [];
    const invocationFacts = invocations.slice(0, 24).map((invocation) => {
      const result = invocation.result && typeof invocation.result === 'object' ? invocation.result as Record<string, unknown> : null;
      const error = invocation.error && typeof invocation.error === 'object' ? invocation.error as Record<string, unknown> : null;
      return {
        capabilityKey: boundedText(invocation.capabilityKey, 128),
        status: boundedText(invocation.status, 64),
        summary: boundedText(result?.summary, 1_000),
        error: boundedText(error?.message ?? nestedErrorMessage(result), 1_000),
        resourceRefs: boundedRefs([result], 'resourceRefs'),
        operationRefs: boundedRefs([result], 'operationRefs'),
        output: result?.output ?? null,
      };
    });
    const children = (session?.tasks ?? []).filter((candidate) => candidate.parentTaskId === task.id && candidate.status !== 'open').slice(0, 12);
    const invocationResults = invocations.map((invocation) => invocation.result && typeof invocation.result === 'object' ? invocation.result as Record<string, unknown> : null);
    const resourceRefs = boundedRefs([latestResult, ...invocationResults, ...children.map((child) => latestChildResult(child))], 'resourceRefs');
    const operationRefs = await currentOperationRefs(boundedRefs([latestResult, ...invocationResults, ...children.map((child) => latestChildResult(child))], 'operationRefs'), input.organizationId, this.operations);
    const lines = [
      `Objective: ${boundedText(task.objective, 1_000)}`,
      `Completion criteria: ${boundedText(task.completionCriteria, 1_000)}`,
      latestResult?.summary ? `Previous concise result: ${boundedText(latestResult.summary, 1_000)}` : null,
      latest?.error && typeof latest.error === 'object' ? `Previous error: ${boundedText((latest.error as Record<string, unknown>).message, 500)}` : null,
      children.length ? `Terminal child tasks: ${children.map((child) => `${String(child.id)}=${String(child.status)}`).join(', ').slice(0, 1_000)}` : null,
      invocationFacts.length ? `Capability outcomes: ${JSON.stringify(invocationFacts).slice(0, 3_000)}` : null,
      resourceRefs.length ? `Referenced resources: ${JSON.stringify(resourceRefs).slice(0, 2_000)}` : null,
      operationRefs.length ? `Referenced operations: ${JSON.stringify(operationRefs).slice(0, 2_000)}` : null,
      `New user instruction: ${userPrompt.slice(0, 8_000)}`,
      'Return only the strict bounded durable result envelope. Do not rely on provider history.',
    ].filter((line): line is string => Boolean(line));
    return { prompt: lines.join('\n').slice(0, 12_000), input: { prompt: userPrompt.slice(0, 8_000), resourceRefs, operationRefs } };
  }
}

function latestChildResult(task: Record<string, unknown>): Record<string, unknown> | null {
  const attempts = Array.isArray(task.attempts) ? task.attempts as Array<Record<string, unknown>> : [];
  const result = attempts[0]?.result;
  return result && typeof result === 'object' ? result as Record<string, unknown> : null;
}
function boundedRefs(values: Array<Record<string, unknown> | null>, key: 'resourceRefs' | 'operationRefs'): unknown[] {
  return values.flatMap((value) => Array.isArray(value?.[key]) ? value[key] : []).filter((value) => value && typeof value === 'object').slice(0, 50);
}
function boundedText(value: unknown, maximum: number): string { return typeof value === 'string' ? value.slice(0, maximum) : ''; }
function nestedErrorMessage(result: Record<string, unknown> | null): unknown {
  return result?.error && typeof result.error === 'object' ? (result.error as Record<string, unknown>).message : undefined;
}

async function projectTask(
  task: Record<string, unknown>,
  all: Array<Record<string, unknown>>,
  organizationId: string,
  operations?: Pick<OperationRunnerPort, 'get'>,
) {
  const attempts = Array.isArray(task.attempts) ? task.attempts as Array<Record<string, unknown>> : [];
  const invocations = Array.isArray(task.invocations) ? task.invocations as Array<Record<string, unknown>> : [];
  const latest = attempts[0] ?? null;
  const result = latest?.result && typeof latest.result === 'object' ? latest.result as Record<string, unknown> : null;
  const approval = invocations.map((item) => item.approval).find((item) => item && typeof item === 'object' && (item as { status?: unknown }).status === 'pending') as Record<string, unknown> | undefined;
  const refs = [result, ...invocations.map((item) => item.result)].filter((item): item is Record<string, unknown> => Boolean(item && typeof item === 'object'));
  const persistedOperationRefs = refs.flatMap((item) => Array.isArray(item.operationRefs) ? item.operationRefs : []);
  const operationRefs = await currentOperationRefs(persistedOperationRefs, organizationId, operations);
  const resourceRefs = refs.flatMap((item) => Array.isArray(item.resourceRefs) ? item.resourceRefs : []);
  const status = String(task.status); const live = Boolean(latest && ['starting', 'running'].includes(String(latest.status)));
  const mutation = invocations.some((item) => ['ready', 'executing'].includes(String(item.status)));
  const activeOperation = operationRefs.some((reference) => isActiveOperation(reference.status));
  const child = all.some((candidate) => candidate.parentTaskId === task.id && candidate.status === 'open');
  const presentation = status === 'failed' ? 'error' : status !== 'open' ? 'terminal' : approval ? 'awaiting_approval' : mutation || activeOperation ? 'awaiting_operation' : child ? 'awaiting_child' : live ? 'running' : result?.needsInput ? 'needs_input' : 'needs_continue';
  const assignedAgentVersion = task.assignedAgentVersion && typeof task.assignedAgentVersion === 'object'
    ? task.assignedAgentVersion as Record<string, unknown>
    : null;
  const agentDefinitionKey = typeof assignedAgentVersion?.agentDefinitionKey === 'string'
    ? assignedAgentVersion.agentDefinitionKey
    : null;
  return { id: task.id, parentTaskId: task.parentTaskId, agentDefinitionKey, objective: task.objective, completionCriteria: task.completionCriteria, status, latestAttempt: latest && { id: latest.id, ordinal: latest.ordinal, status: latest.status, result: latest.result, error: latest.error }, approval: approval && { id: approval.id, invocationId: approval.invocationId, inputHash: approval.inputHash, status: approval.status, expiresAt: approval.expiresAt }, summary: typeof result?.summary === 'string' ? result.summary : null, error: result?.error ?? latest?.error ?? null, operationRefs, resourceRefs, presentation };
}

async function currentOperationRefs(
  references: unknown[],
  organizationId: string,
  operations?: Pick<OperationRunnerPort, 'get'>,
): Promise<Array<Record<string, unknown>>> {
  const bounded = references.filter((reference): reference is Record<string, unknown> => Boolean(reference && typeof reference === 'object')).slice(0, 50);
  if (!operations) return bounded;
  return Promise.all(bounded.map(async (reference) => {
    const id = typeof reference.id === 'string' ? reference.id : null;
    if (!id) return reference;
    try {
      const current = await operations.get(organizationId, id);
      return { ...reference, status: current.status };
    } catch {
      // The Operations owner remains authoritative. Treat an unavailable
      // owner read as a recoverable operation blocker, rather than silently
      // trusting a stale terminal ref and inviting unrelated continuation.
      return {
        ...reference,
        status: 'unavailable',
        error: {
          code: 'operation_status_unavailable',
          message: 'Operations status is temporarily unavailable.',
        },
      };
    }
  }));
}

function isActiveOperation(status: unknown): boolean {
  return typeof status === 'string' && !['succeeded', 'failed', 'cancelled', 'skipped'].includes(status);
}
