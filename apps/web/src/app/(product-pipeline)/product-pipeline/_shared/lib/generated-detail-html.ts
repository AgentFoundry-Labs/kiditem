'use client';

import type { ComponentType } from 'react';
import {
  getTemplate,
  parseDetailPageData,
} from '@kiditem/templates';
import { API_BASE } from '@/lib/api';
import {
  rowToRendererData,
  type KidsPlayfulGenerationItem,
} from '@/app/(product-pipeline)/product-pipeline/detail-template-generation/hooks/useKidsPlayfulGenerate';
import { buildKidsPlayfulHtml } from '@/app/(product-pipeline)/product-pipeline/detail-template-generation/lib/build-kids-playful-html';
import {
  adaptBoldVerticalToDetailPageData,
  type BoldVerticalGeneration,
} from '@/app/(product-pipeline)/product-pipeline/detail-template-generation/lib/bold-vertical-types';
import { renderTemplateToHtml } from '@/app/(product-pipeline)/product-pipeline/_shared/lib/template-html';
import type { GenerationHistoryItem } from '../hooks/useGenerationHistory';

export function generatedDetailTemplateLabel(item: Pick<GenerationHistoryItem, 'templateId'>): string {
  if (item.templateId === 'bold-vertical') return 'KIDITEM DESIGN';
  if (item.templateId === 'kids-playful') return '트렌드 광고형 템플릿';
  return 'AGENT';
}

export function buildGenerationHistoryHtml(
  item: GenerationHistoryItem,
  templateCss: string,
): string {
  if (!item.detailPageData) {
    throw new Error('선택한 이력에 상세페이지 데이터가 없습니다.');
  }

  if (item.templateId === 'bold-vertical') {
    const adapted = adaptBoldVerticalToDetailPageData(
      item.detailPageData as unknown as BoldVerticalGeneration,
      item.imageUrls,
      item.processedImages,
      API_BASE,
    );
    const data = parseDetailPageData(adapted);
    const config = getTemplate('bold-vertical');
    return renderTemplateToHtml(
      config.component as ComponentType<unknown>,
      data,
      config,
      templateCss,
    );
  }

  if (item.templateId === 'kids-playful') {
    return buildKidsPlayfulHtml(rowToRendererData(toKidsPlayfulGenerationItem(item)));
  }

  const data = parseDetailPageData(item.detailPageData);
  const config = getTemplate('bold-vertical');
  return renderTemplateToHtml(
    config.component as ComponentType<unknown>,
    data,
    config,
    templateCss,
  );
}

function toKidsPlayfulGenerationItem(item: GenerationHistoryItem): KidsPlayfulGenerationItem {
  return {
    id: item.id,
    productId: item.productId,
    templateId: item.templateId ?? 'kids-playful',
    productName: item.generatedTitle ?? '상세페이지',
    rawInput: {},
    result: item.detailPageData as unknown as KidsPlayfulGenerationItem['result'],
    imageUrls: item.imageUrls,
    processedImages: item.processedImages,
    imageProcessingStatus: item.status.toLowerCase(),
    imageProcessingError: item.errorMessage,
    createdAt: item.createdAt,
  };
}
