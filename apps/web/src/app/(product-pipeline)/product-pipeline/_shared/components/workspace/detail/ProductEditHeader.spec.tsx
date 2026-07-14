import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import ProductEditHeader from './ProductEditHeader';
import type { ProductBasics, ProductPreparationSelection } from '@/app/(product-pipeline)/product-pipeline/collected-products/lib/sourcing-api';
import { queryKeys } from '@/lib/query-keys';

const {
  createPreparationDraftMock,
  listAccountsMock,
  rejectMock,
  toastSuccessMock,
} = vi.hoisted(() => ({
  createPreparationDraftMock: vi.fn(),
  listAccountsMock: vi.fn(),
  rejectMock: vi.fn(),
  toastSuccessMock: vi.fn(),
}));

vi.mock('@/app/(product-pipeline)/product-pipeline/collected-products/lib/sourcing-api', () => ({
  candidatesApi: {
    createPreparationDraft: (...args: unknown[]) => createPreparationDraftMock(...args),
    reject: (...args: unknown[]) => rejectMock(...args),
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
  selectedThumbnailGenerationCandidateId: '33333333-3333-4333-8333-333333333333',
  selectedDetailPageGenerationId: '44444444-4444-4444-8444-444444444444',
  selectedDetailPageArtifactId: '55555555-5555-4555-8555-555555555555',
  selectedDetailPageRevisionId: '66666666-6666-4666-8666-666666666666',
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

function renderHeader(productPreparation: ProductPreparationSelection | null = null) {
  return renderWithQueryClient(
    <ProductEditHeader
      productName="자석 다트게임"
      productId="candidate-1"
      status="sourced"
      productPreparation={productPreparation}
      basicInfo={basicInfo}
      selectedThumbnailUrl={basicInfo.selectedThumbnailUrl}
      selectedThumbnailGenerationId={basicInfo.selectedThumbnailGenerationId}
      selectedThumbnailGenerationCandidateId={basicInfo.selectedThumbnailGenerationCandidateId}
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
    createPreparationDraftMock.mockReset();
    listAccountsMock.mockReset();
    rejectMock.mockReset();
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

  it('creates a draft for the explicitly selected account and stays in the candidate workspace', async () => {
    createPreparationDraftMock.mockResolvedValue({
      preparationId: '77777777-7777-4777-8777-777777777777',
      status: 'draft',
    });
    renderHeader();

    fireEvent.click(screen.getByRole('button', { name: '제품 등록 준비' }));
    const accountSelect = await screen.findByLabelText('등록 채널 계정');
    expect(accountSelect).toHaveValue('');
    await screen.findByRole('option', { name: '쿠팡 로켓 계정 · coupang' });
    await waitFor(() => expect(accountSelect).toBeEnabled());
    fireEvent.change(accountSelect, {
      target: { value: '22222222-2222-4222-8222-222222222222' },
    });
    fireEvent.click(screen.getByRole('button', { name: '등록 준비 저장' }));

    await waitFor(() => expect(createPreparationDraftMock).toHaveBeenCalledWith(
      'candidate-1',
      expect.objectContaining({
        channelAccountId: '22222222-2222-4222-8222-222222222222',
        displayName: '자석 다트게임',
        registrationInput: expect.objectContaining({
          name: '자석 다트게임',
          category: '완구',
          salePrice: 21900,
        }),
        selectedThumbnailUrl: 'https://cdn.example.com/generated-thumb.png',
        selectedThumbnailGenerationId: '22222222-2222-4222-8222-222222222222',
        selectedThumbnailGenerationCandidateId: '33333333-3333-4333-8333-333333333333',
        selectedDetailPageGenerationId: '44444444-4444-4444-8444-444444444444',
        selectedDetailPageArtifactId: '55555555-5555-4555-8555-555555555555',
        selectedDetailPageRevisionId: '66666666-6666-4666-8666-666666666666',
      }),
    ));
    const request = createPreparationDraftMock.mock.calls[0]?.[1];
    expect(request?.registrationInput).not.toHaveProperty('selectedThumbnailGenerationId');
    expect(request).not.toHaveProperty('options');
    expect(request).not.toHaveProperty('skipPostPromotionHooks');
    expect(request).not.toHaveProperty('masterId');
    expect(await screen.findByText('등록 준비됨')).toBeInTheDocument();
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

  it('shows registration state from the preparation instead of candidate status', () => {
    renderHeader({
      id: '77777777-7777-4777-8777-777777777777',
      sourceCandidateId: 'candidate-1',
      channelAccountId: '22222222-2222-4222-8222-222222222222',
      sourceContentWorkspaceId: '88888888-8888-4888-8888-888888888888',
      channelListingId: '99999999-9999-4999-8999-999999999999',
      status: 'registered',
      selectedThumbnailUrl: null,
      selectedThumbnailGenerationId: null,
      selectedThumbnailGenerationCandidateId: null,
      selectedDetailPageGenerationId: null,
      selectedDetailPageArtifactId: null,
      selectedDetailPageRevisionId: null,
      updatedAt: '2026-07-13T00:00:00.000Z',
    });

    expect(screen.getByText('제품 등록됨')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '제품 등록 준비' })).not.toBeInTheDocument();
  });

  it('does not treat an accountless content preparation as registration state', () => {
    renderHeader({
      id: '77777777-7777-4777-8777-777777777777',
      sourceCandidateId: 'candidate-1',
      channelAccountId: null,
      sourceContentWorkspaceId: '88888888-8888-4888-8888-888888888888',
      channelListingId: null,
      status: 'draft',
      selectedThumbnailUrl: null,
      selectedThumbnailGenerationId: null,
      selectedThumbnailGenerationCandidateId: null,
      selectedDetailPageGenerationId: null,
      selectedDetailPageArtifactId: null,
      selectedDetailPageRevisionId: null,
      updatedAt: '2026-07-13T00:00:00.000Z',
    });

    expect(screen.getByRole('button', { name: '제품 등록 준비' })).toBeInTheDocument();
    expect(screen.queryByText('등록 준비됨')).not.toBeInTheDocument();
  });
});
