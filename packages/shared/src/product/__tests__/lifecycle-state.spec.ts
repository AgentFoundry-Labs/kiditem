import { describe, it, expect } from 'vitest';
import { ProductLifecycleStateSchema, PRODUCT_LIFECYCLE_STATES } from '../lifecycle-state';

describe('ProductLifecycleStateSchema', () => {
  it('accepts valid states', () => {
    for (const s of PRODUCT_LIFECYCLE_STATES) {
      expect(() => ProductLifecycleStateSchema.parse(s)).not.toThrow();
    }
  });

  it('rejects unknown state', () => {
    expect(() => ProductLifecycleStateSchema.parse('draft')).toThrow();
    expect(() => ProductLifecycleStateSchema.parse('processing')).toThrow();
  });
});
