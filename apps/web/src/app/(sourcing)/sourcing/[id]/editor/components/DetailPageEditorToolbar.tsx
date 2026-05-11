'use client';

import type { ReactNode } from 'react';
import { useCallback, useEffect, useState } from 'react';
import { useEditor } from '@grapesjs/react';
import {
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  Circle,
  Download,
  Eye,
  EyeOff,
  Files,
  ImagePlus,
  Layout,
  Loader2,
  Minus,
  MousePointer2,
  Redo2,
  Save,
  Square,
  Trash2,
  Type,
  Undo2,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import { toast } from 'sonner';
import { API_BASE } from '@/lib/api';
import { apiClient } from '@/lib/api-client';
import { useStore } from '@/store/useStore';
import TemplateSelectionModal from '../../components/TemplateSelectionModal';
import { useGenerateDetailPage, type GenerateMode } from '../../hooks/useGenerateDetailPage';
import { insertEditorHtml } from './detail-page-editor-insert';
import {
  buildPersistedEditorHtml,
  getEditorFrameEl,
  syncEditorFrameHeight,
  type ParsedHtml,
} from './detail-page-editor-html';

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

export function DetailPageEditorToolbar({
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
  onSave: (html: string) => void;
  onClose: () => void;
}) {
  const editor = useEditor();
  const setEditorDirty = useStore((s) => s.setEditorDirty);
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);
  const [hasSelection, setHasSelection] = useState(false);
  const [zoom, setZoom] = useState(100);
  const [isExporting, setIsExporting] = useState(false);
  const [activeTool, setActiveTool] = useState('cursor');
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

  const handleSave = useCallback(() => {
    const fullHtml = buildPersistedEditorHtml(editor, parsed, templateCss);
    // Save 후 dirty 해제 + UndoManager 클리어 → "방금 저장된 상태" 가 새 베이스.
    setEditorDirty(false);
    editor.UndoManager.clear();
    onSave(fullHtml);
  }, [editor, onSave, parsed, setEditorDirty, templateCss]);

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
      const htmlStr = editor.getHtml();
      const cssStr = editor.getCss({ avoidProtected: true }) ?? '';
      const iframeDoc = getEditorFrameEl(editor)?.contentDocument;
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
  );
}
