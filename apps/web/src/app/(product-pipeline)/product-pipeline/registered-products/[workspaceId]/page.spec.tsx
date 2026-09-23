import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { placeholderDetailPageData } from '@kiditem/templates';
import RegisteredWorkspaceDetailPage from './page';
import type { RegisteredChannelListing } from '../lib/channel-listings-api';

const { productWorkspaceProps, routerPushMock, listing, contentWorkspace } = vi.hoisted(() => ({
  productWorkspaceProps: [] as Array<Record<string, unknown>>,
  routerPushMock: vi.fn(),
  listing: {
    id: 'listing-1',
    listingName: '자석 다트게임',
    thumbnailUrl: 'https://cdn.example.com/listing.png',
    detailPageArtifactId: null,
    detailPageRevisionId: null,
    channel: 'coupang',
    channelAccountId: 'account-1',
    channelAccountName: '쿠팡 본계정',
    externalId: 'seller-product-1',
    channelName: '쿠팡 등록명',
    channelPrice: 21900,
    sourceRecordId: 'candidate-1',
    contentWorkspaceId: 'listing-workspace-1',
    status: 'active',
    exposureStatus: 'visible',
    optionCount: 1,
    mappingStatus: 'matched',
    category: '완구',
    brand: '키드아이템',
    manufacturer: '키드아이템 제조사',
    providerDetail: {
      category: '완구',
      brand: '키드아이템',
      manufacturer: '키드아이템 제조사',
      sourceDetail: {
        documents: [{ id: 'contents-1', kind: 'contents', value: '<p>공급자 원문</p>' }],
        options: [],
      },
      options: [],
      media: [{
        sourceUrl: 'https://cdn.example.com/provider.png',
        role: 'primary',
        sortOrder: 0,
        externalOptionIds: [],
      }],
    },
    createdAt: '2026-07-13T00:00:00.000Z',
    updatedAt: '2026-07-13T01:00:00.000Z',
  } satisfies RegisteredChannelListing,
  contentWorkspace: {
    id: 'listing-workspace-1',
    ownerType: 'channel_listing',
    sourceRecordId: 'candidate-1',
    channelListingId: 'listing-1',
    originWorkspaceId: 'candidate-workspace-1',
    displayName: '자석 다트게임 콘텐츠',
    normalizedTitle: '자석다트게임콘텐츠',
    status: 'active',
    href: '/product-pipeline/registered-products/listing-1',
    generationCount: 1,
    latestGenerationId: 'generation-1',
    latestStatus: 'completed',
    currentDetailPageArtifactId: 'artifact-1',
    currentDetailPageRevisionId: 'revision-1',
    currentDetailPageGenerationId: 'generation-1',
    currentThumbnailSelection: {
      id: 'selection-1',
      contentAssetId: 'asset-1',
      url: 'https://cdn.example.com/workspace.png',
    },
    createdAt: '2026-07-13T00:00:00.000Z',
    updatedAt: '2026-07-13T01:00:00.000Z',
    history: [{
      id: 'generation-1',
      contentType: 'detail_page',
      status: 'completed',
      generatedTitle: '자석 다트게임',
      templateId: 'kids-playful',
      generationInput: {},
      detailPageData: null,
      imageUrls: ['https://cdn.example.com/detail.png'],
      processedImages: {},
      detailPageArtifactId: 'artifact-1',
      href: '/product-pipeline/detail-pages/generation-1/editor',
      createdAt: '2026-07-13T00:00:00.000Z',
      updatedAt: '2026-07-13T01:00:00.000Z',
    }],
  },
}));

vi.mock('next/navigation', () => ({
  useParams: () => ({ workspaceId: 'listing-1' }),
  useRouter: () => ({ push: routerPushMock }),
}));

vi.mock('@tanstack/react-query', () => ({
  useQuery: ({ queryKey }: { queryKey: readonly unknown[] }) => ({
    data: queryKey[0] === 'channel-listings' ? listing : contentWorkspace,
    isLoading: false,
  }),
}));

vi.mock('../../_shared/components/workspace/ProductWorkspaceScreen', () => ({
  ProductWorkspaceScreen: (props: Record<string, unknown>) => {
    productWorkspaceProps.push(props);
    const history = props.initialAgentHistory as Array<{
      id: string;
      detailPageData: { title?: string } | null;
    }> | undefined;
    const savedGenerationId = props.savedDetailPageGenerationId as string | null | undefined;
    const savedEntry = history?.find((item) => item.id === savedGenerationId);
    return (
      <div data-testid="registered-listing-workspace">
        {props.hasSavedDetailPage && savedEntry?.detailPageData?.title
          ? savedEntry.detailPageData.title
          : '생성된 상세페이지가 없습니다'}
      </div>
    );
  },
}));

describe('RegisteredWorkspaceDetailPage listing projection', () => {
  beforeEach(() => {
    productWorkspaceProps.length = 0;
    routerPushMock.mockReset();
    (contentWorkspace.history[0] as { detailPageData: unknown }).detailPageData = {
      ...placeholderDetailPageData,
      title: '저장된 자석 다트게임 상세페이지',
    };
  });

  it('uses listing and content-workspace identity without a promoted candidate state', () => {
    render(<RegisteredWorkspaceDetailPage />);

    expect(screen.getByTestId('registered-listing-workspace')).toBeInTheDocument();
    const props = productWorkspaceProps.at(-1);
    const initialWorkspaceData = props?.initialWorkspaceData as {
      product: Record<string, unknown>;
    };
    expect(props).toEqual(expect.objectContaining({
      productId: 'listing-1',
      listingContentWorkspaceId: 'listing-workspace-1',
      detailGenerationEnabled: true,
    }));
    // 리스팅에서 만든 값에는 원천 기록이 없다 — 소싱 판단을 지어내지 않는다.
    expect(initialWorkspaceData.product).not.toHaveProperty('status');
    expect(initialWorkspaceData.product.sourceRecordId).toBeNull();
    // 작업공간 id 는 화면 값에 싣지 않고 prop(`contentWorkspaceId`)으로만 넘긴다.
    expect(initialWorkspaceData.product).not.toHaveProperty('contentWorkspaceId');
    expect(initialWorkspaceData.product).not.toHaveProperty('promotedMasterId');
    expect(initialWorkspaceData.product).not.toHaveProperty('promoted_master_id');
    expect(initialWorkspaceData.product.raw_data).toEqual(expect.objectContaining({
      listingId: 'listing-1',
      channelAccountId: 'account-1',
    }));
    expect(initialWorkspaceData.product.raw_data).not.toHaveProperty('masterId');
    expect(initialWorkspaceData.product.thumbnailUrl).toBe('https://cdn.example.com/workspace.png');
    expect(initialWorkspaceData.product.image_urls).toEqual([
      'https://cdn.example.com/workspace.png',
      'https://cdn.example.com/detail.png',
      'https://cdn.example.com/listing.png',
      'https://cdn.example.com/provider.png',
    ]);
    expect(initialWorkspaceData.product.thumbnailUrl).not.toBe(listing.thumbnailUrl);

    expect(props).toEqual(expect.objectContaining({
      hasSavedDetailPage: true,
      savedDetailPageGenerationId: 'generation-1',
      generationHistoryQueryEnabled: false,
    }));
    expect(props?.initialAgentHistory).toEqual([
      expect.objectContaining({
        id: 'generation-1',
        detailPageArtifactId: 'artifact-1',
        detailPageRevisionId: 'revision-1',
        detailPageData: expect.objectContaining({
          title: '저장된 자석 다트게임 상세페이지',
        }),
      }),
    ]);
    expect(initialWorkspaceData.product.basicInfo).toEqual(expect.objectContaining({
      selectedDetailPageGenerationId: 'generation-1',
      selectedDetailPageArtifactId: 'artifact-1',
      selectedDetailPageRevisionId: 'revision-1',
    }));
    expect(screen.getByText('저장된 자석 다트게임 상세페이지')).toBeInTheDocument();
    expect(screen.getByText('쿠팡 원천 상세 정보')).toBeInTheDocument();
    expect(screen.getAllByText(/공급자 원문/).some((element) => element.tagName === 'PRE')).toBe(true);
    expect(screen.getByRole('link', { name: 'https://cdn.example.com/provider.png' })).toBeInTheDocument();
    expect(screen.queryByText('생성된 상세페이지가 없습니다')).not.toBeInTheDocument();

    const openDetailGeneration = props?.onOpenDetailTemplateGeneration as (() => void) | undefined;
    expect(openDetailGeneration).toBeTypeOf('function');
    openDetailGeneration?.();
    expect(routerPushMock).toHaveBeenCalledWith(expect.stringMatching(
      /^\/product-pipeline\/detail-template-generation\?.*contentWorkspaceId=listing-workspace-1/,
    ));
  });

  it('renders an explicit uncaptured price without replacing it with zero', () => {
    (listing as unknown as RegisteredChannelListing).channelPrice = null;
    render(<RegisteredWorkspaceDetailPage />);

    expect(screen.getByText('판매가: 미수집')).toBeInTheDocument();
    (listing as unknown as RegisteredChannelListing).channelPrice = 21900;
  });
});
