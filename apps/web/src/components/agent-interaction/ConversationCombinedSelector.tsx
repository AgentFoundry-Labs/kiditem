'use client';

import { Check, ChevronDown } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { readyGatewayForRuntime } from './conversation-preference-selection';
import type { ConversationRuntime, GatewayReadiness } from './conversation-api';

const runtimeLabels: Record<ConversationRuntime, string> = {
  codex_cli: 'Codex',
  claude_cli: 'Claude',
};

export function ConversationCombinedSelector({
  runtime,
  readiness,
  model,
  reasoningEffort,
  providerEditable,
  disabled,
  needsReview = false,
  onRuntimeChange,
  onModelChange,
  onReasoningEffortChange,
}: {
  runtime: ConversationRuntime | null;
  readiness: GatewayReadiness[] | null | undefined;
  model: string | null;
  reasoningEffort: string | null;
  providerEditable: boolean;
  disabled: boolean;
  needsReview?: boolean;
  onRuntimeChange(runtime: ConversationRuntime | null): void;
  onModelChange(model: string | null): void;
  onReasoningEffortChange(reasoningEffort: string | null): void;
}) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const readyRuntime = useMemo(
    () => !runtime || readiness === undefined
      ? undefined
      : readyGatewayForRuntime(runtime, readiness),
    [readiness, runtime],
  );
  const models = readyRuntime?.readiness.models ?? [];
  const efforts = readyRuntime?.readiness.modelReasoningEfforts
    .find((entry) => entry.model === model)?.reasoningEfforts ?? [];
  const modelNeedsReview = Boolean(model && !models.includes(model));
  const effortNeedsReview = Boolean(reasoningEffort && !efforts.includes(reasoningEffort));
  const label = runtime
    ? `${runtimeLabels[runtime]} · ${model ?? '모델 선택'} · ${reasoningEffort ?? '사고 수준 선택'}`
    : '대화 엔진 선택';

  const close = () => {
    setOpen(false);
    triggerRef.current?.focus();
  };
  useEffect(() => {
    if (!open) return undefined;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      close();
    };
    document.addEventListener('keydown', closeOnEscape);
    return () => document.removeEventListener('keydown', closeOnEscape);
  }, [open]);
  const selectRuntime = (next: string) => {
    const nextRuntime = next || null;
    onRuntimeChange(nextRuntime as ConversationRuntime | null);
    onModelChange(null);
    onReasoningEffortChange(null);
  };
  const selectModel = (nextModel: string) => {
    onModelChange(nextModel || null);
    const supportedEfforts = readyRuntime?.readiness.modelReasoningEfforts
      .find((entry) => entry.model === nextModel)?.reasoningEfforts ?? [];
    if (!reasoningEffort || !supportedEfforts.includes(reasoningEffort)) onReasoningEffortChange(null);
  };

  return (
    <div className="relative shrink-0">
      <button
        ref={triggerRef}
        type="button"
        aria-label="대화 엔진 설정"
        aria-expanded={open}
        aria-haspopup="dialog"
        onClick={() => setOpen((current) => !current)}
        className="inline-flex min-h-10 max-w-full items-center gap-1 rounded-md border bg-background px-3 py-2 text-left text-sm font-medium hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 max-lg:min-h-11"
      >
        <span className="truncate">{label}</span>
        <ChevronDown aria-hidden="true" size={16} className="shrink-0" />
      </button>
      {open ? (
        <div
          role="dialog"
          aria-label="대화 엔진 설정"
          onKeyDown={(event) => {
            if (event.key !== 'Escape') return;
            event.preventDefault();
            event.stopPropagation();
            close();
          }}
          className="absolute bottom-full left-0 z-30 mb-2 w-80 max-w-[calc(100vw-2rem)] rounded-lg border bg-popover p-3 shadow-lg"
        >
          <div className="flex items-center gap-2 text-sm font-semibold">
            <Check aria-hidden="true" size={16} /> 대화 엔진 설정
          </div>
          <label className="mt-3 grid gap-1 text-xs font-medium text-muted-foreground">
            대화 엔진
            <select
              aria-label="대화 엔진"
              value={runtime ?? ''}
              disabled={!providerEditable || disabled}
              onChange={(event) => selectRuntime(event.target.value)}
              className="min-h-10 rounded-md border bg-background px-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60 max-lg:min-h-11"
            >
              <option value="">선택</option>
              <option value="codex_cli">Codex</option>
              <option value="claude_cli">Claude</option>
            </select>
          </label>
          <label className="mt-3 grid gap-1 text-xs font-medium text-muted-foreground">
            모델
            <select
              aria-label="모델"
              value={model ?? ''}
              disabled={disabled || !runtime || !readyRuntime}
              onChange={(event) => selectModel(event.target.value)}
              className="min-h-10 rounded-md border bg-background px-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60 max-lg:min-h-11"
            >
              <option value="">선택</option>
              {modelNeedsReview ? <option value={model ?? ''}>{model} (검토 필요)</option> : null}
              {models.map((candidate) => <option key={candidate} value={candidate}>{candidate}</option>)}
            </select>
          </label>
          <label className="mt-3 grid gap-1 text-xs font-medium text-muted-foreground">
            사고 수준
            <select
              aria-label="사고 수준"
              value={reasoningEffort ?? ''}
              disabled={disabled || !runtime || !model || !readyRuntime}
              onChange={(event) => onReasoningEffortChange(event.target.value || null)}
              className="min-h-10 rounded-md border bg-background px-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60 max-lg:min-h-11"
            >
              <option value="">선택</option>
              {effortNeedsReview ? <option value={reasoningEffort ?? ''}>{reasoningEffort} (검토 필요)</option> : null}
              {efforts.map((candidate) => <option key={candidate} value={candidate}>{candidate}</option>)}
            </select>
          </label>
          {readiness === undefined && runtime ? <p role="status" className="mt-3 text-xs text-muted-foreground">대화 엔진 정보를 확인하고 있습니다.</p> : null}
          {readiness !== undefined && runtime && !readyRuntime ? <p role="status" className="mt-3 text-xs text-amber-700">선택한 대화 엔진을 현재 사용할 수 없습니다.</p> : null}
          {needsReview || modelNeedsReview || effortNeedsReview ? <p role="alert" className="mt-3 text-xs text-amber-700">선택한 모델과 사고 수준을 다시 선택해 주세요.</p> : null}
        </div>
      ) : null}
    </div>
  );
}
