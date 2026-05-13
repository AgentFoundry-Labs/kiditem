'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { MouseEvent } from 'react';
import { useEditor } from '@grapesjs/react';
import { cn } from '@/lib/utils';

type GjsEditor = ReturnType<typeof useEditor>;

interface EditorDetailMinimapProps {
  floating?: boolean;
}

interface PreviewMetrics {
  width: number;
  height: number;
  scale: number;
  viewportTop: number;
  viewportHeight: number;
}

interface FloatingPosition {
  left: number;
  top: number;
  height: number;
}

const SCRIPTLESS_SANDBOX = 'allow-same-origin';
const MINIMAP_WIDTH = 132;
const PREVIEW_WIDTH = 116;
const FALLBACK_PREVIEW_WIDTH = 720;
const FALLBACK_PREVIEW_HEIGHT = 2400;
const FLOATING_GAP = 12;
const FLOATING_EDGE = 12;

export default function EditorDetailMinimap({ floating = false }: EditorDetailMinimapProps) {
  const editor = useEditor();
  const rootRef = useRef<HTMLElement>(null);
  const previewFrameRef = useRef<HTMLIFrameElement>(null);
  const minimapRef = useRef<HTMLDivElement>(null);
  const refreshTimerRef = useRef<number | null>(null);
  const previewPointerStartRef = useRef<{ x: number; y: number } | null>(null);
  const [previewHtml, setPreviewHtml] = useState('');
  const [floatingPosition, setFloatingPosition] = useState<FloatingPosition | null>(null);
  const [metrics, setMetrics] = useState<PreviewMetrics>({
    width: FALLBACK_PREVIEW_WIDTH,
    height: FALLBACK_PREVIEW_HEIGHT,
    scale: PREVIEW_WIDTH / FALLBACK_PREVIEW_WIDTH,
    viewportTop: 0,
    viewportHeight: 900,
  });

  const rebuildPreview = useCallback(() => {
    const wrapper = editor.getWrapper();
    const bodyHtml = editor.getHtml() || wrapper?.toHTML?.() || '';
    const css = editor.getCss({ avoidProtected: true }) || '';
    const headAssets = collectEditorHeadAssets(editor);
    setPreviewHtml(buildPreviewDocument(bodyHtml, css, headAssets));
  }, [editor]);

  const syncFloatingPosition = useCallback(() => {
    if (!floating) return;

    const frame = editor.Canvas.getFrameEl();
    const container = rootRef.current?.parentElement;
    if (!frame || !container) return;

    const frameRect = frame.getBoundingClientRect();
    const containerRect = container.getBoundingClientRect();
    const maxHeight = Math.max(320, containerRect.height - FLOATING_EDGE * 2);
    const height = Math.min(maxHeight, Math.max(420, frameRect.height));
    const idealTop = frameRect.top - containerRect.top;
    const top = Math.max(
      FLOATING_EDGE,
      Math.min(idealTop, containerRect.height - height - FLOATING_EDGE),
    );
    const left = Math.max(
      FLOATING_EDGE,
      frameRect.left - containerRect.left - MINIMAP_WIDTH - FLOATING_GAP,
    );

    setFloatingPosition({ left, top, height });
  }, [editor, floating]);

  const syncViewport = useCallback(() => {
    const viewport = getEditorViewport(editor);
    if (!viewport) return;
    syncFloatingPosition();
    setMetrics((current) => ({
      ...current,
      viewportTop: viewport.top,
      viewportHeight: viewport.height || current.viewportHeight,
    }));
  }, [editor, syncFloatingPosition]);

  const measurePreview = useCallback(() => {
    const frameDocument = previewFrameRef.current?.contentDocument;
    const container = minimapRef.current;
    if (!frameDocument || !container) return;

    const documentElement = frameDocument.documentElement;
    const body = frameDocument.body;
    const width = Math.max(
      FALLBACK_PREVIEW_WIDTH,
      documentElement.scrollWidth,
      body?.scrollWidth ?? 0,
    );
    const height = Math.max(
      FALLBACK_PREVIEW_HEIGHT,
      documentElement.scrollHeight,
      body?.scrollHeight ?? 0,
    );
    const availableHeight = Math.max(320, container.clientHeight - 16);
    const scale = Math.min(PREVIEW_WIDTH / width, availableHeight / height);

    setMetrics((current) => ({
      ...current,
      width,
      height,
      scale,
    }));
  }, []);

  const scheduleRefresh = useCallback(() => {
    syncViewport();
    if (refreshTimerRef.current !== null) {
      window.clearTimeout(refreshTimerRef.current);
    }
    refreshTimerRef.current = window.setTimeout(() => {
      rebuildPreview();
      refreshTimerRef.current = null;
    }, 180);
  }, [rebuildPreview, syncViewport]);

  useEffect(() => {
    scheduleRefresh();
    const events = [
      'update',
      'component:add',
      'component:remove',
      'component:update',
      'canvas:frame:load',
      'canvas:frame:load:body',
    ];
    events.forEach((event) => editor.on(event, scheduleRefresh));
    return () => {
      events.forEach((event) => editor.off(event, scheduleRefresh));
      if (refreshTimerRef.current !== null) {
        window.clearTimeout(refreshTimerRef.current);
      }
    };
  }, [editor, scheduleRefresh]);

  useEffect(() => {
    const sync = () => syncViewport();
    const attachScroll = () => {
      const canvasElement = editor.Canvas.getElement();
      const frameWindow = editor.Canvas.getFrameEl()?.contentWindow;
      canvasElement?.addEventListener('scroll', sync, { passive: true });
      frameWindow?.addEventListener('scroll', sync, { passive: true });
      return { canvasElement, frameWindow };
    };

    let attached = attachScroll();
    const reattach = () => {
      attached.canvasElement?.removeEventListener('scroll', sync);
      attached.frameWindow?.removeEventListener('scroll', sync);
      attached = attachScroll();
      sync();
    };
    const timer = window.setInterval(sync, 600);
    editor.on('canvas:frame:load', reattach);
    editor.on('canvas:frame:load:body', reattach);
    window.addEventListener('resize', measurePreview);
    return () => {
      window.clearInterval(timer);
      attached.canvasElement?.removeEventListener('scroll', sync);
      attached.frameWindow?.removeEventListener('scroll', sync);
      editor.off('canvas:frame:load', reattach);
      editor.off('canvas:frame:load:body', reattach);
      window.removeEventListener('resize', measurePreview);
    };
  }, [editor, measurePreview, syncViewport]);

  useEffect(() => {
    if (!floating) return;

    syncFloatingPosition();
    const sync = () => syncFloatingPosition();
    const timer = window.setInterval(sync, 500);
    editor.on('canvas:frame:load', sync);
    editor.on('canvas:frame:load:body', sync);
    editor.on('canvas:refresh', sync);
    window.addEventListener('resize', sync);
    return () => {
      window.clearInterval(timer);
      editor.off('canvas:frame:load', sync);
      editor.off('canvas:frame:load:body', sync);
      editor.off('canvas:refresh', sync);
      window.removeEventListener('resize', sync);
    };
  }, [editor, floating, syncFloatingPosition]);

  const jumpByPreviewClick = useCallback(
    (event: MouseEvent<HTMLDivElement>) => {
      event.preventDefault();
      event.stopPropagation();
      const pointerStart = previewPointerStartRef.current;
      previewPointerStartRef.current = null;
      if (pointerStart) {
        const distance = Math.hypot(event.clientX - pointerStart.x, event.clientY - pointerStart.y);
        if (distance > 5) return;
      }

      const rect = event.currentTarget.getBoundingClientRect();
      const ratio = (event.clientY - rect.top) / Math.max(1, rect.height);
      const targetY = ratio * metrics.height - metrics.viewportHeight / 2;
      scrollEditorCanvasTo(editor, Math.max(0, targetY));
      requestAnimationFrame(syncViewport);
    },
    [editor, metrics.height, metrics.viewportHeight, syncViewport],
  );

  const scaledWidth = metrics.width * metrics.scale;
  const scaledHeight = metrics.height * metrics.scale;

  return (
    <aside
      ref={rootRef}
      className={cn(
        'flex w-[132px] shrink-0 flex-col bg-slate-50 px-2 py-3',
        floating
          ? 'pointer-events-auto absolute z-20 rounded-2xl border border-slate-200 shadow-xl shadow-slate-900/10'
          : 'h-full border-r border-slate-200',
      )}
      style={
        floating
          ? {
              left: floatingPosition?.left ?? FLOATING_EDGE,
              top: floatingPosition?.top ?? FLOATING_EDGE,
              height: floatingPosition?.height ?? `calc(100% - ${FLOATING_EDGE * 2}px)`,
            }
          : undefined
      }
    >
      <div
        ref={minimapRef}
        className="relative min-h-0 flex-1 overflow-hidden rounded-xl border border-slate-200 bg-slate-100 shadow-inner"
      >
        <div
          role="button"
          tabIndex={0}
          className="absolute left-1/2 top-2 cursor-pointer overflow-hidden rounded-md bg-white shadow-sm"
          style={{
            width: scaledWidth,
            height: scaledHeight,
            transform: 'translateX(-50%)',
          }}
          title="클릭하면 해당 위치로 이동"
          onMouseDown={(event) => {
            event.preventDefault();
            event.stopPropagation();
            previewPointerStartRef.current = { x: event.clientX, y: event.clientY };
          }}
          onClick={jumpByPreviewClick}
          onKeyDown={(event) => {
            if (event.key === 'Enter' || event.key === ' ') {
              event.preventDefault();
              event.stopPropagation();
              scrollEditorCanvasTo(editor, 0);
              requestAnimationFrame(syncViewport);
            }
          }}
        >
          <iframe
            ref={previewFrameRef}
            srcDoc={previewHtml}
            className="pointer-events-none absolute left-0 top-0 border-0 bg-white"
            style={{
              width: metrics.width,
              height: metrics.height,
              transform: `scale(${metrics.scale})`,
              transformOrigin: 'top left',
            }}
            title="detail-editor-minimap"
            sandbox={SCRIPTLESS_SANDBOX}
            onLoad={() => {
              measurePreview();
              syncViewport();
              syncFloatingPosition();
            }}
          />
          <div
            className="pointer-events-none absolute left-0 right-0 border-2 border-violet-500 bg-violet-500/15"
            style={{
              top: metrics.viewportTop * metrics.scale,
              height: Math.max(14, metrics.viewportHeight * metrics.scale),
            }}
          />
        </div>
      </div>
    </aside>
  );
}

function getEditorViewport(editor: GjsEditor): { top: number; height: number } | null {
  const canvasElement = editor.Canvas.getElement();
  const frame = editor.Canvas.getFrameEl();
  if (!canvasElement || !frame) return null;

  const canvasRect = canvasElement.getBoundingClientRect();
  const frameRect = frame.getBoundingClientRect();
  const zoom = Math.max(0.2, (editor.Canvas.getZoom?.() ?? 100) / 100);

  return {
    top: Math.max(0, (canvasRect.top - frameRect.top) / zoom),
    height: Math.max(1, canvasElement.clientHeight / zoom),
  };
}

function scrollEditorCanvasTo(editor: GjsEditor, targetTop: number) {
  const canvasElement = editor.Canvas.getElement();
  const viewport = getEditorViewport(editor);
  if (!canvasElement || !viewport) return;

  const zoom = Math.max(0.2, (editor.Canvas.getZoom?.() ?? 100) / 100);
  const delta = (targetTop - viewport.top) * zoom;
  canvasElement.scrollTop = Math.max(0, canvasElement.scrollTop + delta);
}

function collectEditorHeadAssets(editor: GjsEditor): string {
  const doc = editor.Canvas.getFrameEl()?.contentDocument;
  if (!doc) return '';
  return Array.from(doc.head.querySelectorAll('link[rel="stylesheet"], style'))
    .map((element) => element.outerHTML)
    .join('\n');
}

function buildPreviewDocument(bodyHtml: string, css: string, headAssets: string): string {
  const safeBodyHtml = stripScripts(bodyHtml);
  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  ${headAssets}
  <style>${css}</style>
  <style>
    html, body {
      margin: 0;
      min-height: 100%;
      overflow: hidden;
      background: #ffffff;
    }
    * {
      animation: none !important;
      transition: none !important;
      caret-color: transparent !important;
    }
    .gjs-selected,
    .gjs-hovered,
    .gjs-selected-parent {
      outline: none !important;
      box-shadow: none !important;
    }
  </style>
</head>
<body>${safeBodyHtml}</body>
</html>`;
}

function stripScripts(html: string): string {
  return html.replace(/<script[\s\S]*?<\/script>/gi, '');
}
