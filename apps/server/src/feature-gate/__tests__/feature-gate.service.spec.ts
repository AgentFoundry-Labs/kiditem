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

describe('FeatureGateService', () => {
  let service: FeatureGateService;
  let prisma: ReturnType<typeof makePrisma>;

  beforeEach(() => {
    prisma = makePrisma();
    service = new FeatureGateService(prisma as any);
  });

  describe('isEnabled', () => {
    it('returns true when gate does not exist (default allow)', async () => {
      prisma.featureGate.findUnique.mockResolvedValue(null);
      expect(await service.isEnabled('agent:pricing')).toBe(true);
    });

    it('returns false when gate is disabled', async () => {
      prisma.featureGate.findUnique.mockResolvedValue({
        name: 'agent:pricing',
        enabled: false,
        allowedOrganizations: [],
      });
      expect(await service.isEnabled('agent:pricing')).toBe(false);
    });

    it('returns true when enabled with empty allowedOrganizations (all allowed)', async () => {
      prisma.featureGate.findUnique.mockResolvedValue({
        name: 'agent:pricing',
        enabled: true,
        allowedOrganizations: [],
      });
      expect(await service.isEnabled('agent:pricing', 'organization-1')).toBe(true);
    });

    it('returns true when organization is in allowedOrganizations', async () => {
      prisma.featureGate.findUnique.mockResolvedValue({
        name: 'agent:pricing',
        enabled: true,
        allowedOrganizations: ['organization-1', 'organization-2'],
      });
      expect(await service.isEnabled('agent:pricing', 'organization-1')).toBe(true);
    });

    it('returns false when organization is not in allowedOrganizations', async () => {
      prisma.featureGate.findUnique.mockResolvedValue({
        name: 'agent:pricing',
        enabled: true,
        allowedOrganizations: ['organization-1'],
      });
      expect(await service.isEnabled('agent:pricing', 'organization-99')).toBe(false);
    });

    it('returns false when allowedOrganizations set but no organizationId provided', async () => {
      prisma.featureGate.findUnique.mockResolvedValue({
        name: 'agent:pricing',
        enabled: true,
        allowedOrganizations: ['organization-1'],
      });
      expect(await service.isEnabled('agent:pricing')).toBe(false);
    });
  });
});
