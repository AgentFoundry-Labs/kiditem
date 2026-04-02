import { describe, it, expect } from 'vitest';
import { DryRunGateService } from '../dry-run-gate.service';

describe('DryRunGateService', () => {
  const service = new DryRunGateService(null as any);

  it('forces dry-run when trustLevel=0 and dryRun=false', () => {
    const result = service.check(0, false);
    expect(result.forced).toBe(true);
  });

  it('does not force when trustLevel=1', () => {
    const result = service.check(1, false);
    expect(result.forced).toBe(false);
  });

  it('does not force when dryRun=true (already dry)', () => {
    const result = service.check(0, true);
    expect(result.forced).toBe(false);
  });

  it('does not force when dryRun=undefined', () => {
    const result = service.check(0, undefined);
    expect(result.forced).toBe(false);
  });
});
