'use client';

import { API_BASE } from '@/lib/api';
import grapesjs, { type Asset, type Editor } from 'grapesjs';
import 'grapesjs/dist/css/grapes.min.css';
import './grapesjs-editor.css';
import GjsEditor, {
  AssetsProvider,
  BlocksProvider,
  Canvas,
  LayersProvider,
  StylesProvider,
  TraitsProvider,
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
  ImagePlus,
  Loader2,
  Minus,
  MousePointer2,
  PanelLeft,
  PanelRight,
  Redo2,
  Save,
  Square,
  Trash2,
  Type,
  Undo2,
  X,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import type { ReactNode } from 'react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AIDesignChatPanel } from './AIDesignChatPanel';
import { AIImageEditPanel } from './AIImageEditPanel';
import { AITextEditPanel } from './AITextEditPanel';
import { ImagePickerModal } from './ImagePickerModal';

interface DetailPageEditorProps {
  html: string;
  templateCss: string;
  productName: string;
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
  html, body { overflow: hidden !important; }
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
  .gjs-cv-canvas * {
    scrollbar-width: none !important;
  }
  .gjs-cv-canvas *::-webkit-scrollbar {
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

  for (const url of parsed.stylesheetUrls) {
    const link = doc.createElement('link');
    link.rel = 'stylesheet';
    link.href = url;
    head.appendChild(link);
  }

  for (const styleHtml of parsed.inlineStyles) {
    head.insertAdjacentHTML('beforeend', styleHtml);
  }

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
    cls += 'text-gray-500 hover:text-gray-700 hover:bg-gray-100 disabled:text-gray-300';
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
            .map((l) => l.outerHTML)
            .join('\n    ')
        : '';

      const fullHtml = `<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="UTF-8" />
  <style>${templateCss}</style>
  ${fontLinks}
  <style>${cssStr}</style>
  <style>body { margin: 0; padding: 0; }</style>
</head>
<body>
  ${htmlStr}
</body>
</html>`;

      const res = await fetch(`${API_BASE}/api/render-image`, {
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
    <div className="flex items-center justify-between px-3 py-1.5 bg-white border-b border-gray-200">
      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={onClose}
          className="flex items-center gap-1 px-2 py-1.5 text-sm text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
        >
          <ArrowLeft size={16} />
          <span className="text-xs">닫기</span>
        </button>
        <div className="w-px h-5 bg-gray-200 mx-1" />
        <h2 className="text-xs font-medium text-gray-600 truncate max-w-[160px] mr-2">{productName}</h2>
        <div className="w-px h-5 bg-gray-200 mx-1" />
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
        <div className="w-px h-5 bg-gray-200 mx-1" />
        <ToolBtn icon={<Files size={16} />} title="복제" onClick={handleDuplicate} disabled={!hasSelection} />
        <ToolBtn
          icon={<Trash2 size={16} />}
          title="삭제 (Delete)"
          onClick={handleDelete}
          disabled={!hasSelection}
          danger
        />
        <div className="w-px h-5 bg-gray-200 mx-1" />
        <ToolBtn icon={<ArrowUp size={16} />} title="위로 이동" onClick={handleMoveUp} disabled={!hasSelection} />
        <ToolBtn icon={<ArrowDown size={16} />} title="아래로 이동" onClick={handleMoveDown} disabled={!hasSelection} />
        <div className="w-px h-5 bg-gray-200 mx-1" />
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
          className="px-2 py-1 text-xs font-medium text-gray-600 hover:bg-gray-100 rounded transition-colors min-w-[44px] text-center"
          title="확대/축소 초기화"
        >
          {zoom}%
        </button>
        <ToolBtn icon={<ZoomIn size={16} />} title="확대" onClick={handleZoomIn} />
        <div className="w-px h-5 bg-gray-200 mx-1.5" />
        <button
          type="button"
          onClick={handleSave}
          className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-100 border border-gray-200 rounded-lg transition-colors"
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

function LeftPanel({ onClose }: { onClose?: () => void }) {
  return (
    <aside className="w-[200px] bg-white border-r border-gray-200 flex flex-col overflow-hidden shrink-0">
      <div className="p-3 border-b border-gray-100">
        <div className="flex items-center justify-between mb-2.5">
          <h3 className="text-xs font-bold text-gray-700">요소 추가</h3>
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              className="p-0.5 text-gray-400 hover:text-gray-600 rounded transition-colors"
            >
              <X size={12} />
            </button>
          )}
        </div>
        <BlocksProvider>
          {({ blocks, dragStart, dragStop }) => (
            <div className="grid grid-cols-2 gap-1.5">
              {blocks.map((block) => (
                <div
                  key={block.getId()}
                  draggable
                  className="flex flex-col items-center gap-1 p-2.5 bg-gray-50 hover:bg-emerald-50 border border-gray-200 hover:border-emerald-300 rounded-lg cursor-grab active:cursor-grabbing transition-colors group"
                  onDragStart={(e) => dragStart(block, e.nativeEvent)}
                  onDragEnd={() => dragStop(false)}
                >
                  <span className="text-emerald-500 group-hover:text-emerald-600 transition-colors">
                    {getBlockIcon(block.getId())}
                  </span>
                  <span className="text-[10px] font-medium text-gray-500 group-hover:text-gray-700">
                    {block.getLabel()}
                  </span>
                </div>
              ))}
            </div>
          )}
        </BlocksProvider>
      </div>

      <div className="flex-1 flex flex-col overflow-hidden">
        <h3 className="text-xs font-bold text-gray-700 px-3 pt-3 pb-2">레이어</h3>
        <div className="flex-1 overflow-y-auto px-1">
          <LayersProvider>{({ Container }) => <Container>{null}</Container>}</LayersProvider>
        </div>
      </div>
    </aside>
  );
}

function RightPanel({
  onClose,
  getHtml,
  getCss,
  onDesignApply,
  onDesignUndo,
  canDesignUndo,
}: {
  onClose?: () => void;
  getHtml: () => string;
  getCss: () => string;
  onDesignApply: (html: string) => void;
  onDesignUndo: () => void;
  canDesignUndo: boolean;
}) {
  const editor = useEditor();
  const [hasSelection, setHasSelection] = useState(false);
  const [canvasWidth, setCanvasWidth] = useState(860);
  const [canvasHeight, setCanvasHeight] = useState(3000);
  const [bgColor, setBgColor] = useState('#ffffff');

  useEffect(() => {
    const onSelect = () => setHasSelection(true);
    const onDeselect = () => setHasSelection(!!editor.getSelected());
    editor.on('component:selected', onSelect);
    editor.on('component:deselected', onDeselect);
    return () => {
      editor.off('component:selected', onSelect);
      editor.off('component:deselected', onDeselect);
    };
  }, [editor]);

  useEffect(() => {
    const wrapper = editor.getWrapper();
    if (wrapper) {
      wrapper.addStyle({ 'min-height': `${canvasHeight}px`, 'background-color': bgColor });
    }
  }, [editor, canvasHeight, bgColor]);

  useEffect(() => {
    const device = editor.Devices.get('coupang');
    if (device) {
      device.set('width', `${canvasWidth}px`);
      editor.setDevice('coupang');
    }
  }, [editor, canvasWidth]);

  return (
    <aside className="w-[260px] bg-white border-l border-gray-200 flex flex-col overflow-hidden shrink-0">
      <div className="p-3 border-b border-gray-100 space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-bold text-gray-700">페이지 설정</h3>
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              className="p-0.5 text-gray-400 hover:text-gray-600 rounded transition-colors"
            >
              <X size={12} />
            </button>
          )}
        </div>
        <div>
          <label className="text-[10px] font-medium text-gray-500 mb-1 block">캔버스 너비</label>
          <input
            type="number"
            value={canvasWidth}
            onChange={(e) => setCanvasWidth(Number(e.target.value) || 860)}
            className="w-full px-2.5 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-emerald-500 focus:border-emerald-500"
          />
        </div>
        <div>
          <label className="text-[10px] font-medium text-gray-500 mb-1 block">캔버스 높이</label>
          <input
            type="number"
            value={canvasHeight}
            onChange={(e) => setCanvasHeight(Number(e.target.value) || 3000)}
            className="w-full px-2.5 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-emerald-500 focus:border-emerald-500"
          />
        </div>
        <div>
          <label className="text-[10px] font-medium text-gray-500 mb-1 block">배경색</label>
          <div className="flex items-center gap-2">
            <input
              type="color"
              value={bgColor}
              onChange={(e) => setBgColor(e.target.value)}
              className="w-8 h-8 rounded border border-gray-200 cursor-pointer p-0.5"
            />
            <input
              type="text"
              value={bgColor}
              onChange={(e) => setBgColor(e.target.value)}
              className="flex-1 px-2.5 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-emerald-500 focus:border-emerald-500"
            />
          </div>
        </div>
      </div>

      {hasSelection ? (
        <div className="overflow-y-auto min-h-0 shrink" style={{ flexBasis: '40%' }}>
          <div className="border-b border-gray-100">
            <h3 className="text-xs font-bold text-gray-700 px-3 pt-3 pb-1">스타일</h3>
            <div className="px-1">
              <StylesProvider>{({ Container }) => <Container>{null}</Container>}</StylesProvider>
            </div>
          </div>
          <div>
            <h3 className="text-xs font-bold text-gray-700 px-3 pt-3 pb-1">속성</h3>
            <div className="px-1 pb-3">
              <TraitsProvider>{({ Container }) => <Container>{null}</Container>}</TraitsProvider>
            </div>
          </div>
        </div>
      ) : (
        <div className="shrink" style={{ flexBasis: '40%' }} />
      )}

      <AIDesignChatPanel
        getHtml={getHtml}
        getCss={getCss}
        onApply={onDesignApply}
        onUndo={onDesignUndo}
        canUndo={canDesignUndo}
      />
    </aside>
  );
}

function ImageAssetModal({
  open,
  select,
  close,
}: {
  open: boolean;
  select: (asset: Asset, complete?: boolean) => void;
  close: () => void;
}) {
  const editor = useEditor();
  const [url, setUrl] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setUrl('');
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open]);

  if (!open) return null;

  const handleSubmit = () => {
    const trimmed = url.trim();
    if (!trimmed) return;
    const asset = editor.Assets.add({ type: 'image', src: trimmed });
    const resolved = Array.isArray(asset) ? asset[0] : asset;
    if (resolved) select(resolved, true);
    setUrl('');
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50" onClick={close}>
      <div
        className="bg-white rounded-xl shadow-2xl w-[480px] max-w-[90vw] overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-3 border-b border-gray-200">
          <div className="flex items-center gap-2 text-gray-800 font-semibold text-sm">
            <ImagePlus size={16} />
            이미지 변경
          </div>
          <button
            type="button"
            onClick={close}
            className="p-1 text-gray-400 hover:text-gray-600 rounded transition-colors"
          >
            <X size={16} />
          </button>
        </div>
        <div className="p-5 space-y-4">
          <div>
            <label htmlFor="image-url-input" className="block text-xs font-medium text-gray-500 mb-1.5">
              이미지 URL
            </label>
            <input
              ref={inputRef}
              id="image-url-input"
              type="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
              placeholder="https://example.com/image.jpg"
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
            />
          </div>
          {url.trim() && (
            <div className="border border-gray-200 rounded-lg p-2 bg-gray-50">
              <img
                src={url.trim()}
                alt="미리보기"
                className="max-h-[200px] mx-auto object-contain rounded"
                onError={(e) => {
                  (e.target as HTMLImageElement).style.display = 'none';
                }}
              />
            </div>
          )}
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={close}
              className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
            >
              취소
            </button>
            <button
              type="button"
              onClick={handleSubmit}
              disabled={!url.trim()}
              className="px-4 py-2 text-sm font-medium text-white bg-emerald-500 hover:bg-emerald-600 rounded-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              적용
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function AITextSpot({
  component,
  isBusy,
  onClose,
}: {
  component: any;
  isBusy: React.MutableRefObject<boolean>;
  onClose: () => void;
}) {
  const editor = useEditor();
  const [spotStyle, setSpotStyle] = useState<Record<string, string> | null>(null);

  useEffect(() => {
    if (!component) {
      editor.Canvas.removeSpots({ type: 'ai-text-panel' });
      setSpotStyle(null);
      return;
    }

    const spot = editor.Canvas.addSpot({
      type: 'ai-text-panel',
      component,
    });

    const update = () => {
      const style = spot.getStyle();
      setSpotStyle(style as Record<string, string>);
    };
    update();
    editor.on('canvas:spot', update);

    return () => {
      editor.off('canvas:spot', update);
      editor.Canvas.removeSpots({ type: 'ai-text-panel' });
      setSpotStyle(null);
    };
  }, [editor, component]);

  const spotsEl = editor.Canvas.getSpotsEl();
  if (!spotStyle || !spotsEl || !component) return null;

  const panelStyle: React.CSSProperties = {
    position: 'absolute',
    top: `calc(${spotStyle.top || '0px'} + ${spotStyle.height || '0px'})`,
    left: spotStyle.left || '0px',
    zIndex: 10,
    pointerEvents: 'auto',
  };

  return createPortal(
    <div style={panelStyle}>
      <AITextEditPanel
        component={component}
        editor={editor}
        isBusy={isBusy}
        onClose={onClose}
      />
    </div>,
    spotsEl,
  );
}

export default function DetailPageEditor({
  html,
  templateCss,
  productName,
  rawImages = [],
  processedImages = [],
  onSave,
  onClose,
}: DetailPageEditorProps) {
  const parsed = useMemo(() => parseFullHtml(html), [html]);
  const [selectedImageSrc, setSelectedImageSrc] = useState<string | null>(null);
  const [selectedTextComponent, setSelectedTextComponent] = useState<any>(null);
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

        if (type === 'image' || tagName === 'img') {
          setSelectedImageSrc(component.getAttributes().src ?? '');
          setSelectedTextComponent(null);
        } else if (type === 'text' || type === 'text-ext' || TEXT_TAGS.includes(tagName)) {
          setSelectedTextComponent(component);
          setSelectedImageSrc(null);
        } else {
          setSelectedImageSrc(null);
          setSelectedTextComponent(null);
        }
      });
      editor.on('component:deselected', () => {
        setSelectedImageSrc(null);
        setSelectedTextComponent(null);
      });

      const um = editor.UndoManager;
      um.stop();
      editor.setComponents(parsed.bodyHtml);
      um.clear();
      um.start();

      const wrapper = editor.getWrapper();
      if (wrapper) {
        wrapper.addStyle({ 'min-height': '3000px', 'background-color': '#ffffff' });
      }
    },
    [parsed],
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

  const getEditorHtml = useCallback(() => {
    if (!editorRef) return '';
    return editorRef.getHtml();
  }, [editorRef]);

  const getEditorCss = useCallback(() => {
    if (!editorRef) return '';
    return editorRef.getCss({ avoidProtected: true }) ?? '';
  }, [editorRef]);

  const handleDesignApply = useCallback(
    (newHtml: string) => {
      if (!editorRef) return;
      const newParsed = parseFullHtml(newHtml);
      editorRef.setComponents(newParsed.bodyHtml);

      const iframeEl = editorRef.Canvas.getFrameEl();
      if (iframeEl?.contentWindow) {
        injectHeadResources(iframeEl.contentWindow, newParsed);
      }
    },
    [editorRef],
  );

  const handleDesignUndo = useCallback(() => {
    if (!editorRef) return;
    editorRef.UndoManager.undo();
  }, [editorRef]);

  const [canDesignUndo, setCanDesignUndo] = useState(false);

  useEffect(() => {
    if (!editorRef) return;
    const updateUndo = () => setCanDesignUndo(editorRef.UndoManager.hasUndo());
    editorRef.on('update', updateUndo);
    return () => {
      editorRef.off('update', updateUndo);
    };
  }, [editorRef]);

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
              <LeftPanel onClose={() => setShowLeftPanel(false)} />
            </WithEditor>
          </div>
          <div ref={canvasWrapperRef} className="flex-1 overflow-hidden bg-gray-100 relative">
            <Canvas />
            {selectedTextComponent && (
              <WithEditor>
                <AITextSpot
                  component={selectedTextComponent}
                  isBusy={isBusyRef}
                  onClose={() => setSelectedTextComponent(null)}
                />
              </WithEditor>
            )}
            {!showLeftPanel && (
              <button
                type="button"
                onClick={() => {
                  setShowLeftPanel(true);
                  refreshCanvas();
                }}
                className="absolute top-2 left-2 z-10 p-1.5 bg-white border border-gray-200 rounded-lg shadow-sm text-gray-500 hover:text-gray-700 transition-colors"
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
                className="absolute top-2 right-2 z-10 p-1.5 bg-white border border-gray-200 rounded-lg shadow-sm text-gray-500 hover:text-gray-700 transition-colors"
                title="설정 패널 열기"
              >
                <PanelRight size={14} />
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
                getHtml={getEditorHtml}
                getCss={getEditorCss}
                onDesignApply={handleDesignApply}
                onDesignUndo={handleDesignUndo}
                canDesignUndo={canDesignUndo}
              />
            </WithEditor>
          </div>
        </div>
      </div>

      {selectedImageSrc && (
        <div className="fixed bottom-4 right-[276px] z-50">
          <AIImageEditPanel
            imageUrl={selectedImageSrc}
            onEditComplete={handleImageEdited}
            onReplace={() => setShowImagePicker(true)}
            onClose={() => setSelectedImageSrc(null)}
          />
        </div>
      )}

      <ImagePickerModal
        open={showImagePicker}
        rawImages={rawImages}
        processedImages={processedImages}
        onSelect={handleImageReplaced}
        onClose={() => setShowImagePicker(false)}
      />

      <AssetsProvider>
        {({ open, select, close }) => <ImageAssetModal open={open} select={select} close={close} />}
      </AssetsProvider>
    </GjsEditor>
  );
}
