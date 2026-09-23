/**
 * 대표이미지 생성 job 의 입력은 `thumbnail_generations.input_meta` 한 JSON 에 산다(KID-313 W3a). 옛 입력 사진 ·
 * 원본 URL · 편집 분석 열/표는 없다. 재편집은 여기서 입력 사진을 다시 읽는다.
 */

export interface ThumbnailJobInputImage {
  url: string;
  storageKey: string | null;
  role: string;
  label: string;
  sortOrder: number;
  source: string;
  /** 소싱 원본 사진 id(출처 기록, FK 없음). */
  sourceRecordImageId: string | null;
}

export interface ThumbnailJobInputs {
  originalUrl: string | null;
  editAnalysis: Record<string, unknown> | null;
  inputImages: ThumbnailJobInputImage[];
}

/** 호출자가 넘기는 입력 사진(편집기 모델). 출처 이름은 저장할 때 정규화한다. */
export interface ThumbnailJobInputImageSource {
  url: string;
  storageKey: string | null;
  role: string;
  label: string;
  sortOrder: number;
  source: string;
  candidateImageId?: string | null;
  sourceRecordImageId?: string | null;
}

export function withThumbnailJobInputs(
  meta: Record<string, unknown> | null | undefined,
  inputs: {
    originalUrl: string | null;
    editAnalysis: Record<string, unknown> | null;
    inputImages: readonly ThumbnailJobInputImageSource[];
  },
): Record<string, unknown> {
  return {
    ...(meta ?? {}),
    originalUrl: inputs.originalUrl,
    editAnalysis: inputs.editAnalysis,
    inputImages: inputs.inputImages
      .map((image) => ({
        url: image.url,
        storageKey: image.storageKey,
        role: image.role,
        label: image.label,
        sortOrder: image.sortOrder,
        source: normalizeInputSource(image.source),
        sourceRecordImageId: image.sourceRecordImageId ?? image.candidateImageId ?? null,
      }))
      .sort((a, b) => a.sortOrder - b.sortOrder),
  };
}

export function readThumbnailJobInputs(meta: unknown): ThumbnailJobInputs {
  const record = asRecord(meta);
  if (!record) return { originalUrl: null, editAnalysis: null, inputImages: [] };
  const images = Array.isArray(record.inputImages) ? record.inputImages : [];
  return {
    originalUrl: typeof record.originalUrl === 'string' ? record.originalUrl : null,
    editAnalysis: asRecord(record.editAnalysis),
    inputImages: images
      .flatMap((raw): ThumbnailJobInputImage[] => {
        const image = asRecord(raw);
        if (!image || typeof image.url !== 'string' || !image.url) return [];
        return [{
          url: image.url,
          storageKey: typeof image.storageKey === 'string' ? image.storageKey : null,
          role: typeof image.role === 'string' ? image.role : 'product',
          label: typeof image.label === 'string' ? image.label : 'Product photo',
          sortOrder: typeof image.sortOrder === 'number' ? image.sortOrder : 0,
          source: normalizeInputSource(typeof image.source === 'string' ? image.source : null),
          sourceRecordImageId: typeof image.sourceRecordImageId === 'string' ? image.sourceRecordImageId : null,
        }];
      })
      .sort((a, b) => a.sortOrder - b.sortOrder),
  };
}

function normalizeInputSource(source: string | null | undefined): string {
  if (source === 'other-product') return 'other_product';
  if (source === 'prev-gen' || source === 're-edit') return 'prev_gen';
  if (source === 'workspace_image' || source === 'master_image') return 'hub';
  return source ?? 'upload';
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
}
