import 'reflect-metadata';
import { RequestMethod } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { ROLES_METADATA_KEY } from '../../../../auth/decorators/roles.decorator';
import { SellpiaInventoryFreshnessController } from './sellpia-inventory-freshness.controller';
import type { AuthUser } from '../../../../auth/auth.types';
import type { SellpiaInventoryCollectionStatusPort } from '../../../application/port/in/stock/sellpia-inventory-freshness.port';

const ORG_ID = '00000000-0000-4000-8000-000000000001';
const USER_ID = '00000000-0000-4000-8000-000000000002';
const USER = { id: USER_ID } as AuthUser;

describe('SellpiaInventoryFreshnessController', () => {
  it('exposes exactly the collection-status routes and HTTP methods', () => {
    expect(Reflect.getMetadata('path', SellpiaInventoryFreshnessController)).toBe(
      'inventory/sellpia-collection-status',
    );
    expect(routeMetadata('getState')).toEqual(['/', RequestMethod.GET]);
    expect(routeMetadata('confirmSourceBinding')).toEqual([
      'source-binding',
      RequestMethod.POST,
    ]);
    for (const method of [
      'requestRefresh',
      'claimDue',
      'heartbeat',
      'fail',
      'cancel',
    ] as const) {
      expect(SellpiaInventoryFreshnessController.prototype[method]).toBeUndefined();
    }
  });

  it('restricts source binding to owner/admin', () => {
    expect(Reflect.getMetadata(
      ROLES_METADATA_KEY,
      SellpiaInventoryFreshnessController.prototype.confirmSourceBinding,
    )).toEqual(['owner', 'admin']);
    expect(Reflect.getMetadata(
      ROLES_METADATA_KEY,
      SellpiaInventoryFreshnessController.prototype.getState,
    )).toBeUndefined();
  });

  it('derives organization and actor ownership only from authenticated decorators', async () => {
    const port = makePort();
    const controller = new SellpiaInventoryFreshnessController(port);

    await controller.getState(ORG_ID, USER);
    await controller.confirmSourceBinding(ORG_ID, USER, {
      sourceOrigin: 'https://kiditem.sellpia.com',
      sourceAccountKey: 'kiditem',
      confirmed: true,
    });

    expect(port.getState).toHaveBeenCalledWith({ organizationId: ORG_ID, userId: USER_ID });
    expect(port.confirmSourceBinding).toHaveBeenCalledWith({
      organizationId: ORG_ID,
      userId: USER_ID,
      sourceOrigin: 'https://kiditem.sellpia.com',
      sourceAccountKey: 'kiditem',
      confirmed: true,
    });
  });
});

function routeMetadata(
  method: keyof SellpiaInventoryFreshnessController,
): [string, RequestMethod] {
  const handler = SellpiaInventoryFreshnessController.prototype[method];
  return [
    Reflect.getMetadata('path', handler) ?? '',
    Reflect.getMetadata('method', handler),
  ];
}

function makePort() {
  const view = {
    status: 'not_collected',
    sourceBinding: {
      origin: 'https://kiditem.sellpia.com',
      accountKey: null,
      confirmed: false,
    },
    requestedGeneration: '1',
    verifiedGeneration: '0',
    lastCompletedAttemptId: null,
    lastCompletedAt: null,
    lastAttemptId: null,
    activeSync: null,
    lastAttempt: null,
  } as const;
  return {
    getState: vi.fn<SellpiaInventoryCollectionStatusPort['getState']>().mockResolvedValue(view),
    confirmSourceBinding: vi.fn<SellpiaInventoryCollectionStatusPort['confirmSourceBinding']>()
      .mockResolvedValue(view),
  };
}
