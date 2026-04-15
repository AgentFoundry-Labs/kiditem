import { expect } from 'vitest';

/**
 * ADR-0011 Phase 3 invariant: status='succeeded' ⇔ phase ∈ {'ready','applied'}.
 * Otherwise phase must be null.
 */
export function expectValidInvariant(row: { status?: string | null; phase?: string | null }): void {
  const { status, phase } = row;
  if (status === 'succeeded') {
    expect(phase, `status='succeeded' requires phase ∈ {'ready','applied'}`).toMatch(/^(ready|applied)$/);
  } else {
    expect(phase, `status='${status}' requires phase=null`).toBeNull();
  }
}
