import { describe, it, expect } from 'vitest';
import { ActionCapService } from '../action-cap.service';

describe('ActionCapService', () => {
  const service = new ActionCapService();

  it('passes actions within cap', () => {
    const result = service.validate(
      { maxBudgetChangePct: 30 },
      [{ budgetChangePct: 20 }],
    );
    expect(result.allowed).toHaveLength(1);
    expect(result.blocked).toHaveLength(0);
  });

  it('blocks budget change exceeding cap', () => {
    const result = service.validate(
      { maxBudgetChangePct: 30 },
      [{ budgetChangePct: 50 }],
    );
    expect(result.blocked).toHaveLength(1);
    expect(result.blocked[0].reason).toBe('budget_change_exceeded');
  });

  it('blocks blast radius exceeding cap', () => {
    const actions = Array.from({ length: 60 }, (_, i) => ({ product_id: `p-${i}` }));
    const result = service.validate({ maxAffectedProducts: 50 }, actions);
    expect(result.allBlocked).toBe(true);
    expect(result.blocked[0].reason).toBe('blast_radius');
  });

  it('passes when no cap configured', () => {
    const result = service.validate({}, [{ budgetChangePct: 100 }]);
    expect(result.allowed).toHaveLength(1);
    expect(result.blocked).toHaveLength(0);
  });

  it('partially blocks (some pass, some fail)', () => {
    const result = service.validate(
      { maxBudgetChangePct: 30 },
      [{ budgetChangePct: 20 }, { budgetChangePct: 50 }],
    );
    expect(result.allowed).toHaveLength(1);
    expect(result.blocked).toHaveLength(1);
    expect(result.allBlocked).toBe(false);
  });
});
