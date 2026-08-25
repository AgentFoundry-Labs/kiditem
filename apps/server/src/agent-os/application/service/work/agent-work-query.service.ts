import { Inject, Injectable, NotFoundException, Optional } from '@nestjs/common';
import { OPERATION_RUNNER_PORT, type OperationRunnerPort } from '../../../../operations/application/port/in/operation-runner.port';
import { AGENT_WORK_QUERY_REPOSITORY_PORT, type AgentWorkQueryRepositoryPort } from '../../port/out/work/agent-work-query-repository.port';
import type { AgentWorkQueryPort } from '../../port/in/work/agent-work-query.port';

/** Bounded durable facts view; persistence remains behind the out port. */
@Injectable()
export class AgentWorkQueryService implements AgentWorkQueryPort {
  constructor(
    @Inject(AGENT_WORK_QUERY_REPOSITORY_PORT) private readonly repository: AgentWorkQueryRepositoryPort,
    @Optional() @Inject(OPERATION_RUNNER_PORT) private readonly operations?: Pick<OperationRunnerPort, 'get'>,
  ) {}
  async view(input: { organizationId: string; userId: string; sessionId: string }): Promise<unknown> {
    const session = await this.repository.loadOwnedWorkView(input) as { id: string; createdAt: Date; updatedAt: Date; tasks: Array<Record<string, unknown>> } | null;
    if (!session) throw new NotFoundException('agent_session_not_found');
    return {
      session: { id: session.id, createdAt: session.createdAt, updatedAt: session.updatedAt },
      tasks: await Promise.all(session.tasks.map((task) => workTaskFacts(task, session.tasks, input.organizationId, this.operations))),
    };
  }
  activeVersion(agentDefinitionKey: string) { return this.repository.activeVersion(agentDefinitionKey); }
  taskVersion(input: { organizationId: string; userId: string; sessionId: string; taskId: string }) { return this.repository.taskVersion(input); }
  liveAttempt(input: { organizationId: string; userId: string; sessionId: string; taskId: string; attemptId?: string }) { return this.repository.liveAttempt(input); }
  threadContinuation(input: { organizationId: string; userId: string; sessionId: string }) { return this.repository.threadContinuation(input); }
  async continuationContext(input: { organizationId: string; userId: string; sessionId: string; taskId: string; prompt: string }): Promise<{ prompt: string; input: { prompt: string; resourceRefs: unknown[]; operationRefs: unknown[] } }> {
    const userPrompt = input.prompt.trim();
    if (!userPrompt) throw new NotFoundException('attempt_prompt_required');
    const session = await this.repository.loadOwnedWorkView(input) as { tasks?: Array<Record<string, unknown>> } | null;
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
function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
}
function boundedStructured(value: unknown): unknown | null {
  if (value === undefined || value === null) return null;
  try {
    const serialized = JSON.stringify(value);
    if (typeof serialized !== 'string' || Buffer.byteLength(serialized, 'utf8') > 4_096) return null;
    return JSON.parse(serialized) as unknown;
  } catch {
    return null;
  }
}
function nestedErrorMessage(result: Record<string, unknown> | null): unknown {
  return result?.error && typeof result.error === 'object' ? (result.error as Record<string, unknown>).message : undefined;
}

async function workTaskFacts(
  task: Record<string, unknown>,
  all: Array<Record<string, unknown>>,
  organizationId: string,
  operations?: Pick<OperationRunnerPort, 'get'>,
) {
  const attempts = Array.isArray(task.attempts) ? task.attempts as Array<Record<string, unknown>> : [];
  const invocations = Array.isArray(task.invocations) ? task.invocations as Array<Record<string, unknown>> : [];
  const latest = attempts[0] ?? null;
  const result = asRecord(latest?.result);
  const allApprovals = invocations
    .map((item) => approvalFacts(item.approval, item.id))
    .filter((approval): approval is Record<string, unknown> => approval !== null);
  const approval = allApprovals.find((item) => item.status === 'pending') ?? null;
  const approvals = boundedApprovals(allApprovals, approval);
  const refs = [result, ...invocations.map((item) => asRecord(item.result))]
    .filter((item): item is Record<string, unknown> => item !== null);
  const persistedOperationRefs = boundedRefs(refs, 'operationRefs');
  const operationRefs = await currentOperationRefs(persistedOperationRefs, organizationId, operations);
  const resourceRefs = boundedRefs(refs, 'resourceRefs');
  const assignedAgentVersion = task.assignedAgentVersion && typeof task.assignedAgentVersion === 'object'
    ? task.assignedAgentVersion as Record<string, unknown>
    : null;
  const agentDefinitionKey = typeof assignedAgentVersion?.agentDefinitionKey === 'string'
    ? assignedAgentVersion.agentDefinitionKey
    : null;
  return {
    id: task.id,
    parentTaskId: task.parentTaskId ?? null,
    agentDefinitionKey,
    objective: boundedText(task.objective, 8_000),
    completionCriteria: boundedText(task.completionCriteria, 4_000),
    status: boundedText(task.status, 64),
    latestAttempt: latest ? attemptFacts(latest) : null,
    result: resultFacts(result),
    approval,
    approvals,
    invocations: invocations.slice(0, 24).map((invocation) => invocationFacts(invocation)),
    childTasks: all.filter((candidate) => candidate.parentTaskId === task.id).slice(0, 24).map(childTaskFacts),
    resourceRefs,
    operationRefs,
  };
}

function childTaskFacts(task: Record<string, unknown>): Record<string, unknown> {
  const attempts = Array.isArray(task.attempts) ? task.attempts as Array<Record<string, unknown>> : [];
  return {
    id: task.id,
    parentTaskId: task.parentTaskId ?? null,
    objective: boundedText(task.objective, 1_000),
    completionCriteria: boundedText(task.completionCriteria, 1_000),
    status: boundedText(task.status, 64),
    latestAttempt: attempts[0] ? attemptFacts(attempts[0]) : null,
  };
}

function attemptFacts(attempt: Record<string, unknown>): Record<string, unknown> {
  return {
    id: attempt.id,
    ordinal: attempt.ordinal,
    status: boundedText(attempt.status, 64),
    result: resultFacts(asRecord(attempt.result)),
    error: errorFacts(attempt.error),
  };
}

function invocationFacts(invocation: Record<string, unknown>): Record<string, unknown> {
  return {
    id: invocation.id,
    capabilityKey: boundedText(invocation.capabilityKey, 128),
    status: boundedText(invocation.status, 64),
    result: resultFacts(asRecord(invocation.result)),
    error: errorFacts(invocation.error),
    approval: approvalFacts(invocation.approval, invocation.id),
  };
}

function approvalFacts(value: unknown, fallbackInvocationId: unknown): Record<string, unknown> | null {
  const approval = asRecord(value);
  if (!approval) return null;
  return {
    id: approval.id,
    invocationId: approval.invocationId ?? fallbackInvocationId,
    inputHash: boundedText(approval.inputHash, 128),
    status: boundedText(approval.status, 64),
    expiresAt: approval.expiresAt ?? null,
  };
}

function boundedApprovals(
  approvals: Array<Record<string, unknown>>,
  pending: Record<string, unknown> | null,
): Array<Record<string, unknown>> {
  const bounded = approvals.slice(0, 24);
  if (!pending || bounded.some((approval) => approval.id === pending.id)) return bounded;
  return [...bounded.slice(0, 23), pending];
}

function resultFacts(result: Record<string, unknown> | null): Record<string, unknown> | null {
  if (!result) return null;
  const needsInput = boundedStructured(result.needsInput);
  const error = errorFacts(result.error);
  return {
    outcome: boundedText(result.outcome, 64) || null,
    summary: boundedText(result.summary, 1_000) || null,
    resourceRefs: boundedRefs([result], 'resourceRefs'),
    operationRefs: boundedRefs([result], 'operationRefs'),
    ...(needsInput === null ? {} : { needsInput }),
    ...(error === null ? {} : { error }),
  };
}

function errorFacts(value: unknown): Record<string, unknown> | null {
  const error = asRecord(value);
  if (!error) return null;
  return {
    code: boundedText(error.code, 128) || null,
    message: boundedText(error.message, 1_000) || null,
  };
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
