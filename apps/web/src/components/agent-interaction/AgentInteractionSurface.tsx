'use client';

import { useEffect, useRef, useState, type ComponentProps } from 'react';
import { useAgent, useCopilotKit } from '@copilotkit/react-core/v2';
import { apiClient } from '@/lib/api-client';

type WorkProjection = { session: { id: string }; tasks: Array<{ id: string; parentTaskId: string | null; objective: string; status: string; presentation: string; summary?: string | null; error?: { code?: string; message?: string } | null; resourceRefs?: Array<{ kind: string; id: string }>; operationRefs?: Array<{ kind: string; id: string; status?: string }>; latestAttempt: { id: string; ordinal: number; status: string } | null; approval?: { id: string; invocationId: string; inputHash: string; expiresAt?: string } | null }> };

/** Durable Work UI. CopilotKit messages are future-only browser memory. */
export function AgentInteractionSurface({ surface = 'global_panel', ...props }: ComponentProps<'section'> & { surface?: 'global_panel' | 'workspace' }) {
  const [projection, setProjection] = useState<WorkProjection | null>(null);
  const [prompt, setPrompt] = useState('');
  const [queuedPrompt, setQueuedPrompt] = useState<{ id: string; text: string } | null>(null);
  const [sessionId, setSessionId] = useState('');
  const refresh = async (id = sessionId) => id && setProjection(await apiClient.get<WorkProjection>(`/api/agent-work/sessions/${id}`));
  const start = () => { const threadId = sessionId || crypto.randomUUID(); setSessionId(threadId); setQueuedPrompt({ id: crypto.randomUUID(), text: prompt.trim() }); setPrompt(''); };
  const newTask = () => { setProjection(null); setSessionId(''); setQueuedPrompt(null); setPrompt(''); };
  const action = async (path: string, body?: unknown) => { await apiClient.post(path, body); await refresh(); };
  const deleteSession = async () => { await action(`/api/agent-work/sessions/${sessionId}/delete`); setProjection(null); setSessionId(''); setQueuedPrompt(null); };
  const canDeleteSession = Boolean(projection?.tasks.length && projection.tasks.every((task) => task.status !== 'open'));
  return <section {...props} data-interaction-surface={surface} className={`flex min-h-0 flex-1 flex-col gap-3 ${props.className ?? ''}`}>
    <h1 className="text-lg font-semibold">Operator work</h1>
    <p className="text-sm text-muted-foreground">Refresh loads durable tasks and attempts; past chat is never replayed.</p>
    <div className="flex gap-2"><input value={prompt} onChange={(event) => setPrompt(event.target.value)} placeholder="Ask Operator to begin work" className="flex-1 rounded border px-3 py-2" /><button type="button" onClick={start} disabled={!prompt.trim()} className="rounded bg-primary px-3 py-2 text-primary-foreground">{sessionId ? 'Send follow-up' : 'Start'}</button>{sessionId ? <button type="button" onClick={newTask} className="rounded border px-3 py-2">New task</button> : null}</div>
    {sessionId ? <><LiveFutureAgent key={sessionId} threadId={sessionId} queuedPrompt={queuedPrompt} onConsumed={() => setQueuedPrompt(null)} onFinished={() => void refresh(sessionId)} /><div className="flex gap-2"><button type="button" onClick={() => void refresh()} className="rounded border px-3 py-1">Refresh durable work</button>{canDeleteSession ? <button type="button" onClick={() => void deleteSession()} className="rounded border px-3 py-1">Delete terminal session</button> : null}</div></> : null}
    <ul className="space-y-2">{projection?.tasks.map((task) => <li key={task.id} className="rounded border p-3" style={{ marginLeft: `${taskDepth(task, projection.tasks)}rem` }}><p>{task.objective}</p><p className="text-sm text-muted-foreground">{task.status} · {task.presentation} · {task.parentTaskId ? `Child of ${task.parentTaskId}` : 'Root task'} · {task.latestAttempt ? `Attempt ${task.latestAttempt.ordinal}: ${task.latestAttempt.status}` : 'No attempt'}</p>{task.summary ? <p className="text-sm" data-durable-summary>{task.summary}</p> : null}{task.error?.message ? <p className="text-sm text-destructive" data-durable-error>{task.error.message}</p> : null}{task.resourceRefs?.length ? <p className="text-xs text-muted-foreground" data-resource-refs>Resources: {task.resourceRefs.map((ref) => `${ref.kind}:${ref.id}`).join(', ')}</p> : null}{task.operationRefs?.length ? <p className="text-xs text-muted-foreground" data-operation-refs>Operations: {task.operationRefs.map((ref) => `${ref.kind}:${ref.id}${ref.status ? ` (${ref.status})` : ''}`).join(', ')}</p> : null}{task.approval ? <p className="text-xs text-muted-foreground" data-approval>Approval {task.approval.id}{task.approval.expiresAt ? ` · expires ${task.approval.expiresAt}` : ''}</p> : null}<div className="mt-2 flex flex-wrap gap-2">{task.latestAttempt && task.status === 'open' && ['needs_continue', 'needs_input'].includes(task.presentation) ? <button type="button" onClick={() => void action(`/api/agent-work/sessions/${sessionId}/tasks/${task.id}/continue`, { predecessorAttemptId: task.latestAttempt!.id, prompt: prompt.trim() || 'Continue the durable work with the current state.' })}>Continue</button> : null}{task.latestAttempt && task.status !== 'open' ? <button type="button" onClick={() => void action(`/api/agent-work/sessions/${sessionId}/tasks/${task.id}/continue`, { predecessorAttemptId: task.latestAttempt!.id, prompt: prompt.trim() || 'Reopen this durable work and continue from its current state.', reopen: true })}>Reopen</button> : null}{task.latestAttempt && ['starting', 'running'].includes(task.latestAttempt.status) ? <button type="button" onClick={() => void action(`/api/agent-work/sessions/${sessionId}/tasks/${task.id}/attempts/${task.latestAttempt!.id}/interrupt`)}>Interrupt</button> : null}{task.status === 'open' ? <button type="button" onClick={() => void action(`/api/agent-work/sessions/${sessionId}/tasks/${task.id}/cancel`)}>Cancel</button> : null}{task.approval ? <><button type="button" onClick={() => void action(`/api/agent-work/sessions/${sessionId}/approvals/${task.approval!.id}`, { invocationId: task.approval!.invocationId, inputHash: task.approval!.inputHash, decision: 'approved' })}>Approve</button><button type="button" onClick={() => void action(`/api/agent-work/sessions/${sessionId}/approvals/${task.approval!.id}`, { invocationId: task.approval!.invocationId, inputHash: task.approval!.inputHash, decision: 'rejected' })}>Reject</button></> : null}</div></li>)}</ul>
  </section>;
}

function LiveFutureAgent({ threadId, queuedPrompt, onConsumed, onFinished }: { threadId: string; queuedPrompt: { id: string; text: string } | null; onConsumed(): void; onFinished(): void }) {
  const { agent, isReady } = useAgent({ agentId: 'operator', runtimeAgentId: 'operator', threadId });
  const { copilotkit } = useCopilotKit();
  const submitted = useRef<string | null>(null);
  useEffect(() => {
    if (!queuedPrompt || !isReady || submitted.current === queuedPrompt.id) return;
    submitted.current = queuedPrompt.id;
    onConsumed();
    agent.addMessage({ id: crypto.randomUUID(), role: 'user', content: queuedPrompt.text });
    void copilotkit.runAgent({ agent }).finally(onFinished);
  }, [agent, copilotkit, isReady, onConsumed, onFinished, queuedPrompt]);
  return <ul aria-label="Live Operator output" className="space-y-1">{agent.messages.map((message) => <li key={message.id} data-live-message-role={message.role} className="text-sm">{typeof message.content === 'string' ? message.content : ''}</li>)}</ul>;
}

function taskDepth(task: WorkProjection['tasks'][number], tasks: WorkProjection['tasks']): number {
  let depth = 0;
  let parentId = task.parentTaskId;
  const seen = new Set<string>([task.id]);
  while (parentId && !seen.has(parentId) && depth < 8) {
    seen.add(parentId);
    depth += 1;
    parentId = tasks.find((candidate) => candidate.id === parentId)?.parentTaskId ?? null;
  }
  return depth;
}
