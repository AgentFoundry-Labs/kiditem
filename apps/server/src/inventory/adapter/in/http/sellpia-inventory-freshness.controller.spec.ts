import 'reflect-metadata';
import { RequestMethod } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { ROLES_METADATA_KEY } from '../../../../auth/decorators/roles.decorator';
import type { AuthUser } from '../../../../auth/auth.types';
import type { SellpiaInventoryFreshnessPort } from '../../../application/port/in/stock/sellpia-inventory-freshness.port';
import { SellpiaInventoryFreshnessController } from './sellpia-inventory-freshness.controller';

const ORG_ID = '00000000-0000-4000-8000-000000000001';
const USER_ID = '00000000-0000-4000-8000-000000000002';
const TOKEN = '00000000-0000-4000-8000-000000000003';
const USER = { id: USER_ID } as AuthUser;

describe('SellpiaInventoryFreshnessController', () => {
  it('exposes exactly the freshness routes and HTTP methods', () => {
    expect(Reflect.getMetadata('path', SellpiaInventoryFreshnessController)).toBe(
      'inventory/sellpia-freshness',
    );
    expect(routeMetadata('getState')).toEqual(['/', RequestMethod.GET]);
    expect(routeMetadata('confirmSourceBinding')).toEqual([
      'source-binding',
      RequestMethod.POST,
    ]);
    expect(routeMetadata('requestRefresh')).toEqual(['requests', RequestMethod.POST]);
    expect(routeMetadata('claimDue')).toEqual(['claims', RequestMethod.POST]);
    expect(routeMetadata('heartbeat')).toEqual([
      'claims/:token/heartbeat',
      RequestMethod.POST,
    ]);
    expect(routeMetadata('fail')).toEqual(['claims/:token/fail', RequestMethod.POST]);
    expect(routeMetadata('cancel')).toEqual([
      'claims/:token/cancel',
      RequestMethod.POST,
    ]);
  });

  it('restricts only source binding to owner/admin at the HTTP boundary', () => {
    expect(Reflect.getMetadata(
      ROLES_METADATA_KEY,
      SellpiaInventoryFreshnessController.prototype.confirmSourceBinding,
    )).toEqual(['owner', 'admin']);
    expect(Reflect.getMetadata(
      ROLES_METADATA_KEY,
      SellpiaInventoryFreshnessController.prototype.requestRefresh,
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
    await controller.requestRefresh(ORG_ID, USER, { reason: 'manual_request' });
    await controller.claimDue(ORG_ID, USER, {});
    await controller.heartbeat(ORG_ID, USER, TOKEN, {});
    await controller.fail(ORG_ID, USER, TOKEN, {
      errorCode: 'sellpia_network_failed',
      errorMessage: 'network failed',
    });
    await controller.cancel(ORG_ID, USER, TOKEN, {});

    expect(port.getState).toHaveBeenCalledWith({ organizationId: ORG_ID, userId: USER_ID });
    expect(port.confirmSourceBinding).toHaveBeenCalledWith({
      organizationId: ORG_ID,
      userId: USER_ID,
      sourceOrigin: 'https://kiditem.sellpia.com',
      sourceAccountKey: 'kiditem',
      confirmed: true,
    });
    expect(port.requestRefresh).toHaveBeenCalledWith({
      organizationId: ORG_ID,
      userId: USER_ID,
      reason: 'manual_request',
    });
    expect(port.claimDue).toHaveBeenCalledWith({ organizationId: ORG_ID, userId: USER_ID });
    expect(port.heartbeat).toHaveBeenCalledWith({
      organizationId: ORG_ID,
      userId: USER_ID,
      claimToken: TOKEN,
    });
    expect(port.fail).toHaveBeenCalledWith({
      organizationId: ORG_ID,
      userId: USER_ID,
      claimToken: TOKEN,
      errorCode: 'sellpia_network_failed',
      errorMessage: 'network failed',
    });
    expect(port.cancel).toHaveBeenCalledWith({
      organizationId: ORG_ID,
      userId: USER_ID,
      claimToken: TOKEN,
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
    status: 'refresh_required',
    sourceBinding: {
      origin: 'https://kiditem.sellpia.com',
      accountKey: null,
      confirmed: false,
    },
    lastVerifiedAt: null,
    expiresAt: null,
    requestedGeneration: '1',
    verifiedGeneration: '0',
    refreshRequestedAt: '2026-07-15T00:00:00.000Z',
    refreshReason: 'initial_snapshot',
    syncNotBefore: null,
    activeSync: null,
    lastAttempt: null,
  } as const;
  return {
    getState: vi.fn<SellpiaInventoryFreshnessPort['getState']>().mockResolvedValue(view),
    confirmSourceBinding: vi.fn<SellpiaInventoryFreshnessPort['confirmSourceBinding']>()
      .mockResolvedValue(view),
    requestRefresh: vi.fn<SellpiaInventoryFreshnessPort['requestRefresh']>()
      .mockResolvedValue(view),
    claimDue: vi.fn<SellpiaInventoryFreshnessPort['claimDue']>()
      .mockResolvedValue({ claimed: false, state: view }),
    heartbeat: vi.fn<SellpiaInventoryFreshnessPort['heartbeat']>().mockResolvedValue(view),
    fail: vi.fn<SellpiaInventoryFreshnessPort['fail']>().mockResolvedValue(view),
    cancel: vi.fn<SellpiaInventoryFreshnessPort['cancel']>().mockResolvedValue(view),
  };
}
