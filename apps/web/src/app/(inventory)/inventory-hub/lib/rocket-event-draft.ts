import type { RocketInventoryEventType } from '@kiditem/shared/inventory';

export type RocketEventDraft = {
  inventoryId?: string;
  optionId?: string;
  eventType?: RocketInventoryEventType;
  quantity?: string | number;
  sourceRef?: string;
  openReservationQty?: string | number;
  note?: string;
};

export type RocketEventFormLike = {
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

const eventTypes: RocketInventoryEventType[] = ['reserve', 'release', 'issue', 'return_restock'];

export function buildRocketEventDraftHref(draft: RocketEventDraft): string {
  const params = new URLSearchParams({ tab: 'rocket-events' });
  append(params, 'inventoryId', draft.inventoryId);
  append(params, 'optionId', draft.optionId);
  append(params, 'eventType', draft.eventType);
  append(params, 'quantity', draft.quantity);
  append(params, 'sourceRef', draft.sourceRef);
  append(params, 'openReservationQty', draft.openReservationQty);
  append(params, 'note', draft.note);
  return `/inventory-hub?${params.toString()}`;
}

export function parseRocketEventDraft(params: URLSearchParams): RocketEventDraft {
  const eventType = params.get('eventType');
  return {
    inventoryId: clean(params.get('inventoryId')),
    optionId: clean(params.get('optionId')),
    eventType: eventTypes.includes(eventType as RocketInventoryEventType)
      ? eventType as RocketInventoryEventType
      : undefined,
    quantity: clean(params.get('quantity')),
    sourceRef: clean(params.get('sourceRef')),
    openReservationQty: clean(params.get('openReservationQty')),
    note: clean(params.get('note')),
  };
}

export function validateRocketEventDraft(form: RocketEventFormLike): string | null {
  const quantity = Math.trunc(Number(form.quantity) || 0);
  const missing: string[] = [];
  if (!form.inventoryId.trim()) missing.push('Inventory ID');
  if (!form.optionId.trim()) missing.push('Option ID');
  if (!form.sourceRef.trim()) missing.push('Source reference');
  if (quantity <= 0) missing.push('수량');
  if (missing.length > 0) return `${missing.join(', ')}을 입력하세요.`;

  const openReservationQty = form.openReservationQty === ''
    ? undefined
    : Math.trunc(Number(form.openReservationQty) || 0);
  if (
    form.eventType === 'issue' &&
    form.allowOverReservation &&
    openReservationQty !== undefined &&
    quantity > openReservationQty &&
    !form.overrideReason.trim()
  ) {
    return '초과 출고 사유를 입력하세요.';
  }
  return null;
}

function append(params: URLSearchParams, key: string, value: string | number | undefined): void {
  if (value === undefined || value === '') return;
  params.set(key, String(value));
}

function clean(value: string | null): string | undefined {
  const trimmed = value?.trim() ?? '';
  return trimmed ? trimmed : undefined;
}
