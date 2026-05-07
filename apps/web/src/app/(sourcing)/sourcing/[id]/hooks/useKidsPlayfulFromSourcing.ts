'use client';

/**
 * sourcing 의 ProductCard / ProductEditHeader 에서 "상세페이지 생성" → kids-playful 선택 시
 * 사용할 fire-and-forget 트리거.
 *
 * - product.raw_data 에서 1688 raw 필드 추출
 * - POST /api/ai/detail-page/generate 호출
 * - 모달 닫고 페이지 자유롭게 다닐 수 있음
 * - 생성 중에는 optimistic row 로 진행 상태를 보여주고, 완료 row 는 DB 이력에 저장
 */
import { useCallback } from 'react';
import { toast } from 'sonner';
import { isApiError } from '@/lib/api-error';
import { useKidsPlayfulGenerate } from '@/app/(media-ai)/generate/hooks/useKidsPlayfulGenerate';

function pickString(raw: Record<string, unknown> | null, keys: string[]): string {
  if (!raw) return '';
  for (const k of keys) {
    const v = raw[k];
    if (typeof v === 'string' && v.trim()) return v.trim();
  }
  return '';
}

function pickStringArray(raw: Record<string, unknown> | null, keys: string[]): string[] {
  if (!raw) return [];
  const urls: string[] = [];
  const normalize = (value: unknown): string | null => {
    if (typeof value === 'string') {
      const trimmed = value.trim();
      if (trimmed.startsWith('//')) return `https:${trimmed}`;
      if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) return trimmed;
      return null;
    }
    if (value && typeof value === 'object') {
      const obj = value as Record<string, unknown>;
      for (const key of ['url', 'src', 'imageUrl', 'image_url', 'fullPathImageURI', 'fullPathImageUrl']) {
        const url = normalize(obj[key]);
        if (url) return url;
      }
    }
    return null;
  };
  const visit = (value: unknown) => {
    if (Array.isArray(value)) {
      value.forEach(visit);
      return;
    }
    const url = normalize(value);
    if (url) urls.push(url);
  };
  keys.forEach((key) => visit(raw[key]));
  return [...new Set(urls)];
}

function flattenOptions(raw: Record<string, unknown> | null): string {
  if (!raw) return '';
  const candidates = ['options', 'specs', 'attributes', 'sku_props'];
  for (const k of candidates) {
    const v = raw[k];
    if (!v) continue;
    if (typeof v === 'string') return v;
    if (Array.isArray(v)) {
      return v
        .map((item) =>
          typeof item === 'string'
            ? item
            : item && typeof item === 'object'
              ? Object.entries(item)
                  .map(([k2, v2]) => `${k2}: ${v2}`)
                  .join(', ')
              : '',
        )
        .filter(Boolean)
        .join('; ');
    }
    if (typeof v === 'object') {
      return Object.entries(v as Record<string, unknown>)
        .map(([k2, v2]) => `${k2}: ${v2}`)
        .join(', ');
    }
  }
  return '';
}

interface TriggerInput {
  productId: string;
  productName: string;
  rawData: Record<string, unknown> | null;
  /** 'kids-playful' (default) 또는 'bold-vertical' */
  templateId?: string;
  imageUrls?: string[];
}

export function useKidsPlayfulFromSourcing() {
  const mutation = useKidsPlayfulGenerate();

  const trigger = useCallback(
    async ({ productId, productName, rawData, templateId, imageUrls: suppliedImageUrls }: TriggerInput) => {
      const rawTitle =
        pickString(rawData, ['title', 'name', 'productName', 'subject']) || productName;
      const rawCategory = pickString(rawData, ['category', 'categoryName', 'category_name']);
      const rawDescription = pickString(rawData, [
        'description',
        'desc',
        'productDesc',
        'detail_description',
      ]);
      const rawOptions = flattenOptions(rawData);
      const imageUrls = [
        ...(suppliedImageUrls ?? []),
        ...pickStringArray(rawData, [
          'images',
          'imageUrls',
          'image_urls',
          'mainImages',
          'main_images',
          'mainImage',
          'main_image',
          'offerImgList',
          'description_images',
          'detail_images',
          'thumbnails',
        ]),
      ].filter((url, index, arr) => url && arr.indexOf(url) === index);

      if (!rawTitle.trim() || imageUrls.length === 0) {
        toast.error('product raw_data 에 title 또는 images 가 없어 생성할 수 없어요.');
        return null;
      }

      try {
        const res = await mutation.mutateAsync({
          rawTitle,
          rawCategory: rawCategory || '완구',
          rawDescription,
          rawOptions,
          imageUrls,
          heroImageMode: 'llm-pick',
          productId,
          templateId: templateId ?? 'kids-playful',
        });
        toast.success('상세페이지 생성 완료 — 생성 이력에서 바로 확인할 수 있어요', {
          duration: 4000,
        });
        return res;
      } catch (err) {
        const detail = isApiError(err) ? err.detail : '상세페이지 생성 실패';
        toast.error(detail);
        return null;
      }
    },
    [mutation],
  );

  return { trigger, isPending: mutation.isPending };
}
