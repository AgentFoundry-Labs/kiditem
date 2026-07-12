import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import RegisteredWorkspaceDetailPage from './page';
import type { RegisteredChannelListing } from '../lib/channel-listings-api';

const { productWorkspaceProps, routerPushMock, listing } = vi.hoisted(() => ({
  productWorkspaceProps: [] as Array<Record<string, unknown>>,
  routerPushMock: vi.fn(),
  listing: {
    id: 'listing-1',
    masterId: 'legacy-master-1',
    masterCode: 'M-00000001',
    masterName: '자석 다트게임',
    thumbnailUrl: 'https://cdn.example.com/listing.png',
    channel: 'coupang',
    channelAccountId: 'account-1',
    channelAccountName: '쿠팡 본계정',
    externalId: 'seller-product-1',
    channelName: '쿠팡 등록명',
    channelPrice: 21900,
    sourceCandidateId: 'candidate-1',
    contentWorkspaceId: 'listing-workspace-1',
    status: 'active',
    exposureStatus: 'visible',
    optionCount: 1,
    createdAt: '2026-07-13T00:00:00.000Z',
    updatedAt: '2026-07-13T01:00:00.000Z',
  } satisfies RegisteredChannelListing,
}));

vi.mock('next/navigation', () => ({
  useParams: () => ({ workspaceId: 'listing-1' }),
  useRouter: () => ({ push: routerPushMock }),
  useSearchParams: () => new URLSearchParams('workspace=listing'),
}));

vi.mock('@tanstack/react-query', () => ({
  useQuery: ({ enabled }: { enabled?: boolean }) => enabled
    ? { data: listing, isLoading: false }
    : { data: undefined, isLoading: false },
}));

vi.mock('../../_shared/components/workspace/ProductWorkspaceScreen', () => ({
  ProductWorkspaceScreen: (props: Record<string, unknown>) => {
    productWorkspaceProps.push(props);
    return <div data-testid="registered-listing-workspace" />;
  },
}));

describe('RegisteredWorkspaceDetailPage listing projection', () => {
  beforeEach(() => {
    productWorkspaceProps.length = 0;
    routerPushMock.mockReset();
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
      contentWorkspaceId: 'listing-workspace-1',
      detailGenerationEnabled: true,
      showCandidateActions: false,
      thumbnailSourceCandidateId: null,
    }));
    expect(initialWorkspaceData.product.status).toBe('sourced');
    expect(initialWorkspaceData.product).not.toHaveProperty('promotedMasterId');
    expect(initialWorkspaceData.product).not.toHaveProperty('promoted_master_id');
    expect(initialWorkspaceData.product.raw_data).toEqual(expect.objectContaining({
      listingId: 'listing-1',
      channelAccountId: 'account-1',
    }));

    const openDetailGeneration = props?.onOpenDetailTemplateGeneration as (() => void) | undefined;
    expect(openDetailGeneration).toBeTypeOf('function');
    openDetailGeneration?.();
    expect(routerPushMock).toHaveBeenCalledWith(expect.stringMatching(
      /^\/product-pipeline\/detail-template-generation\?.*contentWorkspaceId=listing-workspace-1/,
    ));
  });
});
