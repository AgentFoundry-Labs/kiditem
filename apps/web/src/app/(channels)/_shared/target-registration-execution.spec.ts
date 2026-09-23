import { describe, expect, it, vi } from 'vitest';
import { executeTargetRegistration, valuesForTargetExecution } from './target-registration-execution';
import type { MallPublishAdapter } from './mall-publish-adapter';
import type {
  TargetExecutionResult,
  TargetExecutionSnapshot,
} from '@kiditem/shared/sales-product';

const TARGET_ID = '11111111-1111-4111-8111-111111111111';
const ACCOUNT_ID = '22222222-2222-4222-8222-222222222222';
const EXECUTION_ID = '33333333-3333-4333-8333-333333333333';
const OPTION_ID = '44444444-4444-4444-8444-444444444444';
const LEASE = '55555555-5555-4555-8555-555555555555';

function snapshot(): TargetExecutionSnapshot {
  return {
    targetId: TARGET_ID,
    targetVersion: 4,
    channelAccountId: ACCOUNT_ID,
    kind: 'register',
    channelListingId: null,
    applyCompositionTemplate: false,
    adapterDefaults: { quantity: '1' },
    product: {
      id: '66666666-6666-4666-8666-666666666666',
      name: '동결된 상품명',
      imageUrls: ['https://cdn.example.test/product.png'],
      options: [{ id: OPTION_ID, salePrice: 9900 }],
      channelOverrides: [{ mallKey: 'smartstore', adapterValues: { quantity: '2' } }],
    } as unknown as TargetExecutionSnapshot['product'],
    detailPage: null,
    registrationInput: { mallCategory: null, mallFields: { smartstoreCategory: '50004643:기타감각발달완구' }, adapter: {} },
    adapterPayload: {},
  };
}

function execution(overrides: Partial<TargetExecutionResult> = {}): TargetExecutionResult {
  return {
    executionId: EXECUTION_ID,
    targetId: TARGET_ID,
    channelAccountId: ACCOUNT_ID,
    status: 'prepared',
    providerOutcome: 'not_attempted',
    payloadHash: 'hash-1',
    payload: snapshot(),
    leaseToken: null,
    maySubmit: false,
    externalListingId: null,
    result: null,
    ...overrides,
  };
}

function adapter(
  send: MallPublishAdapter['send'],
  fields: MallPublishAdapter['fields'] = [{
    key: 'quantity', label: '수량', origin: 'override', control: 'text', defaultValue: '1', required: true,
  }],
): MallPublishAdapter {
  return {
    mallKey: 'smartstore',
    mallName: '스마트스토어',
    mode: 'form',
    batchSize: 1,
    requiresOperatorSubmit: true,
    fields,
    preview: () => [],
    validate: () => [],
    send,
  };
}

describe('executeTargetRegistration', () => {
  it('resumes a fresh prepared history row without creating a second intent', async () => {
    const send = vi.fn().mockResolvedValue({
      ok: true,
      submitted: true,
      accepted: true,
      productNo: 'provider-prepared',
      confirmed: false,
      manualSteps: [],
      warnings: [],
    });
    const started = execution({
      status: 'executing',
      providerOutcome: 'uncertain',
      leaseToken: LEASE,
      maySubmit: true,
    });
    const client = {
      prepare: vi.fn(),
      start: vi.fn().mockResolvedValue(started),
      report: vi.fn().mockResolvedValue(execution({ status: 'reconciling', providerOutcome: 'uncertain' })),
    };

    const result = await executeTargetRegistration({
      targetId: TARGET_ID,
      expectedVersion: 4,
      channelAccountId: ACCOUNT_ID,
      mallKey: 'smartstore',
      adapter: adapter(send),
      client,
      existingExecution: execution(),
    });

    expect(client.prepare).not.toHaveBeenCalled();
    expect(client.start).toHaveBeenCalledWith(EXECUTION_ID);
    expect(send).toHaveBeenCalledTimes(1);
    expect(result.adapterCalled).toBe(true);
  });

  it('only refreshes an executing or reconciling history row and never sends it again', async () => {
    const send = vi.fn();
    const client = {
      prepare: vi.fn(),
      start: vi.fn(),
      report: vi.fn(),
    };

    const result = await executeTargetRegistration({
      targetId: TARGET_ID,
      expectedVersion: 4,
      channelAccountId: ACCOUNT_ID,
      mallKey: 'smartstore',
      adapter: adapter(send),
      client,
      existingExecution: execution({ status: 'reconciling', providerOutcome: 'uncertain' }),
    });

    expect(client.prepare).not.toHaveBeenCalled();
    expect(client.start).not.toHaveBeenCalled();
    expect(client.report).not.toHaveBeenCalled();
    expect(send).not.toHaveBeenCalled();
    expect(result.adapterCalled).toBe(false);
    expect(result.outcome.warnings.join(' ')).toContain('재조정 대기');
  });

  it('does not call the adapter when start returns an existing execution', async () => {
    const send = vi.fn();
    const client = {
      prepare: vi.fn().mockResolvedValue(execution()),
      start: vi.fn().mockResolvedValue(execution({
        status: 'reconciling',
        providerOutcome: 'uncertain',
        maySubmit: false,
      })),
      report: vi.fn(),
    };

    const result = await executeTargetRegistration({
      targetId: TARGET_ID,
      expectedVersion: 4,
      channelAccountId: ACCOUNT_ID,
      mallKey: 'smartstore',
      adapter: adapter(send),
      client,
      idempotencyKey: 'intent-1',
    });

    expect(send).not.toHaveBeenCalled();
    expect(client.report).not.toHaveBeenCalled();
    expect(result.adapterCalled).toBe(false);
    expect(result.outcome.warnings.join(' ')).toContain('외부 송신을 건너뛰었습니다');
  });

  it('sends the frozen snapshot only after a fresh lease and reports approval state', async () => {
    const send = vi.fn().mockResolvedValue({
      ok: true,
      submitted: true,
      accepted: true,
      productNo: 'provider-123',
      confirmed: true,
      manualSteps: [],
      warnings: [],
    });
    const started = execution({
      status: 'executing',
      providerOutcome: 'uncertain',
      leaseToken: LEASE,
      maySubmit: true,
    });
    const reported = execution({
      status: 'reconciling',
      providerOutcome: 'uncertain',
      maySubmit: false,
      externalListingId: 'provider-123',
    });
    const client = {
      prepare: vi.fn().mockResolvedValue(execution()),
      start: vi.fn().mockResolvedValue(started),
      report: vi.fn().mockResolvedValue(reported),
    };

    const result = await executeTargetRegistration({
      targetId: TARGET_ID,
      expectedVersion: 4,
      channelAccountId: ACCOUNT_ID,
      mallKey: 'smartstore',
      adapter: adapter(send),
      client,
      idempotencyKey: 'intent-2',
    });

    expect(send).toHaveBeenCalledWith(expect.objectContaining({
      items: [expect.objectContaining({
        name: '동결된 상품명',
        targetExecution: expect.objectContaining({ payloadHash: 'hash-1', leaseToken: LEASE }),
      })],
      values: expect.objectContaining({ quantity: '2', smartstoreCategory: '50004643:기타감각발달완구' }),
    }));
    expect(client.report).toHaveBeenCalledWith(EXECUTION_ID, expect.objectContaining({
      leaseToken: LEASE,
      payloadHash: 'hash-1',
      outcome: 'awaiting_approval',
      evidence: expect.objectContaining({
        channelAccountId: ACCOUNT_ID,
        externalListingId: 'provider-123',
      }),
    }));
    expect(result.outcome.confirmed).toBe(false);
    expect(result.adapterCalled).toBe(true);
  });

  it('records an uncertain result when the adapter can have reached the provider', async () => {
    const send = vi.fn().mockRejectedValue(new Error('extension disconnected after submit'));
    const started = execution({ status: 'executing', providerOutcome: 'uncertain', leaseToken: LEASE, maySubmit: true });
    const client = {
      prepare: vi.fn().mockResolvedValue(execution()),
      start: vi.fn().mockResolvedValue(started),
      report: vi.fn().mockResolvedValue(execution({ status: 'reconciling', providerOutcome: 'uncertain' })),
    };

    const result = await executeTargetRegistration({
      targetId: TARGET_ID,
      expectedVersion: 4,
      channelAccountId: ACCOUNT_ID,
      mallKey: 'smartstore',
      adapter: adapter(send),
      client,
      idempotencyKey: 'intent-3',
    });

    expect(client.report).toHaveBeenCalledWith(EXECUTION_ID, expect.objectContaining({
      outcome: 'uncertain',
      evidence: expect.objectContaining({ observedStatus: 'uncertain' }),
    }));
    expect(result.outcome.warnings).toContain('제출 여부를 확인할 수 없어 재송신하지 않습니다.');
  });

  it('keeps an omitted submission result uncertain instead of allowing a new submission', async () => {
    const send = vi.fn().mockResolvedValue({ ok: false, confirmed: false, manualSteps: [], warnings: [], error: 'response incomplete' });
    const client = {
      prepare: vi.fn().mockResolvedValue(execution()),
      start: vi.fn().mockResolvedValue(execution({ status: 'executing', providerOutcome: 'uncertain', leaseToken: LEASE, maySubmit: true })),
      report: vi.fn().mockResolvedValue(execution({ status: 'reconciling', providerOutcome: 'uncertain' })),
    };
    await executeTargetRegistration({ targetId: TARGET_ID, expectedVersion: 4, channelAccountId: ACCOUNT_ID,
      mallKey: 'smartstore', adapter: adapter(send), client });
    expect(client.report).toHaveBeenCalledWith(EXECUTION_ID, expect.objectContaining({ outcome: 'uncertain' }));
  });

  it('reports a confirmed registration with the provider evidence the adapter observed, for the server to judge', async () => {
    const send = vi.fn().mockResolvedValue({
      ok: true,
      submitted: true,
      accepted: true,
      productNo: '427011919',
      providerEvidence: { providerAccountId: 'A00012345', externalListingId: '427011919' },
      confirmed: false,
      manualSteps: [],
      warnings: [],
    });
    const client = {
      prepare: vi.fn().mockResolvedValue(execution()),
      start: vi.fn().mockResolvedValue(execution({
        status: 'executing', providerOutcome: 'uncertain', leaseToken: LEASE, maySubmit: true,
        expectedProviderAccountId: 'A00012345',
      })),
      report: vi.fn().mockResolvedValue(execution({ status: 'succeeded', providerOutcome: 'succeeded' })),
    };
    const confirming = adapter(send);
    confirming.requiresOperatorSubmit = false;

    await executeTargetRegistration({ targetId: TARGET_ID, expectedVersion: 4, channelAccountId: ACCOUNT_ID,
      mallKey: 'smartstore', adapter: confirming, client });

    expect(send.mock.calls[0]![0].items[0].targetExecution.expectedProviderAccountId).toBe('A00012345');
    expect(client.report).toHaveBeenCalledWith(EXECUTION_ID, {
      leaseToken: LEASE,
      payloadHash: 'hash-1',
      outcome: 'confirmed',
      evidence: {
        channelAccountId: ACCOUNT_ID,
        externalListingId: '427011919',
        providerAccountId: 'A00012345',
        observedStatus: 'confirmed',
      },
    });
  });

  it('never claims confirmation from a submission without provider evidence', async () => {
    const send = vi.fn().mockResolvedValue({
      ok: true, submitted: true, accepted: true, productNo: '427011919', confirmed: true, manualSteps: [], warnings: [],
    });
    const client = {
      prepare: vi.fn().mockResolvedValue(execution()),
      start: vi.fn().mockResolvedValue(execution({ status: 'executing', providerOutcome: 'uncertain', leaseToken: LEASE, maySubmit: true })),
      report: vi.fn().mockResolvedValue(execution({ status: 'reconciling', providerOutcome: 'uncertain' })),
    };
    const submitting = adapter(send);
    submitting.requiresOperatorSubmit = false;

    const run = await executeTargetRegistration({ targetId: TARGET_ID, expectedVersion: 4, channelAccountId: ACCOUNT_ID,
      mallKey: 'smartstore', adapter: submitting, client });

    expect(client.report).toHaveBeenCalledWith(EXECUTION_ID, expect.objectContaining({ outcome: 'submitted' }));
    expect(run.outcome.confirmed).toBe(false);
  });

  it('does not resend when the report response is retried with the same intent', async () => {
    const send = vi.fn().mockResolvedValue({
      ok: true,
      submitted: true,
      accepted: true,
      productNo: 'provider-456',
      confirmed: true,
      manualSteps: [],
      warnings: [],
    });
    const started = execution({
      status: 'executing',
      providerOutcome: 'uncertain',
      leaseToken: LEASE,
      maySubmit: true,
    });
    const existing = execution({
      status: 'reconciling',
      providerOutcome: 'uncertain',
      maySubmit: false,
      externalListingId: 'provider-456',
    });
    const client = {
      prepare: vi.fn().mockResolvedValue(execution()),
      start: vi.fn().mockResolvedValueOnce(started).mockResolvedValueOnce(existing),
      report: vi.fn().mockRejectedValueOnce(new Error('result response lost')),
    };
    const input = {
      targetId: TARGET_ID,
      expectedVersion: 4,
      channelAccountId: ACCOUNT_ID,
      mallKey: 'smartstore',
      adapter: adapter(send),
      client,
      idempotencyKey: 'stable-intent-after-report-timeout',
    };

    await expect(executeTargetRegistration(input)).rejects.toThrow('result response lost');
    const retry = await executeTargetRegistration(input);

    expect(send).toHaveBeenCalledTimes(1);
    expect(client.start).toHaveBeenCalledTimes(2);
    expect(retry.adapterCalled).toBe(false);
    expect(retry.outcome.warnings.join(' ')).toContain('외부 송신을 건너뛰었습니다');
  });
});

describe('valuesForTargetExecution', () => {
  it('uses frozen defaults even when the current adapter defaults have changed', () => {
    const frozen = snapshot();
    frozen.product.channelOverrides = [];
    frozen.adapterDefaults = { quantity: '2' };
    const current = adapter(vi.fn());
    current.fields[0].defaultValue = '999';
    const values = valuesForTargetExecution(frozen, 'smartstore', current);
    expect(values).toEqual({
      quantity: '2',
      smartstoreCategory: '50004643:기타감각발달완구',
    });
  });

  it('uses explicit frozen submission edits over saved settings without changing those settings', () => {
    const frozen = snapshot();
    frozen.registrationInput = { mallCategory: null, mallFields: { quantity: '3', certNumber: 'saved' }, adapter: {} };
    frozen.adapterValues = { quantity: '4', certNumber: '' };
    expect(valuesForTargetExecution(frozen, 'smartstore', adapter(vi.fn()))).toMatchObject({ quantity: '4', certNumber: '' });
    expect(frozen.registrationInput.mallFields).toEqual({ quantity: '3', certNumber: 'saved' });
  });

  it('passes the target\'s mall category, mall fields and this channel\'s adapter values, and nothing else from registrationInput', () => {
    const target = snapshot();
    target.product.channelOverrides = [];
    target.adapterDefaults = {};
    target.registrationInput = {
      mallCategory: { key: '50000001', label: '완구>감각발달' },
      mallFields: { sabangnetCategory: '001002', stockPercent: 80, supplyPrice: 4700, sabangnetTemplate: null },
      adapter: { coupang: { wingCategoryKey: '77777', linkedOptions: { a: 1 } }, smartstore: { storeKey: 'S-1' } },
      mallRegisterShared: { certNumber: 'OLD-SHAPE' },
      salePrice: 1,
    } as unknown as TargetExecutionSnapshot['registrationInput'];

    expect(valuesForTargetExecution(target, 'coupang', adapter(vi.fn()))).toEqual({
      mallCategoryKey: '50000001',
      mallCategoryLabel: '완구>감각발달',
      sabangnetCategory: '001002',
      stockPercent: '80',
      supplyPrice: '4700',
      wingCategoryKey: '77777',
      linkedOptions: JSON.stringify({ a: 1 }),
    });
    expect(valuesForTargetExecution(target, 'teacherville', adapter(vi.fn()))).toEqual({
      mallCategoryKey: '50000001',
      mallCategoryLabel: '완구>감각발달',
      sabangnetCategory: '001002',
      stockPercent: '80',
      supplyPrice: '4700',
    });
  });
});
