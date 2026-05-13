'use client';

import type { ReactNode } from 'react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import GjsEditor, {
  AssetsProvider,
  BlocksProvider,
  Canvas,
  LayersProvider,
  useEditor,
  WithEditor,
} from '@grapesjs/react';
import grapesjs, { type Editor } from 'grapesjs';
import {
  AlignLeft,
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  Circle,
  Download,
  Eye,
  EyeOff,
  Files,
  Heading1,
  Heading2,
  Image as ImageIcon,
  ImagePlus,
  Layout,
  Loader2,
  Palette,

  Minus,
  MousePointer2,
  PanelLeft,
  PanelRight,
  Redo2,
  Save,
  Sparkles,
  Square,
  Trash2,
  Type,
  Undo2,
  Wand2,
  X,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import { toast } from 'sonner';
import { API_BASE } from '@/lib/api';
import { apiClient } from '@/lib/api-client';
import { getImageDownloadFetchInit } from '@/lib/browser-download';
import { cn } from '@/lib/utils';
import { useStore } from '@/store/useStore';
import 'grapesjs/dist/css/grapes.min.css';
import './grapesjs-editor.css';
import { buildSizeGuideFrameHtml } from '../../../lib/size-guide-frame';
import { AITextEditPanel } from './AITextEditPanel';
import EditorDetailMinimap from './EditorDetailMinimap';
import EditorPagePanel from './EditorPagePanel';
import EditorToolRail, { type EditorToolId } from './EditorToolRail';
import { ImagePickerModal } from './ImagePickerModal';
import { ImageSelectionPanel } from './ImageSelectionPanel';
import { extractEditedImageUrl } from '../lib/image-edit-result';
import {
  buildTemplateSectionBlockHtml,
  TEMPLATE_SECTION_PRESETS,
} from './template-section-blocks';

interface DetailPageEditorProps {
  html: string;
  templateCss: string;
  productName: string;
  productId?: string;
  rawImages?: string[];
  processedImages?: string[];
  onSave: (html: string) => Promise<void> | void;
  onClose: () => void;
}

interface ParsedHtml {
  headHtml: string;
  bodyHtml: string;
  bodyAttrs: string;
  viewportContent: string;
  viewportWidth: number;
  scriptUrls: string[];
  stylesheetUrls: string[];
  inlineStyles: string[];
  inlineScripts: string[];
}

const CANVAS_CSS = `
  html, body {
    overflow-y: auto !important;
  }
  *, html, body {
    scrollbar-width: none !important;
    -ms-overflow-style: none !important;
  }
  *::-webkit-scrollbar {
    display: none !important;
  }
  .gjs-selected {
    outline: 2px solid rgba(16, 185, 129, 0.85) !important;
    outline-offset: -1px;
  }
  .gjs-selected-parent {
    outline: 1px solid rgba(167, 243, 208, 0.5) !important;
  }
  .gjs-hovered {
    outline: 1px dashed rgba(16, 185, 129, 0.5) !important;
    outline-offset: -1px;
  }
  .gjs-dashed *[data-gjs-highlightable] {
    outline: 1px dashed rgba(16, 185, 129, 0.25);
    outline-offset: -1px;
  }
`;

const GJS_THEME_CSS = `
  .gjs-cv-canvas,
  .gjs-cv-canvas *,
  .gjs-frame-wrapper,
  .gjs-frame-wrapper * {
    scrollbar-width: none !important;
  }
  .gjs-cv-canvas::-webkit-scrollbar,
  .gjs-cv-canvas *::-webkit-scrollbar,
  .gjs-frame-wrapper::-webkit-scrollbar,
  .gjs-frame-wrapper *::-webkit-scrollbar {
    display: none !important;
  }

  .gjs-one-bg { background-color: transparent !important; }
  .gjs-two-color { color: #374151 !important; }
  .gjs-three-bg { background-color: #f9fafb !important; }
  .gjs-four-color, .gjs-four-color-h:hover { color: #10b981 !important; }

  .gjs-field {
    background-color: white !important;
    border: 1px solid #e5e7eb !important;
    border-radius: 6px !important;
    color: #374151 !important;
    box-shadow: none !important;
  }
  .gjs-field input, .gjs-field select { color: #374151 !important; }

  .gjs-layers { background: transparent !important; }
  .gjs-layer { background: transparent !important; }
  .gjs-layer.gjs-selected .gjs-layer-name { color: #059669 !important; }
  .gjs-layer-title { background: transparent !important; border-bottom: 1px solid #f3f4f6 !important; }
  .gjs-layer-title-inn { color: #374151 !important; }
  .gjs-layer-name { color: #4b5563 !important; font-size: 12px !important; }
  .gjs-layer-count { color: #9ca3af !important; }
  .gjs-layer-vis { color: #9ca3af !important; }
  .gjs-layer-caret { border-left-color: #9ca3af !important; }

  .gjs-sm-sectors { background: transparent !important; }
  .gjs-sm-sector { border-bottom: 1px solid #e5e7eb !important; }
  .gjs-sm-sector-title {
    background-color: #f9fafb !important;
    color: #374151 !important;
    border-bottom: 1px solid #e5e7eb !important;
  }
  .gjs-sm-sector-caret { border-left-color: #6b7280 !important; }
  .gjs-sm-label { color: #6b7280 !important; font-size: 11px !important; }
  .gjs-sm-property { color: #374151 !important; }
  .gjs-sm-composite .gjs-sm-label { color: #9ca3af !important; }

  .gjs-trt-traits { background: transparent !important; }
  .gjs-trt-trait { border-bottom: 1px solid #f3f4f6 !important; padding: 5px 0 !important; }
  .gjs-trt-trait .gjs-label { color: #6b7280 !important; font-size: 11px !important; }

  .gjs-btn-prim {
    background-color: #10b981 !important;
    color: white !important;
    border-radius: 6px !important;
  }
  .gjs-btn-prim:hover { background-color: #059669 !important; }

  .gjs-radio-item input:checked + .gjs-radio-item-label {
    background-color: #10b981 !important;
    color: white !important;
  }

  .gjs-field-color-picker { border-radius: 4px !important; }

  .gjs-rte-toolbar {
    background-color: white !important;
    border: 1px solid #e5e7eb !important;
    border-radius: 8px !important;
    padding: 4px 6px !important;
    box-shadow: 0 2px 8px rgba(0,0,0,0.12) !important;
  }
  .gjs-rte-toolbar .gjs-rte-btn {
    color: #374151 !important;
    border-radius: 4px !important;
  }
  .gjs-rte-toolbar .gjs-rte-btn:hover {
    background-color: #f3f4f6 !important;
  }
  .gjs-rte-toolbar .gjs-rte-active {
    background-color: #ecfdf5 !important;
    color: #059669 !important;
  }

  .gjs-editor-cont ::-webkit-scrollbar { width: 5px; height: 5px; }
  .gjs-editor-cont ::-webkit-scrollbar-track { background: transparent; }
  .gjs-editor-cont ::-webkit-scrollbar-thumb { background: #d1d5db; border-radius: 3px; }
`;

const GRAPESJS_OPTIONS: Parameters<typeof GjsEditor>[0]['options'] = {
  storageManager: false,
  blockManager: {
    blocks: [
      {
        id: 'heading1',
        label: 'H1 제목',
        category: '기본',
        content: '<h1 style="font-size:32px;font-weight:bold;padding:10px;">제목을 입력하세요</h1>',
      },
      {
        id: 'heading2',
        label: 'H2 부제목',
        category: '기본',
        content: '<h2 style="font-size:24px;font-weight:bold;padding:10px;">부제목을 입력하세요</h2>',
      },
      {
        id: 'text-block',
        label: '본문',
        category: '기본',
        content: '<p style="font-size:16px;line-height:1.6;padding:10px;">본문 텍스트를 입력하세요.</p>',
      },
      {
        id: 'rectangle',
        label: '사각형',
        category: '도형',
        content: '<div style="width:200px;height:150px;border:2px solid #d1d5db;"></div>',
      },
      {
        id: 'circle-shape',
        label: '원형',
        category: '도형',
        content: '<div style="width:150px;height:150px;border-radius:50%;border:2px solid #d1d5db;"></div>',
      },
      {
        id: 'image',
        label: '이미지',
        category: '기본',
        // display:block + margin auto 로 가운데 정렬. 이전엔 default img (inline) 라
        // canvas 의 좌측에 쏠려 보이던 문제 (사용자: "왼쪽이 쏠려있더라").
        content: {
          type: 'image',
          style: {
            display: 'block',
            'margin-left': 'auto',
            'margin-right': 'auto',
            width: '100%',
            'max-width': '600px',
            padding: '10px',
          },
        },
      },
      {
        id: 'line',
        label: '선',
        category: '도형',
        content: '<hr style="border:none;border-top:2px solid #d1d5db;width:100%;" />',
      },
    ],
  },
  panels: { defaults: [] },
  styleManager: {
    sectors: [
      {
        name: '레이아웃',
        open: true,
        properties: ['display', 'width', 'height', 'min-height', 'padding', 'margin'],
      },
      {
        name: '타이포그래피',
        open: false,
        properties: ['font-family', 'font-size', 'font-weight', 'color', 'line-height', 'text-align'],
      },
      {
        name: '배경',
        open: false,
        properties: ['background-color', 'background-image', 'background-size', 'background-position'],
      },
      {
        name: '테두리',
        open: false,
        properties: ['border', 'border-radius', 'box-shadow'],
      },
      {
        name: '효과',
        open: false,
        properties: ['opacity', 'transform'],
      },
    ],
  },
  selectorManager: { componentFirst: true },
  noticeOnUnload: false,
  avoidInlineStyle: true,
  canvasCss: CANVAS_CSS,
  undoManager: { maximumStackLength: 50 },
  deviceManager: {
    devices: [
      { id: 'detail-640', name: '상세페이지 640', width: '640px' },
      { id: 'detail-720', name: '상세페이지 720', width: '720px' },
      { id: 'detail-860', name: '상세페이지 860', width: '860px' },
    ],
  },
};

function inferViewportWidth(source: string, viewportContent: string): number {
  if (/\bmax-w-\[720px\]\b|찐 사용 후기|KeyPoint/i.test(source)) return 720;
  const match = viewportContent.match(/width\s*=\s*(\d+)/i);
  if (match) return Number(match[1]);
  return 860;
}

function serializeAttrs(el: Element): string {
  return Array.from(el.attributes)
    .filter((attr) => !(attr.name === 'id' && /^i[\w-]+$/.test(attr.value)))
    .map((attr) => `${attr.name}="${attr.value.replace(/"/g, '&quot;')}"`)
    .join(' ');
}

function sanitizeEditorCss(css: string): string {
  return css
    .replace(/#[\w-]+\{background-color:#ffffff;min-height:\d+px;\}/g, '')
    .replace(/#[\w-]+\{min-height:\d+px;background-color:#ffffff;\}/g, '')
    .trim();
}

const API_BASE_ROOT = API_BASE.replace(/\/$/, '');

function getWebOrigin(): string {
  if (typeof window === 'undefined') return '';
  return window.location.origin;
}

function absolutizeFontUrls(css: string): string {
  const webOrigin = getWebOrigin();
  if (!webOrigin) return css;
  return css.replace(/url\(\s*(['"]?)\/fonts\//g, `url($1${webOrigin}/fonts/`);
}

function toApiAssetUrl(value: string): string {
  const url = value.trim();
  if (!url || /^(?:[a-z][a-z\d+.-]*:|\/\/)/i.test(url)) return value;
  if (/^\/(?:processed|uploads|api)\//i.test(url)) return `${API_BASE_ROOT}${url}`;
  return value;
}

function normalizeElementUrl(el: Element, attr: string): void {
  const value = el.getAttribute(attr);
  if (!value) return;
  el.setAttribute(attr, toApiAssetUrl(value));
}

function normalizeBodyAssetUrls(doc: Document): void {
  doc.body.querySelectorAll('img[src], source[src], video[src]').forEach((el) => {
    normalizeElementUrl(el, 'src');
  });
  doc.body.querySelectorAll('img[srcset], source[srcset]').forEach((el) => {
    normalizeElementUrl(el, 'srcset');
  });
  doc.body.querySelectorAll('video[poster]').forEach((el) => {
    normalizeElementUrl(el, 'poster');
  });
}

function sanitizePersistedHead(headHtml: string, viewportContent: string): string {
  const doc = new DOMParser().parseFromString(`<head>${headHtml}</head>`, 'text/html');
  const head = doc.head;
  const hasCompiledTemplateStyles = Array.from(head.querySelectorAll('style')).some((style) =>
    /tailwindcss v|NanumSquareRoundLocal|--font-display/i.test(style.textContent ?? ''),
  );

  head.querySelectorAll('meta[charset], base, meta[name="viewport"]').forEach((el) => el.remove());
  head.insertAdjacentHTML(
    'afterbegin',
    `<meta charset="UTF-8" />
<meta name="viewport" content="${viewportContent.replace(/"/g, '&quot;')}" />`,
  );

  const seenScripts = new Set<string>();
  head.querySelectorAll('script[src]').forEach((script) => {
    const src = script.getAttribute('src');
    if (!src) return;
    if (hasCompiledTemplateStyles && /cdn\.tailwindcss\.com/i.test(src)) {
      script.remove();
      return;
    }
    if (seenScripts.has(src)) {
      script.remove();
      return;
    }
    seenScripts.add(src);
  });

  const seenStylesheets = new Set<string>();
  head.querySelectorAll('link[rel="stylesheet"]').forEach((link) => {
    const href = link.getAttribute('href');
    if (!href) return;
    const isLegacyDisplayFont =
      hasCompiledTemplateStyles && /Black\+Han\+Sans|Black\s*Han\s*Sans/i.test(href);
    if (isLegacyDisplayFont || seenStylesheets.has(href)) {
      link.remove();
      return;
    }
    seenStylesheets.add(href);
  });

  const seenStyleText = new Set<string>();
  head.querySelectorAll('style').forEach((style) => {
    const text = style.textContent ?? '';
    const isEditorWrapperStyle = /#[\w-]+\{[^}]*min-height:\d+px[^}]*\}/.test(text);
    const isEditorCanvasStyle =
      /\.gjs-|\.gjs-selected|\.gjs-hovered|scrollbar-width:\s*none/i.test(text);
    const isLegacyEditedHtmlFallbackStyle =
      hasCompiledTemplateStyles &&
      (text.includes('section[class*="from-[#1a1a1a]"]') ||
        text.includes('relative > img.h-\\[500px\\]') ||
        text.includes('.brightness-\\[0\\.7\\]') ||
        /Black\s*Han\s*Sans/i.test(text));
    const normalizedText = absolutizeFontUrls(text).trim();

    if (
      isEditorWrapperStyle ||
      isEditorCanvasStyle ||
      isLegacyEditedHtmlFallbackStyle ||
      (normalizedText && seenStyleText.has(normalizedText))
    ) {
      style.remove();
      return;
    }

    style.removeAttribute('data-gjs-injected');
    style.textContent = normalizedText;
    if (normalizedText) seenStyleText.add(normalizedText);
  });

  return head.innerHTML.trim();
}

function normalizeBodyMarkup(rawHtml: string, bodyAttrs: string): string {
  const source = rawHtml.trim();
  const bodySource = /^<body[\s>]/i.test(source) ? source : `<body>${source}</body>`;
  const doc = new DOMParser().parseFromString(bodySource, 'text/html');
  normalizeBodyAssetUrls(doc);
  return `<body${bodyAttrs ? ` ${bodyAttrs}` : ''}>${doc.body.innerHTML}</body>`;
}

function repairSizeGuideFrameInDocument(doc: Document) {
  const container = doc.querySelector<HTMLElement>('[data-container="sizeImages"]');
  if (!container) return;
  const frame = container.querySelector<HTMLElement>('[data-role="size-guide-frame"]');
  const img = (frame ?? container).querySelector<HTMLImageElement>('img');
  if (!img) return;
  const heightLabel = (frame ?? container)
    .querySelector<HTMLElement>('[data-field="sizeHeightLabel"]')
    ?.textContent?.trim() ?? '';
  const widthLabel = (frame ?? container)
    .querySelector<HTMLElement>('[data-field="sizeWidthLabel"]')
    ?.textContent?.trim() ?? '';
  const repairedFrame = buildSizeGuideFrameHtml({
    src: img.getAttribute('src') ?? '',
    alt: img.getAttribute('alt') ?? '제품 사이즈',
    heightLabel,
    widthLabel,
  });
  if (frame) {
    frame.outerHTML = repairedFrame;
    return;
  }
  container.innerHTML = repairedFrame;
}

function repairProductInfoTableWidthInDocument(doc: Document) {
  const container = doc.querySelector<HTMLElement>('[data-container="productInfo"]');
  if (!container) return;
  const safetyLabelContainer = doc.querySelector<HTMLElement>('[data-container="safetyLabelImages"]');
  if (safetyLabelContainer?.querySelector('img')) {
    container.remove();
    return;
  }

  container.style.width = '82%';
  container.style.maxWidth = '500px';
  container.style.marginLeft = 'auto';
  container.style.marginRight = 'auto';
}

function getEditorFrameEl(
  editor: Editor | ReturnType<typeof useEditor> | null | undefined,
): HTMLIFrameElement | null {
  const canvas = editor?.Canvas;
  if (!canvas || typeof canvas.getFrameEl !== 'function') return null;
  return canvas.getFrameEl() ?? null;
}

function getLiveEditorHeadHtml(editor: Editor): string {
  const iframeDoc = getEditorFrameEl(editor)?.contentDocument;
  return iframeDoc?.head.innerHTML ?? '';
}

function buildPersistedEditorHtml(
  editor: Editor,
  parsed: ParsedHtml,
  templateCss: string,
): string {
  const html = editor.getHtml();
  const css = sanitizeEditorCss(editor.getCss({ avoidProtected: true }) ?? '');
  const liveHeadHtml = getLiveEditorHeadHtml(editor);
  const headResources = sanitizePersistedHead(
    `${parsed.headHtml}\n${liveHeadHtml}\n${templateCss ? `<style>${templateCss}</style>` : ''}`,
    parsed.viewportContent,
  );
  const bodyMarkup = normalizeBodyMarkup(html, parsed.bodyAttrs);

  return `<!DOCTYPE html>
<html lang="ko">
<head>
  ${headResources}
  ${css ? `<style>${css}</style>` : ''}
  <style>body { margin: 0; padding: 0; }</style>
</head>
${bodyMarkup}
</html>`;
}

async function buildLiveEditorExportHtml(
  editor: Editor,
  parsed: ParsedHtml,
  templateCss: string,
): Promise<string> {
  const iframeDoc = getEditorFrameEl(editor)?.contentDocument;
  if (!iframeDoc?.documentElement) {
    return buildPersistedEditorHtml(editor, parsed, templateCss);
  }

  const doc = new DOMParser().parseFromString(
    `<!DOCTYPE html>${iframeDoc.documentElement.outerHTML}`,
    'text/html',
  );
  scrubEditorRuntimeFromExport(doc);
  normalizeExportHead(doc, parsed, templateCss);
  await inlineExportImages(doc);
  return `<!DOCTYPE html>\n${doc.documentElement.outerHTML}`;
}

function getLiveEditorViewportWidth(editor: Editor, fallback: number): number {
  const iframe = getEditorFrameEl(editor);
  const docWidth = iframe?.contentDocument?.documentElement?.clientWidth;
  if (docWidth && docWidth >= 320 && docWidth <= 1600) return Math.round(docWidth);

  const rectWidth = iframe?.getBoundingClientRect().width;
  if (rectWidth && rectWidth >= 320 && rectWidth <= 1600) return Math.round(rectWidth);

  return fallback;
}

function scrubEditorRuntimeFromExport(doc: Document): void {
  doc
    .querySelectorAll('.gjs-selected, .gjs-selected-parent, .gjs-hovered')
    .forEach((el) => {
      el.classList.remove('gjs-selected', 'gjs-selected-parent', 'gjs-hovered');
    });
  doc.querySelectorAll('[data-gjs-highlightable]').forEach((el) => {
    el.removeAttribute('data-gjs-highlightable');
  });
  doc.querySelectorAll('style').forEach((style) => {
    const text = style.textContent ?? '';
    if (/\.gjs-|scrollbar-width:\s*none|data-gjs-injected/i.test(text)) {
      style.remove();
      return;
    }
    style.textContent = absolutizeFontUrls(text);
  });
}

function normalizeExportHead(doc: Document, parsed: ParsedHtml, templateCss: string): void {
  const head = doc.head;
  head.querySelectorAll('meta[charset], base, meta[name="viewport"]').forEach((el) => el.remove());
  head.insertAdjacentHTML(
    'afterbegin',
    `<meta charset="UTF-8" />
<meta name="viewport" content="${parsed.viewportContent.replace(/"/g, '&quot;')}" />
<base href="${window.location.origin}/" />`,
  );

  const hasTemplateCss = Array.from(head.querySelectorAll('style')).some(
    (style) => style.textContent === templateCss,
  );
  if (templateCss && !hasTemplateCss) {
    const style = doc.createElement('style');
    style.textContent = templateCss;
    head.appendChild(style);
  }

  head.querySelectorAll<HTMLLinkElement>('link[href]').forEach((link) => {
    const href = link.getAttribute('href');
    if (!href || /^(?:[a-z][a-z\d+.-]*:|\/\/|data:|blob:)/i.test(href)) return;
    link.setAttribute('href', new URL(href, window.location.origin).toString());
  });
}

async function inlineExportImages(doc: Document): Promise<void> {
  const elements = [
    ...Array.from(doc.querySelectorAll<HTMLElement>('img[src], source[src], video[poster]')),
  ];

  await Promise.all(
    elements.map(async (el) => {
      const attr = el.hasAttribute('poster') ? 'poster' : 'src';
      const src = el.getAttribute(attr);
      if (!src || src.startsWith('data:') || src.startsWith('blob:')) return;
      const dataUrl = await imageUrlToDataUrlForExport(src).catch((err) => {
        console.warn('[detail-editor] export image inline failed', { src, err });
        return null;
      });
      if (dataUrl) el.setAttribute(attr, dataUrl);
    }),
  );
}

async function imageUrlToDataUrlForExport(src: string): Promise<string | null> {
  const response = await fetchExportImage(src);
  if (!response.ok) return null;
  const contentType = response.headers.get('content-type') || 'image/png';
  const blob = await response.blob();
  return blobToDataUrl(blob, contentType.split(';')[0] || 'image/png');
}

async function fetchExportImage(src: string): Promise<Response> {
  const resolved = new URL(src, window.location.origin);
  const apiBase = new URL(API_BASE || window.location.origin, window.location.origin);
  if (resolved.origin === apiBase.origin && resolved.pathname.startsWith('/api/')) {
    return apiClient.fetchRaw(`${resolved.pathname}${resolved.search}`, { method: 'GET' });
  }
  return fetch(resolved.toString(), getImageDownloadFetchInit(resolved.toString()));
}

function blobToDataUrl(blob: Blob, contentType: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error ?? new Error('Image export read failed'));
    reader.onload = () => {
      const result = typeof reader.result === 'string' ? reader.result : '';
      if (result) {
        resolve(result);
        return;
      }
      reject(new Error(`Image export failed for ${contentType}`));
    };
    reader.readAsDataURL(blob);
  });
}

function parseFullHtml(fullHtml: string): ParsedHtml {
  const parser = new DOMParser();
  const doc = parser.parseFromString(fullHtml, 'text/html');
  repairSizeGuideFrameInDocument(doc);
  repairProductInfoTableWidthInDocument(doc);
  const viewportContent =
    doc.head.querySelector<HTMLMetaElement>('meta[name="viewport"]')?.content ||
    `width=${inferViewportWidth(fullHtml, '')}, initial-scale=1`;
  const viewportWidth = inferViewportWidth(fullHtml, viewportContent);
  const normalizedViewportContent = viewportContent.replace(
    /width\s*=\s*(?:device-width|\d+)/i,
    `width=${viewportWidth}`,
  );

  const scriptUrls: string[] = [];
  const stylesheetUrls: string[] = [];
  const inlineStyles: string[] = [];
  const inlineScripts: string[] = [];

  for (const el of Array.from(doc.head.children)) {
    if (el.tagName === 'STYLE') {
      inlineStyles.push(el.outerHTML);
    } else if (el.tagName === 'SCRIPT') {
      const src = (el as HTMLScriptElement).getAttribute('src');
      if (src) {
        scriptUrls.push(src);
      } else if (el.textContent?.trim()) {
        inlineScripts.push(el.textContent);
      }
    } else if (el.tagName === 'LINK') {
      const link = el as HTMLLinkElement;
      const href = link.getAttribute('href');
      if (href && link.getAttribute('rel') === 'stylesheet') {
        stylesheetUrls.push(href);
      }
    }
  }

  return {
    headHtml: doc.head.innerHTML,
    bodyHtml: doc.body.innerHTML,
    bodyAttrs: serializeAttrs(doc.body),
    viewportContent: normalizedViewportContent,
    viewportWidth,
    scriptUrls,
    stylesheetUrls,
    inlineStyles,
    inlineScripts,
  };
}

function injectHeadResources(iframeWindow: Window, parsed: ParsedHtml) {
  const doc = iframeWindow.document;
  const head = doc.head;
  const existingViewport = head.querySelector('meta[name="viewport"]');
  if (existingViewport) {
    existingViewport.setAttribute('content', parsed.viewportContent);
  } else {
    const meta = doc.createElement('meta');
    meta.name = 'viewport';
    meta.content = parsed.viewportContent;
    head.prepend(meta);
  }

  // Stylesheet links: skip if href already present in head
  for (const url of parsed.stylesheetUrls) {
    if (head.querySelector(`link[rel="stylesheet"][href="${url}"]`)) continue;
    const link = doc.createElement('link');
    link.rel = 'stylesheet';
    link.href = url;
    head.appendChild(link);
  }

  // Inline styles: skip if data-gjs-injected fingerprint already present
  for (const styleHtml of parsed.inlineStyles) {
    const fingerprint = String(styleHtml.length) + '_' + styleHtml.slice(0, 60);
    if (head.querySelector(`style[data-gjs-injected="${CSS.escape(fingerprint)}"]`)) continue;
    const tempDiv = doc.createElement('div');
    tempDiv.innerHTML = styleHtml;
    const el = tempDiv.firstElementChild as HTMLStyleElement | null;
    if (!el) continue;
    el.setAttribute('data-gjs-injected', fingerprint);
    head.appendChild(el);
  }

  // Script handling — unchanged from original
  const appendInlineScripts = () => {
    for (const scriptText of parsed.inlineScripts) {
      const script = doc.createElement('script');
      script.textContent = scriptText;
      head.appendChild(script);
    }
  };

  if (parsed.scriptUrls.length === 0) {
    appendInlineScripts();
    return;
  }

  let loaded = 0;
  for (const url of parsed.scriptUrls) {
    const script = doc.createElement('script');
    script.src = url;
    const done = () => {
      loaded++;
      if (loaded >= parsed.scriptUrls.length) appendInlineScripts();
    };
    script.onload = done;
    script.onerror = done;
    head.appendChild(script);
  }
}

function syncEditorFrameHeight(editor: Editor) {
  const canvas = editor.Canvas;
  if (!canvas || typeof canvas.getFrameEl !== 'function') return;

  const iframe = getEditorFrameEl(editor);
  const doc = iframe?.contentDocument;
  if (!iframe || !doc?.body) return;

  const framesEl = canvas.getFramesEl();
  const frameWrapper = iframe.closest<HTMLElement>('.gjs-frame-wrapper');
  const viewportHeight = canvas.getElement()?.clientHeight ?? 800;
  const contentHeight = Math.max(
    doc.documentElement.scrollHeight,
    doc.body.scrollHeight,
    doc.documentElement.offsetHeight,
    doc.body.offsetHeight,
    viewportHeight,
    800,
  );
  const frameHeight = Math.ceil(contentHeight);
  const heightPx = `${frameHeight}px`;
  const zoom = Math.max(0.2, (canvas.getZoom?.() ?? 100) / 100);

  canvas.getFrame()?.set({ height: heightPx }, { noUndo: 1 });
  framesEl?.style.setProperty('transform-origin', 'top center');
  iframe.style.height = heightPx;
  iframe.style.top = '0px';
  iframe.style.bottom = 'auto';
  iframe.parentElement?.style.setProperty('height', heightPx);
  frameWrapper?.style.setProperty('height', heightPx);
  frameWrapper?.style.setProperty('top', '24px');
  frameWrapper?.style.setProperty('bottom', 'auto');
  frameWrapper?.style.setProperty('margin-top', '0');
  frameWrapper?.style.setProperty('margin-bottom', '0');
  framesEl?.style.setProperty('min-height', `${Math.ceil(frameHeight * zoom + 48)}px`);
  const coords = canvas.getCoords?.() ?? { x: 0, y: 0 };
  canvas.setCoords(coords.x ?? 0, 0);
  editor.refresh();
}

function getBlockIcon(blockId: string): ReactNode {
  const size = 20;
  switch (blockId) {
    case 'heading1':
      return <Heading1 size={size} />;
    case 'heading2':
      return <Heading2 size={size} />;
    case 'text-block':
      return <AlignLeft size={size} />;
    case 'rectangle':
      return <Square size={size} />;
    case 'circle-shape':
      return <Circle size={size} />;
    case 'image':
      return <ImageIcon size={size} />;
    case 'line':
      return <Minus size={size} />;
    default:
      return <Square size={size} />;
  }
}

function ToolBtn({
  icon,
  title,
  onClick,
  active,
  disabled,
  danger,
}: {
  icon: ReactNode;
  title: string;
  onClick?: () => void;
  active?: boolean;
  disabled?: boolean;
  danger?: boolean;
}) {
  let cls = 'p-2 rounded-lg transition-colors disabled:cursor-not-allowed ';
  if (danger) {
    cls += 'text-rose-500 hover:text-rose-600 hover:bg-rose-50 disabled:text-rose-300';
  } else if (active) {
    cls += 'text-emerald-600 bg-emerald-50';
  } else {
    cls += 'text-slate-500 hover:text-slate-700 hover:bg-slate-100 disabled:text-slate-300';
  }
  return (
    <button type="button" onClick={onClick} disabled={disabled} title={title} className={cls}>
      {icon}
    </button>
  );
}

function EditorToolbar({
  productName,
  productId,
  templateCss,
  parsed,
  onSave,
  onClose,
}: {
  productName: string;
  productId?: string;
  templateCss: string;
  parsed: ParsedHtml;
  onSave: (html: string) => Promise<void> | void;
  onClose: () => void;
}) {
  const editor = useEditor();
  const setEditorDirty = useStore((s) => s.setEditorDirty);
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);
  const [hasSelection, setHasSelection] = useState(false);
  const [zoom, setZoom] = useState(100);
  const [isSaving, setIsSaving] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [activeTool, setActiveTool] = useState('cursor');
  const [selectedVisible, setSelectedVisible] = useState(true);

  useEffect(() => {
    const updateHistory = () => {
      const hasUndo = editor.UndoManager.hasUndo();
      setCanUndo(hasUndo);
      setCanRedo(editor.UndoManager.hasRedo());
      // dirty 신호는 getDirtyCount() 우선 (UndoManager.hasUndo 보다 안정적).
      // 둘 중 하나라도 변경 감지하면 dirty=true.
      const dirty = hasUndo || (editor.getDirtyCount?.() ?? 0) > 0;
      setEditorDirty(dirty);
    };
    const onSelect = () => {
      setHasSelection(true);
      const sel = editor.getSelected();
      if (sel) {
        const display = sel.getStyle()?.display;
        setSelectedVisible(display !== 'none');
      }
    };
    const onDeselect = () => {
      setHasSelection(!!editor.getSelected());
      setSelectedVisible(true);
    };
    editor.on('update', updateHistory);
    editor.on('component:selected', onSelect);
    editor.on('component:deselected', onDeselect);
    return () => {
      editor.off('update', updateHistory);
      editor.off('component:selected', onSelect);
      editor.off('component:deselected', onDeselect);
      // 에디터 unmount 시 dirty 초기화 (다음 진입 때 false-positive 방지).
      setEditorDirty(false);
    };
  }, [editor, setEditorDirty]);

  // 탭 닫기 / 새로고침 / 외부 URL 입력 방어 — dirty 일 때만 활성.
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      const dirty = editor.UndoManager.hasUndo() || (editor.getDirtyCount?.() ?? 0) > 0;
      if (!dirty) return;
      e.preventDefault();
      // 최신 브라우저는 returnValue 무시하고 자체 confirm 다이얼로그 표시.
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [editor]);

  const handleSave = useCallback(async () => {
    if (isSaving) return;
    setIsSaving(true);
    try {
      const fullHtml = buildPersistedEditorHtml(editor, parsed, templateCss);
      await onSave(fullHtml);
      // Save 성공 후 dirty 해제 + UndoManager 클리어 → "방금 저장된 상태" 가 새 베이스.
      setEditorDirty(false);
      editor.UndoManager.clear();
    } finally {
      setIsSaving(false);
    }
  }, [editor, isSaving, onSave, parsed, setEditorDirty, templateCss]);

  // 닫기 버튼 — Sidebar 가 아니라 toolbar 의 "닫기" 도 dirty 체크 필요.
  // (Sidebar 는 handleNavClick 이 가로채지만, onClose 는 editor 내부 router.push 라 별도 가드.)
  const handleClose = useCallback(() => {
    const dirty = editor.UndoManager.hasUndo() || (editor.getDirtyCount?.() ?? 0) > 0;
    if (!dirty) {
      onClose();
      return;
    }
    if (!window.confirm('저장하지 않은 변경사항이 있습니다. 정말 닫으시겠습니까?')) return;
    setEditorDirty(false);
    editor.UndoManager.clear();
    onClose();
  }, [editor, onClose, setEditorDirty]);

  const handleExportPng = useCallback(async () => {
    setIsExporting(true);
    try {
      const fullHtml = await buildLiveEditorExportHtml(editor, parsed, templateCss);

      const res = await apiClient.fetchRaw('/api/render-image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          html: fullHtml,
          viewportWidth: getLiveEditorViewportWidth(editor, parsed.viewportWidth),
          baseUrl: window.location.origin,
        }),
      });
      if (!res.ok) throw new Error(`Export failed: ${res.status}`);

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${productName || 'page'}.png`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      toast.error('PNG 다운로드에 실패했습니다.');
    } finally {
      setIsExporting(false);
    }
  }, [editor, parsed, productName, templateCss]);

  const addElement = useCallback(
    (type: string) => {
      const wrapper = editor.getWrapper();
      if (!wrapper) return;
      const contentMap: Record<string, string> = {
        text: '<p style="padding:10px;font-size:16px;">텍스트를 입력하세요</p>',
        rectangle: '<div style="width:200px;height:150px;border:2px solid #d1d5db;"></div>',
        circle: '<div style="width:150px;height:150px;border-radius:50%;border:2px solid #d1d5db;"></div>',
        line: '<hr style="border:none;border-top:2px solid #d1d5db;width:100%;" />',
      };
      if (type === 'image') {
        editor.runCommand('core:open-assets');
        return;
      }
      const html = contentMap[type];
      if (html) insertEditorHtml(editor, html);
    },
    [editor],
  );

  const handleToolClick = useCallback(
    (tool: string) => {
      setActiveTool(tool);
      if (tool !== 'cursor') {
        addElement(tool);
        setTimeout(() => setActiveTool('cursor'), 400);
      }
    },
    [addElement],
  );

  const handleDuplicate = useCallback(() => {
    const selected = editor.getSelected();
    if (!selected) return;
    const parent = selected.parent();
    if (!parent) return;
    const clone = selected.clone();
    parent.components().add(clone, { at: selected.index() + 1 });
    editor.select(clone);
  }, [editor]);

  const handleDelete = useCallback(() => {
    const selected = editor.getSelected();
    if (selected) selected.remove();
  }, [editor]);

  const handleMoveUp = useCallback(() => {
    const selected = editor.getSelected();
    if (!selected) return;
    const parent = selected.parent();
    if (!parent) return;
    const idx = selected.index();
    if (idx > 0) {
      const def = selected.toJSON();
      selected.remove();
      const result = parent.components().add(def, { at: idx - 1 });
      const comp = Array.isArray(result) ? result[0] : result;
      if (comp) editor.select(comp);
    }
  }, [editor]);

  const handleMoveDown = useCallback(() => {
    const selected = editor.getSelected();
    if (!selected) return;
    const parent = selected.parent();
    if (!parent) return;
    const idx = selected.index();
    if (idx < parent.components().length - 1) {
      const def = selected.toJSON();
      selected.remove();
      const result = parent.components().add(def, { at: idx });
      const comp = Array.isArray(result) ? result[0] : result;
      if (comp) editor.select(comp);
    }
  }, [editor]);

  const handleToggleVisibility = useCallback(() => {
    const selected = editor.getSelected();
    if (!selected) return;
    if (selected.getStyle()?.display === 'none') {
      selected.removeStyle('display');
      setSelectedVisible(true);
    } else {
      selected.addStyle({ display: 'none' });
      setSelectedVisible(false);
    }
  }, [editor]);

  const applyCanvasZoom = useCallback(
    (level: number) => {
      const iframe = getEditorFrameEl(editor);
      const doc = iframe?.contentDocument;
      if (doc) {
        doc.documentElement.style.removeProperty('zoom');
        doc.body.style.removeProperty('zoom');
      }
      editor.Canvas.setZoom(level);
      requestAnimationFrame(() => syncEditorFrameHeight(editor));
    },
    [editor],
  );

  const handleZoomIn = useCallback(() => {
    const next = Math.min(zoom + 10, 200);
    setZoom(next);
    applyCanvasZoom(next);
  }, [zoom, applyCanvasZoom]);

  const handleZoomOut = useCallback(() => {
    const next = Math.max(zoom - 10, 20);
    setZoom(next);
    applyCanvasZoom(next);
  }, [zoom, applyCanvasZoom]);

  const handleZoomReset = useCallback(() => {
    setZoom(100);
    applyCanvasZoom(100);
  }, [applyCanvasZoom]);

  return (
    <div className="flex items-center justify-between px-3 py-1.5 bg-white border-b border-slate-200">
      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={handleClose}
          className="flex items-center gap-1 px-2 py-1.5 text-sm text-slate-500 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors"
        >
          <ArrowLeft size={16} />
          <span className="text-xs">닫기</span>
        </button>
        <div className="w-px h-5 bg-slate-200 mx-1" />
        <h2 className="text-xs font-medium text-slate-600 truncate max-w-[160px] mr-2">{productName}</h2>
        <div className="w-px h-5 bg-slate-200 mx-1" />
        <ToolBtn
          icon={<MousePointer2 size={16} />}
          title="선택 (V)"
          active={activeTool === 'cursor'}
          onClick={() => handleToolClick('cursor')}
        />
        <ToolBtn
          icon={<Type size={16} />}
          title="텍스트 추가"
          active={activeTool === 'text'}
          onClick={() => handleToolClick('text')}
        />
        <ToolBtn
          icon={<ImagePlus size={16} />}
          title="이미지 추가"
          active={activeTool === 'image'}
          onClick={() => handleToolClick('image')}
        />
        <ToolBtn
          icon={<Square size={16} />}
          title="사각형 추가"
          active={activeTool === 'rectangle'}
          onClick={() => handleToolClick('rectangle')}
        />
        <ToolBtn
          icon={<Circle size={16} />}
          title="원형 추가"
          active={activeTool === 'circle'}
          onClick={() => handleToolClick('circle')}
        />
        <ToolBtn
          icon={<Minus size={16} />}
          title="선 추가"
          active={activeTool === 'line'}
          onClick={() => handleToolClick('line')}
        />
      </div>

      <div className="flex items-center gap-0.5">
        <ToolBtn
          icon={<Undo2 size={16} />}
          title="실행 취소 (Ctrl+Z)"
          onClick={() => editor.UndoManager.undo()}
          disabled={!canUndo}
        />
        <ToolBtn
          icon={<Redo2 size={16} />}
          title="다시 실행 (Ctrl+Shift+Z)"
          onClick={() => editor.UndoManager.redo()}
          disabled={!canRedo}
        />
        <div className="w-px h-5 bg-slate-200 mx-1" />
        <ToolBtn icon={<Files size={16} />} title="복제" onClick={handleDuplicate} disabled={!hasSelection} />
        <ToolBtn
          icon={<Trash2 size={16} />}
          title="삭제 (Delete)"
          onClick={handleDelete}
          disabled={!hasSelection}
          danger
        />
        <div className="w-px h-5 bg-slate-200 mx-1" />
        <ToolBtn icon={<ArrowUp size={16} />} title="위로 이동" onClick={handleMoveUp} disabled={!hasSelection} />
        <ToolBtn icon={<ArrowDown size={16} />} title="아래로 이동" onClick={handleMoveDown} disabled={!hasSelection} />
        <div className="w-px h-5 bg-slate-200 mx-1" />
        <ToolBtn
          icon={selectedVisible ? <Eye size={16} /> : <EyeOff size={16} />}
          title="표시/숨김"
          onClick={handleToggleVisibility}
          disabled={!hasSelection}
        />
      </div>

      <div className="flex items-center gap-1">
        <ToolBtn icon={<ZoomOut size={16} />} title="축소" onClick={handleZoomOut} />
        <button
          type="button"
          onClick={handleZoomReset}
          className="px-2 py-1 text-xs font-medium text-slate-600 hover:bg-slate-100 rounded transition-colors min-w-[44px] text-center"
          title="확대/축소 초기화"
        >
          {zoom}%
        </button>
        <ToolBtn icon={<ZoomIn size={16} />} title="확대" onClick={handleZoomIn} />
        <div className="w-px h-5 bg-slate-200 mx-1.5" />
        <button
          type="button"
          onClick={handleSave}
          disabled={isSaving}
          className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-100 border border-slate-200 rounded-lg transition-colors disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isSaving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
          {isSaving ? '저장 중...' : '저장'}
        </button>
        <button
          type="button"
          onClick={handleExportPng}
          disabled={isExporting}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-white bg-emerald-500 hover:bg-emerald-600 rounded-lg transition-colors shadow-sm disabled:opacity-50"
        >
          {isExporting ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
          다운로드
        </button>
      </div>

    </div>
  );
}

const LEFT_TOOL_LABELS: Record<EditorToolId, string> = {
  pages: '페이지',
  text: '텍스트',
  image: '사진',
  ai: 'AI 생성',
  ads: '광고 소재',
  shape: '도형',
  layers: '레이어',
  color: '색상',
};

function LeftPanel({
  activeTool,
  onClose,
  onOpenAiPanel,
  rawImages = [],
  onImagesUploaded,
}: {
  activeTool: EditorToolId;
  onClose?: () => void;
  onOpenAiPanel: () => void;
  rawImages?: string[];
  onImagesUploaded: (imageUrls: string[]) => void;
}) {
  const editor = useEditor();
  return (
    <aside className="flex h-full w-[320px] shrink-0 flex-col overflow-hidden border-r border-slate-200 bg-white">
      <div className="flex h-12 items-center justify-between border-b border-slate-100 px-4">
        <div className="text-sm font-black text-slate-800">{LEFT_TOOL_LABELS[activeTool]}</div>
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600"
            title="페이지 패널 닫기"
          >
            <X size={14} />
          </button>
        )}
      </div>

      <LeftToolPanel
        activeTool={activeTool}
        editor={editor}
        onOpenAiPanel={onOpenAiPanel}
        rawImages={rawImages}
        onImagesUploaded={onImagesUploaded}
      />
    </aside>
  );
}

function LeftToolPanel({
  activeTool,
  editor,
  onOpenAiPanel,
  rawImages,
  onImagesUploaded,
}: {
  activeTool: EditorToolId;
  editor: ReturnType<typeof useEditor>;
  onOpenAiPanel: () => void;
  rawImages: string[];
  onImagesUploaded: (imageUrls: string[]) => void;
}) {
  if (activeTool === 'pages') return <EditorPagePanel />;
  if (activeTool === 'text') return <TextToolPanel editor={editor} />;
  if (activeTool === 'image') {
    return (
      <ImageToolPanel
        editor={editor}
        rawImages={rawImages}
        onImagesUploaded={onImagesUploaded}
      />
    );
  }
  if (activeTool === 'ai') return <AiToolPanel onOpenAiPanel={onOpenAiPanel} />;
  if (activeTool === 'ads') return <AdsToolPanel editor={editor} />;
  if (activeTool === 'shape') return <ShapeToolPanel editor={editor} />;
  if (activeTool === 'layers') return <LayersToolPanel />;
  return <ColorToolPanel editor={editor} />;
}

function TextToolPanel({ editor }: { editor: ReturnType<typeof useEditor> }) {
  return (
    <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
      <div className="mb-4 grid grid-cols-2 rounded-lg border border-slate-200 bg-slate-50 p-1">
        <button type="button" className="rounded-md bg-white py-2 text-xs font-black text-slate-900 shadow-sm">
          텍스트
        </button>
        <button type="button" className="rounded-md py-2 text-xs font-bold text-slate-500">
          폰트
        </button>
      </div>

      <div className="space-y-2">
        <QuickInsertButton
          label="메인 카피 텍스트 추가"
          onClick={() =>
            insertEditorHtml(
              editor,
              '<h2 style="font-size:42px;font-weight:900;line-height:1.16;letter-spacing:0;color:#111827;text-align:center;margin:24px 0;">메인 카피를 입력하세요</h2>',
            )
          }
        />
        <QuickInsertButton
          label="서브 카피 텍스트 추가"
          onClick={() =>
            insertEditorHtml(
              editor,
              '<p style="font-size:24px;font-weight:800;line-height:1.45;color:#374151;text-align:center;margin:18px 0;">서브 카피를 입력하세요</p>',
            )
          }
        />
        <QuickInsertButton
          label="본문 텍스트 추가"
          onClick={() =>
            insertEditorHtml(
              editor,
              '<p style="font-size:18px;font-weight:500;line-height:1.75;color:#4b5563;text-align:center;margin:16px 0;">본문 내용을 입력하세요.</p>',
            )
          }
        />
      </div>

      <ToolSection title="리뷰/옵션/Q&A 카드">
        <PresetGrid
          items={[
            { label: '리뷰 카드', sub: '별점 + 짧은 후기' },
            { label: 'Q&A 카드', sub: '질문과 답변' },
          ]}
          onSelect={(label) =>
            insertEditorHtml(
              editor,
              `<div style="margin:22px auto;padding:20px;border-radius:16px;background:#f8fafc;color:#111827;max-width:520px;"><strong>${label}</strong><p style="margin:8px 0 0;color:#64748b;">내용을 입력하세요.</p></div>`,
            )
          }
        />
      </ToolSection>

      <ToolSection title="레이아웃">
        <PresetGrid
          items={[
            { label: '중앙 제목', sub: '짧고 강한 문구' },
            { label: '좌우 카피', sub: '비교형 문단' },
          ]}
          onSelect={(label) =>
            insertEditorHtml(
              editor,
              `<div style="margin:24px auto;padding:28px;background:#ffffff;text-align:center;"><h3 style="font-size:30px;font-weight:900;margin:0 0 10px;">${label}</h3><p style="font-size:17px;color:#64748b;margin:0;">내용을 입력해 주세요.</p></div>`,
            )
          }
        />
      </ToolSection>

      <ToolSection title="템플릿 섹션">
        <PresetGrid
          items={TEMPLATE_SECTION_PRESETS}
          onSelect={(_, item) => insertEditorHtml(editor, buildTemplateSectionBlockHtml(item.kind))}
        />
      </ToolSection>
    </div>
  );
}

function ImageToolPanel({
  editor,
  rawImages,
  onImagesUploaded,
}: {
  editor: ReturnType<typeof useEditor>;
  rawImages: string[];
  onImagesUploaded: (imageUrls: string[]) => void;
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const imageDragActiveRef = useRef(false);

  const handleFiles = useCallback(
    async (files: FileList | null) => {
      if (!files?.length) return;
      const uploadedUrls: string[] = [];
      for (const file of Array.from(files)) {
        const url = await readFileAsDataUrl(file);
        uploadedUrls.push(url);
        editor.AssetManager.add({ type: 'image', src: url });
        insertImageIntoEditor(editor, url);
      }
      if (uploadedUrls.length > 0) onImagesUploaded(uploadedUrls);
      if (fileInputRef.current) fileInputRef.current.value = '';
    },
    [editor, onImagesUploaded],
  );

  return (
    <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
      <label className="mb-2 block text-xs font-bold text-slate-500">배경 색상</label>
      <div className="mb-4 flex items-center gap-2">
        <input
          type="color"
          defaultValue="#ffffff"
          className="h-9 w-10 rounded border border-slate-200 bg-white p-1"
          onChange={(event) => applySelectedStyle(editor, { backgroundColor: event.target.value })}
        />
        <input
          type="text"
          defaultValue="#FFFFFF"
          className="h-9 flex-1 rounded-lg border border-slate-200 px-3 text-sm font-semibold text-slate-700"
          onBlur={(event) => applySelectedStyle(editor, { backgroundColor: event.target.value })}
        />
      </div>

      <button
        type="button"
        onClick={() => fileInputRef.current?.click()}
        className="mb-3 flex h-9 w-full items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white text-xs font-black text-slate-700 transition-colors hover:border-emerald-300 hover:text-emerald-600"
      >
        <ImagePlus size={14} />
        이미지 업로드
      </button>
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={(event) => handleFiles(event.target.files)}
      />

      <BlocksProvider>
        {({ blocks, dragStart, dragStop }) => {
          const imageBlocks = blocks.filter((block) => block.getId().startsWith('raw-image-'));
          const blockUrls = imageBlocks
            .map((block) => String(block.get('content') ?? '').match(/src="([^"]+)"/)?.[1])
            .filter(Boolean) as string[];
          const images = Array.from(new Set([...rawImages, ...blockUrls]));
          const rawOnlyImages = images.filter((url) => !blockUrls.includes(url));

          return (
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="flex aspect-square flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-slate-300 bg-slate-50 text-xs font-bold text-slate-400 transition hover:border-emerald-300 hover:bg-emerald-50 hover:text-emerald-600"
              >
                <ImagePlus size={23} />
                업로드
              </button>
              {imageBlocks.map((block) => {
                const blockContent = String(block.get('content') ?? '');
                const thumbUrl = blockContent.match(/src="([^"]+)"/)?.[1] ?? '';
                return (
                  <div
                    key={block.getId()}
                    draggable
                    className="aspect-square cursor-grab overflow-hidden rounded-xl border border-slate-200 bg-slate-50"
                    title="드래그하여 배치 · 클릭하여 배치"
                    onDragStart={(event) => {
                      imageDragActiveRef.current = true;
                      event.stopPropagation();
                      dragStart(block, event.nativeEvent);
                    }}
                    onDragEnd={() => {
                      dragStop(false);
                      window.setTimeout(() => {
                        imageDragActiveRef.current = false;
                      }, 0);
                    }}
                    onClick={(event) => {
                      event.preventDefault();
                      event.stopPropagation();
                      if (imageDragActiveRef.current) return;
                      insertImageIntoEditor(editor, thumbUrl);
                    }}
                  >
                    <img src={thumbUrl} alt="" className="h-full w-full object-cover" />
                  </div>
                );
              })}
              {rawOnlyImages.map((url) => (
                <button
                  key={url}
                  type="button"
                  className="group relative aspect-square overflow-hidden rounded-xl border border-slate-200 bg-slate-50"
                  title="클릭하여 배치"
                  onMouseDown={(event) => event.stopPropagation()}
                  onClick={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    insertImageIntoEditor(editor, url);
                  }}
                >
                  <img src={url} alt="" className="h-full w-full object-cover transition group-hover:scale-105" />
                </button>
              ))}
            </div>
          );
        }}
      </BlocksProvider>
    </div>
  );
}

function AiToolPanel({ onOpenAiPanel }: { onOpenAiPanel: () => void }) {
  return (
    <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
      <div className="mb-4 grid grid-cols-2 rounded-lg bg-slate-100 p-1">
        <button type="button" className="rounded-md bg-white py-2 text-xs font-black text-slate-900 shadow-sm">
          이미지
        </button>
        <button type="button" className="rounded-md py-2 text-xs font-bold text-slate-500">
          GIF
        </button>
      </div>
      <label className="mb-2 block text-xs font-bold text-slate-500">참조 이미지 (선택)</label>
      <div className="mb-4 flex h-36 flex-col items-center justify-center rounded-xl border border-dashed border-slate-300 bg-slate-50 text-xs font-bold text-slate-400">
        <ImageIcon size={28} className="mb-2" />
        클릭 또는 드래그하여 이미지 첨부
      </div>
      <label className="mb-2 block text-xs font-bold text-slate-500">
        프롬프트 <span className="text-rose-500">*</span>
      </label>
      <textarea
        className="h-40 w-full resize-none rounded-xl border border-slate-200 p-3 text-sm outline-none transition focus:border-emerald-300 focus:ring-2 focus:ring-emerald-100"
        placeholder="생성하고 싶은 이미지를 자세히 묘사해주세요..."
      />
      <button
        type="button"
        onClick={onOpenAiPanel}
        className="mt-4 flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-slate-900 text-sm font-black text-white shadow-sm transition hover:bg-slate-800"
      >
        <Sparkles size={15} />
        AI 어시스턴트로 생성
      </button>
    </div>
  );
}

function AdsToolPanel({ editor }: { editor: ReturnType<typeof useEditor> }) {
  return (
    <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
      <ToolSection title="광고 카피">
        <PresetGrid
          items={[
            { label: '후킹 배너', sub: '첫 화면 강조 문구' },
            { label: '쿠폰 카드', sub: '혜택/할인 노출' },
            { label: '리뷰 강조', sub: '구매 전환 문구' },
            { label: '긴급 소구', sub: '한정/마감 문구' },
          ]}
          onSelect={(label) =>
            insertEditorHtml(
              editor,
              `<div style="margin:20px auto;padding:22px;border-radius:18px;background:#111827;color:#ffffff;text-align:center;max-width:560px;"><strong style="font-size:28px;">${label}</strong><p style="margin:8px 0 0;color:#e5e7eb;">광고 문구를 입력하세요.</p></div>`,
            )
          }
        />
      </ToolSection>
    </div>
  );
}

function ShapeToolPanel({ editor }: { editor: ReturnType<typeof useEditor> }) {
  return (
    <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
      <div className="grid grid-cols-2 gap-2">
        <QuickShapeButton
          icon={<Square size={18} />}
          label="사각형"
          onClick={() => insertEditorHtml(editor, '<div style="width:180px;height:90px;background:#f1f5f9;border-radius:16px;margin:20px auto;"></div>')}
        />
        <QuickShapeButton
          icon={<Circle size={18} />}
          label="원형"
          onClick={() => insertEditorHtml(editor, '<div style="width:120px;height:120px;background:#e0f2fe;border-radius:999px;margin:20px auto;"></div>')}
        />
        <QuickShapeButton
          icon={<Minus size={18} />}
          label="선"
          onClick={() => insertEditorHtml(editor, '<div style="height:3px;width:240px;background:#cbd5e1;margin:24px auto;"></div>')}
        />
        <QuickShapeButton
          icon={<Layout size={18} />}
          label="카드"
          onClick={() => insertEditorHtml(editor, '<div style="margin:24px auto;padding:28px;border-radius:20px;background:#ffffff;box-shadow:0 10px 24px rgba(15,23,42,.08);max-width:520px;">내용을 입력하세요.</div>')}
        />
      </div>
    </div>
  );
}

function LayersToolPanel() {
  return (
    <div className="min-h-0 flex-1 overflow-y-auto px-2 py-3">
      <LayersProvider>{({ Container }) => <Container>{null}</Container>}</LayersProvider>
    </div>
  );
}

function ColorToolPanel({ editor }: { editor: ReturnType<typeof useEditor> }) {
  const colors = ['#111827', '#ffffff', '#60a5fa', '#fb7185', '#fbbf24', '#34d399', '#a78bfa', '#fb923c'];
  return (
    <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
      <ToolSection title="텍스트 색상">
        <div className="grid grid-cols-4 gap-2">
          {colors.map((color) => (
            <button
              key={`text-${color}`}
              type="button"
              className="h-12 rounded-xl border border-slate-200 shadow-sm"
              style={{ backgroundColor: color }}
              title={color}
              onClick={() => applySelectedStyle(editor, { color })}
            />
          ))}
        </div>
      </ToolSection>
      <ToolSection title="배경 색상">
        <div className="grid grid-cols-4 gap-2">
          {colors.map((color) => (
            <button
              key={`bg-${color}`}
              type="button"
              className="h-12 rounded-xl border border-slate-200 shadow-sm"
              style={{ backgroundColor: color }}
              title={color}
              onClick={() => applySelectedStyle(editor, { backgroundColor: color })}
            />
          ))}
        </div>
      </ToolSection>
    </div>
  );
}

function ToolSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mt-5">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-xs font-black text-slate-600">{title}</h3>
        <span className="text-[11px] font-bold text-blue-500">더보기</span>
      </div>
      {children}
    </section>
  );
}

function QuickInsertButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex h-12 w-full items-center justify-between rounded-xl bg-slate-50 px-4 text-left text-sm font-black text-slate-800 transition hover:bg-slate-100"
    >
      {label}
      <span className="text-xl font-light text-slate-400">+</span>
    </button>
  );
}

function QuickShapeButton({
  icon,
  label,
  onClick,
}: {
  icon: ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex h-20 flex-col items-center justify-center gap-2 rounded-xl border border-slate-200 bg-slate-50 text-xs font-black text-slate-600 transition hover:border-emerald-300 hover:bg-emerald-50 hover:text-emerald-600"
    >
      {icon}
      {label}
    </button>
  );
}

function PresetGrid<TItem extends { label: string; sub: string }>({
  items,
  onSelect,
}: {
  items: TItem[];
  onSelect: (label: string, item: TItem) => void;
}) {
  return (
    <div className="grid grid-cols-2 gap-2">
      {items.map((item) => (
        <button
          key={item.label}
          type="button"
          onClick={() => onSelect(item.label, item)}
          className="h-24 rounded-xl bg-slate-50 p-3 text-left transition hover:bg-slate-100"
        >
          <div className="text-sm font-black text-slate-800">{item.label}</div>
          <div className="mt-1 text-[11px] font-medium leading-4 text-slate-400">{item.sub}</div>
        </button>
      ))}
    </div>
  );
}

function insertEditorHtml(editor: ReturnType<typeof useEditor>, html: string) {
  const target = getInsertionTarget(editor);
  const added = target.parent
    ? target.parent.components().add(html, { at: target.at })
    : editor.addComponents(html);
  const component = Array.isArray(added) ? added[0] : added;
  if (component) {
    editor.select(component);
    requestAnimationFrame(() => scrollComponentIntoCanvasView(editor, component));
  }
}

function getInsertionTarget(editor: ReturnType<typeof useEditor>): { parent: any | null; at: number } {
  const wrapper = editor.getWrapper();
  const children = wrapper?.components?.();
  const selected = editor.getSelected();
  if (selected && isComponentInCanvasViewport(editor, selected)) {
    const insertableSelected = getInsertableComponent(selected, wrapper);
    const selectedParent = insertableSelected?.parent?.();
    if (insertableSelected && selectedParent) {
      return { parent: selectedParent, at: insertableSelected.index() + 1 };
    }
  }

  if (!wrapper || !children?.length) return { parent: wrapper ?? null, at: children?.length ?? 0 };

  const viewportComponent = getViewportCenterInsertableComponent(editor, wrapper);
  const viewportParent = viewportComponent?.parent?.();
  if (viewportComponent && viewportParent) {
    return { parent: viewportParent, at: viewportComponent.index() + 1 };
  }

  const frame = getEditorFrameEl(editor);
  const frameWindow = frame?.contentWindow;
  if (!frameWindow) return { parent: wrapper, at: children.length };

  const viewportHeight = frameWindow.innerHeight || frame?.clientHeight || 900;
  const viewportTop = frameWindow.scrollY;
  const viewportBottom = viewportTop + viewportHeight;
  const viewportCenter = viewportTop + viewportHeight / 2;
  const models = flattenEditorComponents(wrapper);
  let best: any | null = null;
  let bestScore = Number.POSITIVE_INFINITY;

  for (const component of models) {
    if (component === wrapper) continue;
    const element = component?.getEl?.();
    if (!element) continue;
    const rect = element.getBoundingClientRect();
    if (rect.height <= 0 || rect.width <= 0) continue;
    const top = viewportTop + rect.top;
    const bottom = top + rect.height;
    const visibleOverlap = Math.max(0, Math.min(bottom, viewportBottom) - Math.max(top, viewportTop));
    if (visibleOverlap <= 0) continue;
    const center = top + rect.height / 2;
    const distance = Math.abs(center - viewportCenter);
    const oversizePenalty = Math.max(0, rect.height - viewportHeight * 0.9) * 0.18;
    const score = distance + oversizePenalty + getInsertionDepth(component, wrapper) * 4;
    if (score < bestScore) {
      best = component;
      bestScore = score;
    }
  }

  const insertableBest = getInsertableComponent(best, wrapper);
  const parent = insertableBest?.parent?.();
  return insertableBest && parent
    ? { parent, at: insertableBest.index() + 1 }
    : { parent: wrapper, at: children.length };
}

function getViewportCenterInsertableComponent(
  editor: ReturnType<typeof useEditor>,
  wrapper: any,
): any | null {
  const frame = getEditorFrameEl(editor);
  const doc = frame?.contentDocument;
  const frameWindow = frame?.contentWindow;
  if (!doc || !frameWindow || !wrapper) return null;

  const width = frameWindow.innerWidth || frame?.clientWidth || 720;
  const height = frameWindow.innerHeight || frame?.clientHeight || 900;
  const points = [
    [width / 2, height / 2],
    [width / 2, height * 0.36],
    [width / 2, height * 0.64],
    [width * 0.38, height / 2],
    [width * 0.62, height / 2],
  ];

  for (const [x, y] of points) {
    const component = getInsertableComponentFromPoint(doc, wrapper, x, y);
    if (component) return component;
  }

  return null;
}

function getInsertableComponentFromPoint(
  doc: Document,
  wrapper: any,
  x: number,
  y: number,
): any | null {
  let element = doc.elementFromPoint(x, y) as HTMLElement | null;
  while (element && element !== doc.body && element !== doc.documentElement) {
    const id = element.getAttribute('id');
    if (id) {
      const component = findEditorComponentById(wrapper, id);
      const insertableComponent = getInsertableComponent(component, wrapper);
      if (insertableComponent) return insertableComponent;
    }
    element = element.parentElement;
  }
  return null;
}

function findEditorComponentById(wrapper: any, id: string): any | null {
  const escapedId =
    typeof CSS !== 'undefined' && typeof CSS.escape === 'function'
      ? CSS.escape(id)
      : id.replace(/([ !"#$%&'()*+,./:;<=>?@[\\\]^`{|}~])/g, '\\$1');
  return wrapper?.find?.(`#${escapedId}`)?.[0] ?? null;
}

function isComponentInCanvasViewport(editor: ReturnType<typeof useEditor>, component: any): boolean {
  const frame = getEditorFrameEl(editor);
  const frameWindow = frame?.contentWindow;
  const element = component?.getEl?.();
  if (!frameWindow || !element) return false;
  const rect = element.getBoundingClientRect();
  const viewportHeight = frameWindow.innerHeight || frame?.clientHeight || 900;
  const viewportWidth = frameWindow.innerWidth || frame?.clientWidth || 720;
  return rect.bottom > 0 && rect.top < viewportHeight && rect.right > 0 && rect.left < viewportWidth;
}

function flattenEditorComponents(root: any): any[] {
  const result: any[] = [];
  const walk = (component: any) => {
    result.push(component);
    const children = component?.components?.()?.models ?? [];
    children.forEach(walk);
  };
  walk(root);
  return result;
}

function getInsertableComponent(component: any, wrapper: any): any | null {
  if (!component || !wrapper) return component ?? null;
  let current = component;
  while (current && current !== wrapper) {
    const tag = String(current.get?.('tagName') ?? '').toLowerCase();
    const parent = current.parent?.();
    if (!parent || parent === wrapper) return current;
    const parentTag = String(parent.get?.('tagName') ?? '').toLowerCase();
    if (isInlineEditorTag(tag) || isInlineEditorTag(parentTag)) {
      current = parent;
      continue;
    }
    return current;
  }
  return null;
}

function isInlineEditorTag(tag: string): boolean {
  return ['span', 'strong', 'em', 'b', 'i', 'small', 'u', 'a', 'br'].includes(tag);
}

function getInsertionDepth(component: any, wrapper: any): number {
  let depth = 0;
  let current = component;
  while (current && current !== wrapper) {
    depth += 1;
    current = current.parent?.() ?? null;
  }
  return depth;
}

function scrollComponentIntoCanvasView(editor: ReturnType<typeof useEditor>, component: any) {
  const frame = getEditorFrameEl(editor);
  const frameWindow = frame?.contentWindow;
  const element = component?.getEl?.();
  if (!frameWindow || !element) return;

  const rect = element.getBoundingClientRect();
  const viewportHeight = frameWindow.innerHeight || frame?.clientHeight || 900;
  if (rect.top >= 80 && rect.bottom <= viewportHeight - 80) return;
  const nextTop = Math.max(0, frameWindow.scrollY + rect.top - viewportHeight * 0.35);
  frameWindow.scrollTo({ top: nextTop, behavior: 'auto' });
}

function insertImageIntoEditor(editor: ReturnType<typeof useEditor>, url: string) {
  const selected = editor.getSelected();
  const type = (selected?.get('type') as string) ?? '';
  const tag = ((selected?.get('tagName') as string) ?? '').toLowerCase();
  if (selected && (type === 'image' || tag === 'img')) {
    selected.setAttributes({ src: url });
    return;
  }
  insertEditorHtml(
    editor,
    `<img src="${url}" style="display:block;width:100%;max-width:640px;margin:0 auto;object-fit:cover;" />`,
  );
}

function applySelectedStyle(editor: ReturnType<typeof useEditor>, style: Record<string, string>) {
  const target = editor.getSelected() ?? editor.getWrapper();
  target?.addStyle?.(style);
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ''));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

function RightPanel({
  onClose,
  selectedTextComponent,
  selectedImageComponent,
  isBusy,
  selectedImageSrc,
  onImageEdited,
  onImageReplace,
  onImageClose,
  productId,
  onAiFillComplete,
  onGeneratingChange,
  rawImages = [],
  processedImages = [],
  onImagesUploaded,
}: {
  onClose?: () => void;
  selectedTextComponent: any;
  selectedImageComponent: any;
  isBusy: React.MutableRefObject<boolean>;
  selectedImageSrc: string | null;
  onImageEdited: (newUrl: string, component?: any) => void;
  onImageReplace: () => void;
  onImageClose: () => void;
  productId?: string;
  onAiFillComplete?: () => void;
  onGeneratingChange?: (v: boolean, component?: any, imageUrl?: string) => void;
  rawImages?: string[];
  processedImages?: string[];
  onImagesUploaded: (imageUrls: string[]) => void;
}) {
  const editor = useEditor();
  const [aiFillLoading, setAiFillLoading] = useState(false);
  const [aiFillStep, setAiFillStep] = useState('');
  const [aiFillTaskId, setAiFillTaskId] = useState<string | null>(null);
  const [seedHookText, setSeedHookText] = useState('');
  const [seedHookTitleSub, setSeedHookTitleSub] = useState('');
  const [seedHeroImage, setSeedHeroImage] = useState<string | null>(null);
  const [showHeroPicker, setShowHeroPicker] = useState(false);
  const [colorGuideEnabled, setColorGuideEnabled] = useState(false);
  const [colorImageUrls, setColorImageUrls] = useState<string[]>([]);
  const [showColorPicker, setShowColorPicker] = useState(false);
  const [hasGenerated, setHasGenerated] = useState(false);
  const [colorImagesExist, setColorImagesExist] = useState(false);
  const [colorGuideLoading, setColorGuideLoading] = useState(false);
  const [postColorGuideOpen, setPostColorGuideOpen] = useState(false);

  const applyProgressImages = useCallback((imgs: Record<string, unknown>) => {
    if (!editor) return;
    const wrapper = editor.getWrapper();
    if (!wrapper) return;

    const resolve = (url: string) => url.startsWith('/processed/') ? `${API_BASE}${url}` : url;

    const setImg = (field: string, url: string) => {
      const comps = wrapper.find(`[data-field="${field}"]`);
      if (comps.length > 0 && url) comps[0].setAttributes({ src: resolve(url) });
    };
    const getFieldText = (field: string) => {
      const comp = wrapper.find(`[data-field="${field}"]`)[0];
      return (comp?.getEl() as HTMLElement | undefined)?.textContent?.trim() ?? '';
    };

    const fillContainer = (name: string, urls: string[], alt: string) => {
      const sections = wrapper.find(`[data-section="${name}"]`);
      if (sections.length === 0 || urls.length === 0) return;
      sections[0].removeClass('hidden');
      const containers = wrapper.find(`[data-container="${name}"]`);
      if (containers.length === 0) return;
      if (name === 'sizeImages') {
        containers[0].components(buildSizeGuideFrameHtml({
          src: resolve(urls[0]),
          alt,
          heightLabel: getFieldText('sizeHeightLabel'),
          widthLabel: getFieldText('sizeWidthLabel'),
        }));
        return;
      }
      containers[0].components(
        urls.map((u) => `<img src="${resolve(u)}" alt="${alt}" class="w-full h-auto rounded-[var(--theme-radius)] shadow-md" />`).join('')
      );
    };

    if (typeof imgs.main_image === 'string') setImg('heroImage', imgs.main_image);
    if (typeof imgs.banner === 'string') setImg('heroBanner', imgs.banner);
    if (Array.isArray(imgs.size_images)) fillContainer('sizeImages', imgs.size_images, '사이즈 안내');
    if (Array.isArray(imgs.detail_images)) fillContainer('detailImages', imgs.detail_images, '디테일 이미지');
    if (Array.isArray(imgs.color_images)) {
      fillContainer('colorImages', imgs.color_images, '색상 안내');
      setColorImagesExist(true);
    }
  }, [editor]);

  const handleAiFill = useCallback(async () => {
    if (!productId) return;
    if (aiFillLoading) return;
    isBusy.current = true;
    setAiFillLoading(true);
    onGeneratingChange?.(true);
    setAiFillStep('요청 전송 중...');
    try {
      const { taskId } = await apiClient.post<{ taskId: string }>(`/api/products/${productId}/trigger-content-draft`, {
        seed_hook_text: seedHookText.trim() || undefined,
        seed_hook_title_sub: seedHookTitleSub.trim() || undefined,
        seed_hero_image: seedHeroImage || undefined,
        color_image_urls: colorGuideEnabled && colorImageUrls.length >= 2 ? colorImageUrls : undefined,
      });
      setAiFillTaskId(taskId);
      setAiFillStep('카피 생성 중...');

      // Agent OS: trigger-content-draft returns AgentRunRequest.id as taskId.
      // Poll the request, pivot to the run via latestRunId once executor claims.
      let lastStep = '';
      let latestRunId: string | null = null;
      const maxAttempts = 120;
      for (let i = 0; i < maxAttempts; i++) {
        await new Promise(r => setTimeout(r, 2000));

        let request: any;
        try {
          request = await apiClient.get(`/api/agent-os/requests/${taskId}`);
        } catch { continue; }

        if (request.status === 'failed' || request.status === 'cancelled' || request.status === 'skipped') {
          throw new Error(request.lastErrorMessage || request.lastErrorCode || 'AI 생성에 실패했습니다');
        }

        latestRunId = request.latestRunId ?? latestRunId;
        if (!latestRunId) continue; // pre-claim: no run yet

        // Read run for output progress + final state.
        let run: any;
        try {
          run = await apiClient.get(`/api/agent-os/runs/${latestRunId}`);
        } catch { continue; }

        let output: Record<string, unknown> | null = null;
        try {
          output = typeof run.output === 'string' ? JSON.parse(run.output) : run.output;
        } catch {
          continue;
        }
        if (output?.step && output.step !== lastStep) {
          lastStep = String(output.step);
          if (output.step === 'content_ready') {
            setAiFillStep('이미지 생성 중...');
            onAiFillComplete?.();
          } else if (output.step === 'image_progress') {
            const imgs = (output.images || {}) as Record<string, unknown>;
            const sizeImgs = Array.isArray(imgs.size_images) ? imgs.size_images : [];
            const detailImgs = Array.isArray(imgs.detail_images) ? imgs.detail_images : [];
            const colorImgs = Array.isArray(imgs.color_images) ? imgs.color_images : [];
            const done = [imgs.main_image, imgs.banner, ...sizeImgs, ...detailImgs, ...colorImgs].filter(Boolean).length;
            setAiFillStep(`이미지 생성 중... (${done}장 완료)`);
            applyProgressImages(imgs as Record<string, unknown>);
          }
        }

        if (run.status === 'succeeded' || request.status === 'succeeded') {
          setHasGenerated(true);
          onAiFillComplete?.();
          return;
        }
      }
      throw new Error('시간 초과');
    } catch (err) {
      toast.error('AI 생성에 실패했습니다.');
    } finally {
      isBusy.current = false;
      setAiFillLoading(false);
      onGeneratingChange?.(false);
      setAiFillStep('');
      setAiFillTaskId(null);
    }
  }, [isBusy, productId, aiFillLoading, onAiFillComplete, seedHookText, seedHookTitleSub, seedHeroImage, colorGuideEnabled, colorImageUrls]);

  const handleAiFillCancel = useCallback(async () => {
    if (!aiFillTaskId) return;
    // Agent OS does not currently expose a per-run cancel endpoint; the
    // run will exit on its own once it observes a cancellation signal or
    // finishes. We keep this action available so the UI feedback (closing
    // the busy indicator) still triggers reliably.
    try {
      // No-op for the moment; eventual `/api/agent-os/runs/:id/cancel` once
      // the runner adapter supports it.
    } catch (err) {
      toast.error('AI 작업 취소에 실패했습니다.');
    }
  }, [aiFillTaskId]);

  const handleColorGuideGenerate = useCallback(async () => {
    if (!productId || colorImageUrls.length < 2) return;
    setColorGuideLoading(true);
    try {
      const data = await apiClient.post<{ ok: boolean; runId?: string; requestId?: string }>('/api/agent-os/runs', {
        agentType: 'image_edit',
        sourceType: 'product_content',
        sourceId: productId,
        payload: { preset: 'color_guide', image_urls: colorImageUrls, productId },
      });
      // Agent OS: POST returns requestId synchronously; runId materializes
      // when the executor claims the request.
      const requestId = data.requestId;
      if (!requestId) throw new Error('이미지 작업을 시작하지 못했습니다.');

      let latestRunId: string | null = null;
      for (let i = 0; i < 120; i++) {
        await new Promise(r => setTimeout(r, 2000));

        let request: any;
        try {
          request = await apiClient.get(`/api/agent-os/requests/${requestId}`);
        } catch { continue; }

        if (request.status === 'failed' || request.status === 'cancelled' || request.status === 'skipped') {
          throw new Error(request.lastErrorMessage || request.lastErrorCode || '색상 안내 생성 실패');
        }

        latestRunId = request.latestRunId ?? latestRunId;
        if (request.status !== 'succeeded' || !latestRunId) continue;

        const run = await apiClient.get<{ output?: unknown }>(`/api/agent-os/runs/${latestRunId}`);
        {
          const imageUrl = extractEditedImageUrl(run.output ?? null);
          if (!imageUrl) throw new Error('색상 안내 이미지 URL을 찾지 못했습니다.');

          const wrapper = editor.getWrapper();
          if (!wrapper) throw new Error('에디터를 찾지 못했습니다.');

          const resolveUrl = (url: string) =>
            url.startsWith('/processed/') ? `${API_BASE}${url}` : url;
          const sections = wrapper.find('[data-section="colorImages"]');
          const containers = wrapper.find('[data-container="colorImages"]');
          if (sections.length === 0 || containers.length === 0) {
            throw new Error('색상 안내 섹션을 찾지 못했습니다.');
          }
          sections[0].removeClass('hidden');
          containers[0].components(
            `<img src="${resolveUrl(imageUrl)}" alt="색상 안내" class="w-full h-auto rounded-[var(--theme-radius)] shadow-md" />`
          );
          setColorImagesExist(true);
          setPostColorGuideOpen(false);
          break;
        }
      }
    } catch (err) {
      toast.error('색상 가이드 생성에 실패했습니다.');
    } finally {
      setColorGuideLoading(false);
    }
  }, [productId, colorImageUrls, editor]);

  const selectionType = selectedTextComponent ? 'text' : selectedImageSrc ? 'image' : null;

  return (
    <aside className="flex h-full w-[320px] shrink-0 flex-col overflow-hidden border-l border-slate-200 bg-white">
      <div className="flex items-center justify-between px-3 py-2.5 border-b border-slate-200 shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <Sparkles size={14} className="text-emerald-500 shrink-0" />
          <span className="text-xs font-semibold text-slate-700">AI 어시스턴트</span>
        </div>
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            className="p-1 text-slate-400 hover:text-slate-600 rounded transition-colors shrink-0"
            title="패널 닫기"
          >
            <X size={14} />
          </button>
        )}
      </div>

      <div className="flex-1 overflow-hidden flex flex-col min-h-0">
        {selectionType && (
          <div className="flex items-center gap-1.5 px-3 py-2 border-b border-slate-100 bg-slate-50 shrink-0">
            {selectionType === 'text' ? <Type size={13} className="text-emerald-500" /> : <ImageIcon size={13} className="text-emerald-500" />}
            <span className="text-xs font-medium text-slate-600">
              {selectionType === 'text' ? '텍스트 AI 편집' : '이미지 AI 편집'}
            </span>
          </div>
        )}
        {selectedTextComponent ? (
          <AITextEditPanel
            component={selectedTextComponent}
            editor={editor}
            isBusy={isBusy}
            onClose={() => {/* deselect handled by parent */}}
          />
        ) : selectedImageSrc && selectedImageComponent ? (
          <ImageSelectionPanel
            component={selectedImageComponent}
            editor={editor}
            imageUrl={selectedImageSrc}
            isBusy={isBusy}
            onEditComplete={onImageEdited}
            onReplace={onImageReplace}
            onGeneratingChange={onGeneratingChange}
            onClose={onImageClose}
          />
        ) : aiFillLoading ? (
          <div className="flex-1 flex flex-col items-center justify-center px-6 gap-4">
            <Loader2 size={32} className="animate-spin text-emerald-500" />
            <div className="text-center">
              <p className="text-sm font-semibold text-slate-700">{aiFillStep}</p>
              <p className="text-[10px] text-slate-400 mt-1">생성이 완료되면 캔버스에 자동 반영됩니다</p>
            </div>
            <button
              type="button"
              onClick={handleAiFillCancel}
              className="px-4 py-1.5 text-xs font-medium text-red-500 bg-red-50 hover:bg-red-100 rounded-lg transition-colors"
            >
              취소
            </button>
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto">
            <div className="p-3 space-y-4">
              <div className="space-y-2">
                <label className="block text-xs font-medium text-slate-600">상품 제목 <span className="text-slate-400 font-normal">(선택)</span></label>
                <input
                  type="text"
                  value={seedHookText}
                  onChange={(e) => setSeedHookText(e.target.value)}
                  placeholder="1줄 (예: 쫀득쫀득)"
                  disabled={aiFillLoading}
                  className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-emerald-500 placeholder:text-slate-400"
                />
                <input
                  type="text"
                  value={seedHookTitleSub}
                  onChange={(e) => setSeedHookTitleSub(e.target.value)}
                  placeholder="2줄 (예: 쫀득이)"
                  disabled={aiFillLoading}
                  className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-emerald-500 placeholder:text-slate-400"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1.5">히어로 사진 <span className="text-slate-400 font-normal">(선택)</span></label>
                {seedHeroImage ? (
                  <div className="relative rounded-lg overflow-hidden border border-slate-200 bg-slate-50">
                    <img src={seedHeroImage} alt="" className="w-full h-[160px] object-contain" />
                    <div className="absolute top-1.5 right-1.5 flex gap-1">
                      <button
                        type="button"
                        onClick={() => setShowHeroPicker(true)}
                        disabled={aiFillLoading}
                        className="p-1 bg-white/80 hover:bg-white rounded-full shadow-sm transition-colors"
                        title="다른 사진 선택"
                      >
                        <ImageIcon size={12} className="text-slate-500" />
                      </button>
                      <button
                        type="button"
                        onClick={() => setSeedHeroImage(null)}
                        className="p-1 bg-white/80 hover:bg-white rounded-full shadow-sm transition-colors"
                      >
                        <X size={12} className="text-slate-500" />
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setShowHeroPicker(true)}
                    disabled={aiFillLoading}
                    className="w-full h-[120px] flex flex-col items-center justify-center gap-2 border-2 border-dashed border-slate-200 hover:border-emerald-400 rounded-lg bg-slate-50 hover:bg-emerald-50/50 transition-colors"
                  >
                    <ImageIcon size={24} className="text-slate-300" />
                    <span className="text-xs text-slate-400">사진 선택하기</span>
                  </button>
                )}
                <ImagePickerModal
                  open={showHeroPicker}
                  rawImages={rawImages}
                  processedImages={[]}
                  onUploadImages={onImagesUploaded}
                  onSelect={(url) => {
                    setSeedHeroImage(url);
                    setShowHeroPicker(false);
                  }}
                  onClose={() => setShowHeroPicker(false)}
                />
              </div>

              <div>
                <div className="flex items-center justify-between">
                  <label className="flex items-center gap-1.5 text-xs font-medium text-slate-600">
                    <Palette size={12} className="text-slate-400" />
                    색상 안내
                  </label>
                  <button
                    type="button"
                    onClick={() => {
                      const next = !colorGuideEnabled;
                      setColorGuideEnabled(next);
                      const wrapper = editor.getWrapper();
                      if (!wrapper) return;
                      if (next) {
                        const existing = wrapper.find('[data-section="colorImages"]');
                        if (existing.length === 0) {
                          const detailSections = wrapper.find('[data-section="detailImages"]');
                          const colorHtml = `<div data-section="colorImages"><div class="text-center mt-16"><div style="width:384px;height:2px" class="bg-[#2d3436] opacity-40 mx-auto mb-12"></div><div class="inline-block bg-[#1e2d4d] text-white rounded-full px-12 py-2 font-bold text-xl tracking-widest shadow-md">색상 안내</div><div data-container="colorImages" class="mt-10 flex flex-col gap-6 max-w-2xl mx-auto px-6"><img src="https://placehold.co/860x500/e2e8f0/94a3b8?text=%5B%EC%83%89%EC%83%81+%EC%95%88%EB%82%B4+%EC%9D%B4%EB%AF%B8%EC%A7%80%5D" alt="색상 안내" class="w-full h-auto rounded-[32px] shadow-md" /></div></div></div>`;
                          if (detailSections.length > 0) {
                            detailSections[0].parent()?.append(colorHtml, { at: detailSections[0].index() });
                          } else {
                            wrapper.append(colorHtml);
                          }
                        }
                      } else {
                        const sections = wrapper.find('[data-section="colorImages"]');
                        if (sections.length > 0) sections[0].remove();
                      }
                    }}
                    disabled={aiFillLoading}
                    className={cn('relative w-9 h-5 rounded-full transition-colors', colorGuideEnabled ? 'bg-purple-600' : 'bg-slate-200')}
                  >
                    <span className={cn('absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform', colorGuideEnabled && 'translate-x-4')} />
                  </button>
                </div>
                {colorGuideEnabled && (
                  <div className="mt-2 space-y-2">
                    {colorImageUrls.length > 0 && (
                      <div className="grid grid-cols-4 gap-1.5">
                        {colorImageUrls.map((url, i) => (
                          <div key={url} className="relative aspect-square rounded-lg overflow-hidden border border-slate-200 group">
                            <img src={url} alt="" className="w-full h-full object-cover" />
                            <button
                              type="button"
                              onClick={() => setColorImageUrls(prev => prev.filter((_, idx) => idx !== i))}
                              className="absolute top-0.5 right-0.5 p-0.5 bg-black/50 hover:bg-black/70 rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
                            >
                              <X size={10} className="text-white" />
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                    <button
                      type="button"
                      onClick={() => setShowColorPicker(true)}
                      disabled={aiFillLoading || colorImageUrls.length >= 6}
                      className="w-full py-2 text-xs font-medium text-slate-500 border border-dashed border-slate-300 hover:border-emerald-400 hover:text-emerald-600 rounded-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      + 사진 추가
                    </button>
                    <p className="text-[10px] text-slate-400 text-center">{colorImageUrls.length}/6장</p>
                  </div>
                )}
                <ImagePickerModal
                  open={showColorPicker}
                  rawImages={rawImages}
                  processedImages={processedImages}
                  onUploadImages={onImagesUploaded}
                  onSelect={(url) => {
                    if (colorImageUrls.length < 6 && !colorImageUrls.includes(url)) {
                      setColorImageUrls(prev => [...prev, url]);
                    }
                    setShowColorPicker(false);
                  }}
                  onClose={() => setShowColorPicker(false)}
                />
              </div>

              <button
                type="button"
                onClick={handleAiFill}
                disabled={aiFillLoading}
                className="w-full flex items-center justify-center gap-2 py-2.5 text-xs font-semibold text-white bg-emerald-500 hover:bg-emerald-600 rounded-lg shadow-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {aiFillLoading ? (
                  <>
                    <Loader2 size={14} className="animate-spin" />
                    AI 생성 중...
                  </>
                ) : (
                  <>
                    <Sparkles size={14} />
                    AI 상세페이지 생성
                  </>
                )}
              </button>

                <p className="text-[10px] text-slate-400 text-center leading-relaxed">
                입력하면 반영, 비워두면 AI가 전부 자동 생성합니다
              </p>

              {hasGenerated && (
                <div className="space-y-2">
                  <div className="h-px bg-slate-100" />
                  {!postColorGuideOpen ? (
                    <button
                      type="button"
                      onClick={() => setPostColorGuideOpen(true)}
                      disabled={colorGuideLoading}
                      className="w-full flex items-center justify-center gap-1.5 py-2 text-xs font-medium text-emerald-600 bg-emerald-50 hover:bg-emerald-100 rounded-lg transition-colors disabled:opacity-50"
                    >
                      {colorGuideLoading ? (
                        <>
                          <Loader2 size={14} className="animate-spin" />
                          색상 안내 생성 중...
                        </>
                      ) : (
                        <>
                          <Palette size={14} />
                          {colorImagesExist ? '색상 안내 다시 만들기' : '+ 색상 안내 추가'}
                        </>
                      )}
                    </button>
                  ) : (
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-medium text-slate-600 flex items-center gap-1.5">
                          <Palette size={12} className="text-slate-400" />
                          색상 안내 이미지
                        </span>
                        <button
                          type="button"
                          onClick={() => setPostColorGuideOpen(false)}
                          className="p-0.5 text-slate-400 hover:text-slate-600 rounded transition-colors"
                        >
                          <X size={12} />
                        </button>
                      </div>
                      {colorImageUrls.length > 0 && (
                        <div className="grid grid-cols-4 gap-1.5">
                          {colorImageUrls.map((url, i) => (
                            <div key={url} className="relative aspect-square rounded-lg overflow-hidden border border-slate-200 group">
                              <img src={url} alt="" className="w-full h-full object-cover" />
                              <button
                                type="button"
                                onClick={() => setColorImageUrls(prev => prev.filter((_, idx) => idx !== i))}
                                className="absolute top-0.5 right-0.5 p-0.5 bg-black/50 hover:bg-black/70 rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
                              >
                                <X size={10} className="text-white" />
                              </button>
                            </div>
                          ))}
                        </div>
                      )}
                      <button
                        type="button"
                        onClick={() => setShowColorPicker(true)}
                        disabled={colorImageUrls.length >= 6}
                        className="w-full py-2 text-xs font-medium text-slate-500 border border-dashed border-slate-300 hover:border-emerald-400 hover:text-emerald-600 rounded-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                      >
                        + 사진 추가
                      </button>
                      <p className="text-[10px] text-slate-400 text-center">{colorImageUrls.length}/6장</p>
                      <button
                        type="button"
                        onClick={handleColorGuideGenerate}
                        disabled={colorGuideLoading || colorImageUrls.length < 2}
                        className="w-full flex items-center justify-center gap-2 py-2 text-xs font-semibold text-white bg-emerald-500 hover:bg-emerald-600 rounded-lg shadow-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {colorGuideLoading ? (
                          <>
                            <Loader2 size={14} className="animate-spin" />
                            생성 중...
                          </>
                        ) : (
                          <>
                            <Wand2 size={14} />
                            색상 안내 생성
                          </>
                        )}
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </aside>
  );
}

export default function DetailPageEditor({
  html,
  templateCss,
  productName,
  productId,
  rawImages = [],
  processedImages = [],
  onSave,
  onClose,
}: DetailPageEditorProps) {
  const parsed = useMemo(() => parseFullHtml(html), [html]);
  const [selectedImageSrc, setSelectedImageSrc] = useState<string | null>(null);
  const [selectedImageComponent, setSelectedImageComponent] = useState<any>(null);
  const [selectedTextComponent, setSelectedTextComponent] = useState<any>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [imageEditTarget, setImageEditTarget] = useState<{ component: any; imageUrl: string } | null>(null);
  const [imageEditOverlayRect, setImageEditOverlayRect] = useState<DOMRect | null>(null);
  const isBusyRef = useRef(false);
  const [showImagePicker, setShowImagePicker] = useState(false);
  const [uploadedImages, setUploadedImages] = useState<string[]>([]);
  const [editorRef, setEditorRef] = useState<Editor | null>(null);
  const [showLeftPanel, setShowLeftPanel] = useState(true);
  const [showRightPanel, setShowRightPanel] = useState(true);
  const [activeLeftTool, setActiveLeftTool] = useState<EditorToolId>('pages');
  const panelRawImages = useMemo(
    () => Array.from(new Set([...rawImages, ...uploadedImages])),
    [rawImages, uploadedImages],
  );
  const handleImagesUploaded = useCallback((imageUrls: string[]) => {
    setUploadedImages((prev) => Array.from(new Set([...prev, ...imageUrls])));
  }, []);

  useEffect(() => {
    const style = document.createElement('style');
    style.setAttribute('data-gjs-theme', '');
    style.textContent = GJS_THEME_CSS;
    document.head.appendChild(style);
    return () => {
      document.head.removeChild(style);
    };
  }, []);

  const handleAiFillComplete = useCallback(async () => {
    if (!editorRef || !productId) return;
    try {
      const preview = await apiClient.get<{ data: any }>(`/api/products/${productId}/preview`);
      const d = preview.data;
      if (!d) return;

      const wrapper = editorRef.getWrapper();
      if (!wrapper) return;

      const resolveUrl = (url: string) =>
        url.startsWith('/processed/') ? `${API_BASE}${url}` : url;

      const setText = (field: string, value: string) => {
        const comps = wrapper.find(`[data-field="${field}"]`);
        if (comps.length > 0 && value) comps[0].components(value);
      };

      const setImg = (field: string, url: string) => {
        const comps = wrapper.find(`[data-field="${field}"]`);
        if (comps.length > 0 && url) comps[0].setAttributes({ src: resolveUrl(url) });
      };

      setText('hookText', d.hook_text ?? d.hookText ?? '');
      setText('hookTitleSub', d.hook_title_sub ?? d.hookTitleSub ?? '');
      setText('sectionName', d.section_name ?? d.sectionName ?? '');
      setText('sectionTitle', d.section_title ?? d.sectionTitle ?? '');
      setText('detailText', d.detail_text ?? d.detailText ?? '');

      const desc = d.description ?? [];
      if (desc.length > 0) {
        setText('description', desc.join('\n'));
      }

      const subtitle = d.section_subtitle ?? d.sectionSubtitle ?? [];
      if (subtitle.length > 0) {
        setText('sectionSubtitle', subtitle.join('\n'));
      }

      const images = d.images ?? [];
      if (images[0]) setImg('heroImage', images[0]);

      const banner = d.hero_banner ?? d.heroBanner ?? '';
      if (banner) setImg('heroBanner', banner);

      const fillSection = (sectionName: string, urls: string[], alt: string) => {
        const sections = wrapper.find(`[data-section="${sectionName}"]`);
        if (sections.length === 0 || urls.length === 0) return;
        const section = sections[0];
        section.removeClass('hidden');
        const containers = wrapper.find(`[data-container="${sectionName}"]`);
        if (containers.length === 0) return;
        if (sectionName === 'sizeImages') {
          containers[0].components(buildSizeGuideFrameHtml({
            src: resolveUrl(urls[0]),
            alt,
            heightLabel: d.size_height_label ?? d.sizeHeightLabel ?? '',
            widthLabel: d.size_width_label ?? d.sizeWidthLabel ?? '',
          }));
          return;
        }
        containers[0].components(
          urls.map((url) => `<img src="${resolveUrl(url)}" alt="${alt}" class="w-full h-auto rounded-[var(--theme-radius)] shadow-md" />`).join('')
        );
      };

      const sizeImgs = d.size_images ?? d.sizeImages ?? [];
      fillSection('sizeImages', sizeImgs, '사이즈 안내');
      setText('sizeHeightLabel', d.size_height_label ?? d.sizeHeightLabel ?? '');
      setText('sizeWidthLabel', d.size_width_label ?? d.sizeWidthLabel ?? '');

      const detailImgs = d.detail_images ?? d.detailImages ?? [];
      fillSection('detailImages', detailImgs, '디테일 이미지');

      const colorImgs = d.color_images ?? d.colorImages ?? [];
      fillSection('colorImages', colorImgs, '색상 안내');
    } catch (err) {
      toast.error('캔버스 필드 업데이트에 실패했습니다.');
    }
  }, [editorRef, productId]);

  const handleEditorInit = useCallback(
    (editor: Editor) => {
      setEditorRef(editor);
      editor.setDevice(parsed.viewportWidth <= 720 ? 'detail-640' : 'detail-720');
      let frameHeightSyncTimer: number | null = null;
      const scheduleFrameHeightSync = () => {
        if (frameHeightSyncTimer !== null) window.clearTimeout(frameHeightSyncTimer);
        frameHeightSyncTimer = window.setTimeout(() => {
          frameHeightSyncTimer = null;
          syncEditorFrameHeight(editor);
        }, 80);
      };

      editor.on('canvas:frame:load:body', ({ window: iframeWindow }: { window: Window }) => {
        injectHeadResources(iframeWindow, parsed);
        iframeWindow.document.querySelectorAll('img').forEach((image) => {
          image.addEventListener('load', scheduleFrameHeightSync, { once: true });
        });
        scheduleFrameHeightSync();
      });

      editor.on('component:selected', (component: any) => {
        const type = (component.get('type') as string) ?? '';
        const tagName = ((component.get('tagName') as string) ?? '').toLowerCase();
        const TEXT_TAGS = ['p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'span', 'li'];
        const BLOCK_TAGS = new Set(['div', 'section', 'article', 'header', 'footer', 'p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'ul', 'ol', 'li', 'table', 'blockquote', 'figure']);

        if (type === 'image' || tagName === 'img') {
          setSelectedImageComponent(component);
          setSelectedImageSrc(component.getAttributes().src ?? '');
          setSelectedTextComponent(null);
        } else if (type === 'text' || type === 'text-ext' || TEXT_TAGS.includes(tagName)) {
          const children = component.components();
          const hasBlockChild = children?.models?.some((child: any) => {
            const childTag = ((child.get('tagName') as string) ?? '').toLowerCase();
            return BLOCK_TAGS.has(childTag);
          });
          if (hasBlockChild) {
            setSelectedImageComponent(null);
            setSelectedImageSrc(null);
            setSelectedTextComponent(null);
          } else {
            setSelectedTextComponent(component);
            setSelectedImageComponent(null);
            setSelectedImageSrc(null);
          }
        } else {
          setSelectedImageComponent(null);
          setSelectedImageSrc(null);
          setSelectedTextComponent(null);
        }
      });
      editor.on('component:deselected', () => {
        setSelectedImageComponent(null);
        setSelectedImageSrc(null);
        setSelectedTextComponent(null);
      });

      const PLACEHOLDER_SRC = 'https://placehold.co/860x860/e2e8f0/94a3b8?text=%5B%EC%9D%B4%EB%AF%B8%EC%A7%80%5D';

      editor.on('canvas:frame:load:body', ({ window: iframeWin }: { window: Window }) => {
        iframeWin.document.addEventListener('keydown', (e: KeyboardEvent) => {
          if (e.key !== 'Delete' && e.key !== 'Backspace') return;
          const sel = editor.getSelected();
          if (!sel) return;
          const t = (sel.get('type') as string) ?? '';
          const tag = ((sel.get('tagName') as string) ?? '').toLowerCase();
          if (t === 'image' || tag === 'img') {
            e.preventDefault();
            e.stopPropagation();
            sel.setAttributes({ src: PLACEHOLDER_SRC });
          }
        }, { capture: true });
      });

      editor.on('component:add', (component: any) => {
        if (component.get('type') !== 'image') return;
        const src = component.getAttributes()?.src;
        if (!src || src.includes('placehold.co')) return;
        const parent = component.parent();
        if (!parent) return;
        const idx = component.index();
        const siblings = parent.components();
        for (let i = Math.max(0, idx - 1); i <= Math.min(siblings.length - 1, idx + 1); i++) {
          const sibling = siblings.at(i);
          if (sibling === component) continue;
          const sibType = (sibling?.get('type') as string) ?? '';
          const sibTag = ((sibling?.get('tagName') as string) ?? '').toLowerCase();
          if ((sibType === 'image' || sibTag === 'img') && (sibling.getAttributes()?.src || '').includes('placehold.co')) {
            sibling.setAttributes({ src });
            component.remove();
            editor.select(sibling);
            return;
          }
        }
      });
      editor.on('component:update', scheduleFrameHeightSync);
      editor.on('component:remove', scheduleFrameHeightSync);
      editor.on('component:add', scheduleFrameHeightSync);

      rawImages.forEach((url, i) => {
        editor.Blocks.add(`raw-image-${i}`, {
          label: `원본 ${i + 1}`,
          category: '원본 이미지',
          // display:block + margin auto 로 가운데 정렬 — 기본 img inline 동작이 좌측 쏠림 유발
          content: `<img src="${url}" style="display:block;width:100%;max-width:600px;margin-left:auto;margin-right:auto;" />`,
          media: `<img src="${url}" style="width:60px;height:60px;object-fit:cover;" />`,
        });
      });

      const um = editor.UndoManager;
      um.stop();
      editor.setComponents(parsed.bodyHtml);
      um.clear();
      um.start();

      const wrapper = editor.getWrapper();
      if (wrapper) {
        requestAnimationFrame(() => {
          syncEditorFrameHeight(editor);
        });
      }
    },
    [parsed, rawImages],
  );

  const applyImageSrcToComponent = useCallback(
    (newUrl: string, targetComponent?: any) => {
      if (!editorRef) return null;
      const selected = targetComponent ?? selectedImageComponent ?? editorRef.getSelected();
      if (!selected) return null;
      const shouldSelectAfterUpdate =
        !targetComponent ||
        targetComponent === selectedImageComponent ||
        targetComponent === editorRef.getSelected();

      const attrs = selected.getAttributes?.() ?? {};
      selected.setAttributes?.({ ...attrs, src: newUrl });
      selected.view?.el?.setAttribute?.('src', newUrl);
      selected.view?.render?.();
      editorRef.trigger('component:update', selected);
      editorRef.refresh();

      requestAnimationFrame(() => {
        selected.view?.el?.setAttribute?.('src', newUrl);
        if (shouldSelectAfterUpdate) editorRef.select(selected);
        editorRef.refresh();
      });

      return selected;
    },
    [editorRef, selectedImageComponent],
  );

  const handleImageEdited = useCallback(
    (newUrl: string, targetComponent?: any) => {
      const selected = applyImageSrcToComponent(newUrl, targetComponent);
      if (!selected) return;
      if (!targetComponent || targetComponent === selectedImageComponent || targetComponent === editorRef?.getSelected()) {
        setSelectedImageComponent(selected);
        setSelectedImageSrc(newUrl);
      }
    },
    [applyImageSrcToComponent, editorRef, selectedImageComponent],
  );

  const handleImageReplaced = useCallback(
    (newUrl: string) => {
      const selected = applyImageSrcToComponent(newUrl);
      setShowImagePicker(false);
      if (!selected) return;
      setSelectedImageComponent(selected);
      setSelectedImageSrc(newUrl);
    },
    [applyImageSrcToComponent],
  );

  const handleImageGeneratingChange = useCallback((value: boolean, component?: any, imageUrl?: string) => {
    setIsGenerating(value);
    setImageEditTarget(value && component ? { component, imageUrl: imageUrl ?? '' } : null);
  }, []);

  const refreshCanvas = useCallback(() => {
    if (editorRef) requestAnimationFrame(() => editorRef.refresh());
  }, [editorRef]);

  useEffect(() => {
    if (!isGenerating || !editorRef || !imageEditTarget?.component) {
      setImageEditOverlayRect(null);
      return;
    }

    let frameId = 0;
    const updateRect = () => {
      const frame = getEditorFrameEl(editorRef);
      const imageEl = imageEditTarget.component.view?.el as HTMLElement | undefined;
      if (!frame || !imageEl) {
        setImageEditOverlayRect(null);
        frameId = requestAnimationFrame(updateRect);
        return;
      }

      const frameRect = frame.getBoundingClientRect();
      const imageRect = imageEl.getBoundingClientRect();
      setImageEditOverlayRect(
        new DOMRect(
          frameRect.left + imageRect.left,
          frameRect.top + imageRect.top,
          imageRect.width,
          imageRect.height,
        ),
      );
      frameId = requestAnimationFrame(updateRect);
    };

    frameId = requestAnimationFrame(updateRect);
    return () => cancelAnimationFrame(frameId);
  }, [editorRef, imageEditTarget, isGenerating]);

  return (
    <GjsEditor grapesjs={grapesjs} options={GRAPESJS_OPTIONS} onEditor={handleEditorInit}>
      <div className="flex flex-col h-screen bg-[#F5F7F8]">
        <WithEditor>
          <EditorToolbar
            productName={productName}
            productId={productId}
            templateCss={templateCss}
            parsed={parsed}
            onSave={onSave}
            onClose={onClose}
          />
        </WithEditor>

        <div className="flex min-h-0 min-w-0 flex-1 overflow-hidden">
          <div className={cn('flex h-full shrink-0', !showLeftPanel && 'hidden')}>
            <EditorToolRail activeTool={activeLeftTool} onSelect={setActiveLeftTool} />
            <WithEditor>
              <LeftPanel
                activeTool={activeLeftTool}
                onClose={() => setShowLeftPanel(false)}
                onOpenAiPanel={() => {
                  setShowRightPanel(true);
                  refreshCanvas();
                }}
                rawImages={panelRawImages}
                onImagesUploaded={handleImagesUploaded}
              />
            </WithEditor>
          </div>
          <div className="relative min-w-0 flex-1 overflow-hidden bg-slate-100">
            <Canvas />
            {isGenerating && imageEditOverlayRect && (
              <div
                className="pointer-events-none fixed z-50 flex items-center justify-center overflow-hidden rounded-[inherit] bg-slate-950/30 backdrop-blur-[1px]"
                style={{
                  left: imageEditOverlayRect.left,
                  top: imageEditOverlayRect.top,
                  width: imageEditOverlayRect.width,
                  height: imageEditOverlayRect.height,
                }}
              >
                <div className="flex min-w-[180px] max-w-[260px] flex-col items-center rounded-xl border border-white/70 bg-white/95 px-4 py-3 text-center shadow-xl">
                  <Loader2 size={22} className="animate-spin text-emerald-500" />
                  <p className="mt-2 text-xs font-black text-slate-800">
                    AI 이미지 처리 중...
                  </p>
                  <p className="mt-0.5 text-[10px] font-medium text-slate-500">
                    완료되면 이 이미지에 반영됩니다
                  </p>
                </div>
              </div>
            )}
            {!showLeftPanel && (
              <button
                type="button"
                onClick={() => {
                  setShowLeftPanel(true);
                  refreshCanvas();
                }}
                className="absolute top-2 left-2 z-10 p-1.5 bg-white border border-slate-200 rounded-lg shadow-sm text-slate-500 hover:text-slate-700 transition-colors"
                title="요소 패널 열기"
              >
                <PanelLeft size={14} />
              </button>
            )}
            {!showRightPanel && (
              <button
                type="button"
                onClick={() => {
                  setShowRightPanel(true);
                  refreshCanvas();
                }}
                className="absolute top-2 right-2 z-10 flex items-center gap-1.5 px-2.5 py-1.5 bg-emerald-500 hover:bg-emerald-600 text-white text-xs font-medium rounded-lg shadow-md transition-colors"
                title="AI 패널 열기"
              >
                <Sparkles size={13} />
                AI
              </button>
            )}
          </div>
          <div className={cn('flex h-full shrink-0', !showRightPanel && 'hidden')}>
            <WithEditor>
              <EditorDetailMinimap />
            </WithEditor>
            <WithEditor>
              <RightPanel
                onClose={() => {
                  setShowRightPanel(false);
                  refreshCanvas();
                }}
                selectedTextComponent={selectedTextComponent}
                selectedImageComponent={selectedImageComponent}
                isBusy={isBusyRef}
                selectedImageSrc={selectedImageSrc}
                onImageEdited={handleImageEdited}
                onImageReplace={() => setShowImagePicker(true)}
                onImageClose={() => {
                  setSelectedImageComponent(null);
                  setSelectedImageSrc(null);
                }}
                productId={productId}
                onAiFillComplete={handleAiFillComplete}
                onGeneratingChange={handleImageGeneratingChange}
                rawImages={panelRawImages}
                processedImages={processedImages}
                onImagesUploaded={handleImagesUploaded}
              />
            </WithEditor>
          </div>
        </div>
      </div>

      <ImagePickerModal
        open={showImagePicker}
        rawImages={panelRawImages}
        processedImages={processedImages}
        onUploadImages={handleImagesUploaded}
        onSelect={handleImageReplaced}
        onClose={() => setShowImagePicker(false)}
      />

      <AssetsProvider>
        {({ open, select, close }) => (
          <ImagePickerModal
            open={open}
            rawImages={panelRawImages}
            processedImages={processedImages}
            onUploadImages={handleImagesUploaded}
            onSelect={(url) => {
              if (!editorRef) return;
              const asset = editorRef.Assets.add({ type: 'image', src: url });
              const resolved = Array.isArray(asset) ? asset[0] : asset;
              if (resolved) select(resolved, true);
            }}
            onClose={close}
          />
        )}
      </AssetsProvider>
    </GjsEditor>
  );
}
