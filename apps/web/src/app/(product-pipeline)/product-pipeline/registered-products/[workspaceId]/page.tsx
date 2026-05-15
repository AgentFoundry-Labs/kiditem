'use client';

import { useMemo } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { placeholderDetailPageData } from '@kiditem/templates';
import { useQuery } from '@tanstack/react-query';
import type { ProductDetailResponse } from '../../collected-products/lib/sourcing-api';
import { queryKeys } from '@/lib/query-keys';
import { registrationWorkspacesApi } from '../../_shared/lib/registration-workspaces-api';
import { registrationWorkspaceHistoryToGenerationHistory } from '../../_shared/lib/detail-generation-history';
import { ProductWorkspaceScreen } from '../../collected-products/[id]/components/ProductWorkspaceScreen';
import type { ProductWorkspaceData } from '../../collected-products/[id]/hooks/useProductDetail';
import {
  REGISTERED_PRODUCTS_ROOT,
  detailTemplateGenerationHref,
  registeredProductDetailHref,
} from '../../_shared/lib/product-pipeline-routes';
import {
  latestGenerationInput,
  registrationWorkspaceImageUrls,
  registrationWorkspaceTitle,
} from '../lib/registration-workspace-view';

export default function RegisteredWorkspaceDetailPage() {
  const params = useParams();
  const router = useRouter();
  const workspaceId = params.workspaceId as string;

  const { data: workspace, isLoading } = useQuery({
    queryKey: queryKeys.registrationWorkspaces.detail(workspaceId),
    queryFn: () => registrationWorkspacesApi.get(workspaceId),
    enabled: !!workspaceId,
  });

  const ownerlessWorkspaceData = useMemo(() => (
    workspace && !workspace.sourceCandidateId
      ? registrationWorkspaceToProductWorkspaceData(workspace)
      : null
  ), [workspace]);

  if (isLoading || !workspace) {
    return (
      <div className="flex h-full items-center justify-center bg-slate-50">
        <Loader2 size={28} className="animate-spin text-slate-400" />
      </div>
    );
  }

  const selfHref = registeredProductDetailHref(workspace.id);
  const title = registrationWorkspaceTitle(workspace);

  return (
    <ProductWorkspaceScreen
      productId={workspace.sourceCandidateId ?? workspace.id}
      backHref={REGISTERED_PRODUCTS_ROOT}
      selfHref={selfHref}
      initialWorkspaceData={ownerlessWorkspaceData ?? undefined}
      initialAgentHistory={registrationWorkspaceHistoryToGenerationHistory(workspace.history)}
      generationHistoryQueryEnabled={!!workspace.sourceCandidateId}
      showCandidateActions={!!workspace.sourceCandidateId}
      thumbnailSourceCandidateId={workspace.sourceCandidateId ?? null}
      onOpenDetailTemplateGeneration={
        workspace.sourceCandidateId
          ? undefined
          : () => router.push(detailTemplateGenerationHref({
            registrationWorkspaceId: workspace.id,
            title,
            returnTo: selfHref,
          }))
      }
    />
  );
}

function registrationWorkspaceToProductWorkspaceData(
  workspace: NonNullable<Awaited<ReturnType<typeof registrationWorkspacesApi.get>>>,
): ProductWorkspaceData {
  const title = registrationWorkspaceTitle(workspace);
  const imageUrls = registrationWorkspaceImageUrls(workspace);
  const input = latestGenerationInput(workspace);
  const rawCategory = typeof input.rawCategory === 'string' ? input.rawCategory : '';
  const product: ProductDetailResponse = {
    id: workspace.id,
    name: title,
    status: 'sourced',
    promotedMasterId: workspace.targetMasterId,
    promoted_master_id: workspace.targetMasterId,
    sourcePlatform: 'registration_workspace',
    source_platform: 'registration_workspace',
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
