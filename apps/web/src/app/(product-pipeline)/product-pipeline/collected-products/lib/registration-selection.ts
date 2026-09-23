import type { ContentAssetItem } from '@kiditem/shared/product-content';

/**
 * 등록용 대표 썸네일 후보 한 장(KID-313 W3a). 작업공간의 콘텐츠 자산(업로드 · AI 후보)이면 `assetId` 가 있고,
 * 채택(`PATCH current-thumbnail {assetId}`)은 그 id 로 한다. 자산이 아닌 원천 사진은 갤러리에 저장한 뒤 채택한다.
 */
export interface RegistrationThumbnailOption {
  url: string;
  kind: 'source' | 'generated';
  assetId: string | null;
  /** AI 후보이면 그 job id. */
  generatedGenerationId: string | null;
}

export function buildRegistrationThumbnailOptions(input: {
  sourceImageUrls: string[];
  galleryAssets: readonly ContentAssetItem[];
}): RegistrationThumbnailOption[] {
  const seen = new Set<string>();
  const options: RegistrationThumbnailOption[] = [];
  const assetByUrl = new Map<string, ContentAssetItem>();
  for (const asset of input.galleryAssets) {
    const url = normalizeDisplayUrl(asset.url);
    if (url && !assetByUrl.has(url)) assetByUrl.set(url, asset);
  }
  const push = (url: string | null, asset: ContentAssetItem | undefined) => {
    if (!url || seen.has(url)) return;
    seen.add(url);
    const generated = asset?.source === 'ai';
    options.push({
      url,
      kind: generated ? 'generated' : 'source',
      assetId: asset?.id ?? null,
      generatedGenerationId: generated ? asset?.thumbnailGenerationId ?? null : null,
    });
  };

  for (const raw of input.sourceImageUrls) {
    const url = normalizeDisplayUrl(raw);
    push(url, url ? assetByUrl.get(url) : undefined);
  }
  for (const asset of input.galleryAssets) {
    if (asset.source === 'ai') continue;
    push(normalizeDisplayUrl(asset.url), asset);
  }
  for (const asset of input.galleryAssets) {
    if (asset.source !== 'ai') continue;
    push(normalizeDisplayUrl(asset.url), asset);
  }
  return options;
}

function normalizeDisplayUrl(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}
