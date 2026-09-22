import { describe, expect, it, vi } from 'vitest';
import {
  executeListingAvailability,
  type ExecuteListingAvailabilityInput,
} from './listing-availability-execution';
import type {
  ListingAvailabilityExecution,
  ReportListingAvailabilityInput,
} from '@kiditem/shared/sales-product';
import type { MallAvailabilitySendResult } from './mall-availability-send';

const ACCOUNT_ID = '22222222-2222-4222-8222-222222222222';
const LISTING_ID = 'MALL-711';
const EXECUTION_ID = '66666666-6666-4666-8666-666666666666';
const LEASE_TOKEN = '77777777-7777-4777-8777-777777777777';

function execution(overrides: Partial<ListingAvailabilityExecution> = {}): ListingAvailabilityExecution {
  return {
    executionId: EXECUTION_ID,
    channelAccountId: ACCOUNT_ID,
    status: 'prepared',
    providerOutcome: 'not_attempted',
    payloadHash: 'frozen-hash',
    payload: {
      subject: 'channel_listing',
      channelListingId: '55555555-5555-4555-8555-555555555555',
      channelAccountId: ACCOUNT_ID,
      mallKey: 'coupang',
      externalListingId: LISTING_ID,
      kind: 'sold_out',
      optionCodes: ['OPTION-FROZEN'],
    },
    leaseToken: null,
    maySubmit: false,
    externalListingId: LISTING_ID,
    expectedProviderAccountId: null,
    result: null,
    ...overrides,
  } as ListingAvailabilityExecution;
}

function transportResult(overrides: Partial<MallAvailabilitySendResult> = {}): MallAvailabilitySendResult {
  return {
    sent: 1,
    failed: 0,
    requestOnly: false,
    confirmed: 1,
    warnings: [],
    ...overrides,
  };
}

function setup(
  overrides: Partial<{
    history: ListingAvailabilityExecution[];
    prepared: ListingAvailabilityExecution;
    started: ListingAvailabilityExecution;
    reportResult: ListingAvailabilityExecution;
  }> = {},
) {
  const prepared = overrides.prepared ?? execution();
  const started = overrides.started ?? execution({
    status: 'executing',
    leaseToken: LEASE_TOKEN,
    maySubmit: true,
  });
  const reportResult = overrides.reportResult ?? execution({
    status: 'reconciling',
    providerOutcome: 'succeeded',
    leaseToken: LEASE_TOKEN,
    maySubmit: false,
  });
  const client = {
    list: vi.fn().mockResolvedValue(overrides.history ?? []),
    prepare: vi.fn().mockResolvedValue(prepared),
    start: vi.fn().mockResolvedValue(started),
    report: vi.fn().mockResolvedValue(reportResult),
  };
  const input: ExecuteListingAvailabilityInput = {
    channelAccountId: ACCOUNT_ID,
    externalListingId: LISTING_ID,
    mallKey: 'coupang',
    kind: 'sold_out',
    optionCodes: ['OPTION-LIVE'],
    idempotencyKey: 'intent-1',
    client,
    send: vi.fn().mockResolvedValue(transportResult()),
  };
  return { input, client, prepared, started, reportResult };
}

describe('executeListingAvailability', () => {
  it('reads exact listing history, freezes the intent, starts, then sends only the returned snapshot with lease context', async () => {
    const { input, client } = setup();
    const run = await executeListingAvailability(input);

    expect(client.list).toHaveBeenCalledWith(ACCOUNT_ID, LISTING_ID);
    expect(client.prepare).toHaveBeenCalledWith({
      channelAccountId: ACCOUNT_ID,
      externalListingId: LISTING_ID,
      kind: 'sold_out',
      optionCodes: ['OPTION-LIVE'],
      idempotencyKey: 'intent-1',
    });
    expect(client.start).toHaveBeenCalledWith(EXECUTION_ID);
    expect(input.send).toHaveBeenCalledWith(
      expect.objectContaining({ optionCodes: ['OPTION-FROZEN'] }),
      { executionId: EXECUTION_ID, payloadHash: 'frozen-hash', leaseToken: LEASE_TOKEN },
    );
    expect(client.report).toHaveBeenCalledWith(EXECUTION_ID, expect.objectContaining({
      leaseToken: LEASE_TOKEN,
      payloadHash: 'frozen-hash',
      outcome: 'submitted',
      evidence: expect.objectContaining({ channelAccountId: ACCOUNT_ID, externalListingId: LISTING_ID }),
    } satisfies Partial<ReportListingAvailabilityInput>));
    expect(run).toMatchObject({ adapterCalled: true, activeReused: false, execution: { status: 'reconciling' } });
  });

  it('reuses an active prepared row and sends only its frozen listing intent', async () => {
    const existing = execution({
      payload: { ...execution().payload, kind: 'resume', optionCodes: ['OPTION-HISTORIC'] },
    });
    const { input, client } = setup({
      history: [existing],
      started: { ...existing, status: 'executing', leaseToken: LEASE_TOKEN, maySubmit: true },
    });
    input.kind = 'sold_out';
    input.optionCodes = ['OPTION-CURRENT'];

    const run = await executeListingAvailability(input);

    expect(client.prepare).not.toHaveBeenCalled();
    expect(client.start).toHaveBeenCalledOnce();
    expect(input.send).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'resume', optionCodes: ['OPTION-HISTORIC'] }),
      expect.any(Object),
    );
    expect(run.activeReused).toBe(true);
  });

  it.each(['executing', 'reconciling'] as const)('never resends an existing %s execution', async (status) => {
    const existing = execution({ status, providerOutcome: 'uncertain', leaseToken: LEASE_TOKEN });
    const { input, client } = setup({ history: [existing] });

    const run = await executeListingAvailability(input);

    expect(client.prepare).not.toHaveBeenCalled();
    expect(client.start).not.toHaveBeenCalled();
    expect(input.send).not.toHaveBeenCalled();
    expect(client.report).not.toHaveBeenCalled();
    expect(run).toMatchObject({ adapterCalled: false, activeReused: true, execution: { status } });
  });

  it('does not call transport when start did not grant the fresh lease', async () => {
    const { input, client } = setup({
      started: execution({ status: 'reconciling', providerOutcome: 'uncertain', maySubmit: false }),
    });
    const run = await executeListingAvailability(input);

    expect(input.send).not.toHaveBeenCalled();
    expect(client.report).not.toHaveBeenCalled();
    expect(run).toMatchObject({ adapterCalled: false, execution: { status: 'reconciling' } });
  });

  it('keeps possible transport failure uncertain and never treats provider counts as confirmation', async () => {
    const { input, client } = setup();
    vi.mocked(input.send).mockRejectedValue(new Error('message port closed'));

    const run = await executeListingAvailability(input);

    expect(client.report).toHaveBeenCalledWith(EXECUTION_ID, expect.objectContaining({ outcome: 'uncertain' }));
    expect(run.transportError).toBe('message port closed');

    const second = setup({ history: [execution({ status: 'reconciling', providerOutcome: 'uncertain' })] });
    const rerun = await executeListingAvailability(second.input);
    expect(second.input.send).not.toHaveBeenCalled();
    expect(rerun.adapterCalled).toBe(false);
  });
});


describe('Wing availability confirmation', () => {
  const proof = { externalListingId: LISTING_ID, providerAccountId: 'vendor-1',
    observedOptionStocks: [{ externalOptionId: 'OPTION-FROZEN', stock: 0, registrationType: 'NORMAL' as const }] };
  it('uses the frozen account for transport and reports only complete provider reread proof', async () => {
    const { input, client } = setup({ started: execution({ status: 'executing', leaseToken: LEASE_TOKEN,
      maySubmit: true, expectedProviderAccountId: 'vendor-1' }) });
    vi.mocked(input.send).mockResolvedValue(transportResult({ wingEvidence: [proof] }));
    await executeListingAvailability(input);
    expect(input.send).toHaveBeenCalledWith(expect.any(Object), expect.objectContaining({ expectedProviderAccountId: 'vendor-1' }));
    expect(client.report).toHaveBeenCalledWith(EXECUTION_ID, expect.objectContaining({ outcome: 'confirmed',
      evidence: expect.objectContaining({ providerAccountId: 'vendor-1', observedOptionStocks: proof.observedOptionStocks }) }));
  });
  it.each([
    { ...proof, providerAccountId: 'other-vendor' },
    { ...proof, externalListingId: 'other-listing' },
    { ...proof, observedOptionStocks: [] },
    { ...proof, observedOptionStocks: [...proof.observedOptionStocks, ...proof.observedOptionStocks] },
    { ...proof, observedOptionStocks: [{ ...proof.observedOptionStocks[0], stock: 1 }] },
  ])('keeps mismatched or partial evidence unresolved', async (evidence) => {
    const { input, client } = setup({ started: execution({ status: 'executing', leaseToken: LEASE_TOKEN,
      maySubmit: true, expectedProviderAccountId: 'vendor-1' }) });
    vi.mocked(input.send).mockResolvedValue(transportResult({ wingEvidence: [evidence] }));
    await executeListingAvailability(input);
    expect(client.report.mock.calls[0][1].outcome).toBe('submitted');
    expect(client.report.mock.calls[0][1].evidence).not.toHaveProperty('providerAccountId');
  });
});
