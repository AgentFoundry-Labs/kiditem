import { describe, expect, it } from 'vitest';

import { buildManualRocketSourceActionId } from './rocket-event-source';

describe('buildManualRocketSourceActionId', () => {
  it('keeps the idempotency key stable when only quantity changes', () => {
    expect(buildManualRocketSourceActionId('issue', 'shipment-20260630', 2))
      .toBe(buildManualRocketSourceActionId('issue', 'shipment-20260630', 3));
    expect(buildManualRocketSourceActionId('issue', 'shipment-20260630', 2))
      .toBe('manual-rocket:issue:shipment-20260630');
  });
});
