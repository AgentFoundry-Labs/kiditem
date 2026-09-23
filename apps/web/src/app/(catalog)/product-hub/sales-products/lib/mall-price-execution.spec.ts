import { describe, expect, it, vi } from 'vitest';
import { executeTargetMallPrice, mallPriceReportDecision, frozenMallPriceRequest } from './mall-price-execution';
import { MallPriceSendError } from './mall-price-send';
import type { RegistrationTarget, TargetExecutionResult } from '@kiditem/shared/sales-product';

const target = { id: 'target', salesProductId: 'product', channelAccountId: 'account', version: 4 } as RegistrationTarget;
const prepared = {
  executionId: 'execution', targetId: 'target', channelAccountId: 'account',
  status: 'prepared', providerOutcome: 'not_attempted', payloadHash: 'hash', expectedProviderAccountId: null,
  payload: { kind: 'update', updateFields: ['salePrice'], channelListingId: 'listing', product: {
    options: [{ id: 'option', salePrice: 3000 }],
    channelListings: [{ id: 'listing', channelAccountId: 'account', mallKey: 'kakao', externalId: 'external',
      options: [{ salesProductOptionId: 'option', salePrice: 1000 }] }],
  } },
} as unknown as TargetExecutionResult;
const started = { ...prepared, status: 'executing', providerOutcome: 'uncertain', maySubmit: true, leaseToken: 'lease' } as TargetExecutionResult;
const input = {
  salesProductId: 'product', channelAccountId: 'account', expectedPrice: 3000,
  listingId: 'listing', mallKey: 'kakao', idempotencyKey: 'request',
};
const transport = { sent: 1, failed: 0, confirmed: 1, warnings: [], results: [
  { code: 'external', before: 1000, after: 3000, confirmed: true, observedUrl: 'https://store-sell.kakao.com/products/external' },
] };
function client() {
  return {
    list: vi.fn().mockResolvedValue([]), prepare: vi.fn().mockResolvedValue(prepared),
    start: vi.fn().mockResolvedValue(started), get: vi.fn(),
    report: vi.fn().mockResolvedValue({ ...started, status: 'succeeded' }),
  };
}
const resolveTarget = vi.fn(async () => target);

describe('mall price target execution boundary', () => {
  it('uses the server-frozen price and claim identity, then reports actual observed evidence', async () => {
    const api = client();
    const send = vi.fn().mockResolvedValue(transport);
    await executeTargetMallPrice(input, api, send, resolveTarget);
    // 상품 × 몰 계정당 등록 설정은 하나뿐이다(KID-310) — 고를 target id 가 없다.
    expect(resolveTarget).toHaveBeenCalledWith({ salesProductId: 'product', channelAccountId: 'account' });
    expect(api.prepare).toHaveBeenCalledWith('target', expect.objectContaining({
      kind: 'update', updateFields: ['salePrice'], expectedVersion: 4, channelListingId: 'listing',
    }));
    expect(send).toHaveBeenCalledWith('kakao', [expect.objectContaining({ code: 'external', price: 3000, ifPrice: 1000 })], {
      executionId: 'execution', payloadHash: 'hash', leaseToken: 'lease',
    });
    expect(api.report).toHaveBeenCalledWith('execution', expect.objectContaining({
      outcome: 'confirmed', evidence: expect.objectContaining({ observedUrl: transport.results[0]!.observedUrl }),
    }));
    expect(api.report.mock.calls[0]![1].evidence).not.toHaveProperty('observedStatus');
  });
  it('never sends again while the same listing has an uncertain active execution', async () => {
    const api = client(); api.list.mockResolvedValue([{ ...started, status: 'reconciling' }]);
    const send = vi.fn();
    expect((await executeTargetMallPrice(input, api, send, resolveTarget)).sent).toBe(false);
    expect(api.prepare).not.toHaveBeenCalled(); expect(api.start).not.toHaveBeenCalled(); expect(send).not.toHaveBeenCalled();
  });
  it('resumes a prepared attempt without making a new payload or submitting after a denied claim', async () => {
    const api = client(); api.list.mockResolvedValue([prepared]); api.start.mockResolvedValue({ ...started, maySubmit: false });
    const send = vi.fn();
    await executeTargetMallPrice(input, api, send, resolveTarget);
    expect(api.prepare).not.toHaveBeenCalled(); expect(api.start).toHaveBeenCalledWith('execution');
    expect(send).not.toHaveBeenCalled();
  });
  it('reports a timeout after dispatch as uncertain, never as safe to retry', async () => {
    const api = client();
    await executeTargetMallPrice(input, api, vi.fn().mockRejectedValue(new MallPriceSendError('timeout', { dispatchAttempted: true })), resolveTarget);
    expect(api.report).toHaveBeenCalledWith('execution', expect.objectContaining({ outcome: 'uncertain' }));
  });
  it('closes a proved pre-dispatch failure as not submitted', async () => {
    const api = client();
    await executeTargetMallPrice(input, api, vi.fn().mockRejectedValue(new MallPriceSendError('extension missing')), resolveTarget);
    expect(api.report).toHaveBeenCalledWith('execution', expect.objectContaining({ outcome: 'not_submitted' }));
  });
  it('rejects a frozen listing/account mismatch before provider IO', async () => {
    const api = client(); api.start.mockResolvedValue({ ...started, channelAccountId: 'other' });
    const send = vi.fn();
    await executeTargetMallPrice(input, api, send, resolveTarget);
    expect(send).not.toHaveBeenCalled();
    expect(api.report).toHaveBeenCalledWith('execution', expect.objectContaining({ outcome: 'not_submitted' }));
  });
  it('does not reinterpret a failed report as a provider failure or submit again', async () => {
    const api = client(); api.report.mockRejectedValue(new Error('network'));
    const send = vi.fn().mockResolvedValue(transport);
    await expect(executeTargetMallPrice(input, api, send, resolveTarget)).rejects.toThrow('network');
    expect(send).toHaveBeenCalledTimes(1); expect(api.report).toHaveBeenCalledTimes(1);
  });
  it('does not submit if the resolved frozen price changed after the operator previewed it', async () => {
    const api = client();
    const send = vi.fn();
    await executeTargetMallPrice({ ...input, expectedPrice: 2500 }, api, send, resolveTarget);
    expect(send).not.toHaveBeenCalled();
    expect(api.report).toHaveBeenCalledWith('execution', expect.objectContaining({ outcome: 'not_submitted' }));
  });
  it('allows retry only with explicit no-submission evidence, not merely sent=0', () => {
    const frozen = frozenMallPriceRequest(started, 'listing');
    const skipped = { sent: 0, failed: 1, confirmed: 0, results: [], warnings: ['가격 변경으로 보내지 않았습니다.'] };
    expect(mallPriceReportDecision('kakao', started, frozen, { ...skipped, submissionAttempted: false }).outcome).toBe('not_submitted');
    expect(mallPriceReportDecision('kakao', started, frozen, skipped).outcome).toBe('uncertain');
    expect(mallPriceReportDecision('kakao', started, frozen, { ...skipped, submissionAttempted: true }).outcome).toBe('uncertain');
  });
  it('keeps approval and account-identity confirmation separate from a matching price', () => {
    const frozen = frozenMallPriceRequest(started, 'listing');
    expect(mallPriceReportDecision('kidsnote', started, frozen, transport).outcome).toBe('awaiting_approval');
    const decision = mallPriceReportDecision('kakao', { ...started, expectedProviderAccountId: 'provider' }, frozen, transport);
    expect(decision.outcome).toBe('submitted'); expect(decision.evidence).not.toHaveProperty('providerAccountId');
    const withoutObservation = { ...transport, results: [{ ...transport.results[0]!, observedUrl: undefined }] };
    expect(mallPriceReportDecision('kakao', started, frozen, withoutObservation).confirmed).toBe(false);
  });
});
