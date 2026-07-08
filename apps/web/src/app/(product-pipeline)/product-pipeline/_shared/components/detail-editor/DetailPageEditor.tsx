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
  Plus,
  Minus,
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
import { cancelOperation } from '@/lib/operation-cancellation';
import { cn } from '@/lib/utils';
import { useStore } from '@/store/useStore';
import 'grapesjs/dist/css/grapes.min.css';
import './grapesjs-editor.css';
import { buildSizeGuideFrameHtml } from '../../lib/size-guide-frame';
import TemplateSelectionModal from '../detail-page/TemplateSelectionModal';
import { useGenerateDetailPage, type GenerateMode } from '../../hooks/useGenerateDetailPage';
import {
  DownloadOptionsModal,
  type DetailPageDownloadOptions,
} from '../detail-page/DownloadOptionsModal';
import { AITextEditPanel } from './AITextEditPanel';
import EditorDetailMinimap from './EditorDetailMinimap';
import EditorPagePanel from './EditorPagePanel';
import EditorToolRail, { type EditorToolId } from './EditorToolRail';
import { ImagePickerModal } from './ImagePickerModal';
import { ImageSelectionPanel } from './ImageSelectionPanel';
import {
  buildDirectDetailGenerationBody,
  isDirectDetailGenerationFailed,
  isDirectDetailGenerationPending,
} from './lib/direct-detail-generation';
import { extractEditedImageUrl } from './lib/image-edit-result';
import {
  buildTemplateSectionBlockHtml,
  TEMPLATE_SECTION_PRESETS,
} from './template-section-blocks';

interface DetailPageEditorProps {
  html: string;
  templateCss: string;
  productName: string;
  productId?: string;
  contentGenerationId?: string;
  contentWorkspaceId?: string | null;
  generationRawInput?: unknown;
  generationTemplateId?: string | null;
  rawImages?: string[];
  processedImages?: string[];
  onGeneratedVersionReady?: (generationId: string) => void;
  onSave: (html: string) => Promise<DetailPageEditorSaveResult | void> | DetailPageEditorSaveResult | void;
  onClose: () => void;
}

interface DetailPageEditorSaveResult {
  html?: string | null;
  assetUrlMap?: Record<string, string>;
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

type ImageInsertMode = 'replace' | 'after-selected' | 'viewport';
type TextPanelTab = 'text' | 'font';

const DETAIL_EDITOR_FONT_CSS = `
  @font-face {
    font-family: "NanumSquareRoundLocal";
    src: url("/fonts/nanum-square-round/NanumSquareRoundOTFL.otf") format("opentype");
    font-weight: 300 500;
    font-style: normal;
    font-display: block;
  }
  @font-face {
    font-family: "NanumSquareRoundLocal";
    src: url("/fonts/nanum-square-round/NanumSquareRoundOTFEB.otf") format("opentype");
    font-weight: 700 900;
    font-style: normal;
    font-display: block;
  }
  @font-face {
    font-family: "Jalnan2Local";
    src: url("/fonts/jalnan2/Jalnan2TTF.ttf") format("truetype");
    font-weight: 400 900;
    font-style: normal;
    font-display: block;
  }
  @font-face {
    font-family: "NanumPen";
    src: url("https://hangeul.pstatic.net/hangeul_static/webfont/NanumBrush/NanumPen.woff") format("woff"),
      url("https://hangeul.pstatic.net/hangeul_static/webfont/NanumBrush/NanumPen.ttf") format("truetype");
    font-weight: 400;
    font-style: normal;
    font-display: block;
  }
  :root {
    --font-display: "Jalnan2Local", "NanumSquareRoundLocal", "NanumSquareNeoHeavy", "NanumSquareNeoExtraBold", sans-serif;
    --font-sans: "NanumSquareRoundLocal", "Noto Sans KR", "Pretendard", system-ui, sans-serif;
  }
`;
const DETAIL_EDITOR_FONT_STYLE_ATTR = 'data-kiditem-editor-fonts';

const DETAIL_EDITOR_BODY_FONT = 'var(--font-sans)';
const DETAIL_EDITOR_DISPLAY_FONT = 'var(--font-display)';
const DETAIL_EDITOR_TEXT_TAGS = new Set(['p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'span', 'li', 'strong', 'em']);
const TEXT_FONT_SIZE_MIN_PX = 8;
const TEXT_FONT_SIZE_MAX_PX = 180;
const TEXT_FONT_SIZE_STEP_PX = 2;
const DETAIL_EDITOR_FONT_PRESETS = [
  {
    label: '잘난체 2',
    description: '메인 타이틀 / 강조 문구',
    cssValue: DETAIL_EDITOR_DISPLAY_FONT,
    previewStyle: { fontFamily: '"Jalnan2Local", "NanumSquareRoundLocal", sans-serif', fontWeight: 900 },
  },
  {
    label: '나눔스퀘어라운드',
    description: '본문 / 설명 문구',
    cssValue: DETAIL_EDITOR_BODY_FONT,
    previewStyle: { fontFamily: '"NanumSquareRoundLocal", "Noto Sans KR", sans-serif', fontWeight: 800 },
  },
  {
    label: '나눔펜',
    description: '손글씨 느낌 문구',
    cssValue: '"NanumPen", cursive',
    previewStyle: { fontFamily: '"NanumPen", cursive', fontWeight: 400 },
  },
] as const;

const DEFAULT_DOWNLOAD_OPTIONS: DetailPageDownloadOptions = {
  format: 'jpeg',
  quality: 92,
  viewportWidth: 720,
  renderScale: 2,
  outputWidth: 860,
};

const TEXT_GRADIENT_PRESETS = [
  {
    label: '코랄',
    css: 'linear-gradient(90deg, #ff7a59 0%, #ffbf69 100%)',
  },
  {
    label: '핑크',
    css: 'linear-gradient(90deg, #ec4899 0%, #f97316 100%)',
  },
  {
    label: '블루',
    css: 'linear-gradient(90deg, #2563eb 0%, #06b6d4 100%)',
  },
  {
    label: '민트',
    css: 'linear-gradient(90deg, #10b981 0%, #84cc16 100%)',
  },
  {
    label: '퍼플',
    css: 'linear-gradient(90deg, #7c3aed 0%, #db2777 100%)',
  },
  {
    label: '골드',
    css: 'linear-gradient(90deg, #b45309 0%, #facc15 100%)',
  },
] as const;

const EDITOR_SAVE_TIMEOUT_MS = 45_000;

const CANVAS_CSS = `
  ${DETAIL_EDITOR_FONT_CSS}
  html, body {
    overflow-y: auto !important;
    font-family: var(--font-sans);
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
        content: `<h1 style="font-family:${DETAIL_EDITOR_DISPLAY_FONT};font-size:32px;font-weight:900;line-height:1.15;letter-spacing:0;padding:10px;">제목을 입력하세요</h1>`,
      },
      {
        id: 'heading2',
        label: 'H2 부제목',
        category: '기본',
        content: `<h2 style="font-family:${DETAIL_EDITOR_DISPLAY_FONT};font-size:24px;font-weight:900;line-height:1.2;letter-spacing:0;padding:10px;">부제목을 입력하세요</h2>`,
      },
      {
        id: 'text-block',
        label: '본문',
        category: '기본',
        content: `<p style="font-family:${DETAIL_EDITOR_BODY_FONT};font-size:16px;font-weight:500;line-height:1.6;padding:10px;">본문 텍스트를 입력하세요.</p>`,
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
    .replace(/\bmin-height\s*:\s*(\d+(?:\.\d+)?)px\s*;?/gi, (full, rawValue: string) => {
      const value = Number(rawValue);
      return Number.isFinite(value) && value >= 720 ? '' : full;
    })
    .replace(/\bheight\s*:\s*(\d+(?:\.\d+)?)px\s*;?/gi, (full, rawValue: string) => {
      const value = Number(rawValue);
      return Number.isFinite(value) && value >= 1200 ? '' : full;
    })
    .trim();
}

function buildDetailEditorFontStyleTag(): string {
  return `<style ${DETAIL_EDITOR_FONT_STYLE_ATTR}>${absolutizeFontUrls(DETAIL_EDITOR_FONT_CSS).trim()}</style>`;
}

function ensureDetailEditorFontStyle(head: HTMLHeadElement): void {
  const hasEditorFonts = Array.from(head.querySelectorAll('style')).some((style) => {
    const text = style.textContent ?? '';
    return style.hasAttribute(DETAIL_EDITOR_FONT_STYLE_ATTR) ||
      (/@font-face/i.test(text) && /Jalnan2Local|NanumSquareRoundLocal/.test(text));
  });
  if (hasEditorFonts) return;

  const style = head.ownerDocument.createElement('style');
  style.setAttribute(DETAIL_EDITOR_FONT_STYLE_ATTR, '');
  style.textContent = absolutizeFontUrls(DETAIL_EDITOR_FONT_CSS).trim();
  head.appendChild(style);
}

function extractPersistedEditorCss(headHtml: string): string {
  if (!headHtml.trim()) return '';
  const doc = new DOMParser().parseFromString(`<head>${headHtml}</head>`, 'text/html');
  return Array.from(doc.head.querySelectorAll('style'))
    .map((style) => style.textContent ?? '')
    .map((text) => absolutizeFontUrls(text).trim())
    .filter((text) =>
      /#i[\w-]+\{/.test(text) &&
      !/tailwindcss v|@font-face|\.kiditem-|html\s*\{|body\s*\{|\.gjs-/i.test(text),
    )
    .join('\n');
}

function findElementByCssId(doc: Document, id: string): HTMLElement | null {
  const escapedId =
    typeof CSS !== 'undefined' && typeof CSS.escape === 'function'
      ? CSS.escape(id)
      : id.replace(/([ !"#$%&'()*+,./:;<=>?@[\\\]^`{|}~])/g, '\\$1');
  return doc.getElementById(id) as HTMLElement | null ?? doc.querySelector<HTMLElement>(`#${escapedId}`);
}

function inlineCssRuleStylesIntoDocument(
  doc: Document,
  rules: CSSRuleList | undefined,
): void {
  if (!rules) return;
  for (const rule of Array.from(rules)) {
    if (rule instanceof CSSStyleRule) {
      const selectors = rule.selectorText.split(',');
      for (const selector of selectors) {
        const idMatch = selector.trim().match(/^#([\w-]+)$/);
        if (!idMatch) continue;
        const element = findElementByCssId(doc, idMatch[1]);
        if (!element) continue;
        for (const property of Array.from(rule.style)) {
          element.style.setProperty(
            property,
            rule.style.getPropertyValue(property),
            rule.style.getPropertyPriority(property),
          );
        }
      }
      continue;
    }

    if ('cssRules' in rule) {
      inlineCssRuleStylesIntoDocument(doc, (rule as CSSMediaRule | CSSSupportsRule).cssRules);
    }
  }
}

function inlineEditorCssIntoHtml(rawHtml: string, css: string): string {
  if (!css.trim()) return rawHtml;

  const source = rawHtml.trim();
  const isFullDocument = /^<!doctype\s+html/i.test(source) || /<html[\s>]/i.test(source);
  const startsWithBody = /^<body[\s>]/i.test(source);
  const doc = new DOMParser().parseFromString(
    isFullDocument ? source : startsWithBody ? source : `<body>${source}</body>`,
    'text/html',
  );
  const style = doc.createElement('style');
  style.textContent = css;
  doc.head.appendChild(style);

  try {
    inlineCssRuleStylesIntoDocument(doc, style.sheet?.cssRules);
  } catch {
    // If the browser cannot parse a generated CSS rule, keep the original
    // stylesheet. The save path still includes `css` in the document head.
  } finally {
    style.remove();
  }

  trimEditorDocumentHeightArtifacts(doc);

  if (isFullDocument) return `<!DOCTYPE html>\n${doc.documentElement.outerHTML}`;
  if (startsWithBody) return doc.body.outerHTML;
  return doc.body.innerHTML;
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

function removeHeadOnlyElementsFromBody(doc: Document): void {
  doc.body.querySelectorAll('meta, base, title, link, script, style').forEach((el) => el.remove());
}

function sanitizePersistedHead(headHtml: string, viewportContent: string): string {
  const doc = new DOMParser().parseFromString(`<head>${headHtml}</head>`, 'text/html');
  const head = doc.head;
  const hasCompiledTemplateStyles = Array.from(head.querySelectorAll('style')).some((style) =>
    /tailwindcss v|NanumSquareRoundLocal|--font-display/i.test(style.textContent ?? ''),
  );

  head.querySelectorAll('meta[charset], base, meta[name="viewport"]').forEach((el) => el.remove());
  head
    .querySelectorAll('link[rel="preload"], link[rel="modulepreload"], link[rel="preconnect"], link[rel="dns-prefetch"]')
    .forEach((el) => el.remove());
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
    const isPersistedEditorComponentStyle =
      /#i[\w-]+\{/.test(normalizedText) &&
      !/tailwindcss v|@font-face|\.kiditem-|html\s*\{|body\s*\{/i.test(normalizedText);

    if (
      isEditorWrapperStyle ||
      isEditorCanvasStyle ||
      isLegacyEditedHtmlFallbackStyle ||
      isPersistedEditorComponentStyle ||
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
  removeHeadOnlyElementsFromBody(doc);
  normalizeBodyAssetUrls(doc);
  repairBoldVerticalFramesInDocument(doc);
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

function repairPackageImageFramesInDocument(doc: Document) {
  doc.querySelectorAll<HTMLElement>('[data-role="package-image-frame"]').forEach((frame) => {
    frame.style.overflow = 'hidden';
    frame.style.borderRadius = '34px';
    frame.style.background = 'transparent';
    frame.style.border = '0';
    frame.style.padding = '0';
    frame.querySelectorAll<HTMLImageElement>('img').forEach((img) => {
      img.style.mixBlendMode = '';
      img.style.display = 'block';
      img.style.width = '100%';
      img.style.height = 'auto';
    });
  });
}

function repairSafetyLabelFramesInDocument(doc: Document) {
  doc.querySelectorAll<HTMLElement>('[data-role="safety-label-frame"]').forEach((frame) => {
    frame.style.background = '#8fa2cf';
    frame.style.borderRadius = '36px';
    frame.style.padding = '16px';
    const inner = Array.from(frame.children).find((child) => child.querySelector?.('img')) as HTMLElement | undefined;
    if (inner) {
      inner.style.background = '#ffffff';
      inner.style.borderRadius = '28px';
      inner.style.padding = '20px';
    }
  });
}

function repairBoldVerticalFramesInDocument(doc: Document) {
  repairPackageImageFramesInDocument(doc);
  repairSafetyLabelFramesInDocument(doc);
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

function setImageComponentSrc(
  editor: Editor | ReturnType<typeof useEditor>,
  component: any,
  src: string,
): void {
  const imageComponent = getEditableImageComponent(component) ?? component;
  preserveImageFrameForReplacement(imageComponent);

  const attrs = imageComponent?.getAttributes?.() ?? {};
  imageComponent?.set?.('src', src);
  imageComponent?.addAttributes?.({ ...attrs, src });
  imageComponent?.setAttributes?.({ ...attrs, src });
  imageComponent?.getEl?.()?.setAttribute?.('src', src);
  imageComponent?.view?.el?.setAttribute?.('src', src);
  imageComponent?.view?.render?.();
  if (imageComponent !== component) editor.trigger?.('component:update', imageComponent);
  editor.trigger?.('component:update', component);
  editor.trigger?.('update');
  editor.refresh?.();
}

function preserveImageFrameForReplacement(component: any): void {
  const target = getEditableImageComponent(component) ?? component;
  const element = target?.getEl?.() as HTMLImageElement | null | undefined;
  if (!target || !element) return;

  const rect = element.getBoundingClientRect();
  if (!Number.isFinite(rect.width) || !Number.isFinite(rect.height) || rect.width <= 1 || rect.height <= 1) return;

  const style = target.getStyle?.() ?? {};
  const existingWidth = String(style.width ?? '').trim();
  const existingHeight = String(style.height ?? '').trim();
  const existingMaxWidth = String(style['max-width'] ?? '').trim();
  const frameWidth = `${Math.round(rect.width)}px`;
  const frameHeight = `${Math.round(rect.height)}px`;
  const frameStyle: Record<string, string> = {
    display: 'block',
    width: existingWidth || frameWidth,
    height: existingHeight && existingHeight !== 'auto' ? existingHeight : frameHeight,
    'aspect-ratio': `${Math.round(rect.width)} / ${Math.round(rect.height)}`,
    'object-fit': String(style['object-fit'] ?? '').trim() || 'cover',
    'object-position': String(style['object-position'] ?? '').trim() || 'center',
  };

  if (!existingMaxWidth) frameStyle['max-width'] = '100%';
  target.addStyle?.(frameStyle);
  target.addAttributes?.({ 'data-preserve-frame': 'true' });
}

function isBrokenImageComponent(component: any): boolean {
  const attrs = component?.getAttributes?.() ?? {};
  const attrSrc = typeof attrs.src === 'string' ? attrs.src.trim() : '';
  const modelSrc = typeof component?.get?.('src') === 'string' ? component.get('src').trim() : '';
  const element = component?.getEl?.() as HTMLImageElement | null | undefined;
  const elementSrc = element?.getAttribute?.('src')?.trim() ?? '';
  const src = elementSrc || attrSrc || modelSrc;

  if (!src || src === '#' || src === 'undefined' || src === 'null' || src.includes('placehold.co')) return true;
  if (!element || element.tagName?.toLowerCase() !== 'img') return false;

  return element.complete && element.naturalWidth === 0 && element.naturalHeight === 0;
}

function removeImageComponent(editor: Editor | ReturnType<typeof useEditor>, component: any): void {
  if (!component) return;
  const target = getEditableImageComponent(component) ?? component;
  target.remove?.();
  editor.select?.(undefined);
  editor.trigger?.('component:remove', target);
  editor.trigger?.('update');
  editor.refresh?.();
}

function syncImageSourcesFromCanvas(editor: Editor): void {
  const wrapper = editor.getWrapper();
  if (!wrapper) return;

  for (const component of wrapper.find('img')) {
    if (isBrokenImageComponent(component)) {
      removeImageComponent(editor, component);
      continue;
    }

    const liveSrc = component.getEl?.()?.getAttribute?.('src') ?? '';
    if (!liveSrc) continue;
    const attrs = component.getAttributes?.() ?? {};
    if (attrs.src === liveSrc) continue;
    component.set?.('src', liveSrc);
    component.addAttributes?.({ src: liveSrc });
    component.setAttributes?.({ ...attrs, src: liveSrc });
  }
}

function isImageComponent(component: any): boolean {
  const type = (component?.get?.('type') as string) ?? '';
  const tag = ((component?.get?.('tagName') as string) ?? '').toLowerCase();
  return type === 'image' || tag === 'img';
}

function isTextComponent(component: any): boolean {
  const type = (component?.get?.('type') as string) ?? '';
  const tag = ((component?.get?.('tagName') as string) ?? '').toLowerCase();
  return type === 'text' || type === 'text-ext' || DETAIL_EDITOR_TEXT_TAGS.has(tag);
}

function getEditableTextComponent(component: any): any | null {
  if (!component) return null;
  if (isTextComponent(component)) return component;

  const textChildren = component.find?.(
    Array.from(DETAIL_EDITOR_TEXT_TAGS).join(','),
  ) ?? [];
  return textChildren.length === 1 ? textChildren[0] : null;
}

function getEditableImageComponent(component: any): any | null {
  if (!component) return null;
  if (isImageComponent(component)) return component;

  const images = component.find?.('img') ?? [];
  if (images.length === 1) return images[0];

  return null;
}

function getImageComponentSrc(component: any): string {
  const attrs = component?.getAttributes?.() ?? {};
  const attrSrc = typeof attrs.src === 'string' ? attrs.src.trim() : '';
  if (attrSrc) return toApiAssetUrl(attrSrc);
  const modelSrc = typeof component?.get?.('src') === 'string' ? component.get('src').trim() : '';
  if (modelSrc) return toApiAssetUrl(modelSrc);
  const element = component?.getEl?.() as HTMLImageElement | null | undefined;
  return element?.src ?? '';
}

function isAttachedComponent(component: any): boolean {
  return Boolean(component?.parent?.());
}

function isStructuralDuplicateBoundary(component: any, wrapper: any): boolean {
  if (!component || component === wrapper) return true;

  const tag = ((component.get?.('tagName') as string) ?? '').toLowerCase();
  const attrs = component.getAttributes?.() ?? {};
  return tag === 'body' || tag === 'main' || Boolean(attrs['data-section'] || attrs['data-container']);
}

function getComponentChildren(component: any): any[] {
  return component?.components?.()?.models ?? [];
}

function getImageDuplicateTarget(component: any, wrapper: any): any {
  if (!isImageComponent(component)) return component;

  const parent = component.parent?.();
  if (!parent || isStructuralDuplicateBoundary(parent, wrapper)) return component;

  const children = getComponentChildren(parent);
  const imageChildren = children.filter(isImageComponent);

  return children.length === 1 && imageChildren.length === 1 ? parent : component;
}

function componentContainsImage(component: any): boolean {
  return isImageComponent(component) || (component?.find?.('img') ?? []).length > 0;
}

function ensureImageDuplicateSpacing(component: any): void {
  const style = component.getStyle?.() ?? {};
  const current = Number.parseFloat(String(style['margin-top'] ?? '0'));
  const currentBottom = Number.parseFloat(String(style['margin-bottom'] ?? '0'));

  const nextStyle: Record<string, string> = {};
  if (!Number.isFinite(current) || current < 24) {
    nextStyle['margin-top'] = '24px';
  }
  if (!Number.isFinite(currentBottom) || currentBottom < 24) {
    nextStyle['margin-bottom'] = '24px';
  }
  if (isImageComponent(component)) {
    nextStyle.display = 'block';
  }
  if (Object.keys(nextStyle).length > 0) {
    component.addStyle?.(nextStyle);
  }
}

function ensureImageGapAfter(component: any): void {
  if (!componentContainsImage(component)) return;
  const style = component.getStyle?.() ?? {};
  const currentBottom = Number.parseFloat(String(style['margin-bottom'] ?? '0'));
  if (!Number.isFinite(currentBottom) || currentBottom < 24) {
    component.addStyle?.({ 'margin-bottom': '24px' });
  }
  if (isImageComponent(component)) {
    component.addStyle?.({ display: 'block' });
  }
}

function makeImageComponentInteractive(component: any): void {
  if (!component) return;
  const target = getEditableImageComponent(component) ?? component;
  target.set?.({
    selectable: true,
    hoverable: true,
    draggable: true,
    movable: true,
    copyable: true,
    removable: true,
    resizable: true,
  });
  if (isImageComponent(target)) {
    target.addStyle?.({
      display: 'block',
      cursor: 'move',
    });
  }
}

function isDetailImagesContext(component: any): boolean {
  let current = component;
  for (let depth = 0; current && depth < 8; depth++) {
    const attrs = current.getAttributes?.() ?? {};
    const text = [attrs['data-section'], attrs['data-container'], attrs.class, attrs.alt]
      .filter(Boolean)
      .join(' ');
    if (text.includes('detailImages') || text.includes('디테일 이미지')) return true;
    current = current.parent?.();
  }
  return false;
}

function getDetailImageStackItem(component: any): any | null {
  let item = component;
  let parent = component?.parent?.();
  for (let depth = 0; item && parent && depth < 8; depth++) {
    const attrs = parent.getAttributes?.() ?? {};
    if (attrs['data-container'] === 'detailImages') return item;
    item = parent;
    parent = parent.parent?.();
  }
  return null;
}

function normalizeDetailImageSpacing(editor: Editor | ReturnType<typeof useEditor>): void {
  const wrapper = editor.getWrapper?.();
  if (!wrapper) return;

  for (const image of wrapper.find('img')) {
    if (!isDetailImagesContext(image)) continue;
    const stackItem = getDetailImageStackItem(image);
    const stackParent = stackItem?.parent?.();
    const stackSiblings = stackParent ? getComponentChildren(stackParent).filter(componentContainsImage) : [];
    const stackIndex = stackItem ? stackSiblings.indexOf(stackItem) : -1;
    const imageParent = image.parent?.();
    const imageSiblings = imageParent ? getComponentChildren(imageParent).filter(componentContainsImage) : [];
    const imageIndex = imageSiblings.indexOf(image);
    const effectiveIndex = stackIndex >= 0 ? stackIndex : imageIndex;

    if (stackItem && stackItem !== image) {
      stackItem.addStyle?.({
        display: 'block',
        'margin-top': stackIndex > 0 ? '24px' : '0',
        'margin-bottom': '24px',
      });
    }

    image.addStyle?.({
      display: 'block',
      'margin-left': 'auto',
      'margin-right': 'auto',
      'margin-top': stackItem && stackItem !== image ? '0' : effectiveIndex > 0 ? '24px' : '0',
      'margin-bottom': stackItem && stackItem !== image ? '0' : '24px',
    });
  }
  editor.refresh?.();
}

function isSafetyLabelImageContext(component: any): boolean {
  let current = component;
  for (let depth = 0; current && depth < 8; depth++) {
    const attrs = current.getAttributes?.() ?? {};
    const text = [
      attrs['data-container'],
      attrs.alt,
      attrs.title,
      attrs.class,
      attrs.src,
      current.get?.('tagName'),
    ]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();

    if (
      text.includes('safetylabelimages') ||
      text.includes('safety-label') ||
      text.includes('barcode') ||
      text.includes('bar-code') ||
      text.includes('kc-label') ||
      text.includes('품질표시') ||
      text.includes('안전') ||
      text.includes('바코드')
    ) {
      return true;
    }

    current = current.parent?.();
  }

  return false;
}

async function trimWhiteImageWhitespace(imageUrl: string): Promise<string> {
  if (!imageUrl || imageUrl.includes('placehold.co') || typeof window === 'undefined') return imageUrl;

  try {
    const image = await loadImageForCanvas(imageUrl);
    const sourceWidth = image.naturalWidth || image.width;
    const sourceHeight = image.naturalHeight || image.height;
    if (sourceWidth <= 0 || sourceHeight <= 0) return imageUrl;

    const sourceCanvas = document.createElement('canvas');
    sourceCanvas.width = sourceWidth;
    sourceCanvas.height = sourceHeight;
    const sourceContext = sourceCanvas.getContext('2d', { willReadFrequently: true });
    if (!sourceContext) return imageUrl;

    sourceContext.drawImage(image, 0, 0, sourceWidth, sourceHeight);
    const imageData = sourceContext.getImageData(0, 0, sourceWidth, sourceHeight);
    const bounds = findNonWhiteImageBounds(imageData.data, sourceWidth, sourceHeight);
    if (!bounds) return imageUrl;

    const padding = Math.max(8, Math.round(Math.min(sourceWidth, sourceHeight) * 0.012));
    const left = Math.max(0, bounds.left - padding);
    const top = Math.max(0, bounds.top - padding);
    const right = Math.min(sourceWidth - 1, bounds.right + padding);
    const bottom = Math.min(sourceHeight - 1, bounds.bottom + padding);
    const width = right - left + 1;
    const height = bottom - top + 1;

    if (width / sourceWidth > 0.985 && height / sourceHeight > 0.985) return imageUrl;

    const outputCanvas = document.createElement('canvas');
    outputCanvas.width = width;
    outputCanvas.height = height;
    const outputContext = outputCanvas.getContext('2d');
    if (!outputContext) return imageUrl;

    outputContext.drawImage(sourceCanvas, left, top, width, height, 0, 0, width, height);
    return outputCanvas.toDataURL('image/png');
  } catch {
    return imageUrl;
  }
}

function loadImageForCanvas(imageUrl: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    if (!imageUrl.startsWith('data:') && !imageUrl.startsWith('blob:')) {
      image.crossOrigin = 'anonymous';
    }
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('Image failed to load'));
    image.src = imageUrl;
  });
}

function findNonWhiteImageBounds(
  data: Uint8ClampedArray,
  width: number,
  height: number,
): { left: number; top: number; right: number; bottom: number } | null {
  let left = width;
  let top = height;
  let right = -1;
  let bottom = -1;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const offset = (y * width + x) * 4;
      const alpha = data[offset + 3];
      const r = data[offset];
      const g = data[offset + 1];
      const b = data[offset + 2];
      const max = Math.max(r, g, b);
      const min = Math.min(r, g, b);
      const isWhite = alpha <= 12 || (min >= 248 && max - min <= 18);
      if (isWhite) continue;

      left = Math.min(left, x);
      top = Math.min(top, y);
      right = Math.max(right, x);
      bottom = Math.max(bottom, y);
    }
  }

  return right >= left && bottom >= top ? { left, top, right, bottom } : null;
}

async function prepareImageForComponent(imageUrl: string, component?: any): Promise<string> {
  return component && isSafetyLabelImageContext(component)
    ? trimWhiteImageWhitespace(imageUrl)
    : imageUrl;
}

function buildPersistedEditorHtml(
  editor: Editor,
  parsed: ParsedHtml,
  templateCss: string,
): string {
  syncImageSourcesFromCanvas(editor);
  normalizeDetailImageSpacing(editor);
  const css = sanitizeEditorCss(
    `${extractPersistedEditorCss(parsed.headHtml)}\n${editor.getCss({ avoidProtected: true }) ?? ''}`,
  );
  const html = inlineEditorCssIntoHtml(editor.getHtml(), css);
  const headResources = sanitizePersistedHead(
    `${parsed.headHtml}\n${buildDetailEditorFontStyleTag()}\n${templateCss ? `<style>${templateCss}</style>` : ''}`,
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

function withEditorSaveTimeout<T>(promise: Promise<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      const error = new Error('저장 요청이 오래 걸리고 있어요. 네트워크나 서버 상태를 확인한 뒤 다시 저장해주세요.');
      error.name = 'EditorSaveTimeoutError';
      reject(error);
    }, EDITOR_SAVE_TIMEOUT_MS);

    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

function replaceImageSrcsInEditor(editor: Editor, assetUrlMap: Record<string, string>): void {
  const entries = Object.entries(assetUrlMap);
  if (entries.length === 0) return;
  const wrapper = editor.getWrapper();
  if (!wrapper) return;
  for (const component of wrapper.find('img')) {
    const attrs = component.getAttributes?.() ?? {};
    const current = typeof attrs.src === 'string' ? attrs.src : '';
    const next = assetUrlMap[current];
    if (!next) continue;
    component.setAttributes?.({ ...attrs, src: next });
    component.view?.el?.setAttribute?.('src', next);
    component.view?.render?.();
    editor.trigger('component:update', component);
  }
  editor.refresh();
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

function parseCssPixelLength(value: string): number | null {
  const match = value.trim().match(/^(-?\d+(?:\.\d+)?)px$/i);
  return match ? Number(match[1]) : null;
}

function removeLargeDomHeightArtifacts(el: HTMLElement, allowHeightRemoval: boolean): void {
  const minHeight = parseCssPixelLength(el.style.minHeight);
  if (minHeight !== null && minHeight >= 720) {
    el.style.removeProperty('min-height');
  }

  const height = parseCssPixelLength(el.style.height);
  if (allowHeightRemoval && height !== null && height >= 1200) {
    el.style.removeProperty('height');
  }
}

function trimEditorDocumentHeightArtifacts(doc: Document): void {
  doc.querySelectorAll<HTMLStyleElement>('style').forEach((style) => {
    const text = style.textContent ?? '';
    const next = sanitizeEditorCss(text);
    if (next !== text) style.textContent = next;
  });

  const candidates = new Set<HTMLElement>();
  [doc.documentElement, doc.body].forEach((el) => candidates.add(el));
  Array.from(doc.body.children).forEach((el) => {
    if (el instanceof HTMLElement) candidates.add(el);
  });
  doc.querySelectorAll<HTMLElement>('[data-section], [data-container]').forEach((el) => {
    candidates.add(el);
    let parent = el.parentElement;
    while (parent && parent !== doc.body) {
      candidates.add(parent);
      parent = parent.parentElement;
    }
  });

  candidates.forEach((el) => {
    const isRootish = el === doc.documentElement || el === doc.body || el.parentElement === doc.body;
    const containsSection = el.querySelector('[data-section]') !== null;
    removeLargeDomHeightArtifacts(el, isRootish || containsSection);
  });
}

function getDetailContentExtent(doc: Document): { top: number; bottom: number; height: number } | null {
  const selectors = [
    'section',
    'img',
    'table',
    '[data-section]',
    '[data-container]',
    '[data-field]',
    '[data-role]',
    'h1',
    'h2',
    'h3',
    'h4',
    'h5',
    'h6',
    'p',
    'ul',
    'ol',
    'li',
  ].join(',');
  const rects = Array.from(doc.body.querySelectorAll<HTMLElement>(selectors))
    .filter((el) => !el.closest('.gjs-selected, .gjs-selected-parent, .gjs-hovered'))
    .map((el) => el.getBoundingClientRect())
    .filter((rect) => rect.width > 0 && rect.height > 0);

  if (rects.length === 0) return null;

  const top = Math.max(0, Math.floor(Math.min(...rects.map((rect) => rect.top))));
  const bottom = Math.ceil(Math.max(...rects.map((rect) => rect.bottom)));
  return {
    top,
    bottom,
    height: Math.max(1, bottom - top),
  };
}

function getEditorContentHeight(editor: Editor): number {
  const iframe = getEditorFrameEl(editor);
  const doc = iframe?.contentDocument;
  if (!doc?.body) return 1200;
  trimEditorDocumentHeightArtifacts(doc);
  const extent = getDetailContentExtent(doc);
  if (extent) return Math.max(240, extent.bottom);
  return Math.max(240, doc.body.scrollHeight, doc.documentElement.scrollHeight);
}

function scrubEditorRuntimeFromExport(doc: Document): void {
  trimEditorDocumentHeightArtifacts(doc);
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
  ensureDetailEditorFontStyle(head);

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
  repairBoldVerticalFramesInDocument(doc);
  removeHeadOnlyElementsFromBody(doc);
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
  const contentHeight = Math.max(240, getEditorContentHeight(editor));
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
  const scaledFrameHeight = `${Math.ceil(frameHeight * zoom + 48)}px`;
  framesEl?.style.setProperty('height', scaledFrameHeight);
  framesEl?.style.setProperty('min-height', scaledFrameHeight);
  const canvasElement = canvas.getElement();
  if (canvasElement) {
    const maxScrollTop = Math.max(0, canvasElement.scrollHeight - canvasElement.clientHeight);
    if (canvasElement.scrollTop > maxScrollTop) canvasElement.scrollTop = maxScrollTop;
  }
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
  onSave: (html: string) => Promise<DetailPageEditorSaveResult | void> | DetailPageEditorSaveResult | void;
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
  const [downloadModalOpen, setDownloadModalOpen] = useState(false);
  const [downloadOptions, setDownloadOptions] = useState<DetailPageDownloadOptions>(DEFAULT_DOWNLOAD_OPTIONS);
  const [downloadContentHeight, setDownloadContentHeight] = useState(1200);
  const [selectedVisible, setSelectedVisible] = useState(true);
  const [templateModalOpen, setTemplateModalOpen] = useState(false);

  // 템플릿 변경 — confirm 시 useGenerateDetailPage mutate (productId 기반).
  // 완료되면 새 draft_content 적재 → router.refresh 또는 사용자가 닫고 다시 진입해 확인.
  const { mutate: runRegenerate, isPending: regenerating } = useGenerateDetailPage(
    productId ?? '',
  );

  const handleTemplateChange = (templateId: string, mode: GenerateMode) => {
    if (!productId) {
      toast.error('productId 가 없어 템플릿 변경을 실행할 수 없습니다');
      return;
    }
    runRegenerate(
      { mode, templateId },
      {
        onSuccess: () => {
          toast.success('템플릿 적용 완료 — 닫고 다시 들어오면 반영된 미리보기를 볼 수 있습니다');
        },
      },
    );
  };

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
      const saveResult = await withEditorSaveTimeout(Promise.resolve().then(() => onSave(fullHtml)));
      if (saveResult?.assetUrlMap && Object.keys(saveResult.assetUrlMap).length > 0) {
        replaceImageSrcsInEditor(editor, saveResult.assetUrlMap);
      }
      // Save 성공 후 dirty 해제 + UndoManager 클리어 → "방금 저장된 상태" 가 새 베이스.
      setEditorDirty(false);
      editor.UndoManager.clear();
    } catch (err) {
      if (err instanceof Error && err.name === 'EditorSaveTimeoutError') {
        toast.error(err.message);
      }
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

  const openDownloadOptions = useCallback(() => {
    setDownloadOptions((current) => ({
      ...current,
      viewportWidth: 720,
    }));
    setDownloadContentHeight(getEditorContentHeight(editor));
    setDownloadModalOpen(true);
  }, [editor]);

  const handleExportImage = useCallback(async (options: DetailPageDownloadOptions) => {
    if (isExporting) return;
    setIsExporting(true);
    try {
      const fullHtml = await buildLiveEditorExportHtml(editor, parsed, templateCss);

      const res = await apiClient.fetchRaw('/api/render-image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          html: fullHtml,
          viewportWidth: 720,
          outputWidth: options.outputWidth,
          baseUrl: window.location.origin,
          format: options.format,
          quality: options.format === 'jpeg' ? options.quality : undefined,
        }),
      });
      if (!res.ok) throw new Error(`Export failed: ${res.status}`);

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${productName || 'page'}.${options.format === 'jpeg' ? 'jpg' : 'png'}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      setDownloadModalOpen(false);
      toast.success('이미지를 다운로드했어요.');
    } catch (err) {
      console.error('[detail-editor] image download failed', err);
      toast.error('이미지 다운로드에 실패했습니다.');
    } finally {
      setIsExporting(false);
    }
  }, [editor, isExporting, parsed, productName, templateCss]);

  const handleDuplicate = useCallback(() => {
    const selected = editor.getSelected();
    if (!selected) return;
    const duplicateTarget = getImageDuplicateTarget(selected, editor.getWrapper());
    const parent = duplicateTarget.parent();
    if (!parent) return;
    const clone = duplicateTarget.clone();
    if (componentContainsImage(selected) || componentContainsImage(duplicateTarget)) {
      ensureImageGapAfter(duplicateTarget);
      ensureImageDuplicateSpacing(clone);
    }
    const result = parent.components().add(clone, { at: duplicateTarget.index() + 1 });
    const component = Array.isArray(result) ? result[0] : result;
    if (component && componentContainsImage(component)) {
      ensureImageDuplicateSpacing(component);
      makeImageComponentInteractive(component);
      normalizeDetailImageSpacing(editor);
      editor.trigger('component:update', component);
      editor.refresh();
    }
    if (component) editor.select(component);
  }, [editor]);

  const handleAddImageBelow = useCallback(() => {
    const selected = editor.getSelected();
    const selectedImage = getEditableImageComponent(selected);
    const src = selectedImage?.getEl?.()?.getAttribute?.('src')
      ?? selectedImage?.getAttributes?.()?.src
      ?? selectedImage?.get?.('src');
    if (!selectedImage || !src) {
      toast.error('이미지를 선택한 뒤 아래 추가를 눌러주세요.');
      return;
    }
    insertImageAfterComponent(editor, selectedImage, src);
  }, [editor]);

  const handleDelete = useCallback(() => {
    const selected = editor.getSelected();
    if (selected) removeImageComponent(editor, selected);
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
    <>
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
        <ToolBtn icon={<Plus size={16} />} title="선택 이미지 아래 추가" onClick={handleAddImageBelow} disabled={!hasSelection} />
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
          onClick={() => setTemplateModalOpen(true)}
          className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-violet-700 hover:bg-violet-50 border border-violet-200 rounded-lg transition-colors"
          title="다른 템플릿으로 미리보기 + 적용"
        >
          <Layout size={14} />
          템플릿 변경
        </button>
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
          onClick={openDownloadOptions}
          disabled={isExporting}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-white bg-emerald-500 hover:bg-emerald-600 rounded-lg transition-colors shadow-sm disabled:opacity-50"
        >
          {isExporting ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
          다운로드
        </button>
      </div>

      {/* 템플릿 변경 모달 — confirm 시 useGenerateDetailPage 로 새 templateId 적용. */}
      <TemplateSelectionModal
        isOpen={templateModalOpen}
        onClose={() => setTemplateModalOpen(false)}
        onConfirm={handleTemplateChange}
      />
      {regenerating && (
        <div className="fixed top-14 right-3 z-50 flex items-center gap-2 rounded-lg bg-violet-600 px-3 py-2 text-xs font-semibold text-white shadow-lg">
          <Loader2 size={12} className="animate-spin" />
          템플릿 적용 중...
        </div>
      )}
    </div>
    <DownloadOptionsModal
      open={downloadModalOpen}
      options={downloadOptions}
      isDownloading={isExporting}
      contentHeight={downloadContentHeight}
      onOptionsChange={setDownloadOptions}
      onClose={() => setDownloadModalOpen(false)}
      onDownload={handleExportImage}
    />
    </>
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
  selectedImageComponent,
}: {
  activeTool: EditorToolId;
  onClose?: () => void;
  onOpenAiPanel: () => void;
  rawImages?: string[];
  onImagesUploaded: (imageUrls: string[]) => void;
  selectedImageComponent?: any;
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
        selectedImageComponent={selectedImageComponent}
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
  selectedImageComponent,
}: {
  activeTool: EditorToolId;
  editor: ReturnType<typeof useEditor>;
  onOpenAiPanel: () => void;
  rawImages: string[];
  onImagesUploaded: (imageUrls: string[]) => void;
  selectedImageComponent?: any;
}) {
  if (activeTool === 'pages') return <EditorPagePanel />;
  if (activeTool === 'text') return <TextToolPanel editor={editor} />;
  if (activeTool === 'image') {
    return (
      <ImageToolPanel
        editor={editor}
        rawImages={rawImages}
        onImagesUploaded={onImagesUploaded}
        selectedImageComponent={selectedImageComponent}
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
  const [tab, setTab] = useState<TextPanelTab>('text');
  const applyFont = useCallback(
    (fontFamily: string) => {
      const selected = getEditableTextComponent(editor.getSelected());
      if (!selected) {
        toast.error('폰트를 적용할 텍스트를 먼저 선택해주세요.');
        return;
      }
      applyComponentStyle(editor, selected, { 'font-family': fontFamily, 'letter-spacing': '0' });
    },
    [editor],
  );

  return (
    <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
      <div className="mb-4 grid grid-cols-2 rounded-lg border border-slate-200 bg-slate-50 p-1">
        <button
          type="button"
          onClick={() => setTab('text')}
          className={cn(
            'rounded-md py-2 text-xs font-black transition',
            tab === 'text' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700',
          )}
        >
          텍스트
        </button>
        <button
          type="button"
          onClick={() => setTab('font')}
          className={cn(
            'rounded-md py-2 text-xs font-black transition',
            tab === 'font' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700',
          )}
        >
          폰트
        </button>
      </div>

      {tab === 'font' ? (
        <div className="space-y-3">
          {DETAIL_EDITOR_FONT_PRESETS.map((font) => (
            <button
              key={font.label}
              type="button"
              className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-left transition hover:border-blue-300 hover:bg-blue-50"
              onClick={() => applyFont(font.cssValue)}
            >
              <span className="block text-lg leading-none text-slate-900" style={font.previewStyle}>
                {font.label}
              </span>
              <span className="mt-1 block text-xs font-semibold text-slate-400">{font.description}</span>
            </button>
          ))}
        </div>
      ) : (
        <>
      <div className="space-y-2">
        <QuickInsertButton
          label="메인 카피 텍스트 추가"
          onClick={() =>
            insertEditorHtml(
              editor,
              `<h2 style="font-family:${DETAIL_EDITOR_DISPLAY_FONT};font-size:42px;font-weight:900;line-height:1.16;letter-spacing:0;color:#111827;text-align:center;margin:24px 0;">메인 카피를 입력하세요</h2>`,
            )
          }
        />
        <QuickInsertButton
          label="서브 카피 텍스트 추가"
          onClick={() =>
            insertEditorHtml(
              editor,
              `<p style="font-family:${DETAIL_EDITOR_BODY_FONT};font-size:24px;font-weight:800;line-height:1.45;color:#374151;text-align:center;margin:18px 0;">서브 카피를 입력하세요</p>`,
            )
          }
        />
        <QuickInsertButton
          label="본문 텍스트 추가"
          onClick={() =>
            insertEditorHtml(
              editor,
              `<p style="font-family:${DETAIL_EDITOR_BODY_FONT};font-size:18px;font-weight:500;line-height:1.75;color:#4b5563;text-align:center;margin:16px 0;">본문 내용을 입력하세요.</p>`,
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
              `<div style="font-family:${DETAIL_EDITOR_BODY_FONT};margin:22px auto;padding:20px;border-radius:16px;background:#f8fafc;color:#111827;max-width:520px;"><strong style="font-family:${DETAIL_EDITOR_DISPLAY_FONT};font-weight:900;">${label}</strong><p style="margin:8px 0 0;color:#64748b;">내용을 입력하세요.</p></div>`,
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
              `<div style="font-family:${DETAIL_EDITOR_BODY_FONT};margin:24px auto;padding:28px;background:#ffffff;text-align:center;"><h3 style="font-family:${DETAIL_EDITOR_DISPLAY_FONT};font-size:30px;font-weight:900;letter-spacing:0;margin:0 0 10px;">${label}</h3><p style="font-size:17px;color:#64748b;margin:0;">내용을 입력해 주세요.</p></div>`,
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
        </>
      )}
    </div>
  );
}

function ImageToolPanel({
  editor,
  rawImages,
  onImagesUploaded,
  selectedImageComponent,
}: {
  editor: ReturnType<typeof useEditor>;
  rawImages: string[];
  onImagesUploaded: (imageUrls: string[]) => void;
  selectedImageComponent?: any;
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const imageDragActiveRef = useRef(false);
  const imageClickHandledRef = useRef(false);
  const [insertMode, setInsertMode] = useState<ImageInsertMode>('replace');
  const canReplaceSelectedImage = Boolean(selectedImageComponent && isAttachedComponent(selectedImageComponent));
  const activeInsertMode: ImageInsertMode = canReplaceSelectedImage ? insertMode : 'viewport';

  const handleFiles = useCallback(
    async (files: FileList | null) => {
      if (!files?.length) return;
      const uploadedUrls: string[] = [];
      for (const file of Array.from(files)) {
        const url = await readFileAsDataUrl(file);
        uploadedUrls.push(url);
        editor.AssetManager.add({ type: 'image', src: url });
        await insertImageIntoEditor(editor, url, selectedImageComponent, activeInsertMode);
      }
      if (uploadedUrls.length > 0) onImagesUploaded(uploadedUrls);
      if (fileInputRef.current) fileInputRef.current.value = '';
    },
    [activeInsertMode, editor, onImagesUploaded, selectedImageComponent],
  );

  const handleThumbnailActivate = useCallback(
    (event: React.MouseEvent<HTMLElement> | React.PointerEvent<HTMLElement>, url: string) => {
      event.preventDefault();
      event.stopPropagation();
      if (imageClickHandledRef.current) return;
      if (!canReplaceSelectedImage && imageDragActiveRef.current) return;
      imageClickHandledRef.current = true;
      imageDragActiveRef.current = false;
      void insertImageIntoEditor(editor, url, selectedImageComponent, activeInsertMode);
      window.setTimeout(() => {
        imageClickHandledRef.current = false;
      }, 0);
    },
    [activeInsertMode, canReplaceSelectedImage, editor, selectedImageComponent],
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

      <div className="mb-3 grid grid-cols-3 rounded-lg bg-slate-100 p-1 text-[11px] font-black text-slate-500">
        <button
          type="button"
          disabled={!canReplaceSelectedImage}
          onClick={() => setInsertMode('replace')}
          className={cn(
            'rounded-md px-2 py-1.5 transition disabled:cursor-not-allowed disabled:text-slate-300',
            activeInsertMode === 'replace' && 'bg-white text-slate-900 shadow-sm',
          )}
        >
          교체
        </button>
        <button
          type="button"
          disabled={!canReplaceSelectedImage}
          onClick={() => setInsertMode('after-selected')}
          className={cn(
            'rounded-md px-2 py-1.5 transition disabled:cursor-not-allowed disabled:text-slate-300',
            activeInsertMode === 'after-selected' && 'bg-white text-slate-900 shadow-sm',
          )}
        >
          아래 추가
        </button>
        <button
          type="button"
          onClick={() => setInsertMode('viewport')}
          className={cn(
            'rounded-md px-2 py-1.5 transition',
            activeInsertMode === 'viewport' && 'bg-white text-slate-900 shadow-sm',
          )}
        >
          현재 위치
        </button>
      </div>

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
                    draggable={activeInsertMode === 'viewport'}
                    className="aspect-square cursor-grab overflow-hidden rounded-xl border border-slate-200 bg-slate-50"
                    title={
                      activeInsertMode === 'replace'
                        ? '선택한 이미지 교체'
                        : activeInsertMode === 'after-selected'
                          ? '선택한 이미지 아래 추가'
                          : '현재 보고 있는 위치에 추가 · 드래그하여 배치'
                    }
                    onMouseDown={(event) => event.stopPropagation()}
                    onPointerUp={(event) => handleThumbnailActivate(event, thumbUrl)}
                    onDragStart={(event) => {
                      if (activeInsertMode !== 'viewport') {
                        event.preventDefault();
                        event.stopPropagation();
                        return;
                      }
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
                    onMouseUp={(event) => handleThumbnailActivate(event, thumbUrl)}
                    onClick={(event) => handleThumbnailActivate(event, thumbUrl)}
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
                  title={
                    activeInsertMode === 'replace'
                      ? '선택한 이미지 교체'
                      : activeInsertMode === 'after-selected'
                        ? '선택한 이미지 아래 추가'
                        : '현재 보고 있는 위치에 추가'
                  }
                  onMouseDown={(event) => event.stopPropagation()}
                  onClick={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    void insertImageIntoEditor(editor, url, selectedImageComponent, activeInsertMode);
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

function buildInsertedImageHtml(url: string, wrap = false): string {
  const imageHtml = `<img src="${url}" data-role="editable-image" style="display:block;width:100%;max-width:640px;margin:24px auto 24px;object-fit:cover;cursor:move;" />`;
  return wrap
    ? `<div data-role="inserted-image" style="display:block;margin:24px auto;">${imageHtml}</div>`
    : imageHtml;
}

function insertImageHtmlAt(
  editor: ReturnType<typeof useEditor>,
  parent: any,
  at: number,
  html: string,
): any | null {
  const added = parent
    ? parent.components().add(html, { at })
    : editor.addComponents(html);
  const component = Array.isArray(added) ? added[0] : added;
  if (component) {
    makeImageComponentInteractive(component);
    ensureImageDuplicateSpacing(component);
    normalizeDetailImageSpacing(editor);
    editor.select(component);
    editor.trigger?.('component:update', component);
    editor.refresh?.();
    requestAnimationFrame(() => scrollComponentIntoCanvasView(editor, component));
  }
  return component ?? null;
}

function getImageInsertionTargetAfter(
  editor: ReturnType<typeof useEditor>,
  component: any,
): { parent: any; at: number; wrap: boolean; previous: any } | null {
  const wrapper = editor.getWrapper();
  const image = getEditableImageComponent(component);
  if (!wrapper || !image || !isAttachedComponent(image)) return null;

  const duplicateTarget = getImageDuplicateTarget(image, wrapper);
  const parent = duplicateTarget?.parent?.();
  if (!parent) return null;

  return {
    parent,
    at: duplicateTarget.index() + 1,
    wrap: !isImageComponent(duplicateTarget),
    previous: duplicateTarget,
  };
}

function insertImageAfterComponent(
  editor: ReturnType<typeof useEditor>,
  component: any,
  url: string,
): any | null {
  const target = getImageInsertionTargetAfter(editor, component);
  if (!target) return null;
  ensureImageGapAfter(target.previous);
  return insertImageHtmlAt(editor, target.parent, target.at, buildInsertedImageHtml(url, target.wrap));
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

async function insertImageIntoEditor(
  editor: ReturnType<typeof useEditor>,
  url: string,
  targetComponent?: any,
  mode: ImageInsertMode = 'replace',
): Promise<void> {
  const currentSelection = editor.getSelected();
  const currentImage = getEditableImageComponent(currentSelection);
  const targetImage = getEditableImageComponent(targetComponent);
  const selected = currentImage && isAttachedComponent(currentImage)
    ? currentImage
    : targetImage && isAttachedComponent(targetImage)
      ? targetImage
      : currentSelection;
  const selectedImage = getEditableImageComponent(selected);
  const preparedUrl = await prepareImageForComponent(url, selectedImage ?? selected);

  if (mode === 'replace' && selectedImage && isAttachedComponent(selectedImage)) {
    setImageComponentSrc(editor, selectedImage, preparedUrl);
    makeImageComponentInteractive(selectedImage);
    editor.select(selectedImage);
    return;
  }

  if (mode === 'after-selected' && selectedImage && isAttachedComponent(selectedImage)) {
    const inserted = insertImageAfterComponent(editor, selectedImage, preparedUrl);
    if (inserted) return;
  }

  const target = getInsertionTarget(editor);
  insertImageHtmlAt(editor, target.parent, target.at, buildInsertedImageHtml(preparedUrl));
}

function applySelectedStyle(editor: ReturnType<typeof useEditor>, style: Record<string, string>) {
  const target = editor.getSelected() ?? editor.getWrapper();
  applyComponentStyle(editor, target, style);
}

function TextSizePanel({
  editor,
  component,
  compact = false,
}: {
  editor: Editor | ReturnType<typeof useEditor>;
  component?: any;
  compact?: boolean;
}) {
  const [fontSize, setFontSize] = useState(() => getTextFontSizePx(component ?? editor.getSelected?.()));

  useEffect(() => {
    setFontSize(getTextFontSizePx(component ?? editor.getSelected?.()));
  }, [component, editor]);

  const handleAdjust = useCallback(
    (delta: number) => {
      const applied = adjustTextFontSize(editor, component, delta);
      if (applied != null) setFontSize(applied);
    },
    [component, editor],
  );

  const handleInputChange = useCallback(
    (value: string) => {
      const numericValue = Number(value);
      if (!Number.isFinite(numericValue)) return;
      const applied = applyTextFontSize(editor, component, numericValue);
      if (applied != null) setFontSize(applied);
    },
    [component, editor],
  );

  return (
    <div className={cn('rounded-xl border border-slate-200 bg-white p-3', compact && 'bg-slate-50')}>
      <div className="mb-2 flex items-center justify-between">
        <span className="text-xs font-black text-slate-700">글자 크기</span>
        <span className="text-[10px] font-bold text-slate-400">{fontSize}px</span>
      </div>
      <div className="grid grid-cols-[42px_1fr_42px] items-center gap-2">
        <button
          type="button"
          onClick={() => handleAdjust(-TEXT_FONT_SIZE_STEP_PX)}
          className="flex h-10 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 transition hover:border-emerald-300 hover:bg-emerald-50 hover:text-emerald-700"
          title="글자 크기 줄이기"
          aria-label="글자 크기 줄이기"
        >
          <Minus size={16} />
        </button>
        <input
          type="number"
          min={TEXT_FONT_SIZE_MIN_PX}
          max={TEXT_FONT_SIZE_MAX_PX}
          value={fontSize}
          onChange={(event) => {
            const next = Number(event.target.value);
            setFontSize(Number.isFinite(next) ? clampTextFontSize(next) : fontSize);
          }}
          onBlur={(event) => handleInputChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault();
              handleInputChange((event.currentTarget as HTMLInputElement).value);
            }
          }}
          className="h-10 rounded-lg border border-slate-200 bg-white px-3 text-center text-sm font-black text-slate-800 outline-none transition focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100"
          aria-label="글자 크기 입력"
        />
        <button
          type="button"
          onClick={() => handleAdjust(TEXT_FONT_SIZE_STEP_PX)}
          className="flex h-10 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 transition hover:border-emerald-300 hover:bg-emerald-50 hover:text-emerald-700"
          title="글자 크기 키우기"
          aria-label="글자 크기 키우기"
        >
          <Plus size={16} />
        </button>
      </div>
    </div>
  );
}

function mergeInlineStyleText(currentStyle: string, nextStyle: Record<string, string>): string {
  const entries = new Map<string, string>();
  currentStyle
    .split(';')
    .map((part) => part.trim())
    .filter(Boolean)
    .forEach((declaration) => {
      const separatorIndex = declaration.indexOf(':');
      if (separatorIndex <= 0) return;
      const key = declaration.slice(0, separatorIndex).trim();
      const value = declaration.slice(separatorIndex + 1).trim();
      if (!key || !value) return;
      entries.set(key, value);
    });

  Object.entries(nextStyle).forEach(([key, value]) => {
    if (!value) return;
    entries.set(key, value);
  });

  return Array.from(entries.entries())
    .map(([key, value]) => `${key}:${value}`)
    .join(';');
}

function applyComponentStyle(
  editor: Editor | ReturnType<typeof useEditor>,
  component: any,
  style: Record<string, string>,
): void {
  if (!component) return;
  component.addStyle?.(style);

  const attrs = component.getAttributes?.() ?? {};
  const inlineStyle = mergeInlineStyleText(String(attrs.style ?? ''), style);
  component.addAttributes?.({ ...attrs, style: inlineStyle });
  component.setAttributes?.({ ...attrs, style: inlineStyle });

  const element = component.getEl?.() as HTMLElement | null | undefined;
  if (element) {
    Object.entries(style).forEach(([property, value]) => {
      element.style.setProperty(property, value);
    });
  }

  component.view?.render?.();
  editor.trigger?.('component:update', component);
  editor.trigger?.('update');
  editor.refresh?.();
}

function clampTextFontSize(size: number): number {
  if (!Number.isFinite(size)) return 24;
  return Math.min(TEXT_FONT_SIZE_MAX_PX, Math.max(TEXT_FONT_SIZE_MIN_PX, Math.round(size)));
}

function parsePixelFontSize(value: unknown): number | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  const pxMatch = trimmed.match(/^(-?\d+(?:\.\d+)?)px$/i);
  if (pxMatch) return clampTextFontSize(Number(pxMatch[1]));
  const numberMatch = trimmed.match(/^(-?\d+(?:\.\d+)?)$/);
  if (numberMatch) return clampTextFontSize(Number(numberMatch[1]));
  return null;
}

function readInlineStyleProperty(styleText: unknown, property: string): string | null {
  if (typeof styleText !== 'string') return null;
  const propertyName = property.toLowerCase();
  for (const declaration of styleText.split(';')) {
    const separatorIndex = declaration.indexOf(':');
    if (separatorIndex <= 0) continue;
    const key = declaration.slice(0, separatorIndex).trim().toLowerCase();
    if (key !== propertyName) continue;
    return declaration.slice(separatorIndex + 1).trim();
  }
  return null;
}

function getTextFontSizePx(component: any): number {
  const target = getEditableTextComponent(component) ?? component;
  const style = target?.getStyle?.() ?? {};
  const fromModel = parsePixelFontSize(style['font-size']);
  if (fromModel != null) return fromModel;

  const attrs = target?.getAttributes?.() ?? {};
  const fromAttr = parsePixelFontSize(readInlineStyleProperty(attrs.style, 'font-size'));
  if (fromAttr != null) return fromAttr;

  const element = target?.getEl?.() as HTMLElement | null | undefined;
  if (element && typeof window !== 'undefined') {
    const fromComputed = parsePixelFontSize(window.getComputedStyle(element).fontSize);
    if (fromComputed != null) return fromComputed;
  }

  return 24;
}

function applyTextFontSize(
  editor: Editor | ReturnType<typeof useEditor>,
  component: any,
  nextSize: number,
): number | null {
  const selected = component && isAttachedComponent(component) ? component : editor.getSelected?.();
  const target = getEditableTextComponent(selected);
  if (!target) {
    toast.error('크기를 조절할 텍스트를 먼저 선택해주세요.');
    return null;
  }

  const clamped = clampTextFontSize(nextSize);
  applyComponentStyle(editor, target, { 'font-size': `${clamped}px`, 'letter-spacing': '0' });
  return clamped;
}

function adjustTextFontSize(
  editor: Editor | ReturnType<typeof useEditor>,
  component: any,
  delta: number,
): number | null {
  const selected = component && isAttachedComponent(component) ? component : editor.getSelected?.();
  const target = getEditableTextComponent(selected);
  if (!target) {
    toast.error('크기를 조절할 텍스트를 먼저 선택해주세요.');
    return null;
  }
  return applyTextFontSize(editor, target, getTextFontSizePx(target) + delta);
}

function applyTextGradient(
  editor: ReturnType<typeof useEditor>,
  component: any,
  gradientCss: string,
): void {
  const selected = component && isAttachedComponent(component) ? component : editor.getSelected();
  const target = getEditableTextComponent(selected);
  if (!target) {
    toast.error('그라데이션을 적용할 텍스트를 먼저 선택해주세요.');
    return;
  }

  applyComponentStyle(editor, target, {
    'background-image': gradientCss,
    'background-repeat': 'repeat',
    'background-size': '100%',
    '-webkit-background-clip': 'text',
    'background-clip': 'text',
    '-webkit-text-fill-color': 'transparent',
    color: 'transparent',
    'box-decoration-break': 'clone',
    '-webkit-box-decoration-break': 'clone',
    'letter-spacing': '0',
  });
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ''));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

function TextGradientPanel({
  editor,
  component,
}: {
  editor: ReturnType<typeof useEditor>;
  component: any;
}) {
  const [startColor, setStartColor] = useState('#ff7a59');
  const [endColor, setEndColor] = useState('#ffbf69');

  const applyCustomGradient = useCallback(() => {
    applyTextGradient(editor, component, `linear-gradient(90deg, ${startColor} 0%, ${endColor} 100%)`);
  }, [component, editor, endColor, startColor]);

  return (
    <div className="shrink-0 border-b border-slate-100 bg-white px-3 py-3">
      <div className="mb-2 flex items-center justify-between">
        <span className="flex items-center gap-1.5 text-xs font-black text-slate-700">
          <Palette size={13} className="text-emerald-500" />
          그라데이션
        </span>
        <span className="text-[10px] font-bold text-slate-400">텍스트 색상</span>
      </div>

      <div className="grid grid-cols-3 gap-1.5">
        {TEXT_GRADIENT_PRESETS.map((preset) => (
          <button
            key={preset.label}
            type="button"
            onClick={() => applyTextGradient(editor, component, preset.css)}
            className="group rounded-lg border border-slate-200 bg-white p-1.5 text-left transition hover:border-emerald-300 hover:bg-emerald-50"
            title={`${preset.label} 그라데이션 적용`}
            aria-label={`${preset.label} 그라데이션 적용`}
          >
            <span
              className="block h-7 rounded-md shadow-inner ring-1 ring-black/5"
              style={{ backgroundImage: preset.css }}
            />
            <span className="mt-1 block text-center text-[10px] font-black text-slate-500 group-hover:text-emerald-700">
              {preset.label}
            </span>
          </button>
        ))}
      </div>

      <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50 p-2">
        <div className="grid grid-cols-[1fr_1fr_auto] items-end gap-2">
          <label className="space-y-1">
            <span className="block text-[10px] font-bold text-slate-400">시작</span>
            <input
              type="color"
              value={startColor}
              onChange={(event) => setStartColor(event.target.value)}
              className="h-9 w-full rounded-md border border-slate-200 bg-white p-1"
              aria-label="그라데이션 시작 색상"
            />
          </label>
          <label className="space-y-1">
            <span className="block text-[10px] font-bold text-slate-400">끝</span>
            <input
              type="color"
              value={endColor}
              onChange={(event) => setEndColor(event.target.value)}
              className="h-9 w-full rounded-md border border-slate-200 bg-white p-1"
              aria-label="그라데이션 끝 색상"
            />
          </label>
          <button
            type="button"
            onClick={applyCustomGradient}
            className="h-9 rounded-lg bg-emerald-500 px-3 text-[11px] font-black text-white shadow-sm transition hover:bg-emerald-600"
          >
            적용
          </button>
        </div>
        <div
          className="mt-2 h-2 rounded-full ring-1 ring-black/5"
          style={{ backgroundImage: `linear-gradient(90deg, ${startColor} 0%, ${endColor} 100%)` }}
        />
      </div>
    </div>
  );
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
  contentGenerationId,
  contentWorkspaceId,
  generationRawInput,
  generationTemplateId,
  productName,
  onGeneratedVersionReady,
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
  contentGenerationId?: string;
  contentWorkspaceId?: string | null;
  generationRawInput?: unknown;
  generationTemplateId?: string | null;
  productName: string;
  onGeneratedVersionReady?: (generationId: string) => void;
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
  const aiFillCancelRequestedRef = useRef(false);

  const handleAiFill = useCallback(async () => {
    if (aiFillLoading) return;
    isBusy.current = true;
    setAiFillLoading(true);
    aiFillCancelRequestedRef.current = false;
    onGeneratingChange?.(true);
    setAiFillStep('요청 전송 중...');
    try {
      const body = buildDirectDetailGenerationBody({
        generationRawInput,
        productName,
        productId,
        contentWorkspaceId,
        contentGenerationId,
        templateId: generationTemplateId,
        seedHookText,
        seedHookTitleSub,
        seedHeroImage,
        colorGuideEnabled,
        colorImageUrls,
      });
      const started = await apiClient.post<{ id: string }>('/api/ai/detail-page/generate', body);
      setAiFillTaskId(started.id);
      setAiFillStep('상세페이지 생성 중...');
      if (aiFillCancelRequestedRef.current) {
        await cancelOperation({
          targetType: 'content_generation',
          generationId: started.id,
          reason: '사용자 요청',
        });
        throw new Error('AI_FILL_CANCELLED');
      }

      const maxAttempts = 120;
      for (let i = 0; i < maxAttempts; i++) {
        await new Promise(r => setTimeout(r, 2000));
        if (aiFillCancelRequestedRef.current) {
          throw new Error('AI_FILL_CANCELLED');
        }

        let generation: {
          id: string;
          imageProcessingStatus?: string | null;
          imageProcessingError?: string | null;
        };
        try {
          generation = await apiClient.get<typeof generation>(`/api/ai/detail-page/${started.id}`);
        } catch { continue; }

        if (isDirectDetailGenerationFailed(generation.imageProcessingStatus)) {
          throw new Error(generation.imageProcessingError || 'AI 생성에 실패했습니다');
        }
        if (!isDirectDetailGenerationPending(generation.imageProcessingStatus)) {
          setHasGenerated(true);
          onGeneratedVersionReady?.(generation.id);
          return;
        }
      }
      throw new Error('시간 초과');
    } catch (err) {
      if (!(err instanceof Error && err.message === 'AI_FILL_CANCELLED')) {
        toast.error('AI 생성에 실패했습니다.');
      }
    } finally {
      isBusy.current = false;
      setAiFillLoading(false);
      onGeneratingChange?.(false);
      setAiFillStep('');
      setAiFillTaskId(null);
    }
  }, [
    aiFillLoading,
    colorGuideEnabled,
    colorImageUrls,
    contentGenerationId,
    contentWorkspaceId,
    generationRawInput,
    generationTemplateId,
    isBusy,
    onGeneratedVersionReady,
    onGeneratingChange,
    productId,
    productName,
    seedHeroImage,
    seedHookText,
    seedHookTitleSub,
  ]);

  const handleAiFillCancel = useCallback(async () => {
    aiFillCancelRequestedRef.current = true;
    if (!aiFillTaskId) {
      isBusy.current = false;
      setAiFillLoading(false);
      onGeneratingChange?.(false);
      setAiFillStep('');
      return;
    }
    try {
      await cancelOperation({
        targetType: 'content_generation',
        generationId: aiFillTaskId,
        reason: '사용자 요청',
      });
      toast.success('AI 작업 중단 요청 완료');
      isBusy.current = false;
      setAiFillLoading(false);
      onGeneratingChange?.(false);
      setAiFillStep('');
      setAiFillTaskId(null);
    } catch (err) {
      toast.error('AI 작업 취소에 실패했습니다.');
    }
  }, [aiFillTaskId, isBusy, onGeneratingChange]);

  const handleColorGuideGenerate = useCallback(async () => {
    if (!productId || colorImageUrls.length < 2) return;
    setColorGuideLoading(true);
    try {
      const data = await apiClient.post<{ taskId: string }>('/api/image-ai/edit', {
        preset: 'color_guide',
        image_urls: colorImageUrls,
        productId,
      });
      const taskId = data.taskId;
      if (!taskId) throw new Error('이미지 작업을 시작하지 못했습니다.');

      for (let i = 0; i < 120; i++) {
        await new Promise(r => setTimeout(r, 2000));

        let task: {
          status: string;
          output?: unknown;
          errorCode?: string | null;
          errorMessage?: string | null;
        };
        try {
          task = await apiClient.get<typeof task>(`/api/image-ai/tasks/${taskId}`);
        } catch { continue; }

        if (task.status === 'failed' || task.status === 'cancelled' || task.status === 'skipped') {
          throw new Error(task.errorMessage || task.errorCode || '색상 안내 생성 실패');
        }

        if (task.status !== 'succeeded') continue;

        {
          const imageUrl = extractEditedImageUrl(task.output ?? null);
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
            `<img src="${resolveUrl(imageUrl)}" alt="색상 안내" class="w-full h-auto rounded-[var(--theme-radius)] shadow-md" />`,
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
          <>
            <div className="shrink-0 border-b border-slate-100 bg-white px-3 py-3">
              <TextSizePanel editor={editor} component={selectedTextComponent} compact />
            </div>
            <TextGradientPanel editor={editor} component={selectedTextComponent} />
            <AITextEditPanel
              component={selectedTextComponent}
              editor={editor}
              isBusy={isBusy}
              onClose={() => {/* deselect handled by parent */}}
            />
          </>
        ) : selectedImageSrc && selectedImageComponent ? (
          <ImageSelectionPanel
            component={selectedImageComponent}
            editor={editor}
            imageUrl={selectedImageSrc}
            productId={productId}
            contentGenerationId={contentGenerationId}
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
              <p className="text-[10px] text-slate-400 mt-1">생성이 완료되면 새 버전으로 이동합니다</p>
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
  contentGenerationId,
  contentWorkspaceId,
  generationRawInput,
  generationTemplateId,
  rawImages = [],
  processedImages = [],
  onGeneratedVersionReady,
  onSave,
  onClose,
}: DetailPageEditorProps) {
  const parsed = useMemo(() => parseFullHtml(html), [html]);
  const [selectedImageSrc, setSelectedImageSrc] = useState<string | null>(null);
  const [selectedImageComponent, setSelectedImageComponent] = useState<any>(null);
  const [selectedTextComponent, setSelectedTextComponent] = useState<any>(null);
  const lastSelectedImageComponentRef = useRef<any>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [imageEditTarget, setImageEditTarget] = useState<{ component: any; imageUrl: string } | null>(null);
  const [imageEditOverlayRect, setImageEditOverlayRect] = useState<DOMRect | null>(null);
  const isBusyRef = useRef(false);
  const [showImagePicker, setShowImagePicker] = useState(false);
  const [uploadedImages, setUploadedImages] = useState<string[]>([]);
  const [editorRef, setEditorRef] = useState<Editor | null>(null);
  const editorCleanupRef = useRef<(() => void) | null>(null);
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

  useEffect(() => () => {
    editorCleanupRef.current?.();
    editorCleanupRef.current = null;
  }, []);

  const handleEditorInit = useCallback(
    (editor: Editor) => {
      editorCleanupRef.current?.();
      editorCleanupRef.current = null;
      setEditorRef(editor);
      editor.setDevice(parsed.viewportWidth <= 720 ? 'detail-640' : 'detail-720');
      let frameHeightSyncTimer: number | null = null;
      const frameListenerCleanups: Array<() => void> = [];
      const scheduleFrameHeightSync = () => {
        if (frameHeightSyncTimer !== null) window.clearTimeout(frameHeightSyncTimer);
        frameHeightSyncTimer = window.setTimeout(() => {
          frameHeightSyncTimer = null;
          syncEditorFrameHeight(editor);
        }, 80);
      };

      const handleFrameLoadResources = ({ window: iframeWindow }: { window: Window }) => {
        injectHeadResources(iframeWindow, parsed);
        iframeWindow.document.querySelectorAll('img').forEach((image) => {
          image.addEventListener('load', scheduleFrameHeightSync, { once: true });
          frameListenerCleanups.push(() => image.removeEventListener('load', scheduleFrameHeightSync));
        });
        scheduleFrameHeightSync();
      };

      const handleComponentSelected = (component: any) => {
        const imageComponent = getEditableImageComponent(component);
        const type = (component.get('type') as string) ?? '';
        const tagName = ((component.get('tagName') as string) ?? '').toLowerCase();
        const TEXT_TAGS = ['p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'span', 'li'];
        const BLOCK_TAGS = new Set(['div', 'section', 'article', 'header', 'footer', 'p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'ul', 'ol', 'li', 'table', 'blockquote', 'figure']);

        if (imageComponent) {
          makeImageComponentInteractive(imageComponent);
          lastSelectedImageComponentRef.current = imageComponent;
          setSelectedImageComponent(imageComponent);
          setSelectedImageSrc(getImageComponentSrc(imageComponent));
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
            lastSelectedImageComponentRef.current = null;
            setSelectedTextComponent(null);
          } else {
            setSelectedTextComponent(component);
            setSelectedImageComponent(null);
            setSelectedImageSrc(null);
            lastSelectedImageComponentRef.current = null;
          }
        } else {
          setSelectedImageComponent(null);
          setSelectedImageSrc(null);
          lastSelectedImageComponentRef.current = null;
          setSelectedTextComponent(null);
        }
      };
      const handleComponentDeselected = () => {
        setSelectedTextComponent(null);
      };

      const handleFrameLoadDeleteShortcut = ({ window: iframeWin }: { window: Window }) => {
        const handleFrameKeyDown = (e: KeyboardEvent) => {
          if (e.key !== 'Delete' && e.key !== 'Backspace') return;
          const sel = editor.getSelected();
          if (!sel) return;
          const t = (sel.get('type') as string) ?? '';
          const tag = ((sel.get('tagName') as string) ?? '').toLowerCase();
          if (t === 'image' || tag === 'img') {
            e.preventDefault();
            e.stopPropagation();
            removeImageComponent(editor, sel);
          }
        };
        iframeWin.document.addEventListener('keydown', handleFrameKeyDown, { capture: true });
        frameListenerCleanups.push(() => {
          iframeWin.document.removeEventListener('keydown', handleFrameKeyDown, true);
        });
      };

      const handleImageComponentAdd = (component: any) => {
        if (component.get('type') !== 'image') return;
        makeImageComponentInteractive(component);
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
      };
      const handleComponentRemove = (component: any) => {
        scheduleFrameHeightSync();
        if (isImageComponent(component) || !isAttachedComponent(lastSelectedImageComponentRef.current)) {
          lastSelectedImageComponentRef.current = null;
          setSelectedImageComponent(null);
          setSelectedImageSrc(null);
        }
      };

      editor.on('canvas:frame:load:body', handleFrameLoadResources);
      editor.on('component:selected', handleComponentSelected);
      editor.on('component:deselected', handleComponentDeselected);
      editor.on('canvas:frame:load:body', handleFrameLoadDeleteShortcut);
      editor.on('component:add', handleImageComponentAdd);
      editor.on('component:update', scheduleFrameHeightSync);
      editor.on('component:remove', handleComponentRemove);
      editor.on('component:add', scheduleFrameHeightSync);
      editorCleanupRef.current = () => {
        if (frameHeightSyncTimer !== null) {
          window.clearTimeout(frameHeightSyncTimer);
          frameHeightSyncTimer = null;
        }
        editor.off('canvas:frame:load:body', handleFrameLoadResources);
        editor.off('component:selected', handleComponentSelected);
        editor.off('component:deselected', handleComponentDeselected);
        editor.off('canvas:frame:load:body', handleFrameLoadDeleteShortcut);
        editor.off('component:add', handleImageComponentAdd);
        editor.off('component:update', scheduleFrameHeightSync);
        editor.off('component:remove', handleComponentRemove);
        editor.off('component:add', scheduleFrameHeightSync);
        frameListenerCleanups.splice(0).forEach((cleanup) => cleanup());
      };

      rawImages.forEach((url, i) => {
        editor.Blocks.add(`raw-image-${i}`, {
          label: `원본 ${i + 1}`,
          category: '원본 이미지',
          // display:block + margin auto 로 가운데 정렬 — 기본 img inline 동작이 좌측 쏠림 유발
          content: buildInsertedImageHtml(url),
          media: `<img src="${url}" style="width:60px;height:60px;object-fit:cover;" />`,
        });
      });

      const um = editor.UndoManager;
      um.stop();
      editor.setComponents(parsed.bodyHtml);
      normalizeDetailImageSpacing(editor);
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
      const requested = targetComponent && isAttachedComponent(targetComponent)
        ? targetComponent
        : selectedImageComponent && isAttachedComponent(selectedImageComponent)
          ? selectedImageComponent
          : lastSelectedImageComponentRef.current && isAttachedComponent(lastSelectedImageComponentRef.current)
            ? lastSelectedImageComponentRef.current
            : editorRef.getSelected();
      const selected = getEditableImageComponent(requested);
      if (!selected) return null;
      const shouldSelectAfterUpdate =
        !targetComponent ||
        targetComponent === selectedImageComponent ||
        targetComponent === lastSelectedImageComponentRef.current ||
        targetComponent === editorRef.getSelected();

      setImageComponentSrc(editorRef, selected, newUrl);
      lastSelectedImageComponentRef.current = selected;

      requestAnimationFrame(() => {
        setImageComponentSrc(editorRef, selected, newUrl);
        if (shouldSelectAfterUpdate) editorRef.select(selected);
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
        lastSelectedImageComponentRef.current = selected;
        setSelectedImageComponent(selected);
        setSelectedImageSrc(newUrl);
      }
    },
    [applyImageSrcToComponent, editorRef, selectedImageComponent],
  );

  const handleImageReplaced = useCallback(
    async (newUrl: string) => {
      const target = selectedImageComponent && isAttachedComponent(selectedImageComponent)
        ? selectedImageComponent
        : lastSelectedImageComponentRef.current && isAttachedComponent(lastSelectedImageComponentRef.current)
          ? lastSelectedImageComponentRef.current
          : editorRef?.getSelected();
      const preparedUrl = await prepareImageForComponent(newUrl, target);
      const selected = applyImageSrcToComponent(preparedUrl, target);
      setShowImagePicker(false);
      if (!selected) return;
      lastSelectedImageComponentRef.current = selected;
      setSelectedImageComponent(selected);
      setSelectedImageSrc(preparedUrl);
    },
    [applyImageSrcToComponent, editorRef, selectedImageComponent],
  );

  const refreshCanvas = useCallback(() => {
    if (editorRef) requestAnimationFrame(() => editorRef.refresh());
  }, [editorRef]);

  const handleImageGeneratingChange = useCallback((value: boolean, component?: any, imageUrl?: string) => {
    setIsGenerating(value);
    setImageEditTarget(value && component ? { component, imageUrl: imageUrl ?? '' } : null);
  }, []);

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

  const imageReplacementComponent =
    selectedImageComponent && isAttachedComponent(selectedImageComponent)
      ? selectedImageComponent
      : lastSelectedImageComponentRef.current && isAttachedComponent(lastSelectedImageComponentRef.current)
        ? lastSelectedImageComponentRef.current
        : null;

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
                selectedImageComponent={imageReplacementComponent}
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
                  <p className="mt-2 text-xs font-black text-slate-800">AI 이미지 처리 중...</p>
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
                  lastSelectedImageComponentRef.current = null;
                }}
                productId={productId}
                contentGenerationId={contentGenerationId}
                contentWorkspaceId={contentWorkspaceId}
                generationRawInput={generationRawInput}
                generationTemplateId={generationTemplateId}
                productName={productName}
                onGeneratedVersionReady={onGeneratedVersionReady}
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
