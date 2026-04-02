import { describe, it, expect, vi } from 'vitest';
import { DelegationService } from '../delegation.service';

function makePrisma() {
  return {
    agentDefinition: {
      findUnique: vi.fn(),
    },
  } as any;
}

function makeWakeup() {
  return {
    requestWakeup: vi.fn().mockResolvedValue({ id: 'wakeup-1' }),
  } as any;
}

function makeDenialTracker() {
  return {
    recordDenial: vi.fn().mockResolvedValue(undefined),
  } as any;
}

describe('DelegationService', () => {
  it('delegates successfully from manager to subordinate', async () => {
    const prisma = makePrisma();
    const wakeup = makeWakeup();
    const denial = makeDenialTracker();
    const service = new DelegationService(prisma, wakeup, denial);

    prisma.agentDefinition.findUnique
      .mockResolvedValueOnce({ id: 'mgr-1', name: 'Manager', role: 'manager', companyId: 'co-1' })
      .mockResolvedValueOnce({ id: 'spec-1', name: 'Specialist', type: 'ad_strategy', reportsTo: 'mgr-1' });

    const result = await service.delegate({
      parentAgentId: 'mgr-1',
      childAgentType: 'ad_strategy',
      parentRunId: 'run-1',
      companyId: 'co-1',
    });

    expect(result.ok).toBe(true);
    expect(result.wakeupId).toBe('wakeup-1');
    expect(wakeup.requestWakeup).toHaveBeenCalledWith(
      expect.objectContaining({ agentId: 'spec-1', source: 'assignment' }),
    );
  });

  it('denies delegation from non-subordinate', async () => {
    const prisma = makePrisma();
    const wakeup = makeWakeup();
    const denial = makeDenialTracker();
    const service = new DelegationService(prisma, wakeup, denial);

    prisma.agentDefinition.findUnique
      .mockResolvedValueOnce({ id: 'mgr-1', name: 'Manager', role: 'manager', companyId: 'co-1' })
      .mockResolvedValueOnce({ id: 'spec-2', name: 'Other', type: 'other', reportsTo: 'other-mgr' });

    const result = await service.delegate({
      parentAgentId: 'mgr-1',
      childAgentType: 'other',
      parentRunId: 'run-1',
      companyId: 'co-1',
    });

    expect(result.ok).toBe(false);
    expect(result.error).toBe('not_subordinate');
    expect(denial.recordDenial).toHaveBeenCalled();
  });

  it('returns error when agent not found', async () => {
    const prisma = makePrisma();
    const wakeup = makeWakeup();
    const denial = makeDenialTracker();
    const service = new DelegationService(prisma, wakeup, denial);

    prisma.agentDefinition.findUnique.mockResolvedValue(null);

    const result = await service.delegate({
      parentAgentId: 'mgr-1',
      childAgentType: 'nonexistent',
      parentRunId: 'run-1',
      companyId: 'co-1',
    });

    expect(result.ok).toBe(false);
    expect(result.error).toBe('agent_not_found');
  });
});
