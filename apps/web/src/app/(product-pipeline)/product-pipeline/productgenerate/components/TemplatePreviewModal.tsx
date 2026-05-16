'use client';

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ComponentType,
} from 'react';
import { X } from 'lucide-react';
import {
  getTemplate,
  placeholderDetailPageData,
} from '@kiditem/templates';
import {
  SAME_ORIGIN_SCRIPTLESS_SANDBOX,
  stripSrcDocScripts,
} from '@/app/(product-pipeline)/product-pipeline/_shared/lib/preview-sandbox';
import { renderTemplateToHtml } from '@/app/(product-pipeline)/product-pipeline/_shared/lib/template-html';
import type { GenerateTemplateId } from '../../detail-template-generation/hooks/useGenerateForm';

interface TemplatePreviewModalProps {
  templateId: GenerateTemplateId;
  onClose: () => void;
}

export function TemplatePreviewModal({ templateId, onClose }: TemplatePreviewModalProps) {
  const [templateCss, setTemplateCss] = useState<string | null>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [iframeHeight, setIframeHeight] = useState(2400);
  const config = useMemo(() => {
    try {
      return getTemplate(templateId);
    } catch {
      return null;
    }
  }, [templateId]);

  useEffect(() => {
    let cancelled = false;
    fetch('/templates-styles.css', { cache: 'no-store' })
      .then((res) => (res.ok ? res.text() : ''))
      .then((css) => {
        if (!cancelled) setTemplateCss(css);
      })
      .catch(() => {
        if (!cancelled) setTemplateCss('');
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const html = useMemo(() => {
    if (!config || templateCss == null) return '';
    return renderTemplateToHtml(
      config.component as ComponentType<unknown>,
      placeholderDetailPageData,
      config,
      templateCss,
    );
  }, [config, templateCss]);
  const sandboxedHtml = useMemo(() => stripSrcDocScripts(html), [html]);

  useEffect(() => {
    const el = iframeRef.current;
    if (!el) return;
    const measure = () => {
      let doc: Document | null = null;
      try {
        doc = el.contentDocument;
      } catch {
        doc = null;
      }
      if (!doc) return;
      const height = Math.max(doc.documentElement.scrollHeight, doc.body.scrollHeight);
      if (height > 0) setIframeHeight(height);
    };
    el.addEventListener('load', measure);
    const first = setTimeout(measure, 1500);
    const second = setTimeout(measure, 3500);
    return () => {
      el.removeEventListener('load', measure);
      clearTimeout(first);
      clearTimeout(second);
    };
  }, [sandboxedHtml]);

  if (!config) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-2 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="relative flex h-[96vh] w-full max-w-[720px] flex-col overflow-hidden rounded-2xl bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex shrink-0 items-center justify-between border-b border-slate-200 bg-white px-6 py-3">
          <div>
            <h3 className="text-lg font-bold text-slate-900">{config.name}</h3>
            <p className="text-sm text-slate-500">{config.description}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
            aria-label="닫기"
          >
            <X size={20} />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto bg-white">
          {templateCss == null ? (
            <div className="flex h-full items-center justify-center text-sm font-semibold text-slate-400">
              템플릿 스타일을 불러오는 중입니다.
            </div>
          ) : (
            <iframe
              ref={iframeRef}
              srcDoc={sandboxedHtml}
              className="block w-full border-0 bg-white"
              style={{ height: `${iframeHeight}px` }}
              title={`${templateId}-preview-modal`}
              sandbox={SAME_ORIGIN_SCRIPTLESS_SANDBOX}
            />
          )}
        </div>
      </div>
    </div>
  );
}
