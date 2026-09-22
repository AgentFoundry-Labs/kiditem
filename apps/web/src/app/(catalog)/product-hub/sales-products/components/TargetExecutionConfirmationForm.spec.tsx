import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { targetRegistrationExecutionApi } from '@/app/(channels)/_shared/registration-execution-api';
import { TargetExecutionConfirmationForm } from './TargetExecutionConfirmationForm';
import type { TargetExecutionResult } from '@kiditem/shared/sales-product';

vi.mock('@/app/(channels)/_shared/registration-execution-api', () => ({
  registrationExecutionKeys: {
    targetHistory: (targetId: string) => ['registration-target-executions', 'history', targetId],
  },
  targetRegistrationExecutionApi: { report: vi.fn() },
}));

const EXECUTION_ID = '66666666-6666-4666-8666-666666666666';
const TARGET_ID = '55555555-5555-4555-8555-555555555555';
const ACCOUNT_ID = '22222222-2222-4222-8222-222222222222';
const PRODUCT_ID = '11111111-1111-4111-8111-111111111111';
const OPTION_ID = '33333333-3333-4333-8333-333333333333';
const OPTION_TWO_ID = '99999999-9999-4999-8999-999999999999';
const LISTING_OPTION_ID = '44444444-4444-4444-8444-444444444444';
const LEASE_TOKEN = '77777777-7777-4777-8777-777777777777';

function execution(overrides: Record<string, unknown> = {}): TargetExecutionResult {
  return {
    executionId: EXECUTION_ID,
    targetId: TARGET_ID,
    channelAccountId: ACCOUNT_ID,
    status: 'reconciling',
    providerOutcome: 'uncertain',
    payloadHash: 'frozen-payload-hash',
    payload: {
      targetId: TARGET_ID,
      targetVersion: 4,
      channelAccountId: ACCOUNT_ID,
      kind: 'register',
      channelListingId: null,
      applyCompositionTemplate: false,
      product: {
        id: PRODUCT_ID,
        name: '동물 블록',
        options: [{ id: OPTION_ID, optionCode: '100-0001', values: ['파랑'] }],
      },
      registrationInput: { wingProduct: { category: 'toy' } },
      supplyPrices: [{ salesProductOptionId: OPTION_ID, supplyPrice: 3200 }],
    },
    leaseToken: LEASE_TOKEN,
    maySubmit: false,
    externalListingId: null,
    result: null,
    ...overrides,
  } as unknown as TargetExecutionResult;
}

function templateExecution(): TargetExecutionResult {
  const base = execution();
  return execution({
    payload: {
      ...base.payload,
      applyCompositionTemplate: true,
      product: {
        ...base.payload.product,
        options: [
          ...base.payload.product.options,
          { id: OPTION_TWO_ID, optionCode: '100-0002', values: ['노랑'] },
        ],
      },
    },
  });
}

function renderForm(value = execution()) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <TargetExecutionConfirmationForm execution={value} />
    </QueryClientProvider>,
  );
}

function fillListingEvidence() {
  fireEvent.change(screen.getByLabelText('실제 몰 상품번호'), { target: { value: 'MALL-123' } });
  fireEvent.change(screen.getByLabelText('실제 몰 상품 URL'), { target: { value: 'https://admin.example.test/products/MALL-123' } });
}

describe('<TargetExecutionConfirmationForm />', () => {
  beforeEach(() => vi.clearAllMocks());

  it('reports confirmed evidence with the frozen execution lease and exact option mapping', async () => {
    const current = execution();
    vi.mocked(targetRegistrationExecutionApi.report).mockResolvedValue(current);
    renderForm(current);

    fillListingEvidence();
    fireEvent.change(screen.getByLabelText('몰 판매 상태'), { target: { value: '승인대기' } });
    fireEvent.change(screen.getByLabelText('몰 계정 식별자'), { target: { value: 'seller-7' } });
    fireEvent.change(screen.getByLabelText(/실제 몰 옵션번호$/), { target: { value: 'OPT-77' } });
    fireEvent.change(screen.getByLabelText(/판매자 SKU$/), { target: { value: 'SKU-77' } });
    fireEvent.click(screen.getByRole('button', { name: '몰 확인 결과 기록' }));

    await waitFor(() => expect(targetRegistrationExecutionApi.report).toHaveBeenCalledTimes(1));
    expect(targetRegistrationExecutionApi.report).toHaveBeenCalledWith(EXECUTION_ID, {
      leaseToken: LEASE_TOKEN,
      payloadHash: 'frozen-payload-hash',
      outcome: 'confirmed',
      evidence: {
        channelAccountId: ACCOUNT_ID,
        externalListingId: 'MALL-123',
        observedUrl: 'https://admin.example.test/products/MALL-123',
        observedStatus: '승인대기',
        providerAccountId: 'seller-7',
        options: [{ salesProductOptionId: OPTION_ID, externalOptionId: 'OPT-77', sellerSku: 'SKU-77' }],
      },
    });
  });

  it('keeps the observed provider account optional when the frozen account is unknown', async () => {
    const current = execution();
    vi.mocked(targetRegistrationExecutionApi.report).mockResolvedValue(current);
    renderForm(current);

    fillListingEvidence();
    fireEvent.click(screen.getByRole('button', { name: '몰 확인 결과 기록' }));

    await waitFor(() => expect(targetRegistrationExecutionApi.report).toHaveBeenCalledTimes(1));
    expect(targetRegistrationExecutionApi.report).toHaveBeenCalledWith(EXECUTION_ID, expect.objectContaining({
      evidence: expect.not.objectContaining({ providerAccountId: expect.anything() }),
    }));
  });

  it('blocks a missing or mismatched observed account when the frozen account is known', async () => {
    const current = execution({ expectedProviderAccountId: 'seller-expected' });
    renderForm(current);

    fillListingEvidence();
    fireEvent.click(screen.getByRole('button', { name: '몰 확인 결과 기록' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('실제 몰 계정 식별자');
    expect(targetRegistrationExecutionApi.report).not.toHaveBeenCalled();

    fireEvent.change(screen.getByLabelText('몰 계정 식별자'), { target: { value: 'seller-wrong' } });
    fireEvent.click(screen.getByRole('button', { name: '몰 확인 결과 기록' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('일치하지 않습니다');
    expect(targetRegistrationExecutionApi.report).not.toHaveBeenCalled();
  });

  it('reports the observed account only when it matches the frozen account', async () => {
    const current = execution({ expectedProviderAccountId: 'seller-expected' });
    vi.mocked(targetRegistrationExecutionApi.report).mockResolvedValue(current);
    renderForm(current);

    fillListingEvidence();
    fireEvent.change(screen.getByLabelText('몰 계정 식별자'), { target: { value: 'seller-expected' } });
    fireEvent.click(screen.getByRole('button', { name: '몰 확인 결과 기록' }));

    await waitFor(() => expect(targetRegistrationExecutionApi.report).toHaveBeenCalledTimes(1));
    expect(targetRegistrationExecutionApi.report).toHaveBeenCalledWith(EXECUTION_ID, expect.objectContaining({
      evidence: expect.objectContaining({ providerAccountId: 'seller-expected' }),
    }));
  });

  it('blocks template confirmation when one frozen selected option identity is missing', async () => {
    const current = templateExecution();
    vi.mocked(targetRegistrationExecutionApi.report).mockResolvedValue(current);
    renderForm(current);

    fillListingEvidence();
    fireEvent.change(screen.getByLabelText(/100-0001.*실제 몰 옵션번호/), { target: { value: 'OPT-77' } });
    fireEvent.click(screen.getByRole('button', { name: '몰 확인 결과 기록' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('동결된 모든 선택 옵션');
    expect(targetRegistrationExecutionApi.report).not.toHaveBeenCalled();
  });

  it('reports every frozen selected option identity when applying a template', async () => {
    const current = templateExecution();
    vi.mocked(targetRegistrationExecutionApi.report).mockResolvedValue(current);
    renderForm(current);

    fillListingEvidence();
    fireEvent.change(screen.getByLabelText(/100-0001.*실제 몰 옵션번호/), { target: { value: 'OPT-77' } });
    fireEvent.change(screen.getByLabelText(/100-0002.*실제 몰 옵션번호/), { target: { value: 'OPT-88' } });
    fireEvent.click(screen.getByRole('button', { name: '몰 확인 결과 기록' }));

    await waitFor(() => expect(targetRegistrationExecutionApi.report).toHaveBeenCalledTimes(1));
    expect(targetRegistrationExecutionApi.report).toHaveBeenCalledWith(EXECUTION_ID, expect.objectContaining({
      evidence: expect.objectContaining({
        options: [
          { salesProductOptionId: OPTION_ID, externalOptionId: 'OPT-77' },
          { salesProductOptionId: OPTION_TWO_ID, externalOptionId: 'OPT-88' },
        ],
      }),
    }));
  });

  it('requires every frozen composition transition mapping and sends explicit IDs', async () => {
    const current = execution({
      payload: {
        ...execution().payload,
        kind: 'composition_change',
        optionTransitions: [{ channelListingOptionId: LISTING_OPTION_ID, salesProductOptionId: OPTION_ID }],
      },
    });
    vi.mocked(targetRegistrationExecutionApi.report).mockResolvedValue(current);
    renderForm(current);

    fillListingEvidence();
    fireEvent.click(screen.getByRole('button', { name: '몰 확인 결과 기록' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('구성 전환된 모든 공통 옵션');
    expect(targetRegistrationExecutionApi.report).not.toHaveBeenCalled();

    fireEvent.change(screen.getByLabelText(/실제 몰 옵션번호$/), { target: { value: 'NEW-OPT-9' } });
    fireEvent.click(screen.getByRole('button', { name: '몰 확인 결과 기록' }));

    await waitFor(() => expect(targetRegistrationExecutionApi.report).toHaveBeenCalledTimes(1));
    expect(targetRegistrationExecutionApi.report).toHaveBeenCalledWith(EXECUTION_ID, expect.objectContaining({
      evidence: expect.objectContaining({
        options: [{ salesProductOptionId: OPTION_ID, externalOptionId: 'NEW-OPT-9' }],
      }),
    }));
  });

  it('surfaces server validation errors without attempting a provider resend', async () => {
    vi.mocked(targetRegistrationExecutionApi.report).mockRejectedValue(new Error('lease가 만료되었습니다.'));
    renderForm();
    fillListingEvidence();
    fireEvent.click(screen.getByRole('button', { name: '몰 확인 결과 기록' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('lease가 만료되었습니다.');
    expect(targetRegistrationExecutionApi.report).toHaveBeenCalledTimes(1);
  });
});
