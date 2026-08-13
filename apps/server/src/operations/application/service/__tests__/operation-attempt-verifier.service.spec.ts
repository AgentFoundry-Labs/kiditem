import { ConflictException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { OperationLifecycleGateService } from '../operation-lifecycle-gate.service';
import type {
  ActiveBrowserOperationAttemptRecord,
  OperationRunRepositoryPort,
} from '../../port/out/repository/operation.repository.port';
import { OperationAttemptVerifierService } from '../operation-attempt-verifier.service';
import { OperationsModule } from '../../../operations.module';
import { OPERATION_ATTEMPT_VERIFIER_PORT } from '../../port/in/operation-attempt-verifier.port';

const NOW = new Date('2026-08-14T00:00:00.000Z');
const RUN_ID = '10000000-0000-4000-8000-000000000001';
const ORGANIZATION_ID = '20000000-0000-4000-8000-000000000002';
const ATTEMPT_TOKEN = '30000000-0000-4000-8000-000000000003';
const OPERATION_KEY = 'sourcing.collect_wing_catalog_batch';

function activeAttempt(
  overrides: Partial<ActiveBrowserOperationAttemptRecord> = {},
): ActiveBrowserOperationAttemptRecord {
  return {
    runId: RUN_ID,
    organizationId: ORGANIZATION_ID,
    operationKey: OPERATION_KEY,
    engineType: 'browser',
    status: 'running',
    attemptToken: ATTEMPT_TOKEN,
    input: { keywords: ['슬라임'], maxPages: 2, purpose: 'catalog_search' },
    requestedByUserId: '40000000-0000-4000-8000-000000000004',
    startedAt: new Date('2026-08-13T23:59:00.000Z'),
    leaseExpiresAt: new Date('2026-08-14T00:01:00.000Z'),
    deadlineAt: new Date('2026-08-14T00:15:00.000Z'),
    ...overrides,
  };
}

describe('OperationAttemptVerifierService', () => {
  let repository: Pick<OperationRunRepositoryPort, 'findActiveBrowserAttempt'>;
  let lifecycleGate: Pick<OperationLifecycleGateService, 'assertAccepting'>;
  let service: OperationAttemptVerifierService;

  beforeEach(() => {
    repository = { findActiveBrowserAttempt: vi.fn().mockResolvedValue(activeAttempt()) };
    lifecycleGate = { assertAccepting: vi.fn() };
    service = new OperationAttemptVerifierService(
      repository as OperationRunRepositoryPort,
      lifecycleGate as OperationLifecycleGateService,
      () => NOW,
    );
  });

  it('returns only the small context for the exact active browser attempt', async () => {
    await expect(service.verifyActiveBrowserAttempt({
      organizationId: ORGANIZATION_ID,
      runId: RUN_ID,
      expectedOperationKey: OPERATION_KEY,
      attemptToken: ATTEMPT_TOKEN,
    })).resolves.toEqual({
      runId: RUN_ID,
      organizationId: ORGANIZATION_ID,
      operationKey: OPERATION_KEY,
      input: { keywords: ['슬라임'], maxPages: 2, purpose: 'catalog_search' },
      requestedByUserId: '40000000-0000-4000-8000-000000000004',
      startedAt: new Date('2026-08-13T23:59:00.000Z'),
      leaseExpiresAt: new Date('2026-08-14T00:01:00.000Z'),
      deadlineAt: new Date('2026-08-14T00:15:00.000Z'),
    });
    expect(repository.findActiveBrowserAttempt).toHaveBeenCalledWith({
      organizationId: ORGANIZATION_ID,
      runId: RUN_ID,
      expectedOperationKey: OPERATION_KEY,
      attemptToken: ATTEMPT_TOKEN,
      now: NOW,
    });
  });

  it('exports both the verifier port and service from Operations', () => {
    const exportedProviders: unknown[] =
      Reflect.getMetadata('exports', OperationsModule) ?? [];
    expect(exportedProviders).toContain(OPERATION_ATTEMPT_VERIFIER_PORT);
    expect(exportedProviders).toContain(OperationAttemptVerifierService);
  });

  it.each([
    ['organizationId', 'wrong-org'],
    ['operationKey', 'wrong.operation'],
    ['engineType', 'server'],
    ['status', 'cancelled'],
    ['attemptToken', 'wrong-token'],
  ] as const)('rejects a mismatched %s returned by the repository fence', async (key, value) => {
    vi.mocked(repository.findActiveBrowserAttempt).mockResolvedValue(
      activeAttempt({ [key]: value } as Partial<ActiveBrowserOperationAttemptRecord>),
    );
    await expect(service.verifyActiveBrowserAttempt({
      organizationId: ORGANIZATION_ID,
      runId: RUN_ID,
      expectedOperationKey: OPERATION_KEY,
      attemptToken: ATTEMPT_TOKEN,
    })).rejects.toBeInstanceOf(ConflictException);
  });

  it.each([
    ['leaseExpiresAt', NOW],
    ['deadlineAt', NOW],
  ] as const)('rejects an expired %s', async (key, value) => {
    vi.mocked(repository.findActiveBrowserAttempt).mockResolvedValue(activeAttempt({ [key]: value }));
    await expect(service.verifyActiveBrowserAttempt({
      organizationId: ORGANIZATION_ID,
      runId: RUN_ID,
      expectedOperationKey: OPERATION_KEY,
      attemptToken: ATTEMPT_TOKEN,
    })).rejects.toBeInstanceOf(ConflictException);
  });

  it('rejects a missing run and lifecycle-cancelled work', async () => {
    vi.mocked(repository.findActiveBrowserAttempt).mockResolvedValue(null);
    await expect(service.verifyActiveBrowserAttempt({
      organizationId: ORGANIZATION_ID,
      runId: RUN_ID,
      expectedOperationKey: OPERATION_KEY,
      attemptToken: ATTEMPT_TOKEN,
    })).rejects.toBeInstanceOf(ConflictException);

    vi.mocked(lifecycleGate.assertAccepting).mockImplementation(() => {
      throw new ConflictException('operation_server_lifecycle_expired');
    });
    await expect(service.verifyActiveBrowserAttempt({
      organizationId: ORGANIZATION_ID,
      runId: RUN_ID,
      expectedOperationKey: OPERATION_KEY,
      attemptToken: ATTEMPT_TOKEN,
    })).rejects.toThrow('operation_server_lifecycle_expired');
  });
});
