import type { ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { OperationView } from '@kiditem/shared/operation';
import { apiClient } from '@/lib/api-client';
import { describeRegistrationOperation } from './registration-operation';
import { RegistrationOperationResolution } from './RegistrationOperationResolution';

vi.mock('@/lib/api-client', () => ({ apiClient: { get: vi.fn(), post: vi.fn() } }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() } }));

const OPERATION = '33333333-3333-4333-8333-333333333333';
const OPTION = '66666666-6666-4666-8666-666666666666';

function operation(patch: Partial<OperationView>): OperationView {
  return {
    id: OPERATION, kind: 'channels.registration', status: 'reconciling', lockKeys: [],
    plan: {
      executionKind: 'register', mallKey: 'art09',
      payload: { snapshot: { product: { options: [{ id: OPTION, optionCode: 'KID-1-01', values: ['빨강'] }] } } },
    },
    progress: null,
    result: {
      providerOutcome: 'uncertain', mallOutcome: 'submitted', submitted: true, submitSkipped: null,
      externalListingId: null, mallMessage: null, fill: { steps: [], warnings: [], manualSteps: [], dialogs: [] }, evidence: null,
    },
    window: null, errorCode: null, errorMessage: null, startedAt: '2026-09-27T09:00:00.000Z', finishedAt: null,
    expiresAt: '2026-09-27T09:30:00.000Z', attempts: 1, maxAttempts: 1, scheduledFor: null, ...patch,
  };
}

function wrap(children: ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(apiClient.post).mockResolvedValue({ operation: operation({ status: 'succeeded' }) });
});
afterEach(cleanup);

describe('RegistrationOperationResolution — reconciling 등록 실행 확인(KID-218)', () => {
  it('⭐ "확인 필요" 실행에 등록상품ID 입력과 "등록되지 않음"을 연다 — 확인은 몰에서 읽은 ID로', async () => {
    const onResolved = vi.fn();
    render(wrap(<RegistrationOperationResolution read={describeRegistrationOperation(operation({}))} onResolved={onResolved} />));

    expect(screen.getByText('확인 필요')).toBeTruthy();
    fireEvent.change(screen.getByLabelText('등록상품ID'), { target: { value: ' 9001 ' } });
    fireEvent.change(screen.getByLabelText('KID-1-01 · 빨강 몰 옵션번호'), { target: { value: 'v-1' } });
    fireEvent.click(screen.getByRole('button', { name: '몰에서 확인' }));

    await waitFor(() => expect(apiClient.post).toHaveBeenCalledWith(
      `/api/channels/registration-operations/${OPERATION}/confirm`,
      { externalListingId: '9001', options: [{ salesProductOptionId: OPTION, externalOptionId: 'v-1' }] },
    ));
    await waitFor(() => expect(onResolved).toHaveBeenCalled());
  });

  it('등록상품ID 없이 확인을 누를 수 없다', () => {
    render(wrap(<RegistrationOperationResolution read={describeRegistrationOperation(operation({}))} />));
    expect((screen.getByRole('button', { name: '몰에서 확인' }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('"등록되지 않음"은 실행을 실패로 닫는다', async () => {
    render(wrap(<RegistrationOperationResolution read={describeRegistrationOperation(operation({}))} />));
    fireEvent.click(screen.getByRole('button', { name: '등록되지 않음' }));
    await waitFor(() => expect(apiClient.post).toHaveBeenCalledWith(
      `/api/channels/registration-operations/${OPERATION}/close`,
      { reason: '운영자가 몰에서 확인: 등록되지 않음' },
    ));
  });

  it('서버 거절은 presenter 문장으로 보여 준다(원문 코드 금지)', async () => {
    vi.mocked(apiClient.post).mockRejectedValue(Object.assign(new Error('OPERATION_FENCE_LOST'), { name: 'Error' }));
    render(wrap(<RegistrationOperationResolution read={describeRegistrationOperation(operation({}))} />));
    fireEvent.change(screen.getByLabelText('등록상품ID'), { target: { value: '9001' } });
    fireEvent.click(screen.getByRole('button', { name: '몰에서 확인' }));
    const alert = await screen.findByRole('alert');
    expect(alert.textContent).not.toContain('OPERATION_FENCE_LOST');
  });

  it('묶음 품절·재개는 등록상품ID를 묻지 않고 "반영되지 않음"으로만 닫는다', async () => {
    render(wrap(<RegistrationOperationResolution read={describeRegistrationOperation(operation({ plan: { executionKind: 'sold_out' } }))} />));
    expect(screen.queryByLabelText('등록상품ID')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: '반영되지 않음' }));
    await waitFor(() => expect(apiClient.post).toHaveBeenCalledWith(
      `/api/channels/registration-operations/${OPERATION}/close`,
      { reason: '운영자가 몰에서 확인: 반영되지 않음' },
    ));
  });

  it('기존 몰 상품 수정(가격·썸네일)은 그 상품번호를 채워 두고 확인한다', () => {
    render(wrap(<RegistrationOperationResolution read={describeRegistrationOperation(operation({
      plan: { executionKind: 'update', externalListingId: 'MALL-9' }, result: null,
    }))} />));
    expect((screen.getByLabelText('등록상품ID') as HTMLInputElement).value).toBe('MALL-9');
  });

  it('확인 필요가 아닌 실행은 상태만 보이고 입력을 열지 않는다', () => {
    render(wrap(<RegistrationOperationResolution read={describeRegistrationOperation(operation({ status: 'executing', result: null }))} />));
    expect(screen.getByText('진행 중')).toBeTruthy();
    expect(screen.queryByLabelText('등록상품ID')).toBeNull();
  });
});
