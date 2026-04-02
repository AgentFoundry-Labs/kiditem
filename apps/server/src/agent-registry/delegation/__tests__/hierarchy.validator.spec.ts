import { describe, it, expect } from 'vitest';
import { validateDelegation } from '../hierarchy.validator';

describe('validateDelegation', () => {
  const manager = { id: 'mgr-1', role: 'manager' };
  const specialist = { id: 'spec-1', reportsTo: 'mgr-1' };

  it('allows manager → subordinate delegation', () => {
    const result = validateDelegation(manager, specialist);
    expect(result.valid).toBe(true);
  });

  it('blocks self delegation', () => {
    const result = validateDelegation(manager, { id: 'mgr-1', reportsTo: 'mgr-1' });
    expect(result.valid).toBe(false);
    expect(result.reason).toBe('self_delegation');
  });

  it('blocks non-subordinate delegation', () => {
    const result = validateDelegation(manager, { id: 'spec-2', reportsTo: 'other-mgr' });
    expect(result.valid).toBe(false);
    expect(result.reason).toBe('not_subordinate');
  });

  it('blocks specialist trying to delegate', () => {
    const result = validateDelegation({ id: 'spec-x', role: 'specialist' }, { id: 'spec-1', reportsTo: 'spec-x' });
    expect(result.valid).toBe(false);
    expect(result.reason).toBe('insufficient_role');
  });

  it('allows operator role', () => {
    const result = validateDelegation({ id: 'mgr-1', role: 'operator' }, specialist);
    expect(result.valid).toBe(true);
  });
});
