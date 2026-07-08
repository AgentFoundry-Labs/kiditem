'use client';

import { useMemo } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { placeholderDetailPageData } from '@kiditem/templates';
import { useQuery } from '@tanstack/react-query';
import type { ProductDetailResponse } from '../../collected-products/lib/sourcing-api';
import { queryKeys } from '@/lib/query-keys';
import { contentWorkspacesApi } from '../../_shared/lib/content-workspaces-api';
import { contentWorkspaceHistoryToGenerationHistory } from '../../_shared/lib/detail-generation-history';
import { ProductWorkspaceScreen } from '../../_shared/components/workspace/ProductWorkspaceScreen';
import type { ProductWorkspaceData } from '../../_shared/hooks/useProductDetail';
import {
  REGISTERED_PRODUCTS_ROOT,
  detailTemplateGenerationHref,
  registeredProductDetailHref,
} from '../../_shared/lib/product-pipeline-routes';
import {
  channelListingsApi,
  type RegisteredChannelListing,
} from '../lib/channel-listings-api';
import { registeredListingDetailHref } from '../lib/registered-listing-navigation';
import {
  latestGenerationInput,
  contentWorkspaceImageUrls,
  contentWorkspaceTitle,
} from '../lib/content-workspace-view';

export default function RegisteredWorkspaceDetailPage() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const workspaceId = params.workspaceId as string;
  const isListingWorkspace = searchParams.get('workspace') === 'listing';

  const { data: workspace, isLoading } = useQuery({
    queryKey: queryKeys.contentWorkspaces.detail(workspaceId),
    queryFn: () => contentWorkspacesApi.get(workspaceId),
    enabled: !!workspaceId && !isListingWorkspace,
  });
  const { data: listing, isLoading: isLoadingListing } = useQuery({
    queryKey: queryKeys.channelListings.detail(workspaceId),
    queryFn: () => channelListingsApi.getWorkspace(workspaceId),
    enabled: !!workspaceId && isListingWorkspace,
  });

  const ownerlessWorkspaceData = useMemo(() => (
    workspace && !workspace.sourceCandidateId
      ? contentWorkspaceToProductWorkspaceData(workspace)
      : null
  ), [workspace]);
  const savedDetailPageGenerationId = useMemo(() => {
    if (!workspace?.currentDetailPageArtifactId) return null;
    return (
      workspace.currentDetailPageGenerationId ??
      workspace.history.find(
        (item) => item.detailPageArtifactId === workspace.currentDetailPageArtifactId,
      )?.id ??
      null
    );
  }, [workspace]);
  const listingWorkspaceData = useMemo(() => (
    listing ? channelListingToProductWorkspaceData(listing) : null
  ), [listing]);

  if (isLoading || isLoadingListing || (!isListingWorkspace && !workspace) || (isListingWorkspace && !listing)) {
    return (
      <div className="flex h-full items-center justify-center bg-slate-50">
        <Loader2 size={28} className="animate-spin text-slate-400" />
      </div>
    );
  }

  if (isListingWorkspace && listing && listingWorkspaceData) {
    const selfHref = registeredListingDetailHref(listing.id);
    return (
      <ProductWorkspaceScreen
        productId={listing.id}
        backHref={REGISTERED_PRODUCTS_ROOT}
        selfHref={selfHref}
        initialWorkspaceData={listingWorkspaceData}
        initialAgentHistory={[]}
        generationHistoryQueryEnabled={false}
        showCandidateActions={false}
        thumbnailSourceCandidateId={null}
      />
    );
  }

  if (!workspace) {
    return (
      <div className="flex h-full items-center justify-center bg-slate-50">
        <Loader2 size={28} className="animate-spin text-slate-400" />
      </div>
    );
  }

  const selfHref = registeredProductDetailHref(workspace.id);
  const title = contentWorkspaceTitle(workspace);

  return (
    <ProductWorkspaceScreen
      productId={workspace.sourceCandidateId ?? workspace.id}
      backHref={REGISTERED_PRODUCTS_ROOT}
      selfHref={selfHref}
      initialWorkspaceData={ownerlessWorkspaceData ?? undefined}
      initialAgentHistory={contentWorkspaceHistoryToGenerationHistory(workspace.history)}
      generationHistoryQueryEnabled={!!workspace.sourceCandidateId}
      showCandidateActions={!!workspace.sourceCandidateId}
      contentWorkspaceId={workspace.id}
      hasSavedDetailPage={Boolean(savedDetailPageGenerationId)}
      savedDetailPageGenerationId={savedDetailPageGenerationId}
      thumbnailSourceCandidateId={workspace.sourceCandidateId ?? null}
      onOpenDetailTemplateGeneration={
        workspace.sourceCandidateId
          ? undefined
          : () => router.push(detailTemplateGenerationHref({
            contentWorkspaceId: workspace.id,
            title,
            returnTo: selfHref,
          }))
      }
    />
  );
}

function contentWorkspaceToProductWorkspaceData(
  workspace: NonNullable<Awaited<ReturnType<typeof contentWorkspacesApi.get>>>,
): ProductWorkspaceData {
  const title = contentWorkspaceTitle(workspace);
  const imageUrls = contentWorkspaceImageUrls(workspace);
  const input = latestGenerationInput(workspace);
  const rawCategory = typeof input.rawCategory === 'string' ? input.rawCategory : '';
  const product: ProductDetailResponse = {
    id: workspace.id,
    name: title,
    status: 'sourced',
    promotedMasterId: workspace.targetMasterId,
    promoted_master_id: workspace.targetMasterId,
    sourcePlatform: 'content_workspace',
    source_platform: 'content_workspace',
    source_url: null,
    thumbnailUrl: imageUrls[0] ?? null,
    thumbnail_url: imageUrls[0] ?? null,
    price_krw: 0,
    cost_cny: null,
    image_count: imageUrls.length,
    is_processed: true,
    raw_data: {
      workspaceId: workspace.id,
      ownerType: workspace.ownerType,
      rawTitle: title,
      rawCategory,
      imageUrls,
    },
    processed_data: {
      title,
      price: 0,
      images: imageUrls,
      specs: [],
      features: [],
    },
    image_urls: imageUrls,
    images: imageUrls.map((url, index) => ({
      url,
      sortOrder: index,
      isPrimary: index === 0,
    })),
    basicInfo: buildFallbackBasicInfo({
      name: title,
      category: rawCategory,
      description: '',
      thumbnailUrls: imageUrls,
    }),
    productPreparation: null,
    created_at: workspace.createdAt,
    updated_at: workspace.updatedAt,
  };

  return {
    product,
    detailPageData: placeholderDetailPageData,
    editedHtml: null,
    templateCss: '',
    editState: {
      name: title,
      category: rawCategory,
      originalPrice: 0,
      salePrice: 0,
      discountRate: 0,
      thumbnails: imageUrls,
      tags: [],
      rating: 0,
      reviewCount: 0,
      productInfo: [],
      features: [],
    },
  };
}

function channelListingToProductWorkspaceData(
  listing: RegisteredChannelListing,
): ProductWorkspaceData {
  const title = listing.masterName;
  const imageUrls = listing.thumbnailUrl ? [listing.thumbnailUrl] : [];
  const price = listing.channelPrice ?? 0;
  const product: ProductDetailResponse = {
    id: listing.id,
    name: title,
    status: 'promoted',
    promotedMasterId: listing.masterId,
    promoted_master_id: listing.masterId,
    sourcePlatform: `channel_listing:${listing.channel}`,
    source_platform: `channel_listing:${listing.channel}`,
    source_url: null,
    thumbnailUrl: listing.thumbnailUrl,
    thumbnail_url: listing.thumbnailUrl,
    price_krw: price,
    cost_cny: null,
    image_count: imageUrls.length,
    is_processed: true,
    raw_data: {
      listingId: listing.id,
      masterId: listing.masterId,
      masterCode: listing.masterCode,
      channel: listing.channel,
      channelAccountId: listing.channelAccountId,
      channelAccountName: listing.channelAccountName,
      externalId: listing.externalId,
      exposureStatus: listing.exposureStatus,
      optionCount: listing.optionCount,
      price: listing.channelPrice,
      rawTitle: title,
      imageUrls,
    },
    processed_data: {
      title,
      price,
      images: imageUrls,
      specs: [
        { key: '마켓', value: listing.channel },
        { key: '상품코드', value: listing.masterCode },
        { key: '마켓 상품번호', value: listing.externalId },
      ],
      features: [],
    },
    image_urls: imageUrls,
    images: imageUrls.map((url, index) => ({
      url,
      sortOrder: index,
      isPrimary: index === 0,
    })),
    basicInfo: buildFallbackBasicInfo({
      name: title,
      category: '',
      description: '',
      thumbnailUrls: imageUrls,
      salePrice: price,
    }),
    productPreparation: null,
    created_at: listing.createdAt,
    updated_at: listing.updatedAt,
  };

  return {
    product,
    detailPageData: placeholderDetailPageData,
    editedHtml: null,
    templateCss: '',
    editState: {
      name: title,
      category: '',
      originalPrice: price,
      salePrice: price,
      discountRate: 0,
      thumbnails: imageUrls,
      tags: [],
      rating: 0,
      reviewCount: 0,
      productInfo: [],
      features: [],
    },
  };
}

function buildFallbackBasicInfo(input: {
  name: string;
  category: string;
  description: string;
  thumbnailUrls: string[];
  salePrice?: number;
}): ProductDetailResponse['basicInfo'] {
  return {
    name: input.name,
    category: input.category,
    description: input.description,
    target: '',
    ageGroup: '',
    tags: [],
    keywords: [],
    optionNames: [],
    kcCertificationStatus: '',
    kcCertificationNumber: '',
    kcCertificationImageUrl: '',
    productSize: '',
    colorVariantStatus: '',
    colorVariantNames: '',
    boxSetStatus: '',
    boxSetQuantity: '',
    originalPrice: input.salePrice ?? 0,
    salePrice: input.salePrice ?? 0,
    discountRate: 0,
    rocketBundleQuantity: 0,
    rocketUnitCost: 0,
    thumbnailUrls: input.thumbnailUrls,
    selectedThumbnailUrl: null,
    selectedThumbnailGenerationCandidateId: null,
    selectedDetailPageGenerationId: null,
    selectedDetailPageArtifactId: null,
    selectedDetailPageRevisionId: null,
  };
}
