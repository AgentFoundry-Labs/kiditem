'use client';

import { toast } from 'sonner';
import grapesjs, { type Editor } from 'grapesjs';
import { API_BASE } from '@/lib/api';
import { apiClient } from '@/lib/api-client';
import 'grapesjs/dist/css/grapes.min.css';
import './grapesjs-editor.css';
import GjsEditor, {
  AssetsProvider,
  BlocksProvider,
  Canvas,
  LayersProvider,
  useEditor,
  WithEditor,
} from '@grapesjs/react';
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
import type { ReactNode } from 'react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AIImageEditPanel } from './AIImageEditPanel';
import { AITextEditPanel } from './AITextEditPanel';
import { ImagePickerModal } from './ImagePickerModal';

interface DetailPageEditorProps {
  html: string;
  templateCss: string;
  productName: string;
  productId?: string;
  rawImages?: string[];
  processedImages?: string[];
  onSave: (html: string) => void;
  onClose: () => void;
}

interface ParsedHtml {
  bodyHtml: string;
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
        content: { type: 'image', style: { width: '100%', 'max-width': '600px', padding: '10px' } },
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
    devices: [{ id: 'coupang', name: '쿠팡 상세페이지', width: '860px' }],
  },
};

function parseFullHtml(fullHtml: string): ParsedHtml {
  const parser = new DOMParser();
  const doc = parser.parseFromString(fullHtml, 'text/html');

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

  return { bodyHtml: doc.body.innerHTML, scriptUrls, stylesheetUrls, inlineStyles, inlineScripts };
}

function injectHeadResources(iframeWindow: Window, parsed: ParsedHtml) {
  const doc = iframeWindow.document;
  const head = doc.head;

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
  templateCss,
  onSave,
  onClose,
}: {
  productName: string;
  templateCss: string;
  onSave: (html: string) => void;
  onClose: () => void;
}) {
  const editor = useEditor();
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);
  const [hasSelection, setHasSelection] = useState(false);
  const [zoom, setZoom] = useState(100);
  const [isExporting, setIsExporting] = useState(false);
  const [activeTool, setActiveTool] = useState('cursor');
  const [selectedVisible, setSelectedVisible] = useState(true);

  useEffect(() => {
    const updateHistory = () => {
      setCanUndo(editor.UndoManager.hasUndo());
      setCanRedo(editor.UndoManager.hasRedo());
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
    };
  }, [editor]);

  const handleSave = useCallback(() => {
    const html = editor.getHtml();
    const css = editor.getCss({ avoidProtected: true });
    const fullHtml = css ? `${html}\n<style>${css}</style>` : html;
    onSave(fullHtml);
  }, [editor, onSave]);

  const handleExportPng = useCallback(async () => {
    setIsExporting(true);
    try {
      const htmlStr = editor.getHtml();
      const cssStr = editor.getCss({ avoidProtected: true }) ?? '';
      const iframeDoc = editor.Canvas.getFrameEl()?.contentDocument;
      const fontLinks = iframeDoc
        ? Array.from(iframeDoc.head.querySelectorAll('link[rel="stylesheet"]'))
            .map((l) => l.outerHTML).join('\n')
        : '';
      const styleEls = iframeDoc
        ? Array.from(iframeDoc.head.querySelectorAll('style'))
            .map((s) => s.outerHTML).join('\n')
        : '';

      const fullHtml = `<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="UTF-8" />
  <base href="${API_BASE}/" />
  ${fontLinks}
  ${styleEls}
  <style>${templateCss}</style>
  <style>${cssStr}</style>
  <style>body { margin: 0; padding: 0; }</style>
</head>
<body>${htmlStr}</body>
</html>`;

      const res = await apiClient.fetchRaw('/api/render-image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ html: fullHtml }),
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
      toast.error('이미지 내보내기에 실패했습니다.');
    } finally {
      setIsExporting(false);
    }
  }, [editor, productName, templateCss]);

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
      if (html) wrapper.append(html);
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

  const applyContentZoom = useCallback(
    (level: number) => {
      const iframe = editor.Canvas.getFrameEl();
      const doc = iframe?.contentDocument;
      if (doc) {
        doc.documentElement.style.zoom = `${level / 100}`;
      }
    },
    [editor],
  );

  const handleZoomIn = useCallback(() => {
    const next = Math.min(zoom + 10, 200);
    setZoom(next);
    applyContentZoom(next);
  }, [zoom, applyContentZoom]);

  const handleZoomOut = useCallback(() => {
    const next = Math.max(zoom - 10, 20);
    setZoom(next);
    applyContentZoom(next);
  }, [zoom, applyContentZoom]);

  const handleZoomReset = useCallback(() => {
    setZoom(100);
    applyContentZoom(100);
  }, [applyContentZoom]);

  return (
    <div className="flex items-center justify-between px-3 py-1.5 bg-white border-b border-slate-200">
      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={onClose}
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
          className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-100 border border-slate-200 rounded-lg transition-colors"
        >
          <Save size={14} />
          저장
        </button>
        <button
          type="button"
          onClick={handleExportPng}
          disabled={isExporting}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-white bg-emerald-500 hover:bg-emerald-600 rounded-lg transition-colors shadow-sm disabled:opacity-50"
        >
          {isExporting ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
          Export PNG
        </button>
      </div>
    </div>
  );
}

function LeftPanel({ onClose, rawImages = [] }: { onClose?: () => void; rawImages?: string[] }) {
  const editor = useEditor();
  return (
    <aside className="w-[280px] bg-white border-r border-slate-200 flex flex-col overflow-hidden shrink-0">
      <BlocksProvider>
        {({ blocks, dragStart, dragStop }) => {
          const standardBlocks = blocks.filter((b) => !b.getId().startsWith('raw-image-'));
          const imageBlocks = blocks.filter((b) => b.getId().startsWith('raw-image-'));

          return (
            <>
              <div className="p-3 border-b border-slate-100">
                <div className="flex items-center justify-between mb-2.5">
                  <h3 className="text-xs font-bold text-slate-700">요소 추가</h3>
                  {onClose && (
                    <button
                      type="button"
                      onClick={onClose}
                      className="p-0.5 text-slate-400 hover:text-slate-600 rounded transition-colors"
                    >
                      <X size={12} />
                    </button>
                  )}
                </div>
                <div className="grid grid-cols-2 gap-1.5">
                  {standardBlocks.map((block) => (
                    <div
                      key={block.getId()}
                      draggable
                      className="flex flex-col items-center gap-1 p-2.5 bg-slate-50 hover:bg-emerald-50 border border-slate-200 hover:border-emerald-300 rounded-lg cursor-grab active:cursor-grabbing transition-colors group"
                      onDragStart={(e) => dragStart(block, e.nativeEvent)}
                      onDragEnd={() => dragStop(false)}
                    >
                      <span className="text-emerald-500 group-hover:text-emerald-600 transition-colors">
                        {getBlockIcon(block.getId())}
                      </span>
                      <span className="text-[10px] font-medium text-slate-500 group-hover:text-slate-700">
                        {block.getLabel()}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              {imageBlocks.length > 0 && (
                <div className="border-t border-slate-100 p-3">
                  <h3 className="text-xs font-bold text-slate-700 mb-2 flex items-center gap-1.5">
                    <ImageIcon size={12} />
                    원본 이미지
                    <span className="text-slate-400 font-normal">({imageBlocks.length})</span>
                  </h3>
                  <div className="grid grid-cols-3 gap-1.5 max-h-[320px] overflow-y-auto">
                    {imageBlocks.map((block) => {
                      const blockContent = block.get('content') as string;
                      const srcMatch = blockContent.match(/src="([^"]+)"/);
                      const thumbUrl = srcMatch?.[1] ?? '';

                      return (
                        <div
                          key={block.getId()}
                          draggable
                          className="aspect-square rounded border border-slate-200 hover:border-emerald-400 overflow-hidden cursor-grab active:cursor-grabbing transition-colors group"
                          title="드래그하여 배치 · 클릭하여 선택된 이미지 교체"
                          onDragStart={(e) => dragStart(block, e.nativeEvent)}
                          onDragEnd={() => dragStop(false)}
                          onClick={() => {
                            const selected = editor.getSelected();
                            const type = (selected?.get('type') as string) ?? '';
                            const tag = ((selected?.get('tagName') as string) ?? '').toLowerCase();
                            if (selected && (type === 'image' || tag === 'img')) {
                              selected.setAttributes({ src: thumbUrl });
                            }
                          }}
                        >
                          <img
                            src={thumbUrl}
                            alt=""
                            className="w-full h-full object-cover group-hover:opacity-80 transition-opacity pointer-events-none"
                          />
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </>
          );
        }}
      </BlocksProvider>

      <div className="flex-1 flex flex-col overflow-hidden">
        <h3 className="text-xs font-bold text-slate-700 px-3 pt-3 pb-2">레이어</h3>
        <div className="flex-1 overflow-y-auto px-1">
          <LayersProvider>{({ Container }) => <Container>{null}</Container>}</LayersProvider>
        </div>
      </div>
    </aside>
  );
}

function RightPanel({
  onClose,
  selectedTextComponent,
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
}: {
  onClose?: () => void;
  selectedTextComponent: any;
  isBusy: React.MutableRefObject<boolean>;
  selectedImageSrc: string | null;
  onImageEdited: (newUrl: string) => void;
  onImageReplace: () => void;
  onImageClose: () => void;
  productId?: string;
  onAiFillComplete?: () => void;
  onGeneratingChange?: (v: boolean) => void;
  rawImages?: string[];
  processedImages?: string[];
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

    const fillContainer = (name: string, urls: string[], alt: string) => {
      const sections = wrapper.find(`[data-section="${name}"]`);
      if (sections.length === 0 || urls.length === 0) return;
      sections[0].removeClass('hidden');
      const containers = wrapper.find(`[data-container="${name}"]`);
      if (containers.length === 0) return;
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

      let lastStep = '';
      const maxAttempts = 120;
      for (let i = 0; i < maxAttempts; i++) {
        await new Promise(r => setTimeout(r, 2000));
        let task: any;
        try {
          task = await apiClient.get(`/api/agent-tasks/${taskId}`);
        } catch { continue; }

        if (task.status === 'failed') {
          throw new Error(task.error || 'AI 생성에 실패했습니다');
        }

        let output: Record<string, unknown> | null = null;
        try {
          output = typeof task.output === 'string' ? JSON.parse(task.output) : task.output;
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

        if (task.status === 'completed') {
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
    try {
      await apiClient.post(`/api/agent-tasks/${aiFillTaskId}/cancel`);
    } catch (err) {
      toast.error('AI 작업 취소에 실패했습니다.');
    }
  }, [aiFillTaskId]);

  const handleColorGuideGenerate = useCallback(async () => {
    if (!productId || colorImageUrls.length < 2) return;
    setColorGuideLoading(true);
    try {
      const data = await apiClient.post<{ id?: string; taskId?: string }>('/api/agent-tasks', {
        agentType: 'image_edit',
        input: { preset: 'color_guide', image_urls: colorImageUrls, productId },
      });
      const taskId = data.id ?? data.taskId;

      for (let i = 0; i < 120; i++) {
        await new Promise(r => setTimeout(r, 2000));
        let task: any;
        try {
          task = await apiClient.get(`/api/agent-tasks/${taskId}`);
        } catch { continue; }

        if (task.status === 'failed') {
          throw new Error(task.error || '색상 안내 생성 실패');
        }

        if (task.status === 'completed') {
          let output: Record<string, unknown> | null = null;
          try {
            output = typeof task.output === 'string' ? JSON.parse(task.output) : task.output;
          } catch {
            break;
          }

          if (output && Array.isArray(output.color_images)) {
            const wrapper = editor.getWrapper();
            if (wrapper) {
              const resolveUrl = (url: string) =>
                url.startsWith('/processed/') ? `${API_BASE}${url}` : url;
              const sections = wrapper.find('[data-section="colorImages"]');
              if (sections.length > 0) {
                sections[0].removeClass('hidden');
                const containers = wrapper.find('[data-container="colorImages"]');
                if (containers.length > 0) {
                  containers[0].components(
                    (output.color_images as string[])
                      .map((url) =>
                        `<img src="${resolveUrl(url)}" alt="색상 안내" class="w-full h-auto rounded-[var(--theme-radius)] shadow-md" />`
                      )
                      .join('')
                  );
                }
              }
            }
          }
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
    <aside className="w-[320px] bg-white border-l border-slate-200 flex flex-col overflow-hidden shrink-0">
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
        ) : selectedImageSrc ? (
          <AIImageEditPanel
            imageUrl={selectedImageSrc}
            isBusy={isBusy}
            onEditComplete={onImageEdited}
            onReplace={onImageReplace}
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
                    className={`relative w-9 h-5 rounded-full transition-colors ${colorGuideEnabled ? 'bg-purple-600' : 'bg-slate-200'}`}
                  >
                    <span className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${colorGuideEnabled ? 'translate-x-4' : ''}`} />
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
  const [selectedTextComponent, setSelectedTextComponent] = useState<any>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const isBusyRef = useRef(false);
  const [showImagePicker, setShowImagePicker] = useState(false);
  const [editorRef, setEditorRef] = useState<Editor | null>(null);
  const [showLeftPanel, setShowLeftPanel] = useState(true);
  const [showRightPanel, setShowRightPanel] = useState(true);

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
        containers[0].components(
          urls.map((url) => `<img src="${resolveUrl(url)}" alt="${alt}" class="w-full h-auto rounded-[var(--theme-radius)] shadow-md" />`).join('')
        );
      };

      const sizeImgs = d.size_images ?? d.sizeImages ?? [];
      fillSection('sizeImages', sizeImgs, '사이즈 안내');

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
      editor.setDevice('coupang');

      editor.on('canvas:frame:load:body', ({ window: iframeWindow }: { window: Window }) => {
        injectHeadResources(iframeWindow, parsed);
      });

      editor.on('component:selected', (component: any) => {
        const type = (component.get('type') as string) ?? '';
        const tagName = ((component.get('tagName') as string) ?? '').toLowerCase();
        const TEXT_TAGS = ['p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'span', 'li'];
        const BLOCK_TAGS = new Set(['div', 'section', 'article', 'header', 'footer', 'p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'ul', 'ol', 'li', 'table', 'blockquote', 'figure']);

        if (type === 'image' || tagName === 'img') {
          setSelectedImageSrc(component.getAttributes().src ?? '');
          setSelectedTextComponent(null);
        } else if (type === 'text' || type === 'text-ext' || TEXT_TAGS.includes(tagName)) {
          const children = component.components();
          const hasBlockChild = children?.models?.some((child: any) => {
            const childTag = ((child.get('tagName') as string) ?? '').toLowerCase();
            return BLOCK_TAGS.has(childTag);
          });
          if (hasBlockChild) {
            setSelectedImageSrc(null);
            setSelectedTextComponent(null);
          } else {
            setSelectedTextComponent(component);
            setSelectedImageSrc(null);
          }
        } else {
          setSelectedImageSrc(null);
          setSelectedTextComponent(null);
        }
      });
      editor.on('component:deselected', () => {
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

      rawImages.forEach((url, i) => {
        editor.Blocks.add(`raw-image-${i}`, {
          label: `원본 ${i + 1}`,
          category: '원본 이미지',
          content: `<img src="${url}" style="width:100%;max-width:600px;" />`,
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
        wrapper.addStyle({ 'background-color': '#ffffff' });
        requestAnimationFrame(() => {
          const iframe = editor.Canvas.getFrameEl();
          const contentHeight = iframe?.contentDocument?.body.scrollHeight ?? 800;
          const autoHeight = Math.max(contentHeight + 300, 800);
          wrapper.addStyle({ 'min-height': `${autoHeight}px` });
        });
      }
    },
    [parsed, rawImages],
  );

  const handleImageEdited = useCallback(
    (newUrl: string) => {
      if (!editorRef) return;
      const selected = editorRef.getSelected();
      if (selected) {
        selected.setAttributes({ src: newUrl });
      }
      setSelectedImageSrc(null);
    },
    [editorRef],
  );

  const handleImageReplaced = useCallback(
    (newUrl: string) => {
      if (!editorRef) return;
      const selected = editorRef.getSelected();
      if (selected) {
        selected.setAttributes({ src: newUrl });
      }
      setShowImagePicker(false);
      setSelectedImageSrc(null);
    },
    [editorRef],
  );

  const refreshCanvas = useCallback(() => {
    if (editorRef) requestAnimationFrame(() => editorRef.refresh());
  }, [editorRef]);

  const canvasWrapperRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = canvasWrapperRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      const iframe = el.querySelector<HTMLIFrameElement>('iframe');
      iframe?.contentWindow?.scrollBy(0, e.deltaY);
    };
    el.addEventListener('wheel', onWheel, { passive: true });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);

  return (
    <GjsEditor grapesjs={grapesjs} options={GRAPESJS_OPTIONS} onEditor={handleEditorInit}>
      <div className="flex flex-col h-screen bg-[#F5F7F8]">
        <WithEditor>
          <EditorToolbar productName={productName} templateCss={templateCss} onSave={onSave} onClose={onClose} />
        </WithEditor>

        <div className="flex flex-1 overflow-hidden">
          <div className={`h-full ${showLeftPanel ? '' : 'hidden'}`}>
            <WithEditor>
              <LeftPanel onClose={() => setShowLeftPanel(false)} rawImages={rawImages} />
            </WithEditor>
          </div>
          <div ref={canvasWrapperRef} className="flex-1 overflow-hidden bg-slate-100 relative">
            <Canvas />
            {isGenerating && (
              <div className="absolute inset-0 bg-white/30 z-50 cursor-not-allowed" />
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
          <div className={`h-full ${showRightPanel ? '' : 'hidden'}`}>
            <WithEditor>
              <RightPanel
                onClose={() => {
                  setShowRightPanel(false);
                  refreshCanvas();
                }}
                selectedTextComponent={selectedTextComponent}
                isBusy={isBusyRef}
                selectedImageSrc={selectedImageSrc}
                onImageEdited={handleImageEdited}
                onImageReplace={() => setShowImagePicker(true)}
                onImageClose={() => setSelectedImageSrc(null)}
                productId={productId}
                onAiFillComplete={handleAiFillComplete}
                onGeneratingChange={setIsGenerating}
                rawImages={rawImages}
                processedImages={processedImages}
              />
            </WithEditor>
          </div>
        </div>
      </div>

      <ImagePickerModal
        open={showImagePicker}
        rawImages={rawImages}
        processedImages={processedImages}
        onSelect={handleImageReplaced}
        onClose={() => setShowImagePicker(false)}
      />

      <AssetsProvider>
        {({ open, select, close }) => (
          <ImagePickerModal
            open={open}
            rawImages={rawImages}
            processedImages={processedImages}
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
