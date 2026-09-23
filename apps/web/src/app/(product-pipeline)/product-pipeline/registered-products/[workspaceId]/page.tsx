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
      <ProviderDetailPanel listing={listing} />
    </div>
  );
}

function ProviderDetailPanel({ listing }: { listing: RegisteredChannelListing }) {
  const detail = listing.providerDetail;
  if (!detail) return null;
  const detailJson = detail.sourceDetail ? JSON.stringify(detail.sourceDetail, null, 2) : null;
  return (
    <section className="mx-auto mb-6 w-full max-w-6xl rounded-xl border border-slate-200 bg-white p-5 shadow-sm" aria-label="쿠팡 원천 상세 정보">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-black text-slate-900">쿠팡 원천 상세 정보</h2>
          <p className="mt-1 text-xs font-medium text-slate-500">
            운영자 선택 이미지와 생성 상세페이지와 분리된 공급자 원문입니다. HTML은 실행하지 않고 텍스트로 표시합니다.
          </p>
        </div>
        <div className="text-right text-xs font-semibold text-slate-600">
          <div>판매가: {listing.channelPrice == null ? '미수집' : `${listing.channelPrice.toLocaleString('ko-KR')}원`}</div>
          <div className="mt-1">카테고리: {detail.category ?? '미수집'}</div>
        </div>
      </div>
      <dl className="mt-4 grid gap-2 text-xs sm:grid-cols-3">
        <div className="rounded-lg bg-slate-50 px-3 py-2"><dt className="font-bold text-slate-500">브랜드</dt><dd className="mt-1 text-slate-800">{detail.brand ?? '미수집'}</dd></div>
        <div className="rounded-lg bg-slate-50 px-3 py-2"><dt className="font-bold text-slate-500">제조사</dt><dd className="mt-1 text-slate-800">{detail.manufacturer ?? '미수집'}</dd></div>
        <div className="rounded-lg bg-slate-50 px-3 py-2"><dt className="font-bold text-slate-500">옵션</dt><dd className="mt-1 text-slate-800">{detail.options.length.toLocaleString('ko-KR')}개</dd></div>
      </dl>
      {detail.media.length > 0 && (
        <div className="mt-4">
          <h3 className="text-xs font-bold text-slate-700">공급자 이미지 URL ({detail.media.length})</h3>
          <ul className="mt-2 grid gap-1 text-xs text-slate-600">
            {detail.media.map((media) => (
              <li key={`${media.role}:${media.sortOrder}:${media.sourceUrl}`} className="flex min-w-0 items-center gap-2">
                <span className="shrink-0 rounded bg-slate-100 px-1.5 py-0.5 font-semibold">{media.role}</span>
                <a className="truncate text-emerald-700 underline" href={media.sourceUrl} target="_blank" rel="noreferrer">{media.sourceUrl}</a>
              </li>
            ))}
          </ul>
        </div>
      )}
      {detailJson && (
        <details className="mt-4">
          <summary className="cursor-pointer text-xs font-bold text-slate-700">전체 원문 JSON 보기</summary>
          <pre className="mt-2 max-h-96 overflow-auto whitespace-pre-wrap break-words rounded-lg bg-slate-950 p-3 text-[11px] leading-5 text-slate-100">{detailJson}</pre>
        </details>
      )}
    </section>
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
    contentWorkspace?.currentThumbnailSelection?.url ?? null,
    ...generatedImageUrls,
    listing.thumbnailUrl,
    ...providerImageUrls,
  ].filter((url): url is string => Boolean(url))));
  const thumbnailUrl = contentWorkspace?.currentThumbnailSelection?.url
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
      salePrice: price,
      selectedDetailPageGenerationId:
        contentWorkspace?.currentDetailPageId ?? null,
      selectedDetailPageRevisionId:
        contentWorkspace?.currentDetailPageRevisionId ?? null,
    }),
    registrationTarget: null,
    // 이 화면은 후보가 아니라 이미 등록된 리스팅이다 — 후보 울타리를 들고 오지 않는다
    // (초안이 없어 편집 · 등록 준비 · 반려가 열리지 않는다). 상태를 지어내지 않고 모른다고 둔다.
    registrationState: null,
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
  salePrice?: number;
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
    originalPrice: input.salePrice ?? 0,
    salePrice: input.salePrice ?? 0,
    discountRate: 0,
    rocketBundleQuantity: 0,
    rocketUnitCost: 0,
    thumbnailUrls: input.thumbnailUrls,
    selectedThumbnailUrl: null,
    selectedThumbnailGenerationId: null,
    selectedThumbnailGenerationCandidateId: null,
    selectedDetailPageGenerationId: input.selectedDetailPageGenerationId ?? null,
    // 아티팩트는 KID-313 W3b 에서 사라졌다 — 상세는 상세 페이지 id 와 revision 으로 고른다.
    selectedDetailPageArtifactId: null,
    selectedDetailPageRevisionId: input.selectedDetailPageRevisionId ?? null,
  };
}
