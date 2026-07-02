'use client';

import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Check, Loader2, RotateCcw } from 'lucide-react';
import { cn } from '@/lib/utils';
import { postRocketInventoryEvent } from '../../_shared/inventory-api';
import { buildManualRocketSourceActionId } from '../lib/rocket-event-source';
import { parseRocketEventDraft, validateRocketEventDraft } from '../lib/rocket-event-draft';
import type {
  RocketInventoryEventInput,
  RocketInventoryEventResult,
  RocketInventoryEventType,
} from '@kiditem/shared/inventory';

type FormState = {
  inventoryId: string;
  optionId: string;
  eventType: RocketInventoryEventType;
  quantity: string;
  sourceRef: string;
  openReservationQty: string;
  allowOverReservation: boolean;
  overrideReason: string;
  note: string;
};

const initialForm: FormState = {
  inventoryId: '',
  optionId: '',
  eventType: 'return_restock',
  quantity: '',
  sourceRef: '',
  openReservationQty: '',
  allowOverReservation: false,
  overrideReason: '',
  note: '',
};

const eventLabels: Record<RocketInventoryEventType, string> = {
  release: '예약 해제',
  issue: '출고',
  return_restock: '반품 입고',
  reserve: '예약',
};

export default function RocketStockEvents() {
  const searchParams = useSearchParams();
  const [form, setForm] = useState<FormState>(initialForm);
  const [pending, setPending] = useState(false);
  const [result, setResult] = useState<RocketInventoryEventResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const draft = parseRocketEventDraft(new URLSearchParams(searchParams.toString()));
    if (Object.values(draft).every((value) => value === undefined)) return;
    setForm((current) => ({
      ...current,
      inventoryId: draft.inventoryId ?? current.inventoryId,
      optionId: draft.optionId ?? current.optionId,
      eventType: draft.eventType ?? current.eventType,
      quantity: draft.quantity === undefined ? current.quantity : String(draft.quantity),
      sourceRef: draft.sourceRef ?? current.sourceRef,
      openReservationQty: draft.openReservationQty === undefined
        ? current.openReservationQty
        : String(draft.openReservationQty),
      note: draft.note ?? current.note,
    }));
  }, [searchParams]);

  async function submit() {
    const validationError = validateRocketEventDraft(form);
    if (validationError) {
      setResult(null);
      setError(validationError);
      return;
    }

    const quantity = Math.max(0, Math.trunc(Number(form.quantity) || 0));
    const openReservationQty = form.openReservationQty === ''
      ? undefined
      : Math.max(0, Math.trunc(Number(form.openReservationQty) || 0));

    if (
      form.eventType === 'issue' &&
      form.allowOverReservation &&
      openReservationQty !== undefined &&
      quantity > openReservationQty &&
      !form.overrideReason.trim()
    ) {
      setError('초과 출고 사유를 입력하세요.');
      return;
    }

    const payload: RocketInventoryEventInput = {
      inventoryId: form.inventoryId.trim(),
      optionId: form.optionId.trim(),
      eventType: form.eventType,
      quantity,
      sourceActionId: buildManualRocketSourceActionId(form.eventType, form.sourceRef.trim(), quantity),
      sourceType: sourceTypeFor(form.eventType),
      sourceRef: form.sourceRef.trim(),
      openReservationQty,
      allowOverReservation: form.allowOverReservation || undefined,
      overrideReason: cleanOptional(form.overrideReason),
      note: cleanOptional(form.note),
    };

    setPending(true);
    setError(null);
    setResult(null);
    try {
      setResult(await postRocketInventoryEvent(payload));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Rocket inventory event failed');
    } finally {
      setPending(false);
    }
  }

  return (
    <section className="space-y-4">
      <div className="rounded-xl border border-slate-200 bg-white p-5">
        <div className="mb-4 flex items-center gap-2">
          <RotateCcw size={18} className="text-slate-500" />
          <h2 className="text-base font-semibold text-slate-900">Rocket stock event</h2>
        </div>
        <div className="grid gap-3 md:grid-cols-3">
          <TextField label="Inventory ID" value={form.inventoryId} onChange={(inventoryId) => setForm({ ...form, inventoryId })} />
          <TextField label="Option ID" value={form.optionId} onChange={(optionId) => setForm({ ...form, optionId })} />
          <label className="text-sm font-medium text-slate-700">
            Event type
            <select
              aria-label="Event type"
              value={form.eventType}
              onChange={(event) => setForm({ ...form, eventType: event.target.value as RocketInventoryEventType })}
              className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
            >
              <option value="return_restock">{eventLabels.return_restock}</option>
              <option value="reserve">{eventLabels.reserve}</option>
              <option value="issue">{eventLabels.issue}</option>
              <option value="release">{eventLabels.release}</option>
            </select>
          </label>
          <TextField label="Quantity" type="number" value={form.quantity} onChange={(quantity) => setForm({ ...form, quantity })} />
          <TextField label="Open reservation" type="number" value={form.openReservationQty} onChange={(openReservationQty) => setForm({ ...form, openReservationQty })} />
          <TextField label="Source reference" value={form.sourceRef} onChange={(sourceRef) => setForm({ ...form, sourceRef })} />
          <label className="flex items-center gap-2 text-sm font-medium text-slate-700">
            <input
              aria-label="Allow over-reservation"
              type="checkbox"
              checked={form.allowOverReservation}
              onChange={(event) => setForm({ ...form, allowOverReservation: event.target.checked })}
              className="h-4 w-4 rounded border-slate-300"
            />
            Allow over-reservation
          </label>
          <TextField label="Override reason" value={form.overrideReason} onChange={(overrideReason) => setForm({ ...form, overrideReason })} />
          <TextField label="Note" value={form.note} onChange={(note) => setForm({ ...form, note })} />
        </div>
        <div className="mt-4 flex justify-end">
          <button
            type="button"
            onClick={() => void submit()}
            disabled={pending}
            className={cn(
              'inline-flex h-10 items-center gap-2 rounded-lg bg-slate-900 px-4 text-sm font-medium text-white hover:bg-slate-800',
              pending && 'pointer-events-none opacity-60',
            )}
          >
            {pending ? <Loader2 size={15} className="animate-spin" /> : <Check size={15} />}
            적용
          </button>
        </div>
      </div>

      {error ? (
        <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      ) : null}

      {result ? (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          <span className="font-mono">{result.ledgerId}</span>
          <span className="ml-3 text-xs">{result.alreadyApplied ? 'already applied' : 'applied'}</span>
        </div>
      ) : null}
    </section>
  );
}

function TextField({
  label,
  value,
  onChange,
  type = 'text',
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: 'text' | 'number';
}) {
  return (
    <label className="text-sm font-medium text-slate-700">
      {label}
      <input
        aria-label={label}
        type={type}
        min={type === 'number' ? 0 : undefined}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
      />
    </label>
  );
}

function sourceTypeFor(eventType: RocketInventoryEventType): string {
  if (eventType === 'return_restock') return 'rocket_return';
  if (eventType === 'issue') return 'rocket_shipment';
  if (eventType === 'release') return 'rocket_release';
  return 'rocket_reserve';
}

function cleanOptional(value: string): string | undefined {
  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
}
