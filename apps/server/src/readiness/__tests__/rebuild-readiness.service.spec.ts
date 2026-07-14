import { describe, expect, it, vi } from 'vitest';
import { ReadinessService } from '../readiness.service';

const organizationId = '00000000-0000-4000-8000-000000000001';

describe('ReadinessService rebuild status', () => {
  it('reports organization-scoped snapshot-required state without exposing binding secrets', async () => {
    const prisma = {
      systemSetting: {
        findUnique: vi.fn(async () => ({
          value: {
            state: 'snapshot_required',
            target: 'staging',
            originRunId: '12345',
            deployedSha: 'secret-sha-binding',
            channelAccountFingerprint: 'secret-account-fingerprint',
          },
        })),
      },
    };
    const service = new ReadinessService(prisma as never);

    await expect(service.getRebuildStatus(organizationId)).resolves.toEqual({
      state: 'snapshot_required',
      target: 'staging',
      requiredImports: ['sellpia', 'wing'],
    });
    expect(JSON.stringify(await service.getRebuildStatus(organizationId)))
      .not.toMatch(/secret-sha-binding|secret-account-fingerprint|12345/);
  });
});
