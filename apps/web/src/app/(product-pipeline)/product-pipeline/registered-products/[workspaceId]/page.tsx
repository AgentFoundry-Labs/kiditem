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
import { contentWorkspaceHistoryToGenerationHistory } from '../../_shared/lib/detail-generation-history';

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
  // 이력의 줄 하나가 상세 페이지 하나다 — 몰로 가는 현재는 작업공간의 현재 revision 이 속한 페이지다.
  const initialAgentHistory = contentWorkspace
    ? contentWorkspaceHistoryToGenerationHistory(contentWorkspace.history).map((item) => (
        item.id === contentWorkspace.currentDetailPageId
          ? { ...item, detailPageRevisionId: contentWorkspace.currentDetailPageRevisionId }
          : item
      ))
    : [];

  return (
    <div className="flex h-full min-h-0 flex-col overflow-y-auto bg-slate-50">
      <ProductWorkspaceScreen
        productId={listing.id}
        backHref={REGISTERED_PRODUCTS_ROOT}
        selfHref={selfHref}
        initialWorkspaceData={listingWorkspaceData}
        initialAgentHistory={initialAgentHistory}
        generationHistoryQueryEnabled={false}
        listingContentWorkspaceId={listing.contentWorkspaceId}
        hasSavedDetailPage={Boolean(contentWorkspace?.currentDetailPageId)}
        savedDetailPageGenerationId={contentWorkspace?.currentDetailPageId ?? null}
        detailGenerationEnabled={Boolean(listing.contentWorkspaceId)}
        onOpenDetailTemplateGeneration={listing.contentWorkspaceId
          ? () => router.push(detailTemplateGenerationHref({
              contentWorkspaceId: listing.contentWorkspaceId!,
              title: listing.listingName,
              returnTo: selfHref,
            }))
          : undefined}
      />
    </div>
  );
}


function channelListingToProductWorkspaceData(
  listing: RegisteredChannelListing,
  contentWorkspace: ContentWorkspaceSummary | null,
): ProductWorkspaceData {
  const title = listing.listingName;
  const currentDetailGeneration = contentWorkspace?.history.find(
    (item) => item.id === contentWorkspace.currentDetailPageId,
  ) ?? null;
  const generatedImageUrls = currentDetailGeneration?.imageUrls ?? [];
  const providerImageUrls = listing.providerDetail?.media.map((media) => media.sourceUrl) ?? [];
  const imageUrls = Array.from(new Set([
    contentWorkspace?.currentThumbnailAsset?.url ?? null,
    ...generatedImageUrls,
    listing.thumbnailUrl,
    ...providerImageUrls,
  ].filter((url): url is string => Boolean(url))));
  const thumbnailUrl = contentWorkspace?.currentThumbnailAsset?.url
    ?? generatedImageUrls[0]
    ?? listing.thumbnailUrl
    ?? providerImageUrls[0]
    ?? null;
  const price = listing.channelPrice ?? 0;
  const product: ProductDetailResponse = {
    id: listing.id,
    name: title,
    sourceRecordId: null,
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
      // 몰이 판매가를 안 줬으면 null(미정)이다 — 0원이 아니다(KID-310).
      salePrice: listing.channelPrice,
      selectedDetailPageGenerationId:
        contentWorkspace?.currentDetailPageId ?? null,
      selectedDetailPageRevisionId:
        contentWorkspace?.currentDetailPageRevisionId ?? null,
    }),
    // 이 화면은 이미 등록된 리스팅이다 — 그 리스팅 계정의 등록 상태는 리스팅 요약이 등록 상태 reader
    // 에서 싣고 온다(KID-320). 판매상품이 없는 리스팅이면 null 이라 상태를 지어내지 않는다.
    registrationAccounts: listing.registration ? [listing.registration] : [],
    // 이 화면은 판매상품 초안이 아니라 리스팅에서 값을 만든다 — 초안 id 로 이어지지 않는다.
    salesProductId: null,
    salesProductVersion: null,
    registrationImages: { primary: [], thumbnail: [], detail: [] },
    currentThumbnail: null,
    created_at: listing.createdAt,
    updated_at: listing.updatedAt,
  };

  return {
    product,
    detailPageData: parseWorkspaceDetailPage(currentDetailGeneration?.detailPageData),
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
  salePrice?: number | null;
  selectedDetailPageGenerationId?: string | null;
  selectedDetailPageRevisionId?: string | null;
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
    originalPrice: input.salePrice ?? null,
    salePrice: input.salePrice ?? null,
    discountRate: 0,
    rocketBundleQuantity: 0,
    rocketUnitCost: 0,
    thumbnailUrls: input.thumbnailUrls,
    selectedThumbnailUrl: null,
    selectedThumbnailAssetId: null,
    selectedDetailPageGenerationId: input.selectedDetailPageGenerationId ?? null,
    selectedDetailPageRevisionId: input.selectedDetailPageRevisionId ?? null,
  };
}
