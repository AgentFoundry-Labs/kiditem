'use client';

import { useEffect, useMemo, useState } from 'react';
import { conversationContexts } from './conversation-context.catalog';
import { isSupportedConversationPair, readyGatewayForRuntime } from './conversation-preference-selection';
import type {
  AgentConversationKey,
  ConversationPreferences,
  ConversationRuntime,
  GatewayReadiness,
  SetConversationPreferenceCommand,
} from './conversation-api';

const runtimes: Array<{ value: ConversationRuntime; label: string }> = [
  { value: 'codex_cli', label: 'Codex' },
  { value: 'claude_cli', label: 'Claude' },
];

/** User-owned model and reasoning defaults, scoped to one context and engine. */
export function ConversationDefaultsSettings({
  preferences,
  preferencesLoading,
  preferencesError,
  readiness,
  onSave,
}: {
  preferences: ConversationPreferences | null | undefined;
  preferencesLoading: boolean;
  preferencesError: boolean;
  readiness: GatewayReadiness[] | null | undefined;
  onSave(input: SetConversationPreferenceCommand): Promise<ConversationPreferences>;
}) {
  const [context, setContext] = useState<AgentConversationKey | null>(null);
  const [runtime, setRuntime] = useState<ConversationRuntime>('codex_cli');
  const [model, setModel] = useState('');
  const [reasoningEffort, setReasoningEffort] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState(false);
  const stored = preferences?.contexts[context ?? 'general']?.[runtime];
  const gateway = readyGatewayForRuntime(runtime, readiness);
  const models = gateway?.readiness.models ?? [];
  const efforts = gateway?.readiness.modelReasoningEfforts
    .find((entry) => entry.model === model)?.reasoningEfforts ?? [];
  const storedNeedsReview = Boolean(stored && !isSupportedConversationPair({
    runtime,
    model: stored.model,
    reasoningEffort: stored.reasoningEffort,
    readiness,
  }));
  const modelOptions = useMemo(
    () => stored?.model && !models.includes(stored.model) ? [stored.model, ...models] : models,
    [models, stored?.model],
  );
  const effortOptions = useMemo(
    () => stored?.reasoningEffort && !efforts.includes(stored.reasoningEffort)
      ? [stored.reasoningEffort, ...efforts]
      : efforts,
    [efforts, stored?.reasoningEffort],
  );
  const canSave = isSupportedConversationPair({ runtime, model, reasoningEffort, readiness });

  useEffect(() => {
    setModel(stored?.model ?? '');
    setReasoningEffort(stored?.reasoningEffort ?? '');
    setSaveError(false);
  }, [context, runtime, stored?.model, stored?.reasoningEffort]);

  const selectModel = (nextModel: string) => {
    setModel(nextModel);
    const supportedEfforts = gateway?.readiness.modelReasoningEfforts
      .find((entry) => entry.model === nextModel)?.reasoningEfforts ?? [];
    if (!supportedEfforts.includes(reasoningEffort)) setReasoningEffort('');
  };
  const save = async () => {
    if (!canSave) return;
    setSaving(true);
    setSaveError(false);
    try {
      await onSave({
        context: context ?? 'general',
        runtime,
        model,
        reasoningEffort,
      });
    } catch {
      setSaveError(true);
    } finally {
      setSaving(false);
    }
  };

  return (
    <section aria-label="대화 기본값" className="space-y-4">
      <p className="text-sm leading-6 text-muted-foreground">새 대화에 사용할 모델과 사고 수준을 선택하세요.</p>
      {preferencesLoading ? <p role="status" className="text-sm text-muted-foreground">기본값을 불러오는 중입니다.</p> : null}
      {preferencesError ? <p role="alert" className="text-sm text-destructive">기본값을 불러올 수 없습니다. 모델과 사고 수준을 직접 선택해 주세요.</p> : null}
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="grid gap-1 text-sm font-medium">
          대화 컨텍스트
          <select aria-label="대화 컨텍스트" value={context ?? 'general'} onChange={(event) => setContext(event.target.value === 'general' ? null : event.target.value as AgentConversationKey)} className="min-h-10 rounded-md border bg-background px-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 max-lg:min-h-11">
            {conversationContexts.map((candidate) => <option key={candidate.key ?? 'general'} value={candidate.key ?? 'general'}>{candidate.label}</option>)}
          </select>
        </label>
        <label className="grid gap-1 text-sm font-medium">
          대화 엔진
          <select aria-label="대화 엔진" value={runtime} onChange={(event) => setRuntime(event.target.value as ConversationRuntime)} className="min-h-10 rounded-md border bg-background px-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 max-lg:min-h-11">
            {runtimes.map((candidate) => <option key={candidate.value} value={candidate.value}>{candidate.label}</option>)}
          </select>
        </label>
      </div>
      <label className="grid gap-1 text-sm font-medium">
        모델
        <select aria-label="기본 모델" value={model} disabled={!gateway} onChange={(event) => selectModel(event.target.value)} className="min-h-10 rounded-md border bg-background px-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60 max-lg:min-h-11">
          <option value="">선택</option>
          {modelOptions.map((candidate) => <option key={candidate} value={candidate}>{candidate}{storedNeedsReview && candidate === stored?.model ? ' (검토 필요)' : ''}</option>)}
        </select>
      </label>
      <label className="grid gap-1 text-sm font-medium">
        사고 수준
        <select aria-label="기본 사고 수준" value={reasoningEffort} disabled={!gateway || !model} onChange={(event) => setReasoningEffort(event.target.value)} className="min-h-10 rounded-md border bg-background px-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60 max-lg:min-h-11">
          <option value="">선택</option>
          {effortOptions.map((candidate) => <option key={candidate} value={candidate}>{candidate}{storedNeedsReview && candidate === stored?.reasoningEffort ? ' (검토 필요)' : ''}</option>)}
        </select>
      </label>
      {!gateway && readiness !== undefined ? <p role="status" className="text-sm text-amber-700">선택한 대화 엔진을 현재 사용할 수 없습니다.</p> : null}
      {storedNeedsReview ? <p role="alert" className="text-sm text-amber-700">저장된 모델과 사고 수준을 다시 선택해 주세요.</p> : null}
      {saveError ? <p role="alert" className="text-sm text-destructive">기본값을 저장할 수 없습니다.</p> : null}
      <button type="button" disabled={!canSave || saving} onClick={() => void save()} className="inline-flex min-h-10 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 max-lg:min-h-11">
        {saving ? '저장 중…' : '기본값 저장'}
      </button>
    </section>
  );
}
