'use client';

import type { ReactNode } from 'react';
import { useCallback, useRef } from 'react';
import { BlocksProvider, LayersProvider, useEditor } from '@grapesjs/react';
import {
  Circle,
  Image as ImageIcon,
  ImagePlus,
  Layout,
  Minus,
  Sparkles,
  Square,
  X,
} from 'lucide-react';
import EditorPagePanel from './EditorPagePanel';
import type { EditorToolId } from './EditorToolRail';
import {
  buildTemplateSectionBlockHtml,
  TEMPLATE_SECTION_PRESETS,
} from './template-section-blocks';
import {
  applySelectedStyle,
  insertEditorHtml,
  insertImageIntoEditor,
  readFileAsDataUrl,
} from './detail-page-editor-insert';

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

export function DetailPageLeftPanel({
  activeTool,
  onClose,
  onOpenAiPanel,
  rawImages = [],
}: {
  activeTool: EditorToolId;
  onClose?: () => void;
  onOpenAiPanel: () => void;
  rawImages?: string[];
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
      />
    </aside>
  );
}

function LeftToolPanel({
  activeTool,
  editor,
  onOpenAiPanel,
  rawImages,
}: {
  activeTool: EditorToolId;
  editor: ReturnType<typeof useEditor>;
  onOpenAiPanel: () => void;
  rawImages: string[];
}) {
  if (activeTool === 'pages') return <EditorPagePanel />;
  if (activeTool === 'text') return <TextToolPanel editor={editor} />;
  if (activeTool === 'image') return <ImageToolPanel editor={editor} rawImages={rawImages} />;
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
}: {
  editor: ReturnType<typeof useEditor>;
  rawImages: string[];
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const imageDragActiveRef = useRef(false);

  const handleFiles = useCallback(
    async (files: FileList | null) => {
      if (!files?.length) return;
      for (const file of Array.from(files)) {
        const url = await readFileAsDataUrl(file);
        editor.AssetManager.add({ type: 'image', src: url });
        insertImageIntoEditor(editor, url);
      }
      if (fileInputRef.current) fileInputRef.current.value = '';
    },
    [editor],
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
