'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { toast } from 'sonner';
import type { RegistrationThumbnailOption } from '@/app/(product-pipeline)/product-pipeline/collected-products/lib/registration-selection';
import { prepareImageUploadFile } from '@/app/(product-pipeline)/product-pipeline/detail-template-generation/lib/image-whitespace-crop';
import { writeThumbnailEditorUpload } from '@/app/(product-pipeline)/product-pipeline/thumbnail-generation/edit/lib/upload-session';
import { apiClient } from '@/lib/api-client';
import { useSourcingThumbnailGenerations } from '../../../hooks/useGenerateSourcingThumbnail';
import { thumbnailGenerationEditHref } from '../../../lib/product-pipeline-routes';
import ProductThumbnailResults from './ProductThumbnailResults';
import ThumbnailSourcePicker from './ThumbnailSourcePicker';
import { buildThumbnailSourceOptions, getGeneratedThumbnailOptions } from './thumbnail-workspace-state';
import type { ProductEditState } from '../../../lib/product-workspace-types';

interface ThumbnailWorkspaceTabProps {
  editData: ProductEditState;
  contentWorkspaceId?: string | null;
  thumbnailUrl?: string | null;
  thumbnailSourceCandidateId?: string | null;
  selectedRegistrationThumbnailUrl: string | null;
  /** 실제로 저장된 대표 썸네일. `등록 대표` 배지의 유일한 근거다(폴백 없음). */
  savedRepresentativeThumbnailUrl?: string | null;
  thumbnailPreviewImages: string[];
  onPreviewThumbnail: (url: string | null) => void;
  onThumbnailPreviewImagesChange: (images: string[]) => void;
  onSaveThumbnailConfiguration: (input: {
    thumbnailUrls: string[];
    selectedThumbnail: RegistrationThumbnailOption | null;
  }) => Promise<void> | void;
  thumbnailGenerationReturnHref: string;
  canSaveConfiguration?: boolean;
}

export default function ThumbnailWorkspaceTab({
  editData,
  contentWorkspaceId = null,
  thumbnailUrl = null,
  thumbnailSourceCandidateId = null,
  selectedRegistrationThumbnailUrl,
  savedRepresentativeThumbnailUrl = null,
  thumbnailPreviewImages,
  onPreviewThumbnail,
  onThumbnailPreviewImagesChange,
  onSaveThumbnailConfiguration,
  thumbnailGenerationReturnHref,
  canSaveConfiguration = true,
}: ThumbnailWorkspaceTabProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const didSeedPreviewImages = useRef(false);
  /**
   * 저장된 대표를 편집 선택으로 한 번 끌어왔거나, 사용자가 직접 골랐으면 더는 건드리지 않는다.
   *
   * `selectedSourceUrl` 의 useState 초기값은 마운트 시점에 확정되는데, 그때는 부모가 아직
   * 서버 값을 채우기 전이라 후보의 첫 이미지로 잡힌다. 그 상태로 두면 **재진입 후 대표
   * 패널이 저장된 대표가 아닌 엉뚱한 이미지를 보여주고**, 저장 버튼이 그걸 그대로 새 대표로
   * 덮어쓴다(= 사용자가 저장한 대표가 조용히 바뀐다).
   */
  const didAdoptSavedRepresentative = useRef(false);
  const [uploadingCount, setUploadingCount] = useState(0);
  const [selectedSourceUrl, setSelectedSourceUrl] = useState<string | null>(
    searchParams.get('imageUrl') ??
      selectedRegistrationThumbnailUrl ??
      thumbnailPreviewImages[0] ??
      thumbnailUrl ??
      editData.thumbnails[0] ??
      null,
  );
  const thumbnailGenerations = useSourcingThumbnailGenerations({
    sourceCandidateId: thumbnailSourceCandidateId,
    contentWorkspaceId,
  });
  const sourceOptions = useMemo(
    () =>
      buildThumbnailSourceOptions({
        sourceImageUrls: editData.thumbnails,
        generations: thumbnailGenerations.data ?? [],
      }),
    [editData.thumbnails, thumbnailGenerations.data],
  );
  const resultOptions = useMemo(
    () =>
      getGeneratedThumbnailOptions({
        sourceImageUrls: editData.thumbnails,
        generations: thumbnailGenerations.data ?? [],
      }),
    [editData.thumbnails, thumbnailGenerations.data],
  );
  const fallbackPreviewImages = useMemo(
    () => uniqueNonEmpty([selectedRegistrationThumbnailUrl, thumbnailUrl, editData.thumbnails[0]]),
    [editData.thumbnails, selectedRegistrationThumbnailUrl, thumbnailUrl],
  );
  const availableSourceOptions = useMemo(
    () => uniqueOptions([...sourceOptions, ...resultOptions]),
    [resultOptions, sourceOptions],
  );
  const sourceOptionMap = useMemo(() => {
    const map = new Map<string, RegistrationThumbnailOption>();
    for (const option of sourceOptions) {
      map.set(option.url, option);
    }
    for (const option of resultOptions) {
      map.set(option.url, option);
    }
    return map;
  }, [resultOptions, sourceOptions]);

  useEffect(() => {
    if (didSeedPreviewImages.current || thumbnailPreviewImages.length > 0) return;
    if (fallbackPreviewImages.length === 0) return;
    didSeedPreviewImages.current = true;
    onThumbnailPreviewImagesChange(fallbackPreviewImages);
  }, [fallbackPreviewImages, onThumbnailPreviewImagesChange, thumbnailPreviewImages.length]);

  useEffect(() => {
    if (selectedSourceUrl) return;
    const fallbackUrl = thumbnailPreviewImages[0] ?? fallbackPreviewImages[0] ?? null;
    if (fallbackUrl) setSelectedSourceUrl(fallbackUrl);
  }, [fallbackPreviewImages, selectedSourceUrl, thumbnailPreviewImages]);

  // 서버가 준 저장된 대표가 도착하면 편집 선택을 거기에 한 번 맞춘다.
  // 편집기에서 `imageUrl` 을 들고 돌아온 경우는 그쪽이 이긴다 — 방금 만든 이미지다.
  useEffect(() => {
    if (didAdoptSavedRepresentative.current) return;
    if (!savedRepresentativeThumbnailUrl) return;
    didAdoptSavedRepresentative.current = true;
    if (searchParams.get('imageUrl')) return;
    setSelectedSourceUrl(savedRepresentativeThumbnailUrl);
  }, [savedRepresentativeThumbnailUrl, searchParams]);

  useEffect(() => {
    onPreviewThumbnail(selectedSourceUrl);
  }, [onPreviewThumbnail, selectedSourceUrl]);

  const openEditor = (mode: 'edit' | 'creative', sourceUrl = selectedSourceUrl) => {
    if (!sourceUrl) return;
    const shouldUseUploadKey =
      sourceUrl.startsWith('data:') || sourceUrl.startsWith('blob:') || sourceUrl.length > 1500;
    const uploadKey = shouldUseUploadKey
      ? writeThumbnailEditorUpload(sourceUrl, {
          productName: editData.name,
          mode,
        })
      : null;
    const workspaceHref = thumbnailGenerationEditHref({
      mode,
      editCase: mode === 'edit' ? 'single' : null,
      returnTo: thumbnailGenerationReturnHref,
      imageUrl: uploadKey ? null : sourceUrl,
      productName: editData.name,
      productDescription: editData.name,
      extraParams: {
        uploadKey,
        sourceCandidateId: thumbnailSourceCandidateId,
        contentWorkspaceId,
        fullPage: '1',
      },
    });
    router.push(workspaceHref);
  };

  const uploadThumbnailSourceImage = async (file: File): Promise<string> => {
    const uploadFile = await prepareImageUploadFile(file).catch((err) => {
      console.warn('[thumbnail-workspace] upload image preparation failed, using original', err);
      return file;
    });
    const formData = new FormData();
    formData.append('file', uploadFile);
    const result = await apiClient.upload<{ url: string }>('/api/ai/detail-page/images', formData);
    return result.url;
  };

  const handleUploadImages = async (files: File[]) => {
    if (files.length === 0) return;
    setUploadingCount(files.length);
    try {
      const results = await Promise.allSettled(files.map(uploadThumbnailSourceImage));
      const uploaded = results.flatMap((result) => (result.status === 'fulfilled' ? [result.value] : []));
      const failedCount = results.length - uploaded.length;
      if (uploaded.length > 0) {
        const next = uniqueNonEmpty([...thumbnailPreviewImages, ...uploaded]);
        onThumbnailPreviewImagesChange(next);
        setSelectedSourceUrl(uploaded[0] ?? selectedSourceUrl);
        toast.success(`${uploaded.length}장 업로드 완료`);
      }
      if (failedCount > 0) {
        toast.error(`${failedCount}장 업로드에 실패했습니다.`);
      }
    } finally {
      setUploadingCount(0);
    }
  };

  const handleAddImages = (urls: string[]) => {
    const next = uniqueNonEmpty([...thumbnailPreviewImages, ...urls]);
    onThumbnailPreviewImagesChange(next);
    if (urls[0]) {
      setSelectedSourceUrl(urls[0]);
    }
  };

  const handleRemovePreviewImage = (url: string) => {
    const next = thumbnailPreviewImages.filter((candidateUrl) => candidateUrl !== url);
    onThumbnailPreviewImagesChange(next);
    if (selectedSourceUrl !== url) return;
    const fallbackUrl = next[0] ?? null;
    setSelectedSourceUrl(fallbackUrl);
  };

  const optionForUrl = (url: string): RegistrationThumbnailOption =>
    sourceOptionMap.get(url) ??
    ({
      url,
      kind: 'source',
      generatedGenerationId: null,
      generatedCandidateId: null,
    } satisfies RegistrationThumbnailOption);

  /**
   * 대표 썸네일과 미리보기 목록을 **한 번에** 저장한다.
   *
   * 예전에는 `대표 썸네일 등록` 과 `썸네일 구성 저장` 이 따로 있어서 하나만 누르면
   * 반쪽만 저장됐다(대표만 남고 목록은 사라지는 상태가 실제로 발생했다).
   * 선택된 이미지를 대표 자리로 끌어올린 목록을 그대로 저장한다.
   */
  const handleSaveConfiguration = () => {
    const saveUrl = selectedSourceUrl ?? thumbnailPreviewImages[0] ?? null;
    if (!saveUrl) {
      onSaveThumbnailConfiguration({
        thumbnailUrls: thumbnailPreviewImages,
        selectedThumbnail: null,
      });
      return;
    }
    const nextThumbnailUrls = uniqueNonEmpty([saveUrl, ...thumbnailPreviewImages.filter((url) => url !== saveUrl)]);
    onThumbnailPreviewImagesChange(nextThumbnailUrls);
    onSaveThumbnailConfiguration({
      thumbnailUrls: nextThumbnailUrls,
      selectedThumbnail: optionForUrl(saveUrl),
    });
  };

  return (
    <div className="space-y-3 p-5" data-testid="thumbnail-workspace-tab">
      <ThumbnailSourcePicker
        thumbnailUrls={thumbnailPreviewImages}
        availableOptions={availableSourceOptions}
        selectedUrl={selectedSourceUrl}
        savedRepresentativeUrl={savedRepresentativeThumbnailUrl}
        onSelect={(url) => {
          // 사용자가 직접 고른 순간부터 저장된 대표를 다시 끌어오지 않는다.
          didAdoptSavedRepresentative.current = true;
          setSelectedSourceUrl(url);
        }}
        onEditSelectedImage={() => openEditor('edit')}
        onSaveConfiguration={handleSaveConfiguration}
        canSaveConfiguration={canSaveConfiguration}
        onAddImages={handleAddImages}
        onRemoveImage={handleRemovePreviewImage}
        onReorderImages={onThumbnailPreviewImagesChange}
        onUploadImages={handleUploadImages}
        uploadingCount={uploadingCount}
      />
      <ProductThumbnailResults
        options={resultOptions}
        previewImageUrls={thumbnailPreviewImages}
        onPreviewThumbnail={onPreviewThumbnail}
        onAddToPreviewImages={(url) => handleAddImages([url])}
        onEditThumbnail={(url) => {
          setSelectedSourceUrl(url);
          openEditor('edit', url);
        }}
      />
    </div>
  );
}

function uniqueNonEmpty(values: Array<string | null | undefined>): string[] {
  return Array.from(new Set(values.map((value) => value?.trim()).filter(Boolean) as string[]));
}

function uniqueOptions(options: RegistrationThumbnailOption[]): RegistrationThumbnailOption[] {
  const seen = new Set<string>();
  return options.filter((option) => {
    const key = option.url.trim();
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
