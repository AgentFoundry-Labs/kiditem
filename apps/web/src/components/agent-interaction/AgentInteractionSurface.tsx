'use client';

import { useState, type ComponentProps } from 'react';
import { apiClient } from '@/lib/api-client';

type WorkProjection = { session: { id: string }; tasks: Array<{ id: string; objective: string; status: string; presentation: string; latestAttempt: { id: string; ordinal: number; status: string } | null; approval?: { id: string; invocationId: string; inputHash: string } | null }> };

/** Durable Work UI. Only future live UI events may be held in browser memory. */
export function AgentInteractionSurface({ surface = 'global_panel', ...props }: ComponentProps<'section'> & { surface?: 'global_panel' | 'workspace' }) {
  const [projection, setProjection] = useState<WorkProjection | null>(null);
  const [prompt, setPrompt] = useState('');
  const [sessionId, setSessionId] = useState('');
  const start = async () => {
    const admitted = await apiClient.post<{ session: { id: string } }>('/api/agent-work/start', { objective: prompt });
    setSessionId(admitted.session.id);
    setPrompt('');
    setProjection(await apiClient.get<WorkProjection>(`/api/agent-work/sessions/${admitted.session.id}`));
  };
  const refresh = async () => sessionId && setProjection(await apiClient.get<WorkProjection>(`/api/agent-work/sessions/${sessionId}`));
  const action = async (path: string, body?: unknown) => { await apiClient.post(path, body); await refresh(); };
  const deleteSession = async () => { await action(`/api/agent-work/sessions/${sessionId}/delete`); setProjection(null); setSessionId(''); };
  return <section {...props} data-interaction-surface={surface} className={`flex min-h-0 flex-1 flex-col gap-3 ${props.className ?? ''}`}>
    <h1 className="text-lg font-semibold">Operator work</h1>
    <p className="text-sm text-muted-foreground">Refresh loads durable tasks and attempts; past chat is never replayed.</p>
    <div className="flex gap-2"><input value={prompt} onChange={(event) => setPrompt(event.target.value)} placeholder="Ask Operator to begin work" className="flex-1 rounded border px-3 py-2" /><button type="button" onClick={start} disabled={!prompt.trim()} className="rounded bg-primary px-3 py-2 text-primary-foreground">Start</button></div>
    {sessionId ? <div className="flex gap-2"><button type="button" onClick={refresh} className="rounded border px-3 py-1">Refresh durable work</button><button type="button" onClick={deleteSession} className="rounded border px-3 py-1">Delete terminal session</button></div> : null}
    <ul className="space-y-2">{projection?.tasks.map((task) => <li key={task.id} className="rounded border p-3"><p>{task.objective}</p><p className="text-sm text-muted-foreground">{task.status} · {task.presentation} · {task.latestAttempt ? `Attempt ${task.latestAttempt.ordinal}: ${task.latestAttempt.status}` : 'No attempt'}</p><div className="mt-2 flex flex-wrap gap-2">{task.latestAttempt ? <><button type="button" onClick={() => action(`/api/agent-work/sessions/${sessionId}/tasks/${task.id}/continue`, { predecessorAttemptId: task.latestAttempt!.id })}>Continue</button><button type="button" onClick={() => action(`/api/agent-work/sessions/${sessionId}/tasks/${task.id}/continue`, { predecessorAttemptId: task.latestAttempt!.id, reopen: true })}>Reopen</button>{['starting', 'running'].includes(task.latestAttempt.status) ? <button type="button" onClick={() => action(`/api/agent-work/sessions/${sessionId}/tasks/${task.id}/attempts/${task.latestAttempt!.id}/interrupt`)}>Interrupt</button> : null}</> : null}{task.status === 'open' ? <button type="button" onClick={() => action(`/api/agent-work/sessions/${sessionId}/tasks/${task.id}/cancel`)}>Cancel</button> : null}{task.approval ? <><button type="button" onClick={() => action(`/api/agent-work/sessions/${sessionId}/approvals/${task.approval!.id}`, { invocationId: task.approval!.invocationId, inputHash: task.approval!.inputHash, decision: 'approved' })}>Approve</button><button type="button" onClick={() => action(`/api/agent-work/sessions/${sessionId}/approvals/${task.approval!.id}`, { invocationId: task.approval!.invocationId, inputHash: task.approval!.inputHash, decision: 'rejected' })}>Reject</button></> : null}</div></li>)}</ul>
  </section>;
}
