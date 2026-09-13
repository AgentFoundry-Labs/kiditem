import { describe, expect, it } from 'vitest';
import {
  CoupangCatalogBrowserCommandSchema,
  CoupangCatalogBrowserStatusSchema,
} from './coupang-catalog-snapshot';

const attemptId = '11111111-1111-4111-8111-111111111111';
const permit = {
  attemptId,
  attemptToken: '22222222-2222-4222-8222-222222222222',
  state: 'RUNNING',
  expiresAt: '2030-01-02T00:00:00.000Z',
  plan: {
    collectorVersion: 'wing-inventory-v1',
    listUrl: 'https://wing.coupang.com/tenants/seller-web/vendor-inventory/list',
    detailUrl: 'https://wing.coupang.com/tenants/seller-web/vendor-inventory/modify',
    channelAccountId: '33333333-3333-4333-8333-333333333333',
    vendorId: 'A00000000',
    publicationRevision: '0',
  },
};

describe('catalog extension wire', () => {
  it('projects transport activity and attention without inventing a terminal source state', () => {
    const view = {
      attemptId, active: false,
      attention: { reason: 'marketplace_login', message: '로그인이 필요합니다', canOpenTab: true },
    };
    expect(CoupangCatalogBrowserStatusSchema.parse(view)).toEqual(view);
    expect(CoupangCatalogBrowserStatusSchema.safeParse({
      ...view, status: 'done', attemptToken: permit.attemptToken,
    }).success).toBe(false);
  });

  it('starts only with the owner permit and controls that exact attempt', () => {
    expect(CoupangCatalogBrowserCommandSchema.parse({
      action: 'startCoupangCatalogImport', permit,
    })).toEqual({ action: 'startCoupangCatalogImport', permit });
    for (const action of ['getCoupangCatalogImportStatus', 'cancelCoupangCatalogImport']) {
      expect(CoupangCatalogBrowserCommandSchema.parse({ action, attemptId })).toEqual({ action, attemptId });
    }
    expect(CoupangCatalogBrowserCommandSchema.safeParse({
      action: 'startCoupangCatalogImport', runId: attemptId, channelAccountId: permit.plan.channelAccountId,
    }).success).toBe(false);
  });
});
