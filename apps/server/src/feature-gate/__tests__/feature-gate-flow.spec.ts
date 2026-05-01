import { describe, it, expect, vi, beforeEach } from 'vitest';
import { FeatureGateService } from '../feature-gate.service';

function makePrisma() {
  return {
    featureGate: {
      findUnique: vi.fn(),
      findMany: vi.fn().mockResolvedValue([]),
      upsert: vi.fn(),
      delete: vi.fn(),
    },
  };
}

describe('FeatureGateService — full gate lifecycle', () => {
  let service: FeatureGateService;
  let prisma: ReturnType<typeof makePrisma>;

  beforeEach(() => {
    prisma = makePrisma();
    service = new FeatureGateService(prisma as any);
  });

  it('isEnabled with no gate → returns true (default allow)', async () => {
    prisma.featureGate.findUnique.mockResolvedValue(null);
    expect(await service.isEnabled('feature:checkout')).toBe(true);
  });

  it('upsert gate (enabled=false) → isEnabled → returns false (block)', async () => {
    const gate = { name: 'feature:checkout', enabled: false, allowedOrganizations: [] };
    prisma.featureGate.upsert.mockResolvedValue(gate);
    await service.upsert('feature:checkout', { enabled: false });
    expect(prisma.featureGate.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { name: 'feature:checkout' },
        update: expect.objectContaining({ enabled: false }),
        create: expect.objectContaining({ name: 'feature:checkout', enabled: false }),
      }),
    );

    prisma.featureGate.findUnique.mockResolvedValue(gate);
    expect(await service.isEnabled('feature:checkout')).toBe(false);
  });

  it('upsert gate (enabled=true, allowedOrganizations=[organization-A]) → isEnabled(organization-A)=true, isEnabled(organization-B)=false', async () => {
    const gate = { name: 'feature:checkout', enabled: true, allowedOrganizations: ['organization-A'] };
    prisma.featureGate.upsert.mockResolvedValue(gate);
    await service.upsert('feature:checkout', { enabled: true, allowedOrganizations: ['organization-A'] });

    prisma.featureGate.findUnique.mockResolvedValue(gate);
    expect(await service.isEnabled('feature:checkout', 'organization-A')).toBe(true);
    expect(await service.isEnabled('feature:checkout', 'organization-B')).toBe(false);
  });

  it('delete gate → isEnabled → returns true (allow again)', async () => {
    prisma.featureGate.delete.mockResolvedValue({});
    const result = await service.delete('feature:checkout');
    expect(result).toEqual({ ok: true });
    expect(prisma.featureGate.delete).toHaveBeenCalledWith({ where: { name: 'feature:checkout' } });

    prisma.featureGate.findUnique.mockResolvedValue(null);
    expect(await service.isEnabled('feature:checkout')).toBe(true);
  });
});
