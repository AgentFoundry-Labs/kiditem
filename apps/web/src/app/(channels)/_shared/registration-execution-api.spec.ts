import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { apiClient } from '@/lib/api-client';
import { listRegistrationTargetExecutions, registrationExecutionApi } from './registration-execution-api';
import type { TargetExecutionResult } from '@kiditem/shared/sales-product';

vi.mock('@/lib/api-client', () => ({
  apiClient: { post: vi.fn().mockResolvedValue({}), getParsed: vi.fn() },
}));

const SALES_PRODUCT = 'sales-product-1';
const EXECUTION = '33333333-3333-4333-8333-333333333333';
const BASE = `/api/products/sales-products/${SALES_PRODUCT}/registration/executions`;
const TARGET = '44444444-4444-4444-8444-444444444444';
const TARGET_ACCOUNT = '55555555-5555-4555-8555-555555555555';

const TARGET_RESULT = {
  executionId: EXECUTION,
  targetId: TARGET,
  channelAccountId: TARGET_ACCOUNT,
  status: 'prepared',
  providerOutcome: 'not_attempted',
  payloadHash: 'payload-hash',
  payload: {
    targetId: TARGET,
    targetVersion: 3,
    channelAccountId: TARGET_ACCOUNT,
    kind: 'register',
    channelListingId: null,
    applyCompositionTemplate: false,
    product: {
      id: '66666666-6666-4666-8666-666666666666',
      code: 'SP-001',
      ownCode: null,
      sabangnetGoodsNo: null,
      sourceCandidateId: null,
      sourcePlatform: null,
      sourceUrl: null,
      name: '상품',
      shortName: null,
      englishName: null,
      printName: null,
      modelName: null,
      modelNo: null,
      brand: null,
      manufacturer: null,
      originCountry: null,
      originRegion: null,
      keywords: [],
      standardCategory: null,
      description: '',
      targetAudience: null,
      ageGroup: null,
      productSize: null,
      colorVariantNames: [],
      boxSetQuantity: null,
      registrationDefaults: null,
      status: 'active',
      taxType: 'taxable',
      deliveryFeeType: null,
      deliveryFee: null,
      optionAxes: [],
      stockManaged: false,
      imageUrls: [],
      detailHtml: null,
      extraDetailHtml: [],
      noticeCategory: null,
      noticeValues: [],
      certifications: [],
      kcStatus: 'unknown',
      importDeclarationNo: null,
      adminMemo: null,
      version: 1,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
      options: [{
        id: '77777777-7777-4777-8777-777777777777',
        optionCode: 'SP-001-0001',
        values: [],
        optionKey: '',
        alias: null,
        barcode: null,
        salePrice: 1000,
        normalPrice: null,
        supplyStatus: 'selling',
        safetyStock: null,
        sortOrder: 0,
        components: [],
        referenceCost: null,
        linkedChannelOptionCount: 0,
      }],
      channelOverrides: [],
      channelListings: [],
    },
    registrationInput: {},
    supplyPrices: [{ salesProductOptionId: '77777777-7777-4777-8777-777777777777', supplyPrice: null }],
  },
  leaseToken: null,
  maySubmit: false,
  externalListingId: null,
  result: null,
} satisfies TargetExecutionResult;

describe('registration execution client', () => {
  beforeEach(() => {
    vi.mocked(apiClient.post).mockClear().mockResolvedValue({});
    vi.mocked(apiClient.getParsed).mockClear();
  });

  it('uses the target snapshot and lease routes', async () => {
    vi.mocked(apiClient.post).mockResolvedValue(TARGET_RESULT);
    vi.mocked(apiClient.getParsed).mockResolvedValue(TARGET_RESULT);
    const prepare = {
      expectedVersion: 3,
      kind: 'register' as const,
      idempotencyKey: 'target-intent-1',
      applyCompositionTemplate: false,
    };
    await registrationExecutionApi.prepareTarget(TARGET, prepare);
    expect(apiClient.post).toHaveBeenCalledWith(
      `/api/channels/registration-targets/${TARGET}/executions`,
      prepare,
    );

    await registrationExecutionApi.startTarget(EXECUTION);
    expect(apiClient.post).toHaveBeenCalledWith(
      `/api/channels/registration-executions/${EXECUTION}/start`,
      {},
    );

    await registrationExecutionApi.getTarget(EXECUTION);
    expect(apiClient.getParsed).toHaveBeenCalledWith(
      `/api/channels/registration-executions/${EXECUTION}`,
      expect.anything(),
    );

    vi.mocked(apiClient.getParsed).mockResolvedValue([TARGET_RESULT]);
    await listRegistrationTargetExecutions(TARGET);
    expect(apiClient.getParsed).toHaveBeenCalledWith(
      `/api/channels/registration-targets/${TARGET}/executions`,
      expect.anything(),
    );

    await registrationExecutionApi.reportTarget(EXECUTION, {
      leaseToken: '88888888-8888-4888-8888-888888888888',
      payloadHash: 'payload-hash',
      outcome: 'awaiting_approval',
      evidence: { channelAccountId: TARGET_ACCOUNT, observedStatus: 'awaiting_approval' },
    });
    expect(apiClient.post).toHaveBeenCalledWith(
      `/api/channels/registration-executions/${EXECUTION}/result`,
      expect.objectContaining({ outcome: 'awaiting_approval' }),
    );
  });

  it('opens the fence on the sales-product registration route, not a candidate route', async () => {
    await registrationExecutionApi.prepare(SALES_PRODUCT, {
      channelAccountId: 'account-1',
      displayName: 'Kids rain boots',
      registrationInput: {},
      idempotencyKey: EXECUTION,
    });

    expect(apiClient.post).toHaveBeenCalledWith(`${BASE}/prepare`, expect.objectContaining({
      channelAccountId: 'account-1',
    }));
  });

  it.each([
    ['start', () => registrationExecutionApi.start(SALES_PRODUCT, EXECUTION), `${BASE}/${EXECUTION}/start`],
    ['unresolved', () => registrationExecutionApi.markUnresolved(SALES_PRODUCT, EXECUTION, { reason: 'x' }), `${BASE}/${EXECUTION}/unresolved`],
    ['not-submitted', () => registrationExecutionApi.markNotSubmitted(SALES_PRODUCT, EXECUTION, { reason: 'x' }), `${BASE}/${EXECUTION}/not-submitted`],
  ])('addresses one execution by id for %s', async (_name, call, expected) => {
    await call();
    expect(apiClient.post).toHaveBeenCalledWith(expected, expect.anything());
  });

  it('confirms a registration on the same execution-scoped route', async () => {
    await registrationExecutionApi.confirm(SALES_PRODUCT, {
      executionId: EXECUTION,
      externalListingId: '427011919',
    });
    expect(apiClient.post).toHaveBeenCalledWith(`${BASE}/confirm`, expect.objectContaining({
      externalListingId: '427011919',
    }));
  });

  it('escapes a sales-product or execution id so a path segment cannot be forged', async () => {
    await registrationExecutionApi.start('a/../b', '1/2');
    expect(apiClient.post).toHaveBeenCalledWith(
      '/api/products/sales-products/a%2F..%2Fb/registration/executions/1%2F2/start',
      {},
    );
  });

  /**
   * 울타리에 닿는 길은 이 파일 하나다(ADR-0014). 화면마다 자기 호출을 두면
   * "같은 초안을 한 계정에 두 번 보내지 않는다"가 화면마다 달라진다.
   */
  it('is the only web module that addresses the registration execution routes', () => {
    const webSrc = path.resolve(__dirname, '../../..');
    const hits = execFileSync('rg', [
      '--files-with-matches',
      '--glob', '!**/*.spec.*',
      'registration/executions',
      webSrc,
    ], { encoding: 'utf8' })
      .split('\n')
      .filter(Boolean)
      .map((file) => path.relative(webSrc, file));

    expect(hits).toEqual(['app/(channels)/_shared/registration-execution-api.ts']);
  });
});
