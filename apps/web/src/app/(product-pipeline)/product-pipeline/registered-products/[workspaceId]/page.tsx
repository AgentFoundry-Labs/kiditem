'use client';

import { useMemo } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { parseDetailPageData, placeholderDetailPageData } from '@kiditem/templates';
import { useQuery } from '@tanstack/react-query';
import type { ProductDetailResponse } from '../../collected-products/lib/sourcing-api';
import { queryKeys } from '@/lib/query-keys';
import { ProductWorkspaceScreen } from '../../_shared/components/workspace/ProductWorkspaceScreen';
import type { ProductWorkspaceData } from '../../_shared/hooks/useProductDetail';
import {
  REGISTERED_PRODUCTS_ROOT,
  detailTemplateGenerationHref,
} from '../../_shared/lib/product-pipeline-routes';
import {
  channelListingsApi,
  type RegisteredChannelListing,
} from '../lib/channel-listings-api';
import { registeredListingDetailHref } from '../lib/registered-listing-navigation';
import {
  contentWorkspacesApi,
  type ContentWorkspaceSummary,
} from '../../_shared/lib/content-workspaces-api';

export default function RegisteredWorkspaceDetailPage() {
  const params = useParams();
  const router = useRouter();
  const listingId = params.workspaceId as string;
  const { data: listing, isLoading } = useQuery({
    queryKey: queryKeys.channelListings.detail(listingId),
    queryFn: () => channelListingsApi.getWorkspace(listingId),
    enabled: !!listingId,
  });
  const contentWorkspaceId = listing?.contentWorkspaceId ?? null;
  const { data: contentWorkspace, isLoading: isLoadingContentWorkspace } = useQuery({
    queryKey: queryKeys.contentWorkspaces.detail(contentWorkspaceId ?? ''),
    queryFn: () => contentWorkspacesApi.get(contentWorkspaceId!),
    enabled: Boolean(contentWorkspaceId),
  });
  const listingWorkspaceData = useMemo(() => (
    listing
      ? channelListingToProductWorkspaceData(listing, contentWorkspace ?? null)
      : null
  ), [contentWorkspace, listing]);

  if (isLoading || isLoadingContentWorkspace || !listing || !listingWorkspaceData) {
    return (
      <div className="flex h-full items-center justify-center bg-slate-50">
        <Loader2 size={28} className="animate-spin text-slate-400" />
      </div>
    );
  }

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
      contentWorkspaceId={listing.contentWorkspaceId}
      detailGenerationEnabled={Boolean(listing.contentWorkspaceId)}
      thumbnailSourceCandidateId={null}
      onOpenDetailTemplateGeneration={listing.contentWorkspaceId
        ? () => router.push(detailTemplateGenerationHref({
            contentWorkspaceId: listing.contentWorkspaceId!,
            title: listing.listingName,
            returnTo: selfHref,
          }))
        : undefined}
    />
  );
}

function channelListingToProductWorkspaceData(
  listing: RegisteredChannelListing,
  contentWorkspace: ContentWorkspaceSummary | null,
): ProductWorkspaceData {
  const title = listing.listingName;
  const currentDetailGeneration = contentWorkspace?.history.find(
    (item) => item.id === contentWorkspace.currentDetailPageGenerationId,
  ) ?? null;
  const imageUrls = Array.from(new Set([
    contentWorkspace?.currentThumbnailSelection?.url ?? null,
    ...(currentDetailGeneration?.imageUrls ?? []),
  ].filter((url): url is string => Boolean(url))));
  const thumbnailUrl = contentWorkspace?.currentThumbnailSelection?.url ?? null;
  const price = listing.channelPrice ?? 0;
  const product: ProductDetailResponse = {
    id: listing.id,
    name: title,
    status: 'sourced',
    sourcePlatform: `channel_listing:${listing.channel}`,
    source_platform: `channel_listing:${listing.channel}`,
    source_url: null,
    thumbnailUrl,
    thumbnail_url: thumbnailUrl,
    price_krw: price,
    cost_cny: null,
    image_count: imageUrls.length,
    is_processed: true,
    raw_data: {
      listingId: listing.id,
      channel: listing.channel,
      channelAccountId: listing.channelAccountId,
      channelAccountName: listing.channelAccountName,
      externalId: listing.externalId,
      exposureStatus: listing.exposureStatus,
      optionCount: listing.optionCount,
      mappingStatus: listing.mappingStatus,
      contentWorkspaceId: contentWorkspace?.id ?? null,
      contentWorkspaceStatus: contentWorkspace?.status ?? null,
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
    detailPageData: parseWorkspaceDetailPage(currentDetailGeneration?.detailPageData),
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

function parseWorkspaceDetailPage(value: Record<string, unknown> | null | undefined) {
  if (!value) return placeholderDetailPageData;
  try {
    return parseDetailPageData(value);
  } catch {
    return placeholderDetailPageData;
  }
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
    selectedThumbnailGenerationId: null,
    selectedThumbnailGenerationCandidateId: null,
    selectedDetailPageGenerationId: null,
    selectedDetailPageArtifactId: null,
    selectedDetailPageRevisionId: null,
  };
}
