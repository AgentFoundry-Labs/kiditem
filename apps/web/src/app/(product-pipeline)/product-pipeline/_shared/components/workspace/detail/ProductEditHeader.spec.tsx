import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import ProductEditHeader from './ProductEditHeader';
import type { RegistrationAccountState } from '@kiditem/shared/sales-product';
import type { ProductBasics } from '@/app/(product-pipeline)/product-pipeline/collected-products/lib/sourcing-api';
import { queryKeys } from '@/lib/query-keys';
import { salesProductKeys } from '@/lib/sales-product-api';

const {
  resolveRegistrationTargetMock,
  listAccountsMock,
  toastSuccessMock,
} = vi.hoisted(() => ({
  resolveRegistrationTargetMock: vi.fn(),
  listAccountsMock: vi.fn(),
  toastSuccessMock: vi.fn(),
}));

// 네트워크만 막는다. 등록 상태 환산 같은 순수 함수는 진짜 것을 쓴다 — 가짜로 두면
// 화면이 무엇을 믿는지 테스트가 대신 정해 버린다.
vi.mock('@/lib/registration-target-api', () => ({
  registrationTargetApi: {
    resolve: (...args: unknown[]) => resolveRegistrationTargetMock(...args),
  },
  registrationTargetKeys: {
    all: ['registration-targets'] as const,
  },
}));

vi.mock('@/app/(product-pipeline)/product-pipeline/registered-products/lib/channel-listings-api', () => ({
  channelListingsApi: {
    listAccounts: (...args: unknown[]) => listAccountsMock(...args),
  },
}));

vi.mock('@/app/(product-pipeline)/product-pipeline/detail-template-generation/hooks/useKidsPlayfulGenerate', () => ({
  useKidsPlayfulInProgress: () => null,
}));

vi.mock('@/app/(product-pipeline)/product-pipeline/_shared/hooks/useGenerateDetailPage', () => ({
  useGenerateDetailPage: () => ({ mutate: vi.fn(), isPending: false }),
}));

vi.mock('../../../hooks/useKidsPlayfulFromSourcing', () => ({
  useKidsPlayfulFromSourcing: () => ({ trigger: vi.fn(), isPending: false }),
}));

vi.mock('@/app/(product-pipeline)/product-pipeline/_shared/components/detail-page/TemplateSelectionModal', () => ({
  default: () => null,
}));

vi.mock('sonner', () => ({
  toast: {
    success: (...args: unknown[]) => toastSuccessMock(...args),
    error: vi.fn(),
  },
}));

const basicInfo: ProductBasics = {
  name: '자석 다트게임',
  category: '완구',
  description: '실내 다트 놀이',
  target: '아동',
  ageGroup: '8세 이상',
  tags: ['다트'],
  keywords: ['자석 다트'],
  optionNames: ['기본'],
  kcCertificationStatus: '대상',
  kcCertificationNumber: 'CB123R456-7001',
  kcCertificationImageUrl: 'https://cdn.example.com/kc.png',
  productSize: '30cm',
  colorVariantStatus: '단일',
  colorVariantNames: '혼합',
  boxSetStatus: '단품',
  boxSetQuantity: '1',
  originalPrice: 23900,
  salePrice: 21900,
  discountRate: 8,
  rocketBundleQuantity: 1,
  rocketUnitCost: 9000,
  thumbnailUrls: ['https://cdn.example.com/source.png'],
  selectedThumbnailUrl: 'https://cdn.example.com/generated-thumb.png',
  selectedThumbnailGenerationId: '22222222-2222-4222-8222-222222222222',
  selectedThumbnailAssetId: '33333333-3333-4333-8333-333333333333',
  selectedDetailPageGenerationId: '44444444-4444-4444-8444-444444444444',
  selectedDetailPageArtifactId: '55555555-5555-4555-8555-555555555555',
  selectedDetailPageRevisionId: '66666666-6666-4666-8666-666666666666',
  mallRegisterValues: { '11st': { categoryPath: '문구>팬시' } },
  mallRegisterShared: { certNumber: 'CB123R456-7001' },
};

function renderWithQueryClient(ui: React.ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
  return {
    ...render(
    <QueryClientProvider client={queryClient}>
      {ui}
    </QueryClientProvider>,
    ),
    queryClient,
  };
}

const MAIN_ACCOUNT = '11111111-1111-4111-8111-111111111111';
const ROCKET_ACCOUNT = '22222222-2222-4222-8222-222222222222';

function account(
  channelAccountId: string,
  state: RegistrationAccountState['state'],
  overrides: Partial<RegistrationAccountState> = {},
): RegistrationAccountState {
  return {
    channelAccountId,
    channel: 'coupang',
    channelAccountName: channelAccountId === MAIN_ACCOUNT ? '쿠팡 본계정' : '쿠팡 로켓 계정',
    registrationTargetId: '77777777-7777-4777-8777-777777777777',
    channelListingId: null,
    externalListingId: null,
    listingState: null,
    listingRawStatus: null,
    listingActive: false,
    state,
    soldOut: false,
    changedSinceRegistration: false,
    selectedThumbnailAssetId: null,
    selectedDetailPageRevisionId: null,
    lastExecution: null,
    ...overrides,
  };
}

function renderHeader(registrationAccounts: RegistrationAccountState[] = []) {
  return renderWithQueryClient(
    <ProductEditHeader
      productName="자석 다트게임"
      productId="candidate-1"
      salesProductId="sales-product-1"
      registrationAccounts={registrationAccounts}
      basicInfo={basicInfo}
      selectedThumbnailUrl={basicInfo.selectedThumbnailUrl}
      selectedDetailPageGenerationId={basicInfo.selectedDetailPageGenerationId}
      isEditComplete={false}
      isLocked={false}
      onToggleEditComplete={vi.fn()}
      onToggleLocked={vi.fn()}
      onBack={vi.fn()}
    />,
  );
}

describe('ProductEditHeader preparation draft action', () => {
  beforeEach(() => {
    resolveRegistrationTargetMock.mockReset();
    listAccountsMock.mockReset();
    toastSuccessMock.mockReset();
    listAccountsMock.mockResolvedValue([
      {
        id: '11111111-1111-4111-8111-111111111111',
        channel: 'coupang',
        name: '쿠팡 본계정',
        externalAccountId: 'vendor-main',
        isPrimary: true,
      },
      {
        id: '22222222-2222-4222-8222-222222222222',
        channel: 'coupang',
        name: '쿠팡 로켓 계정',
        externalAccountId: 'vendor-rocket',
      },
    ]);
  });

  it('resolves (creates or reuses) the registration target for the explicitly selected account and stays in the candidate workspace', async () => {
    resolveRegistrationTargetMock.mockResolvedValue({
      id: '77777777-7777-4777-8777-777777777777',
      salesProductId: 'sales-product-1',
      channelAccountId: '22222222-2222-4222-8222-222222222222',
      version: 1,
      displayName: null,
      registrationInput: {},
      selectedOptions: [],
      resolved: { name: '자석 다트게임', options: [] },
    });
    const { queryClient } = renderHeader();
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries');

    fireEvent.click(screen.getByRole('button', { name: '제품 등록 준비' }));
    const accountSelect = await screen.findByLabelText('등록 채널 계정');
    expect(accountSelect).toHaveValue('');
    await screen.findByRole('option', { name: '쿠팡 로켓 계정 · coupang' });
    await waitFor(() => expect(accountSelect).toBeEnabled());
    fireEvent.change(accountSelect, {
      target: { value: '22222222-2222-4222-8222-222222222222' },
    });
    fireEvent.click(screen.getByRole('button', { name: '등록 준비 저장' }));

    // 판매상품 초안은 수집 시점부터 있다(ADR-0022) — 만들지 않고 이 초안 × 고른
    // 계정의 등록 설정을 열거나(이미 있으면) 그대로 돌려받는다.
    await waitFor(() => expect(resolveRegistrationTargetMock).toHaveBeenCalledWith({
      salesProductId: 'sales-product-1',
      channelAccountId: '22222222-2222-4222-8222-222222222222',
    }));
    // 상태는 등록 상태 reader 가 다시 답한다 — 화면이 '준비됨' 을 지어내지 않는다.
    await waitFor(() => expect(invalidate).toHaveBeenCalledWith({
      queryKey: salesProductKeys.registrationState('sales-product-1'),
    }));
    expect(screen.getByText('자석 다트게임')).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('caches the account picker response under the canonical active-account key', async () => {
    const { queryClient } = renderHeader();

    fireEvent.click(screen.getByRole('button', { name: '제품 등록 준비' }));
    await screen.findByRole('option', { name: '쿠팡 로켓 계정 · coupang' });

    expect(queryClient.getQueryData(queryKeys.channelAccounts.active())).toEqual(
      await listAccountsMock.mock.results[0]?.value,
    );
  });

  /**
   * 등록이 어디까지 갔는가는 등록 상태 reader 가 계정별로 답한다(KID-320). 한 몰에 올라갔어도 다른 몰은 준비할
   * 수 있어야 한다 — 버튼은 열어 두고, 이미 올라간 계정은 대화상자가 계정마다 막는다(W4 리뷰 S2).
   */
  it('⭐ shows the only account\'s state and still offers preparation for the other malls when it is registered', async () => {
    renderHeader([account(ROCKET_ACCOUNT, 'registered', { changedSinceRegistration: true })]);

    expect(screen.getByText('등록됨')).toBeInTheDocument();
    expect(screen.getByText('변경됨 · 재전송 필요')).toBeInTheDocument();
    const button = screen.getByRole('button', { name: '제품 등록 준비' });
    expect(button).toBeEnabled();

    fireEvent.click(button);
    const registered = await screen.findByRole('option', { name: /쿠팡 로켓 계정/ });
    expect(registered).toBeDisabled();
  });

  /** 아무 계정에도 보내지 않았으면 등록 준비 길은 열려 있다. 반려는 없다(KID-313). */
  it('⭐ keeps preparation open while no account has anything', () => {
    renderHeader([]);
    expect(screen.getByRole('button', { name: '제품 등록 준비' })).toBeEnabled();
    expect(screen.queryByRole('button', { name: /반려/ })).not.toBeInTheDocument();
  });

  it('keeps preparation open for the other malls while one account is live', () => {
    renderHeader([account(ROCKET_ACCOUNT, 'submitting')]);

    expect(screen.getByRole('button', { name: '제품 등록 준비' })).toBeEnabled();
    expect(screen.getByText('전송 중')).toBeInTheDocument();
  });

  it('opens preparation again for a failed account', () => {
    renderHeader([account(ROCKET_ACCOUNT, 'failed')]);

    expect(screen.getByText('실패')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '제품 등록 준비' })).toBeEnabled();
  });

  it('summarises several accounts and does not offer an already registered one in the picker', async () => {
    renderHeader([account(MAIN_ACCOUNT, 'registered'), account(ROCKET_ACCOUNT, 'unregistered')]);

    expect(screen.getByText('1몰 등록')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '제품 등록 준비' }));
    const registered = await screen.findByRole('option', { name: '쿠팡 본계정 · coupang (등록됨)' });
    expect(registered).toBeDisabled();
    expect(screen.getByRole('option', { name: '쿠팡 로켓 계정 · coupang' })).toBeEnabled();
  });
});
