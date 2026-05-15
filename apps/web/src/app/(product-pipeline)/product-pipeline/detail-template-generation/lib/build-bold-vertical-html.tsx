/**
 * BoldVertical generation output → sourcing AI 와 같은 BoldVertical 템플릿 HTML.
 */
import type { ComponentType } from 'react';
import { getTemplate, parseDetailPageData } from '@kiditem/templates';
import type { DetailPageData } from '@kiditem/templates';
import { renderTemplateToHtml } from '@/app/(product-pipeline)/product-pipeline/_shared/lib/template-html';

export function buildBoldVerticalHtml(
  partial: Partial<DetailPageData>,
  templateCss = '',
): string {
  const data = parseDetailPageData(partial);
  const config = getTemplate('bold-vertical');
  return renderTemplateToHtml(
    config.component as ComponentType<unknown>,
    data,
    config,
    templateCss,
  );
}
