import type { RocketInventoryEventType } from '@kiditem/shared/inventory';

export function buildManualRocketSourceActionId(
  eventType: RocketInventoryEventType,
  sourceRef: string,
  _quantity: number,
): string {
  return `manual-rocket:${sourcePart(eventType, 48)}:${sourcePart(sourceRef, 140)}`.slice(0, 200);
}

function sourcePart(value: unknown, maxLength: number): string {
  const text = String(value ?? '').trim().replace(/\s+/g, '');
  return (text || 'none').slice(0, maxLength);
}
