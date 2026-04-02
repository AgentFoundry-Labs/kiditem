import { describe, it, expect, vi } from 'vitest';
import { SafetyPipelineService } from '../safety-pipeline.service';
import { ActionCapService } from '../action-cap.service';
import { DryRunGateService } from '../dry-run-gate.service';

function makePipeline() {
  const dryRunGate = new DryRunGateService(null as any);
  const actionCap = new ActionCapService();
  const snapshot = { capture: vi.fn().mockResolvedValue(3) } as any;
  const postVerify = { schedule: vi.fn().mockResolvedValue(undefined) } as any;
  return new SafetyPipelineService(dryRunGate, actionCap, snapshot, postVerify);
}

describe('SafetyPipelineService', () => {
  it('skips ActionCap when dry_run is true', async () => {
    const pipeline = makePipeline();
    const result = await pipeline.validate({
      agentId: 'a-1', trustLevel: 2, actionCap: { maxBudgetChangePct: 30 },
      runId: 'r-1', companyId: 'c-1',
      body: { actions: [{ budgetChangePct: 50 }], dry_run: true },
    });
    expect(result.allowed).toBe(true);
    expect(result.blockedActions).toHaveLength(0);
  });

  it('forces dry_run when trustLevel=0', async () => {
    const pipeline = makePipeline();
    const body = { actions: [{ budgetChangePct: 50 }], dry_run: false };
    const result = await pipeline.validate({
      agentId: 'a-1', trustLevel: 0, actionCap: { maxBudgetChangePct: 30 },
      runId: 'r-1', companyId: 'c-1', body,
    });
    expect(result.dryRunForced).toBe(true);
    expect(body.dry_run).toBe(true);
  });

  it('blocks actions exceeding cap', async () => {
    const pipeline = makePipeline();
    const result = await pipeline.validate({
      agentId: 'a-1', trustLevel: 2, actionCap: { maxBudgetChangePct: 30 },
      runId: 'r-1', companyId: 'c-1',
      body: { actions: [{ budgetChangePct: 50 }], dry_run: false },
    });
    expect(result.blockedActions).toHaveLength(1);
  });
});
