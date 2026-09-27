import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { executeTargetRegistration } from '@/app/(channels)/_shared/target-registration-execution';
import {
  describeRegistrationOperation,
  readRegistrationOperation,
  startRegistrationOperation,
} from '@/app/(channels)/_shared/registration-operation';
import type { OperationView } from '@kiditem/shared/operation';
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
}));

// 등록 실행 시작·읽기(확장·서버 경계)만 가짜다. 상태 풀이·키는 진짜.
vi.mock('@/app/(channels)/_shared/registration-operation', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/app/(channels)/_shared/registration-operation')>()),
  readRegistrationOperation: vi.fn(),
  startRegistrationOperation: vi.fn(),
}));

const PRODUCT_ID = '11111111-1111-4111-8111-111111111111';
const ACCOUNT_ID = '22222222-2222-4222-8222-222222222222';
const OPTION_ONE = '33333333-3333-4333-8333-333333333333';
const OPTION_TWO = '44444444-4444-4444-8444-444444444444';
const TARGET_ID = '55555555-5555-4555-8555-555555555555';
const LISTING_ID = '66666666-6666-4666-8666-666666666666';
const LISTING_OPTION_ID = '77777777-7777-4777-8777-777777777777';
const EXECUTION_ID = '88888888-8888-4888-8888-888888888888';

function liveOperation(patch: Partial<OperationView> = {}) {
  return describeRegistrationOperation({
    id: EXECUTION_ID, kind: 'channels.registration', status: 'reconciling', lockKeys: [],
    plan: { executionKind: 'register', payload: { snapshot: { product: { options: [{ id: OPTION_ONE, optionCode: '100-0001', values: ['파랑'] }] } } } },
    progress: null, result: null, window: null, errorCode: null, errorMessage: null,
    startedAt: '2026-09-22T01:02:03.000Z', finishedAt: null, expiresAt: '2026-09-22T01:32:03.000Z',
    attempts: 1, maxAttempts: 1, scheduledFor: null, ...patch,
  });
}

const product = {
  id: PRODUCT_ID,
  name: '동물 블록',
  imageUrls: [],
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
    listingState: null,
    listingRawStatus: null,
    listingActive: false,
    state: 'unregistered',
    soldOut: false,
    changedSinceRegistration: false,
    selectedThumbnailAssetId: null,
    selectedDetailPageRevisionId: null,
    lastExecution: null,
    ...overrides,
  };
}

let lastQueryClient: QueryClient;

function serveRegistrationState(...accounts: ReturnType<typeof accountState>[]) {
  vi.mocked(salesProductApi.registrationState).mockResolvedValue({ accounts } as never);
}

function renderSection(value: SalesProduct = product, openAdvanced = false) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  lastQueryClient = queryClient;
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
    // 변경됨은 실제 재전송(KID-323)이 생길 때까지 보이지 않는다.
    expect(screen.queryByText(/변경됨/)).not.toBeInTheDocument();
    // 상태는 배지가 말한다 — 마지막 실행 줄은 그 실행의 시각만 적고 상태 말을 새로 짓지 않는다.
    expect(screen.getAllByText(/^마지막 실행 /).length).toBeGreaterThan(0);
    expect(screen.queryByText(/등록 결과 확인됨/)).not.toBeInTheDocument();
    // 재전송이 아직 없으니(KID-323) 몰에 올라간 상품으로 보내는 고리도 없다.
    expect(screen.queryByRole('link', { name: /다시 보내기|몰에 올라간 상품/ })).not.toBeInTheDocument();
    expect(readRegistrationOperation).not.toHaveBeenCalled();
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
      operation: liveOperation(),
      outcome: { ok: false, confirmed: false, manualSteps: [], warnings: [] },
      started: true,
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
    expect(first).toMatchObject({ target, mallKey: 'smartstore', item: { candidateId: PRODUCT_ID, source: 'sales_product' } });
  });

  it('⭐ reads the live operation the reader names, never sends again, and opens the 등록상품ID confirmation for 확인 필요', async () => {
    vi.mocked(registrationTargetApi.list).mockResolvedValue([target]);
    vi.mocked(salesProductApi.mallAccounts).mockResolvedValue([{
      channelAccountId: ACCOUNT_ID,
      mallKey: 'smartstore',
      mallName: '스마트스토어 본계정',
    }]);
    serveRegistrationState(accountState({
      state: 'confirming',
      lastExecution: {
        id: EXECUTION_ID, kind: 'register', status: 'reconciling', providerOutcome: 'uncertain',
        createdAt: '2026-09-22T01:02:03.000Z', completedAt: null,
      },
    }));
    vi.mocked(readRegistrationOperation).mockResolvedValue(liveOperation());

    renderSection(product, true);
    await waitFor(() => expect(readRegistrationOperation).toHaveBeenCalledWith(EXECUTION_ID));
    expect(await screen.findByLabelText('등록상품ID')).toBeInTheDocument();
    expect(screen.getAllByText(/^마지막 실행 /).length).toBeGreaterThan(0);
    const button = screen.getByRole('button', { name: '확인 필요' });
    expect(button).toBeDisabled();
    expect(executeTargetRegistration).not.toHaveBeenCalled();
  });

  it('re-reads the live operation when the reader reports a new status', async () => {
    vi.mocked(registrationTargetApi.list).mockResolvedValue([target]);
    vi.mocked(salesProductApi.mallAccounts).mockResolvedValue([{
      channelAccountId: ACCOUNT_ID, mallKey: 'smartstore', mallName: '스마트스토어 본계정',
    }]);
    const live = (status: string) => accountState({
      state: status === 'reconciling' ? 'confirming' : 'submitting',
      lastExecution: {
        id: EXECUTION_ID, kind: 'register', status, providerOutcome: 'uncertain',
        createdAt: '2026-09-22T01:02:03.000Z', completedAt: null,
      },
    });
    serveRegistrationState(live('executing'));
    vi.mocked(readRegistrationOperation).mockResolvedValue(liveOperation({ status: 'executing' }));

    renderSection(product, true);
    await waitFor(() => expect(readRegistrationOperation).toHaveBeenCalledTimes(1));

    serveRegistrationState(live('reconciling'));
    await lastQueryClient.invalidateQueries({ queryKey: ['sales-products', 'registration-state', PRODUCT_ID] });

    await waitFor(() => expect(readRegistrationOperation).toHaveBeenCalledTimes(2));
  });

  it('re-reads the registration state after the simple and the advanced saves — both can flip 변경됨', async () => {
    vi.mocked(registrationTargetApi.list).mockResolvedValue([target]);
    vi.mocked(registrationTargetApi.resolve).mockResolvedValue(target);
    vi.mocked(registrationTargetApi.update).mockResolvedValue(target);
    vi.mocked(salesProductApi.mallAccounts).mockResolvedValue([{
      channelAccountId: ACCOUNT_ID, mallKey: 'smartstore', mallName: '스마트스토어 본계정',
    }]);
    renderSection();
    const invalidate = vi.spyOn(lastQueryClient, 'invalidateQueries');
    const stateKey = { queryKey: ['sales-products', 'registration-state', PRODUCT_ID] };

    fireEvent.change(await screen.findByLabelText('스마트스토어 본계정 몰 카테고리'), { target: { value: '완구>블록' } });
    fireEvent.click(screen.getByRole('button', { name: '저장' }));
    await waitFor(() => expect(invalidate).toHaveBeenCalledWith(stateKey));

    invalidate.mockClear();
    fireEvent.click(screen.getByText('추가 등록 설정'));
    fireEvent.click(await screen.findByRole('button', { name: '1 / 2' }));
    fireEvent.click(screen.getByRole('checkbox', { name: '100-0002 외부 송신 선택' }));
    fireEvent.click(screen.getByRole('button', { name: '등록 대상 저장' }));
    await waitFor(() => expect(invalidate).toHaveBeenCalledWith(stateKey));
  });

  it('starts an explicit composition transition as a registration operation without building a mall form', async () => {
    vi.mocked(registrationTargetApi.list).mockResolvedValue([target]);
    vi.mocked(salesProductApi.mallAccounts).mockResolvedValue([{
      channelAccountId: ACCOUNT_ID,
      mallKey: 'smartstore',
      mallName: '스마트스토어 본계정',
    }]);
    vi.mocked(startRegistrationOperation).mockResolvedValue({ operationId: EXECUTION_ID, reused: false });

    renderSection(compositionProduct, true);
    await waitFor(() => expect(screen.getByLabelText('구성 변경 대상 쇼핑몰 상품')).toBeInTheDocument());
    fireEvent.change(screen.getByLabelText('구성 변경 대상 쇼핑몰 상품'), { target: { value: LISTING_ID } });
    fireEvent.change(screen.getByLabelText('기존 몰 옵션 MALL-OPTION-1 새 판매상품 옵션'), { target: { value: OPTION_ONE } });
    fireEvent.click(screen.getByRole('button', { name: '구성 변경 실행' }));

    await waitFor(() => expect(startRegistrationOperation).toHaveBeenCalledTimes(1));
    expect(startRegistrationOperation).toHaveBeenCalledWith({
      mallKey: 'smartstore',
      idempotencyKey: expect.any(String),
      scope: {
        executionKind: 'composition_change',
        registrationTargetId: TARGET_ID,
        expectedVersion: 2,
        channelListingId: LISTING_ID,
        applyCompositionTemplate: false,
        submit: false,
        optionTransitions: [{ channelListingOptionId: LISTING_OPTION_ID, salesProductOptionId: OPTION_ONE }],
      },
    });
    expect(executeTargetRegistration).not.toHaveBeenCalled();
    expect(await screen.findByText(/자동 재고 처리를 보류합니다/)).toBeInTheDocument();
  });

  it('keeps one composition intent when the operator clicks repeatedly', async () => {
    let resolveStart!: (value: { operationId: string; reused: boolean }) => void;
    const pending = new Promise<{ operationId: string; reused: boolean }>((resolve) => { resolveStart = resolve; });
    vi.mocked(registrationTargetApi.list).mockResolvedValue([target]);
    vi.mocked(salesProductApi.mallAccounts).mockResolvedValue([{
      channelAccountId: ACCOUNT_ID,
      mallKey: 'smartstore',
      mallName: '스마트스토어 본계정',
    }]);
    vi.mocked(startRegistrationOperation).mockReturnValue(pending);

    renderSection(compositionProduct, true);
    await waitFor(() => expect(screen.getByLabelText('구성 변경 대상 쇼핑몰 상품')).toBeInTheDocument());
    fireEvent.change(screen.getByLabelText('구성 변경 대상 쇼핑몰 상품'), { target: { value: LISTING_ID } });
    fireEvent.change(screen.getByLabelText('기존 몰 옵션 MALL-OPTION-1 새 판매상품 옵션'), { target: { value: OPTION_ONE } });
    const submit = screen.getByRole('button', { name: '구성 변경 실행' });
    fireEvent.click(submit);
    fireEvent.click(submit);

    await waitFor(() => expect(startRegistrationOperation).toHaveBeenCalledTimes(1));
    resolveStart({ operationId: EXECUTION_ID, reused: false });
    await waitFor(() => expect(screen.getByRole('button', { name: '구성 변경 실행 기록됨' })).toBeInTheDocument());
    expect(startRegistrationOperation).toHaveBeenCalledTimes(1);
  });

  it('shows a start refusal and never builds a mall form', async () => {
    vi.mocked(registrationTargetApi.list).mockResolvedValue([target]);
    vi.mocked(salesProductApi.mallAccounts).mockResolvedValue([{
      channelAccountId: ACCOUNT_ID,
      mallKey: 'smartstore',
      mallName: '스마트스토어 본계정',
    }]);
    vi.mocked(startRegistrationOperation).mockRejectedValue(new Error('구성 변경 실행이 거절됐습니다.'));

    renderSection(compositionProduct, true);
    await waitFor(() => expect(screen.getByLabelText('구성 변경 대상 쇼핑몰 상품')).toBeInTheDocument());
    fireEvent.change(screen.getByLabelText('구성 변경 대상 쇼핑몰 상품'), { target: { value: LISTING_ID } });
    fireEvent.change(screen.getByLabelText('기존 몰 옵션 MALL-OPTION-1 새 판매상품 옵션'), { target: { value: OPTION_ONE } });
    fireEvent.click(screen.getByRole('button', { name: '구성 변경 실행' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('구성 변경 실행이 거절됐습니다.');
    expect(executeTargetRegistration).not.toHaveBeenCalled();
  });
});
