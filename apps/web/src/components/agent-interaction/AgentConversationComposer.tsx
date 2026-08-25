'use client';

import { useEffect, useMemo, useState } from 'react';
import { Send, Square } from 'lucide-react';
import type { ConversationRuntime, GatewayReadiness } from './conversation-api';

type ReadyGateway = Extract<GatewayReadiness, { ready: true }>;

export function AgentConversationComposer({
  label,
  runtime,
  readiness,
  initialDraft,
  activeTurnId,
  onStart,
  onInput,
  onInterrupt,
}: {
  label: string;
  runtime: ConversationRuntime;
  readiness: GatewayReadiness[] | null | undefined;
  initialDraft?: string;
  activeTurnId: string | null;
  onStart(input: { message: string; model: string; reasoningEffort: string }): Promise<void>;
  onInput(message: string): Promise<void>;
  onInterrupt(): Promise<void>;
}) {
  const [draft, setDraft] = useState(initialDraft ?? '');
  const [model, setModel] = useState('');
  const [reasoningEffort, setReasoningEffort] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const runtimeReadiness = useMemo(
    () => readiness === undefined
      ? undefined
      : readiness?.find((entry): entry is ReadyGateway => entry.runtime === runtime && entry.ready) ?? null,
    [readiness, runtime],
  );
  const models = useMemo(() => runtimeReadiness?.readiness.models ?? [], [runtimeReadiness]);
  const efforts = useMemo(
    () => runtimeReadiness?.readiness.modelReasoningEfforts
      .find((entry) => entry.model === model)?.reasoningEfforts ?? [],
    [model, runtimeReadiness],
  );

  useEffect(() => {
    if (initialDraft) setDraft(initialDraft);
  }, [initialDraft]);
  useEffect(() => {
    setModel((current) => models.includes(current) ? current : '');
  }, [models]);
  useEffect(() => {
    setReasoningEffort((current) => efforts.includes(current) ? current : '');
  }, [efforts]);

  const canStart = Boolean(draft.trim() && model && reasoningEffort && runtimeReadiness && !submitting);
  const canInput = Boolean(draft.trim() && activeTurnId && !submitting);
  const submit = async () => {
    if (!(activeTurnId ? canInput : canStart)) return;
    setSubmitting(true);
    setError(null);
    try {
      if (activeTurnId) await onInput(draft.trim());
      else await onStart({ message: draft.trim(), model, reasoningEffort });
      setDraft('');
    } catch {
      setError(activeTurnId ? 'Unable to send input to the active turn.' : 'Unable to start this turn.');
    } finally {
      setSubmitting(false);
    }
  };
  const interrupt = async () => {
    setSubmitting(true);
    setError(null);
    try {
      await onInterrupt();
    } catch {
      setError('Unable to interrupt the active turn.');
    } finally {
      setSubmitting(false);
    }
  };
  const needsModel = !activeTurnId && runtimeReadiness && !model;
  const needsEffort = !activeTurnId && runtimeReadiness && model && !reasoningEffort;

  return (
    <form
      className="sticky bottom-0 border-t bg-background/95 p-3 backdrop-blur supports-[backdrop-filter]:bg-background/80"
      onSubmit={(event) => { event.preventDefault(); void submit(); }}
    >
      {readiness === undefined ? <p role="status" className="mb-2 text-sm text-muted-foreground">Checking Gateway readiness…</p> : null}
      {readiness !== undefined && !runtimeReadiness ? <p role="status" className="mb-2 text-sm text-amber-700">Gateway unavailable. Provider history and durable cards remain available.</p> : null}
      {needsModel ? <p id="agent-conversation-model-help" className="mb-2 text-sm text-muted-foreground">Choose a supported model to start a turn.</p> : null}
      {needsEffort ? <p id="agent-conversation-effort-help" className="mb-2 text-sm text-muted-foreground">Choose a supported reasoning effort to start a turn.</p> : null}
      {error ? <p role="alert" className="mb-2 text-sm text-destructive">{error}</p> : null}
      <label className="sr-only" htmlFor="agent-conversation-message">Message {label}</label>
      <textarea
        id="agent-conversation-message"
        maxLength={16_000}
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        placeholder={`Message ${label}`}
        rows={2}
        className="min-h-20 w-full resize-y rounded-lg border bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
      />
      <div className="mt-2 flex flex-wrap items-end gap-2 max-sm:flex-col max-sm:items-stretch">
        <label className="grid min-w-36 flex-1 gap-1 text-xs font-medium text-muted-foreground max-sm:w-full">
          Model
          <select aria-label="Model" aria-describedby={needsModel ? 'agent-conversation-model-help' : undefined} value={model} disabled={Boolean(activeTurnId) || !runtimeReadiness} onChange={(event) => setModel(event.target.value)} className="min-h-10 rounded-md border bg-background px-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:opacity-60 max-lg:min-h-11">
            <option value="">Select model</option>
            {models.map((candidate) => <option key={candidate} value={candidate}>{candidate}</option>)}
          </select>
        </label>
        <label className="grid min-w-36 flex-1 gap-1 text-xs font-medium text-muted-foreground max-sm:w-full">
          Reasoning effort
          <select aria-label="Reasoning effort" aria-describedby={needsEffort ? 'agent-conversation-effort-help' : undefined} value={reasoningEffort} disabled={Boolean(activeTurnId) || !model} onChange={(event) => setReasoningEffort(event.target.value)} className="min-h-10 rounded-md border bg-background px-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:opacity-60 max-lg:min-h-11">
            <option value="">Select effort</option>
            {efforts.map((candidate) => <option key={candidate} value={candidate}>{candidate}</option>)}
          </select>
        </label>
        {activeTurnId ? (
          <button type="button" onClick={() => void interrupt()} disabled={submitting} className="inline-flex min-h-10 items-center gap-1 rounded-md border px-3 py-2 text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 max-lg:min-h-11 max-sm:w-full max-sm:justify-center">
            <Square aria-hidden="true" size={16} /> Interrupt
          </button>
        ) : null}
        <button type="submit" disabled={activeTurnId ? !canInput : !canStart} className="inline-flex min-h-10 items-center gap-1 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 max-lg:min-h-11 max-sm:w-full max-sm:justify-center">
          <Send aria-hidden="true" size={16} /> {activeTurnId ? 'Send input' : 'Send'}
        </button>
      </div>
    </form>
  );
}
