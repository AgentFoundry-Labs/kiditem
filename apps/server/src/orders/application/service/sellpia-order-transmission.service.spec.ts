import { ConflictException, NotFoundException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SellpiaOrderTransmissionService } from './sellpia-order-transmission.service';
import type {
  SellpiaOrderTransmissionRepositoryPort,
  SellpiaOrderTransmissionRepositoryTransaction,
} from '../port/out/repository/sellpia-order-transmission.repository.port';

const ORGANIZATION_ID = '00000000-0000-4000-8000-000000000001';
const USER_ID = '00000000-0000-4000-8000-000000000002';

describe('SellpiaOrderTransmissionService', () => {
  let transaction: SellpiaOrderTransmissionRepositoryTransaction;
  let repository: SellpiaOrderTransmissionRepositoryPort;
  let service: SellpiaOrderTransmissionService;

  beforeEach(() => {
    transaction = {
      prepare: vi.fn().mockResolvedValue('prepared'),
      findForActor: vi.fn().mockResolvedValue({ status: 'prepared' }),
      finalize: vi.fn().mockResolvedValue(undefined),
      abort: vi.fn().mockResolvedValue(undefined),
      findForReconciliation: vi.fn().mockResolvedValue({
        status: 'prepared',
        latestReconciliation: null,
      }),
      reconcile: vi.fn().mockResolvedValue(undefined),
    };
    repository = {
      withLockedIntent: vi.fn(async (_input, operation) => operation(transaction)),
    };
    service = new SellpiaOrderTransmissionService(repository);
  });

  it('finalizes the duplicate-submission fence without requesting inventory state', async () => {
    await expect(service.finalize({
      organizationId: ORGANIZATION_ID,
      userId: USER_ID,
      intentKey: 'orders-1',
    })).resolves.toEqual({ intentKey: 'orders-1', status: 'finalized' });

    expect(transaction.finalize).toHaveBeenCalledWith({
      userId: USER_ID,
      finalizedAt: expect.any(Date),
    });
    expect(repository.withLockedIntent).toHaveBeenCalledWith(
      { organizationId: ORGANIZATION_ID, intentKey: 'orders-1' },
      expect.any(Function),
    );
  });

  it('keeps repeated preparation idempotent and scoped to the actor', async () => {
    vi.mocked(transaction.prepare).mockResolvedValue('already_prepared');

    await expect(service.prepare({
      organizationId: ORGANIZATION_ID,
      userId: USER_ID,
      intentKey: 'orders-1',
    })).resolves.toEqual({
      intentKey: 'orders-1',
      disposition: 'already_prepared',
    });
  });

  it('does not expose another actor intent', async () => {
    vi.mocked(transaction.prepare).mockResolvedValue('not_owned');

    await expect(service.prepare({
      organizationId: ORGANIZATION_ID,
      userId: USER_ID,
      intentKey: 'orders-1',
    })).rejects.toBeInstanceOf(NotFoundException);
  });

  it('rejects finalization unless the intent is prepared', async () => {
    vi.mocked(transaction.findForActor).mockResolvedValue({ status: 'aborted' });

    await expect(service.finalize({
      organizationId: ORGANIZATION_ID,
      userId: USER_ID,
      intentKey: 'orders-1',
    })).rejects.toBeInstanceOf(ConflictException);
    expect(transaction.finalize).not.toHaveBeenCalled();
  });

  it('records an audited operator-confirmed non-submission without inventory evidence', async () => {
    await expect(service.reconcile({
      organizationId: ORGANIZATION_ID,
      userId: USER_ID,
      intentKey: 'orders-1',
      outcome: 'not_submitted',
      note: ' 셀피아 주문 내역에서 미접수 확인 ',
    })).resolves.toMatchObject({
      intentKey: 'orders-1',
      outcome: 'not_submitted',
      status: 'aborted',
      reconciledBy: USER_ID,
      note: '셀피아 주문 내역에서 미접수 확인',
    });
    expect(transaction.reconcile).toHaveBeenCalledWith(expect.objectContaining({
      userId: USER_ID,
      outcome: 'not_submitted',
      note: '셀피아 주문 내역에서 미접수 확인',
    }));
  });
});
