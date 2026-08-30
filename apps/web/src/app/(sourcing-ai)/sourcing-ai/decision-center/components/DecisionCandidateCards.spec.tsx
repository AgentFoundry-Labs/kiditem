import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { CandidateDetailCard } from './DecisionCandidateCards';
import type { SourcingDecisionCandidateViewModel } from '../lib/sourcing-decision-center';
import type { SupplierOfferSnapshot } from '../lib/sourcing-intelligence-api';

describe('CandidateDetailCard', () => {
  it('배치 단위 소스 커버리지를 후보 지표로 표시하지 않는다', () => {
    // 서버는 키워드 단위 coverage 하나를 모든 후보에 복사한다. 후보 증거가 0 인데
    // 옆에 67% 가 붙으면 서로 모순되는 화면이 되므로, 이 값은 배치 바에만 둔다.
    renderCard(candidate({
      confidence: 0.67,
      confidenceKind: 'coverage',
      evidenceFamilyCount: 0,
      evidencePlatformCount: 0,
    }));

    expect(screen.queryByText('증거 커버리지')).not.toBeInTheDocument();
    expect(screen.queryByText('소스 커버리지')).not.toBeInTheDocument();
    expect(screen.queryByText('67%')).not.toBeInTheDocument();
  });

  it('후보 카드에는 그 후보의 실제 증거 수를 보여준다', () => {
    renderCard(candidate({ evidenceFamilyCount: 0, evidencePlatformCount: 0 }));

    expect(screen.getByText('연결된 증거')).toBeInTheDocument();
    expect(screen.getByText('0종 · 0곳')).toBeInTheDocument();
  });

  it('disables RFQ and sample actions visibly for a read-only role', () => {
    const onRequestRfq = vi.fn();
    const onRequestSample = vi.fn();
    renderCard(candidate({ canRequestRfq: true, canRequestSample: true }), {
      canManage: false,
      onRequestRfq,
      onRequestSample,
    });

    const rfq = screen.getByRole('button', { name: '견적 요청(RFQ)' });
    const sample = screen.getByRole('button', { name: '샘플 요청' });
    expect(rfq).toBeDisabled();
    expect(sample).toBeDisabled();
    // 두 요청이 같은 사유로 막히면 버튼마다 반복하지 않고 그룹 아래 한 번만 적는다.
    expect(screen.getAllByText('Owner 또는 Admin 권한이 필요합니다.')).toHaveLength(1);

    fireEvent.click(rfq);
    fireEvent.click(sample);
    expect(onRequestRfq).not.toHaveBeenCalled();
    expect(onRequestSample).not.toHaveBeenCalled();
  });

  it('keeps a per-button reason when only one of the two actions is blocked', () => {
    renderCard(candidate({
      canRequestRfq: true,
      canRequestSample: false,
      offer: offer({ sampleAvailable: false }),
      actionBlockReasons: ['supplier_sample_unavailable'],
    }));

    // 사유가 서로 다르면 합치지 않고 막힌 버튼 아래에 그대로 둔다.
    expect(screen.getByRole('button', { name: '견적 요청(RFQ)' })).toBeEnabled();
    expect(screen.getByRole('button', { name: '샘플 요청' })).toBeDisabled();
    expect(screen.getAllByText(/샘플을 제공하지 않는/)).toHaveLength(1);
  });

  it('keeps RFQ enabled but blocks a supplier-disallowed sample with a visible reason', () => {
    const onRequestRfq = vi.fn();
    const onRequestSample = vi.fn();
    renderCard(candidate({
      canRequestRfq: true,
      canRequestSample: false,
      offer: offer({ sampleAvailable: false }),
      actionBlockReasons: ['supplier_sample_unavailable'],
    }), { onRequestRfq, onRequestSample });

    const rfq = screen.getByRole('button', { name: '견적 요청(RFQ)' });
    const sample = screen.getByRole('button', { name: '샘플 요청' });
    expect(rfq).toBeEnabled();
    expect(sample).toBeDisabled();
    expect(screen.getByText('공급자가 샘플을 제공하지 않는 제안입니다.')).toBeInTheDocument();

    fireEvent.click(rfq);
    fireEvent.click(sample);
    expect(onRequestRfq).toHaveBeenCalledTimes(1);
    expect(onRequestSample).not.toHaveBeenCalled();
  });

  it('keeps purchase execution locked even when a persisted item says execution eligible', () => {
    renderCard(candidate({ executionEligible: true }));

    expect(screen.getAllByText('구매 실행 잠금').length).toBeGreaterThan(0);
    expect(screen.queryByRole('button', { name: /발주|주문|결제/ })).not.toBeInTheDocument();
    expect(screen.getByText(/테스트 발주·결제·발주서는 생성하지 않습니다/)).toBeInTheDocument();
  });
});

function renderCard(
  value: SourcingDecisionCandidateViewModel,
  overrides: {
    canManage?: boolean;
    onRequestRfq?: () => void;
    onRequestSample?: () => void;
  } = {},
) {
  return render(
    <CandidateDetailCard
      candidate={value}
      totalCandidates={3}
      canManage={overrides.canManage ?? true}
      isCreatingIntent={false}
      onRequestRfq={overrides.onRequestRfq ?? vi.fn()}
      onRequestSample={overrides.onRequestSample ?? vi.fn()}
    />,
  );
}

function candidate(
  overrides: Partial<SourcingDecisionCandidateViewModel> = {},
): SourcingDecisionCandidateViewModel {
  return {
    id: 'candidate-1',
    rank: 1,
    productName: '자석 블록 64피스',
    decision: 'hold',
    decisionLabel: '보류',
    executionEligible: false,
    score: 78,
    confidence: 0.67,
    confidenceKind: 'coverage',
    evidenceFamilyCount: 3,
    evidencePlatformCount: 2,
    hasCoupangEvidence: true,
    has1688Evidence: true,
    nextEvidenceAction: 'obtain_calibrated_probability',
    reasonCodes: ['coverage_confidence_not_executable'],
    riskCodes: [],
    offer: offer(),
    launchCandidate: null,
    latestIntent: null,
    canRequestRfq: true,
    canRequestSample: true,
    actionBlockReasons: [],
    ...overrides,
  };
}

function offer(overrides: Partial<SupplierOfferSnapshot> = {}): SupplierOfferSnapshot {
  return {
    id: 'offer-1',
    organizationId: 'organization-1',
    evidenceObservationId: 'observation-1',
    supplierId: null,
    supplierName: 'Yiwu Top Toy',
    identityStatus: 'exact_variant',
    sourcePlatform: '1688',
    sourceUrl: null,
    externalSupplierKey: null,
    externalOfferId: 'offer-external-1',
    externalSkuId: 'sku-1',
    variantKey: 'red-64',
    productName: 'Magnetic block',
    variantName: 'Red 64pcs',
    currency: 'CNY',
    orderUnit: 'box',
    unitsPerOrderUnit: 1,
    minOrderQuantity: 10,
    sampleAvailable: true,
    samplePriceCny: '18.00',
    domesticFreightCny: null,
    productionLeadTimeDaysMin: 7,
    productionLeadTimeDaysMax: 14,
    dispatchLeadTimeDaysMin: 1,
    dispatchLeadTimeDaysMax: 3,
    grossWeightGrams: null,
    lengthMm: null,
    widthMm: null,
    heightMm: null,
    material: 'ABS',
    packCount: 1,
    capturedAt: '2026-08-01T00:00:00.000Z',
    validUntil: '2026-09-01T00:00:00.000Z',
    snapshotHash: 'hash',
    priceTiers: [{ id: 'tier-1', minQuantity: 10, maxQuantity: null, unitPriceCny: '12.30' }],
    createdAt: '2026-08-01T00:00:00.000Z',
    ...overrides,
  };
}
