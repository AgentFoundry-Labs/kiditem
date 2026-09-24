import 'reflect-metadata';
import { RequestMethod } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import type { AuthUser } from '../../../../auth/auth.types';
import { ROLES_METADATA_KEY } from '../../../../auth/decorators/roles.decorator';
import type { SellpiaOrderTransmissionPort } from '../../../application/port/in/sellpia-order-transmission.port';
import { SellpiaOrderTransmissionController } from './sellpia-order-transmission.controller';

const ORGANIZATION_ID = '00000000-0000-4000-8000-000000000001';
const USER_ID = '00000000-0000-4000-8000-000000000002';
const USER = { id: USER_ID } as AuthUser;

describe('SellpiaOrderTransmissionController', () => {
  it('owns the transmission routes under Orders', () => {
    expect(Reflect.getMetadata('path', SellpiaOrderTransmissionController)).toBe(
      'orders/sellpia-transmissions/intents',
    );
    for (const action of ['prepare', 'finalize', 'abort', 'reconcile'] as const) {
      const handler = SellpiaOrderTransmissionController.prototype[action];
      expect([
        Reflect.getMetadata('path', handler),
        Reflect.getMetadata('method', handler),
      ]).toEqual([action, RequestMethod.POST]);
    }
    expect(Reflect.getMetadata(
      ROLES_METADATA_KEY,
      SellpiaOrderTransmissionController.prototype.reconcile,
    )).toEqual(['owner', 'admin']);
  });

  it('passes only authenticated organization and actor identity', async () => {
    const transmissions = {
      prepare: vi.fn().mockResolvedValue({ intentKey: 'orders-1', disposition: 'prepared' }),
      finalize: vi.fn().mockResolvedValue({ intentKey: 'orders-1', status: 'finalized' }),
      abort: vi.fn().mockResolvedValue({ intentKey: 'orders-1', status: 'aborted' }),
      reconcile: vi.fn().mockResolvedValue({
        intentKey: 'orders-1',
        outcome: 'not_submitted',
        status: 'aborted',
        reconciledBy: USER_ID,
        reconciledAt: '2026-07-31T00:00:00.000Z',
        note: '미접수 확인',
      }),
    } satisfies SellpiaOrderTransmissionPort;
    const controller = new SellpiaOrderTransmissionController(transmissions);

    await controller.prepare(ORGANIZATION_ID, USER, { intentKey: 'orders-1' });
    await controller.finalize(ORGANIZATION_ID, USER, { intentKey: 'orders-1' });
    await controller.abort(ORGANIZATION_ID, USER, { intentKey: 'orders-1' });
    await controller.reconcile(ORGANIZATION_ID, USER, {
      intentKey: 'orders-1',
      outcome: 'not_submitted',
      note: '미접수 확인',
    });

    expect(transmissions.prepare).toHaveBeenCalledWith({
      organizationId: ORGANIZATION_ID,
      userId: USER_ID,
      intentKey: 'orders-1',
    });
    expect(transmissions.reconcile).toHaveBeenCalledWith({
      organizationId: ORGANIZATION_ID,
      userId: USER_ID,
      intentKey: 'orders-1',
      outcome: 'not_submitted',
      note: '미접수 확인',
    });
  });
});
