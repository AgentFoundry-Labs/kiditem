import type { Editor } from 'grapesjs';
import { API_BASE } from '@/lib/api';
import { buildSizeGuideFrameHtml } from '../../../lib/size-guide-frame';

export interface ParsedHtml {
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

const API_BASE_ROOT = API_BASE.replace(/\/$/, '');

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

export function getEditorFrameEl(editor: Editor | null | undefined): HTMLIFrameElement | null {
  const canvas = editor?.Canvas;
  if (!canvas || typeof canvas.getFrameEl !== 'function') return null;
  return canvas.getFrameEl() ?? null;
}

function getLiveEditorHeadHtml(editor: Editor): string {
  const iframeDoc = getEditorFrameEl(editor)?.contentDocument;
  return iframeDoc?.head.innerHTML ?? '';
}

export function buildPersistedEditorHtml(
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

export function parseFullHtml(fullHtml: string): ParsedHtml {
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

export function injectHeadResources(iframeWindow: Window, parsed: ParsedHtml) {
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

export function syncEditorFrameHeight(editor: Editor) {
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
