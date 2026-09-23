import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { executeTargetRegistration } from '@/app/(channels)/_shared/target-registration-execution';
import {
  listRegistrationTargetExecutions,
  targetRegistrationExecutionApi,
} from '@/app/(channels)/_shared/registration-execution-api';
import { salesProductApi } from '@/lib/sales-product-api';
import { registrationTargetApi } from '@/lib/registration-target-api';
import { ChannelOverridesSection } from './ChannelOverridesSection';
import type { RegistrationTarget, SalesProduct } from '@kiditem/shared/sales-product';

vi.mock('@/lib/registration-target-api', () => ({
  registrationTargetKeys: {
    list: (salesProductId: string) => ['registration-targets', 'list', salesProductId],
  },
  registrationTargetApi: {
    list: vi.fn(),
    resolve: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
  },
}));

vi.mock('@/lib/sales-product-api', () => ({
  salesProductKeys: {
    mallAccounts: () => ['sales-products', 'mall-accounts'],
    registrationState: (id: string) => ['sales-products', 'registration-state', id],
  },
  salesProductApi: { mallAccounts: vi.fn(), registrationState: vi.fn() },
}));

vi.mock('@/app/(channels)/_shared/target-registration-execution', () => ({
  executeTargetRegistration: vi.fn(),
  isActiveTargetExecution: (execution: { status: string }) => ['prepared', 'executing', 'reconciling'].includes(execution.status),
}));

vi.mock('@/app/(channels)/_shared/registration-execution-api', () => ({
  listRegistrationTargetExecutions: vi.fn(),
  targetRegistrationExecutionApi: { prepare: vi.fn(), start: vi.fn(), report: vi.fn(), get: vi.fn() },
  registrationExecutionKeys: {
    targetHistory: (targetId: string) => ['registration-target-executions', 'history', targetId],
    execution: (executionId: string) => ['registration-executions', 'detail', executionId],
  },
}));

const PRODUCT_ID = '11111111-1111-4111-8111-111111111111';
const ACCOUNT_ID = '22222222-2222-4222-8222-222222222222';
const OPTION_ONE = '33333333-3333-4333-8333-333333333333';
const OPTION_TWO = '44444444-4444-4444-8444-444444444444';
const TARGET_ID = '55555555-5555-4555-8555-555555555555';
const LISTING_ID = '66666666-6666-4666-8666-666666666666';
const LISTING_OPTION_ID = '77777777-7777-4777-8777-777777777777';
const EXECUTION_ID = '88888888-8888-4888-8888-888888888888';

const product = {
  id: PRODUCT_ID,
  name: '동물 블록',
  options: [
    { id: OPTION_ONE, optionCode: '100-0001', values: ['파랑'], salePrice: 5900, normalPrice: 9000, supplyStatus: 'selling' },
    { id: OPTION_TWO, optionCode: '100-0002', values: ['노랑'], salePrice: 6200, normalPrice: null, supplyStatus: 'selling' },
  ],
  channelListings: [],
} as unknown as SalesProduct;

const target = {
  id: TARGET_ID,
  salesProductId: PRODUCT_ID,
  channelAccountId: ACCOUNT_ID,
  version: 2,
  registrationInput: { mallCategory: null, mallFields: {}, adapter: { coupang: { wingCategoryKey: 'toy' } } },
  selectedThumbnailAssetId: null,
  selectedDetailPageRevisionId: null,
  selectedOptions: [{ salesProductOptionId: OPTION_ONE }],
  resolved: {
    name: '동물 블록',
    options: [{ salesProductOptionId: OPTION_ONE, code: '100-0001', values: ['파랑'], salePrice: 5900, normalPrice: 9000 }],
  },
} satisfies RegistrationTarget;

const compositionProduct = {
  ...product,
  channelListings: [{
    id: LISTING_ID,
    channelAccountId: ACCOUNT_ID,
    mallKey: 'smartstore',
    mallName: '스마트스토어 본계정',
    externalId: 'MALL-100',
    displayName: '동물 블록 기존 상품',
    status: '판매중',
    isActive: true,
    options: [{
      id: LISTING_OPTION_ID,
      externalOptionId: 'MALL-OPTION-1',
      itemName: '기존 파랑',
      salePrice: 5900,
      salesProductOptionId: null,
    }],
  }],
} as unknown as SalesProduct;

/** 등록 상태 reader 가 주는 계정 한 줄(KID-320). */
function accountState(overrides: Record<string, unknown> = {}) {
  return {
    channelAccountId: ACCOUNT_ID,
    channel: 'smartstore',
    channelAccountName: '스마트스토어 본계정',
    registrationTargetId: TARGET_ID,
    channelListingId: null,
    externalListingId: null,
    state: 'unregistered',
    soldOut: false,
    changedSinceRegistration: false,
    selectedThumbnailAssetId: null,
    selectedDetailPageRevisionId: null,
    lastExecution: null,
    ...overrides,
  };
}

function serveRegistrationState(...accounts: ReturnType<typeof accountState>[]) {
  vi.mocked(salesProductApi.registrationState).mockResolvedValue({ accounts } as never);
}

function renderSection(value: SalesProduct = product, openAdvanced = false) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const rendered = render(
    <QueryClientProvider client={queryClient}>
      <ChannelOverridesSection product={value} />
    </QueryClientProvider>,
  );
  if (openAdvanced) fireEvent.click(screen.getByText('추가 등록 설정'));
  return rendered;
}

describe('<ChannelOverridesSection />', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    serveRegistrationState();
  });

  it('shows each mall account\'s state from the one reader and reads no execution history', async () => {
    vi.mocked(registrationTargetApi.list).mockResolvedValue([target]);
    vi.mocked(salesProductApi.mallAccounts).mockResolvedValue([{
      channelAccountId: ACCOUNT_ID, mallKey: 'smartstore', mallName: '스마트스토어 본계정',
    }]);
    serveRegistrationState(accountState({
      state: 'registered',
      changedSinceRegistration: true,
      lastExecution: {
        id: EXECUTION_ID, kind: 'register', status: 'succeeded', providerOutcome: 'succeeded',
        createdAt: '2026-09-22T01:02:03.000Z', completedAt: '2026-09-22T01:05:00.000Z',
      },
    }));

    renderSection(product, true);

    expect((await screen.findAllByText('등록됨')).length).toBeGreaterThan(0);
    expect(screen.getAllByText('변경됨 · 재전송 필요').length).toBeGreaterThan(0);
    expect(screen.getAllByText(/등록 · 등록 결과 확인됨/).length).toBeGreaterThan(0);
    expect(screen.getAllByRole('link', { name: '몰에 올라간 상품에서 다시 보내기' })[0]).toHaveAttribute('href', '#listings');
    expect(listRegistrationTargetExecutions).not.toHaveBeenCalled();
    expect(targetRegistrationExecutionApi.get).not.toHaveBeenCalled();
  });

  it('does not offer a second register send for an account the reader says is registered', async () => {
    vi.mocked(registrationTargetApi.list).mockResolvedValue([target]);
    vi.mocked(salesProductApi.mallAccounts).mockResolvedValue([{
      channelAccountId: ACCOUNT_ID, mallKey: 'smartstore', mallName: '스마트스토어 본계정',
    }]);
    serveRegistrationState(accountState({ state: 'registered' }));

    renderSection(product, true);

    await waitFor(() => expect(screen.getByRole('button', { name: '등록됨' })).toBeDisabled());
    expect(screen.queryByRole('button', { name: '외부 송신' })).toBeNull();
  });

  it('edits the other mall values with fields and key/value rows instead of a JSON document', async () => {
    const configured = {
      ...target,
      registrationInput: {
        mallCategory: { key: '001', label: null },
        mallFields: { supplyPrice: '4700', deliveryTemplate: 'T1' },
        adapter: { coupang: { wingCategoryKey: 'toy' } },
      },
    } satisfies RegistrationTarget;
    vi.mocked(registrationTargetApi.list).mockResolvedValue([configured]);
    vi.mocked(salesProductApi.mallAccounts).mockResolvedValue([{
      channelAccountId: ACCOUNT_ID, mallKey: 'coupang', mallName: '쿠팡 본계정',
    }]);
    vi.mocked(registrationTargetApi.update).mockResolvedValue(configured);

    renderSection(product, true);
    await waitFor(() => expect(screen.getAllByText('쿠팡 본계정')[0]).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: '1 / 2' }));

    expect(screen.queryByLabelText('provider document')).toBeNull();
    expect(screen.getByLabelText('몰 공급가')).toHaveValue('4700');
    expect(screen.getByLabelText('몰 칸 1 이름')).toHaveValue('deliveryTemplate');
    fireEvent.change(screen.getByLabelText('몰 홍보문'), { target: { value: '오늘 출발' } });
    fireEvent.change(screen.getByLabelText('몰 재고 비율'), { target: { value: '80' } });
    fireEvent.click(screen.getByRole('button', { name: '몰 칸 더하기' }));
    fireEvent.change(screen.getByLabelText('몰 칸 2 이름'), { target: { value: 'returnCode' } });
    fireEvent.change(screen.getByLabelText('몰 칸 2 값'), { target: { value: 'R1' } });
    fireEvent.click(screen.getByRole('button', { name: '등록 대상 저장' }));

    await waitFor(() => expect(registrationTargetApi.update).toHaveBeenCalledWith(TARGET_ID, expect.objectContaining({
      registrationInput: {
        mallCategory: { key: '001', label: null },
        mallFields: { supplyPrice: '4700', promoText: '오늘 출발', stockPercent: 80, deliveryTemplate: 'T1', returnCode: 'R1' },
        adapter: { coupang: { wingCategoryKey: 'toy' } },
      },
    })));
  });

  it('blocks saving a product fact typed as a mall value', async () => {
    vi.mocked(registrationTargetApi.list).mockResolvedValue([target]);
    vi.mocked(salesProductApi.mallAccounts).mockResolvedValue([{
      channelAccountId: ACCOUNT_ID, mallKey: 'coupang', mallName: '쿠팡 본계정',
    }]);

    renderSection(product, true);
    await waitFor(() => expect(screen.getAllByText('쿠팡 본계정')[0]).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: '1 / 2' }));
    fireEvent.click(screen.getByRole('button', { name: '몰 칸 더하기' }));
    fireEvent.change(screen.getByLabelText('몰 칸 1 이름'), { target: { value: 'salePrice' } });
    fireEvent.change(screen.getByLabelText('몰 칸 1 값'), { target: { value: '1000' } });

    expect(screen.getByText(/판매상품에서 고치세요/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '등록 대상 저장' })).toBeDisabled();
  });

  it('keeps common values usable without creating a target or showing technical settings', async () => {
    vi.mocked(registrationTargetApi.list).mockResolvedValue([]);
    vi.mocked(salesProductApi.mallAccounts).mockResolvedValue([{
      channelAccountId: ACCOUNT_ID, mallKey: 'smartstore', mallName: '스마트스토어 본계정',
    }]);
    renderSection();

    expect(await screen.findByLabelText('스마트스토어 본계정 몰 카테고리')).toBeEnabled();
    // 판매가는 판매상품 값을 보여 줄 뿐 몰마다 고치지 않는다(KID-313 W2).
    expect(screen.getByLabelText('스마트스토어 본계정 판매가')).toHaveTextContent('옵션별 판매가');
    expect(screen.queryByLabelText('스마트스토어 본계정 몰 상품명')).toBeNull();
    expect(screen.getByRole('button', { name: '저장' })).toBeDisabled();
    expect(screen.queryByText(/몰 전용 값 \(JSON|등록 대상 추가|버전/)).toBeNull();
    expect(registrationTargetApi.resolve).not.toHaveBeenCalled();
    expect(registrationTargetApi.update).not.toHaveBeenCalled();
  });

  it('resolves the target only after an edit and keeps its other mall values, options and content ids', async () => {
    const configured = {
      ...target,
      registrationInput: { mallCategory: null, mallFields: { returnFee: '3000' }, adapter: { coupang: { keep: true } } },
      selectedDetailPageRevisionId: '99999999-9999-4999-8999-999999999999',
    } satisfies RegistrationTarget;
    vi.mocked(registrationTargetApi.list).mockResolvedValue([configured]);
    vi.mocked(registrationTargetApi.resolve).mockResolvedValue(configured);
    vi.mocked(registrationTargetApi.update).mockResolvedValue(configured);
    vi.mocked(salesProductApi.mallAccounts).mockResolvedValue([{
      channelAccountId: ACCOUNT_ID, mallKey: 'smartstore', mallName: '스마트스토어 본계정',
    }]);
    renderSection();

    const category = await screen.findByLabelText('스마트스토어 본계정 몰 카테고리');
    fireEvent.change(category, { target: { value: '완구>블록' } });
    fireEvent.click(screen.getByRole('button', { name: '저장' }));

    // resolve 요청에는 targetId 가 없다 — 상품 × 몰계정당 활성 설정은 늘 하나라 고를 것이 없다(ADR-0022).
    await waitFor(() => expect(registrationTargetApi.resolve).toHaveBeenCalledWith({
      salesProductId: PRODUCT_ID, channelAccountId: ACCOUNT_ID,
    }));
    await waitFor(() => expect(registrationTargetApi.update).toHaveBeenCalledWith(TARGET_ID, expect.objectContaining({
      expectedVersion: 2,
      registrationInput: { ...configured.registrationInput, mallCategory: { key: '완구>블록', label: null } },
      selectedDetailPageRevisionId: configured.selectedDetailPageRevisionId,
      selectedOptions: configured.selectedOptions,
    })));
  });

  it('never renders a registration-setting picker — a product × mall account always has at most one', async () => {
    vi.mocked(registrationTargetApi.list).mockResolvedValue([target]);
    vi.mocked(salesProductApi.mallAccounts).mockResolvedValue([{
      channelAccountId: ACCOUNT_ID, mallKey: 'smartstore', mallName: '스마트스토어 본계정',
    }]);
    renderSection();

    expect(await screen.findByLabelText('스마트스토어 본계정 몰 카테고리')).toBeEnabled();
    expect(screen.queryByRole('combobox', { name: /등록 설정/ })).not.toBeInTheDocument();
  });

  it('edits a persistent target\'s mall values and option selection without any price input', async () => {
    vi.mocked(registrationTargetApi.list).mockResolvedValue([target]);
    vi.mocked(salesProductApi.mallAccounts).mockResolvedValue([{
      channelAccountId: ACCOUNT_ID,
      mallKey: 'coupang',
      mallName: '쿠팡 본계정',
    }]);
    vi.mocked(registrationTargetApi.update).mockResolvedValue(target);

    renderSection(product, true);

    await waitFor(() => expect(screen.getAllByText('쿠팡 본계정')[0]).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: '1 / 2' }));

    expect(screen.queryByLabelText('100-0001 판매가 override')).toBeNull();
    expect(screen.getByText('판매가 5,900원 · 정상가 9,000원')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('checkbox', { name: '100-0002 외부 송신 선택' }));
    fireEvent.click(screen.getByRole('button', { name: '등록 대상 저장' }));

    await waitFor(() => expect(registrationTargetApi.update).toHaveBeenCalledWith(TARGET_ID, expect.objectContaining({
      expectedVersion: 2,
      registrationInput: target.registrationInput,
      selectedOptions: [{ salesProductOptionId: OPTION_ONE }, { salesProductOptionId: OPTION_TWO }],
    })));
  });

  it('reuses the target intent key while the saved target version is unchanged', async () => {
    vi.mocked(registrationTargetApi.list).mockResolvedValue([target]);
    vi.mocked(salesProductApi.mallAccounts).mockResolvedValue([{
      channelAccountId: ACCOUNT_ID,
      mallKey: 'smartstore',
      mallName: '스마트스토어 본계정',
    }]);
    vi.mocked(executeTargetRegistration).mockResolvedValue({
      execution: { status: 'reconciling' } as never,
      outcome: { ok: true, confirmed: false, manualSteps: [], warnings: [] },
      adapterCalled: true,
    });

    renderSection(product, true);
    await waitFor(() => expect(screen.getByRole('button', { name: '외부 송신' })).toBeEnabled());
    const send = screen.getByRole('button', { name: '외부 송신' });
    fireEvent.click(send);
    await waitFor(() => expect(executeTargetRegistration).toHaveBeenCalledTimes(1));
    fireEvent.click(send);
    await waitFor(() => expect(executeTargetRegistration).toHaveBeenCalledTimes(2));

    const first = vi.mocked(executeTargetRegistration).mock.calls[0]?.[0];
    const second = vi.mocked(executeTargetRegistration).mock.calls[1]?.[0];
    expect(first?.idempotencyKey).toBeTruthy();
    expect(second?.idempotencyKey).toBe(first?.idempotencyKey);
  });

  it('reads the live execution the reader names and resumes it without creating a new intent', async () => {
    const activeExecution = {
      executionId: '66666666-6666-4666-8666-666666666666',
      targetId: TARGET_ID,
      channelAccountId: ACCOUNT_ID,
      status: 'reconciling',
      providerOutcome: 'uncertain',
      payloadHash: 'history-hash',
      payload: {
        targetId: TARGET_ID,
        targetVersion: 2,
        channelAccountId: ACCOUNT_ID,
        kind: 'register',
        channelListingId: null,
        applyCompositionTemplate: false,
        product: {
          id: PRODUCT_ID,
          name: '동물 블록',
          options: [{ id: OPTION_ONE, optionCode: '100-0001', values: ['파랑'] }],
        },
        detailPage: null,
        registrationInput: {},
      },
      leaseToken: '77777777-7777-4777-8777-777777777777',
      maySubmit: false,
      externalListingId: null,
      result: null,
      createdAt: '2026-09-22T01:02:03.000Z',
    } as never;
    vi.mocked(registrationTargetApi.list).mockResolvedValue([target]);
    vi.mocked(salesProductApi.mallAccounts).mockResolvedValue([{
      channelAccountId: ACCOUNT_ID,
      mallKey: 'smartstore',
      mallName: '스마트스토어 본계정',
    }]);
    serveRegistrationState(accountState({
      state: 'confirming',
      lastExecution: {
        id: '66666666-6666-4666-8666-666666666666', kind: 'register', status: 'reconciling', providerOutcome: 'uncertain',
        createdAt: '2026-09-22T01:02:03.000Z', completedAt: null,
      },
    }));
    vi.mocked(targetRegistrationExecutionApi.get).mockResolvedValue(activeExecution);
    vi.mocked(executeTargetRegistration).mockResolvedValue({
      execution: activeExecution,
      outcome: { ok: false, confirmed: false, manualSteps: [], warnings: ['재조정 대기'] },
      adapterCalled: false,
    });
    vi.mocked(targetRegistrationExecutionApi.report).mockResolvedValue(activeExecution);

    renderSection(product, true);
    await waitFor(() => expect(screen.getByRole('button', { name: '상태 확인' })).toBeEnabled());
    expect(screen.getAllByText('확인 대기').length).toBeGreaterThan(0);
    expect(screen.getAllByText(/등록 · 결과 확인 중 · 재송신하지 않음/).length).toBeGreaterThan(0);
    expect(targetRegistrationExecutionApi.get).toHaveBeenCalledWith('66666666-6666-4666-8666-666666666666');
    expect(listRegistrationTargetExecutions).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: '상태 확인' }));

    await waitFor(() => expect(executeTargetRegistration).toHaveBeenCalledWith(expect.objectContaining({
      existingExecution: activeExecution,
    })));
  });

  it('records an explicit composition transition without calling the registration adapter', async () => {
    vi.mocked(registrationTargetApi.list).mockResolvedValue([target]);
    vi.mocked(salesProductApi.mallAccounts).mockResolvedValue([{
      channelAccountId: ACCOUNT_ID,
      mallKey: 'smartstore',
      mallName: '스마트스토어 본계정',
    }]);
    vi.mocked(targetRegistrationExecutionApi.prepare).mockResolvedValue({ executionId: EXECUTION_ID } as never);
    vi.mocked(targetRegistrationExecutionApi.start).mockResolvedValue({
      executionId: EXECUTION_ID,
      status: 'executing',
    } as never);

    renderSection(compositionProduct, true);
    await waitFor(() => expect(screen.getByLabelText('구성 변경 대상 쇼핑몰 상품')).toBeInTheDocument());
    fireEvent.change(screen.getByLabelText('구성 변경 대상 쇼핑몰 상품'), { target: { value: LISTING_ID } });
    fireEvent.change(screen.getByLabelText('기존 몰 옵션 MALL-OPTION-1 새 판매상품 옵션'), { target: { value: OPTION_ONE } });
    fireEvent.click(screen.getByRole('button', { name: '구성 변경 실행' }));

    await waitFor(() => expect(targetRegistrationExecutionApi.prepare).toHaveBeenCalledTimes(1));
    expect(targetRegistrationExecutionApi.prepare).toHaveBeenCalledWith(TARGET_ID, expect.objectContaining({
      expectedVersion: 2,
      kind: 'composition_change',
      channelListingId: LISTING_ID,
      applyCompositionTemplate: false,
      optionTransitions: [{
        channelListingOptionId: LISTING_OPTION_ID,
        salesProductOptionId: OPTION_ONE,
      }],
      idempotencyKey: expect.any(String),
    }));
    expect(targetRegistrationExecutionApi.start).toHaveBeenCalledWith(EXECUTION_ID);
    expect(executeTargetRegistration).not.toHaveBeenCalled();
    expect(screen.getByText(/자동 재고 처리를 보류합니다/)).toBeInTheDocument();
  });

  it('keeps one composition intent when the operator clicks repeatedly', async () => {
    let resolvePrepare!: (value: unknown) => void;
    const pendingPrepare = new Promise<unknown>((resolve) => { resolvePrepare = resolve; });
    vi.mocked(registrationTargetApi.list).mockResolvedValue([target]);
    vi.mocked(salesProductApi.mallAccounts).mockResolvedValue([{
      channelAccountId: ACCOUNT_ID,
      mallKey: 'smartstore',
      mallName: '스마트스토어 본계정',
    }]);
    vi.mocked(targetRegistrationExecutionApi.prepare).mockReturnValue(pendingPrepare as never);
    vi.mocked(targetRegistrationExecutionApi.start).mockResolvedValue({ executionId: EXECUTION_ID, status: 'executing' } as never);

    renderSection(compositionProduct, true);
    await waitFor(() => expect(screen.getByLabelText('구성 변경 대상 쇼핑몰 상품')).toBeInTheDocument());
    fireEvent.change(screen.getByLabelText('구성 변경 대상 쇼핑몰 상품'), { target: { value: LISTING_ID } });
    fireEvent.change(screen.getByLabelText('기존 몰 옵션 MALL-OPTION-1 새 판매상품 옵션'), { target: { value: OPTION_ONE } });
    const submit = screen.getByRole('button', { name: '구성 변경 실행' });
    fireEvent.click(submit);
    fireEvent.click(submit);

    await waitFor(() => expect(targetRegistrationExecutionApi.prepare).toHaveBeenCalledTimes(1));
    resolvePrepare({ executionId: EXECUTION_ID });
    await waitFor(() => expect(targetRegistrationExecutionApi.start).toHaveBeenCalledTimes(1));
  });

  it('starts the prepared composition execution the reader names without preparing or sending again', async () => {
    const prepared = {
      executionId: EXECUTION_ID,
      targetId: TARGET_ID,
      channelAccountId: ACCOUNT_ID,
      status: 'prepared',
      providerOutcome: 'not_attempted',
      payload: { kind: 'composition_change' },
    } as never;
    vi.mocked(registrationTargetApi.list).mockResolvedValue([target]);
    vi.mocked(salesProductApi.mallAccounts).mockResolvedValue([{
      channelAccountId: ACCOUNT_ID,
      mallKey: 'smartstore',
      mallName: '스마트스토어 본계정',
    }]);
    serveRegistrationState(accountState({
      state: 'preparing',
      lastExecution: {
        id: EXECUTION_ID, kind: 'composition_change', status: 'prepared', providerOutcome: 'not_attempted',
        createdAt: '2026-09-22T01:02:03.000Z', completedAt: null,
      },
    }));
    vi.mocked(targetRegistrationExecutionApi.get).mockResolvedValue(prepared);
    vi.mocked(targetRegistrationExecutionApi.start).mockResolvedValue({ executionId: EXECUTION_ID, status: 'executing' } as never);

    renderSection(compositionProduct, true);
    await waitFor(() => expect(screen.getByRole('button', { name: '준비된 구성 변경 시작' })).toBeEnabled());
    fireEvent.click(screen.getByRole('button', { name: '준비된 구성 변경 시작' }));

    await waitFor(() => expect(targetRegistrationExecutionApi.start).toHaveBeenCalledWith(EXECUTION_ID));
    expect(targetRegistrationExecutionApi.prepare).not.toHaveBeenCalled();
    expect(executeTargetRegistration).not.toHaveBeenCalled();
  });

  it('shows a prepare validation error and never starts or sends a provider request', async () => {
    vi.mocked(registrationTargetApi.list).mockResolvedValue([target]);
    vi.mocked(salesProductApi.mallAccounts).mockResolvedValue([{
      channelAccountId: ACCOUNT_ID,
      mallKey: 'smartstore',
      mallName: '스마트스토어 본계정',
    }]);
    vi.mocked(targetRegistrationExecutionApi.prepare).mockRejectedValue(new Error('구성 변경 실행이 거절됐습니다.'));

    renderSection(compositionProduct, true);
    await waitFor(() => expect(screen.getByLabelText('구성 변경 대상 쇼핑몰 상품')).toBeInTheDocument());
    fireEvent.change(screen.getByLabelText('구성 변경 대상 쇼핑몰 상품'), { target: { value: LISTING_ID } });
    fireEvent.change(screen.getByLabelText('기존 몰 옵션 MALL-OPTION-1 새 판매상품 옵션'), { target: { value: OPTION_ONE } });
    fireEvent.click(screen.getByRole('button', { name: '구성 변경 실행' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('구성 변경 실행이 거절됐습니다.');
    expect(targetRegistrationExecutionApi.start).not.toHaveBeenCalled();
    expect(executeTargetRegistration).not.toHaveBeenCalled();
  });

  it('surfaces a start error without calling the registration adapter', async () => {
    vi.mocked(registrationTargetApi.list).mockResolvedValue([target]);
    vi.mocked(salesProductApi.mallAccounts).mockResolvedValue([{
      channelAccountId: ACCOUNT_ID,
      mallKey: 'smartstore',
      mallName: '스마트스토어 본계정',
    }]);
    vi.mocked(targetRegistrationExecutionApi.prepare).mockResolvedValue({ executionId: EXECUTION_ID } as never);
    vi.mocked(targetRegistrationExecutionApi.start).mockRejectedValue(new Error('구성 변경 실행을 시작하지 못했습니다.'));

    renderSection(compositionProduct, true);
    await waitFor(() => expect(screen.getByLabelText('구성 변경 대상 쇼핑몰 상품')).toBeInTheDocument());
    fireEvent.change(screen.getByLabelText('구성 변경 대상 쇼핑몰 상품'), { target: { value: LISTING_ID } });
    fireEvent.change(screen.getByLabelText('기존 몰 옵션 MALL-OPTION-1 새 판매상품 옵션'), { target: { value: OPTION_ONE } });
    fireEvent.click(screen.getByRole('button', { name: '구성 변경 실행' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('구성 변경 실행을 시작하지 못했습니다.');
    expect(executeTargetRegistration).not.toHaveBeenCalled();
  });
});
