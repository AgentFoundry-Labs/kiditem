'use client';

import { renderTemplateToHtml } from '@/lib/template-html';
import { type DetailPageData } from '@kiditem/templates';
import { useMemo } from 'react';

interface TemplateConfig {
  component: React.ComponentType<{ data: DetailPageData }>;
  fonts: string[];
  fontFamily: string;
}

interface StructuredPreviewPaneProps {
  draftData: DetailPageData | null;
  templateConfig: TemplateConfig | null;
  templateCss: string;
}

export function StructuredPreviewPane({ draftData, templateConfig, templateCss }: StructuredPreviewPaneProps) {
  const html = useMemo(() => {
    if (!draftData || !templateConfig) return null;
    return renderTemplateToHtml(templateConfig.component, draftData, templateConfig, templateCss);
  }, [draftData, templateConfig, templateCss]);

  if (!html) {
    return (
      <div className="w-full h-full flex items-center justify-center bg-gray-50">
        <p className="text-sm text-gray-400">프리뷰를 표시할 수 없습니다</p>
      </div>
    );
  }

  return (
    <iframe
      srcDoc={html}
      className="w-full h-full border-0"
      title="template-preview"
    />
  );
}
