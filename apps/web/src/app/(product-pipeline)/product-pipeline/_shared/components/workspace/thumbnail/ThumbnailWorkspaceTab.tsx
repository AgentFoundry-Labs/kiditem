'use client';

import { Suspense, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { productBoundThumbnailWorkspaceHref } from '../../../lib/product-pipeline-routes';
import { writeThumbnailEditorUpload } from '@/app/(product-pipeline)/product-pipeline/thumbnail-generation/edit/lib/upload-session';
import { ThumbnailEditorWorkspace } from '@/app/(product-pipeline)/product-pipeline/thumbnail-generation/edit/components/ThumbnailEditorWorkspace';
import { useSourcingThumbnailGenerations } from '../../../hooks/useGenerateSourcingThumbnail';
import type { ProductEditState } from '../../../lib/product-workspace-types';
import ProductThumbnailResults from './ProductThumbnailResults';
import ProductWingStatusPanel from './ProductWingStatusPanel';
import ThumbnailActionChooser from './ThumbnailActionChooser';
import ThumbnailSourcePicker from './ThumbnailSourcePicker';
import {
  buildThumbnailSourceOptions,
  classifyProductWingStatus,
  getGeneratedThumbnailOptions,
} from './thumbnail-workspace-state';

interface ThumbnailWorkspaceTabProps {
  editData: ProductEditState;
  productId: string;
  promotedMasterId: string | null;
  registrationWorkspaceId?: string | null;
  thumbnailSourceCandidateId?: string | null;
  selectedRegistrationThumbnailUrl: string | null;
  onSelectRegistrationThumbnail: (url: string | null) => void;
  onThumbnailsChange: (thumbnails: string[]) => void;
  thumbnailGenerationReturnHref: string;
}

export default function ThumbnailWorkspaceTab({
  editData,
  promotedMasterId,
  registrationWorkspaceId = null,
  thumbnailSourceCandidateId = null,
  selectedRegistrationThumbnailUrl,
  onSelectRegistrationThumbnail,
  onThumbnailsChange,
  thumbnailGenerationReturnHref,
}: ThumbnailWorkspaceTabProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const thumbnailMode = searchParams.get('thumbnailMode');
  const [selectedSourceUrl, setSelectedSourceUrl] = useState<string | null>(
    searchParams.get('imageUrl') ?? selectedRegistrationThumbnailUrl ?? editData.thumbnails[0] ?? null,
  );
  const thumbnailGenerations = useSourcingThumbnailGenerations({
    productId: promotedMasterId,
    sourceCandidateId: promotedMasterId ? null : thumbnailSourceCandidateId,
    registrationWorkspaceId,
  });
  const sourceOptions = useMemo(
    () => buildThumbnailSourceOptions({
      sourceImageUrls: editData.thumbnails,
      generations: thumbnailGenerations.data ?? [],
    }),
    [editData.thumbnails, thumbnailGenerations.data],
  );
  const resultOptions = useMemo(
    () => getGeneratedThumbnailOptions({
      sourceImageUrls: editData.thumbnails,
      generations: thumbnailGenerations.data ?? [],
    }),
    [editData.thumbnails, thumbnailGenerations.data],
  );
  const wingStatus = classifyProductWingStatus({
    hasRegistrationWorkspace: Boolean(registrationWorkspaceId),
    generations: thumbnailGenerations.data ?? [],
  });

  const openEditor = (mode: 'edit' | 'creative') => {
    if (!selectedSourceUrl) return;
    const shouldUseUploadKey =
      selectedSourceUrl.startsWith('data:') ||
      selectedSourceUrl.startsWith('blob:') ||
      selectedSourceUrl.length > 1500;
    const uploadKey = shouldUseUploadKey
      ? writeThumbnailEditorUpload(selectedSourceUrl, { productName: editData.name, mode })
      : null;
    const workspaceHref = productBoundThumbnailWorkspaceHref({
      productId: promotedMasterId,
      sourceCandidateId: promotedMasterId ? null : thumbnailSourceCandidateId,
      registrationWorkspaceId,
      returnTo: thumbnailGenerationReturnHref,
      imageUrl: uploadKey ? null : selectedSourceUrl,
      uploadKey,
      productName: editData.name,
      productDescription: editData.name,
      editCase: mode === 'edit' ? 'single' : null,
      mode,
    });
    if (workspaceHref) router.push(workspaceHref);
  };

  if (thumbnailMode === 'edit' || thumbnailMode === 'creative') {
    const backHref = productBoundThumbnailWorkspaceHref({
      productId: promotedMasterId,
      sourceCandidateId: promotedMasterId ? null : thumbnailSourceCandidateId,
      registrationWorkspaceId,
      returnTo: thumbnailGenerationReturnHref,
      productName: editData.name,
      productDescription: editData.name,
    }) ?? thumbnailGenerationReturnHref;
    return (
      <div className="p-5" data-testid="thumbnail-workspace-tab">
        <Suspense fallback={<div className="min-h-[720px] rounded-lg bg-slate-50" />}>
          <ThumbnailEditorWorkspace
            embedded
            onBack={() => router.push(backHref)}
          />
        </Suspense>
      </div>
    );
  }

  return (
    <div className="space-y-4 p-5" data-testid="thumbnail-workspace-tab">
      <ThumbnailSourcePicker
        options={sourceOptions}
        selectedUrl={selectedSourceUrl}
        onSelect={setSelectedSourceUrl}
        onAddImage={() => {
          const next = `https://placehold.co/400x400/e2e8f0/64748b?text=${encodeURIComponent(`상품 ${editData.thumbnails.length + 1}`)}`;
          onThumbnailsChange([...editData.thumbnails, next]);
          setSelectedSourceUrl(next);
        }}
      />
      <ThumbnailActionChooser
        selectedImageUrl={selectedSourceUrl}
        onOpenEdit={() => openEditor('edit')}
        onOpenCreative={() => openEditor('creative')}
      />
      <ProductThumbnailResults
        options={resultOptions}
        selectedRegistrationThumbnailUrl={selectedRegistrationThumbnailUrl}
        onSelectRegistrationThumbnail={onSelectRegistrationThumbnail}
      />
      <ProductWingStatusPanel status={wingStatus} />
    </div>
  );
}
