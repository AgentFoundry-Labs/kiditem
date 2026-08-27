'use client';

import { Check, ChevronDown, ChevronLeft, ChevronRight } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { readyGatewayForRuntime } from './conversation-preference-selection';
import type { ConversationRuntime, GatewayReadiness } from './conversation-api';

const runtimeLabels: Record<ConversationRuntime, string> = {
  codex_cli: 'Codex',
  claude_cli: 'Claude',
};

type SelectionStep = 'menu' | 'runtime' | 'model' | 'reasoning';

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
  const [step, setStep] = useState<SelectionStep>('menu');
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
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
  const modelOptions = modelNeedsReview && model ? [model, ...models] : models;
  const effortOptions = effortNeedsReview && reasoningEffort ? [reasoningEffort, ...efforts] : efforts;
  const label = runtime
    ? `${runtimeLabels[runtime]} · ${model ?? '모델 선택'} · ${reasoningEffort ?? '추론 수준 선택'}`
    : '대화 엔진 선택';
  const modelDisabled = disabled || !runtime || !readyRuntime;
  const reasoningDisabled = disabled || !runtime || !model || !readyRuntime;

  const close = useCallback(() => {
    setOpen(false);
    setStep('menu');
    window.setTimeout(() => triggerRef.current?.focus(), 0);
  }, []);
  useEffect(() => {
    if (!open) return undefined;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      close();
    };
    document.addEventListener('keydown', closeOnEscape);
    return () => document.removeEventListener('keydown', closeOnEscape);
  }, [close, open]);
  useEffect(() => {
    if (!open) return;
    panelRef.current?.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus();
  }, [open, step]);

  const selectRuntime = (nextRuntime: ConversationRuntime) => {
    onRuntimeChange(nextRuntime);
    onModelChange(null);
    onReasoningEffortChange(null);
    setStep('menu');
  };
  const selectModel = (nextModel: string) => {
    onModelChange(nextModel);
    const supportedEfforts = readyRuntime?.readiness.modelReasoningEfforts
      .find((entry) => entry.model === nextModel)?.reasoningEfforts ?? [];
    if (!reasoningEffort || !supportedEfforts.includes(reasoningEffort)) onReasoningEffortChange(null);
    setStep('menu');
  };
  const selectReasoningEffort = (nextReasoningEffort: string) => {
    onReasoningEffortChange(nextReasoningEffort);
    setStep('menu');
  };

  return (
    <div className="relative min-w-0 flex-1">
      <button
        ref={triggerRef}
        type="button"
        aria-label="대화 엔진 설정"
        aria-expanded={open}
        aria-haspopup="dialog"
        onClick={() => {
          if (open) close();
          else {
            setStep('menu');
            setOpen(true);
          }
        }}
        className="inline-flex min-h-10 w-full min-w-0 items-center gap-1 rounded-full border border-input bg-card px-3 py-2 text-left text-sm font-medium hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 max-lg:min-h-11"
      >
        <span className="min-w-0 flex-1 truncate">{label}</span>
        <ChevronDown aria-hidden="true" size={16} className="shrink-0" />
      </button>
      {open ? (
        <div
          ref={panelRef}
          role="dialog"
          aria-label="대화 엔진 설정"
          className="absolute bottom-full left-0 z-30 mb-2 w-80 max-w-[calc(100vw-2rem)] rounded-2xl border border-input bg-popover p-2 shadow-lg"
        >
          {step === 'menu' ? (
            <>
              <div className="flex items-center gap-2 px-2 py-2 text-sm font-semibold">
                <Check aria-hidden="true" size={16} /> 대화 엔진 설정
              </div>
              <div className="space-y-1">
                <SelectorMenuRow
                  label="대화 엔진"
                  value={runtime ? runtimeLabels[runtime] : '선택'}
                  disabled={!providerEditable || disabled}
                  onClick={() => setStep('runtime')}
                />
                <SelectorMenuRow
                  label="모델"
                  value={model ?? '선택'}
                  disabled={modelDisabled}
                  onClick={() => setStep('model')}
                />
                <SelectorMenuRow
                  label="추론 수준"
                  value={reasoningEffort ?? '선택'}
                  disabled={reasoningDisabled}
                  onClick={() => setStep('reasoning')}
                />
              </div>
              {readiness === undefined && runtime ? <p role="status" className="px-2 pb-1 pt-3 text-xs text-muted-foreground">대화 엔진 정보를 확인하고 있습니다.</p> : null}
              {readiness !== undefined && runtime && !readyRuntime ? <p role="status" className="px-2 pb-1 pt-3 text-xs text-amber-700">선택한 대화 엔진을 현재 사용할 수 없습니다.</p> : null}
              {needsReview || modelNeedsReview || effortNeedsReview ? <p role="alert" className="px-2 pb-1 pt-3 text-xs text-amber-700">선택한 모델과 추론 수준을 다시 선택해 주세요.</p> : null}
            </>
          ) : (
            <ChoiceList
              step={step}
              runtime={runtime}
              model={model}
              reasoningEffort={reasoningEffort}
              modelOptions={modelOptions}
              effortOptions={effortOptions}
              onBack={() => setStep('menu')}
              onRuntime={selectRuntime}
              onModel={selectModel}
              onReasoningEffort={selectReasoningEffort}
            />
          )}
        </div>
      ) : null}
    </div>
  );
}

function SelectorMenuRow({
  label,
  value,
  disabled,
  onClick,
}: {
  label: string;
  value: string;
  disabled: boolean;
  onClick(): void;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className="flex min-h-11 w-full items-center gap-3 rounded-xl px-2 text-left text-sm hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
    >
      <span className="min-w-0 flex-1 text-muted-foreground">{label}</span>
      <span className="max-w-[11rem] truncate font-medium text-foreground">{value}</span>
      <ChevronRight aria-hidden="true" size={16} className="shrink-0 text-muted-foreground" />
    </button>
  );
}

function ChoiceList({
  step,
  runtime,
  model,
  reasoningEffort,
  modelOptions,
  effortOptions,
  onBack,
  onRuntime,
  onModel,
  onReasoningEffort,
}: {
  step: Exclude<SelectionStep, 'menu'>;
  runtime: ConversationRuntime | null;
  model: string | null;
  reasoningEffort: string | null;
  modelOptions: string[];
  effortOptions: string[];
  onBack(): void;
  onRuntime(runtime: ConversationRuntime): void;
  onModel(model: string): void;
  onReasoningEffort(reasoningEffort: string): void;
}) {
  const title = step === 'runtime' ? '대화 엔진' : step === 'model' ? '모델' : '추론 수준';
  const options = step === 'runtime'
    ? (Object.entries(runtimeLabels) as Array<[ConversationRuntime, string]>).map(([value, label]) => ({ value, label, selected: runtime === value }))
    : step === 'model'
      ? modelOptions.map((value) => ({ value, label: value, selected: model === value }))
      : effortOptions.map((value) => ({ value, label: value, selected: reasoningEffort === value }));
  const choose = (value: string) => {
    if (step === 'runtime') onRuntime(value as ConversationRuntime);
    else if (step === 'model') onModel(value);
    else onReasoningEffort(value);
  };

  return (
    <>
      <div className="flex items-center gap-2 px-1 py-1">
        <button
          type="button"
          aria-label="대화 엔진 설정으로 돌아가기"
          onClick={onBack}
          className="inline-flex min-h-9 min-w-9 items-center justify-center rounded-full hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <ChevronLeft aria-hidden="true" size={18} />
        </button>
        <p className="text-sm font-semibold">{title} 선택</p>
      </div>
      <div role="listbox" aria-label={`${title} 목록`} className="max-h-56 space-y-1 overflow-y-auto py-1">
        {options.map((option) => (
          <button
            key={option.value}
            type="button"
            role="option"
            aria-selected={option.selected}
            onClick={() => choose(option.value)}
            className={`flex min-h-10 w-full items-center rounded-xl px-3 text-left text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${option.selected ? 'bg-primary-soft font-medium text-primary' : 'hover:bg-muted'}`}
          >
            {option.label}
          </button>
        ))}
      </div>
    </>
  );
}
