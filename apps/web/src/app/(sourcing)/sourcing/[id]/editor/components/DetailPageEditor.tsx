'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import GjsEditor, {
  AssetsProvider,
  Canvas,
  WithEditor,
} from '@grapesjs/react';
import grapesjs, { type Editor } from 'grapesjs';
import { PanelLeft, Sparkles } from 'lucide-react';
import { toast } from 'sonner';
import { API_BASE } from '@/lib/api';
import { apiClient } from '@/lib/api-client';
import { cn } from '@/lib/utils';
import 'grapesjs/dist/css/grapes.min.css';
import './grapesjs-editor.css';
import { buildSizeGuideFrameHtml } from '../../../lib/size-guide-frame';
import EditorDetailMinimap from './EditorDetailMinimap';
import EditorToolRail, { type EditorToolId } from './EditorToolRail';
import { ImagePickerModal } from './ImagePickerModal';
import { DetailPageLeftPanel } from './DetailPageLeftPanel';
import { DetailPageRightPanel } from './DetailPageRightPanel';
import { DetailPageEditorToolbar } from './DetailPageEditorToolbar';
import { GJS_THEME_CSS, GRAPESJS_OPTIONS } from './detail-page-editor-config';
import {
  injectHeadResources,
  parseFullHtml,
  syncEditorFrameHeight,
} from './detail-page-editor-html';

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
  const isBusyRef = useRef(false);
  const [showImagePicker, setShowImagePicker] = useState(false);
  const [editorRef, setEditorRef] = useState<Editor | null>(null);
  const [showLeftPanel, setShowLeftPanel] = useState(true);
  const [showRightPanel, setShowRightPanel] = useState(true);
  const [activeLeftTool, setActiveLeftTool] = useState<EditorToolId>('pages');

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
    (newUrl: string) => {
      if (!editorRef) return null;
      const selected = selectedImageComponent ?? editorRef.getSelected();
      if (!selected) return null;

      const attrs = selected.getAttributes?.() ?? {};
      selected.setAttributes?.({ ...attrs, src: newUrl });
      selected.view?.el?.setAttribute?.('src', newUrl);
      selected.view?.render?.();
      editorRef.trigger('component:update', selected);
      editorRef.refresh();

      requestAnimationFrame(() => {
        selected.view?.el?.setAttribute?.('src', newUrl);
        editorRef.select(selected);
        editorRef.refresh();
      });

      return selected;
    },
    [editorRef, selectedImageComponent],
  );

  const handleImageEdited = useCallback(
    (newUrl: string) => {
      const selected = applyImageSrcToComponent(newUrl);
      if (!selected) return;
      setSelectedImageComponent(selected);
      setSelectedImageSrc(newUrl);
    },
    [applyImageSrcToComponent],
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

  const refreshCanvas = useCallback(() => {
    if (editorRef) requestAnimationFrame(() => editorRef.refresh());
  }, [editorRef]);

  return (
    <GjsEditor grapesjs={grapesjs} options={GRAPESJS_OPTIONS} onEditor={handleEditorInit}>
      <div className="flex flex-col h-screen bg-[#F5F7F8]">
        <WithEditor>
          <DetailPageEditorToolbar
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
              <DetailPageLeftPanel
                activeTool={activeLeftTool}
                onClose={() => setShowLeftPanel(false)}
                onOpenAiPanel={() => {
                  setShowRightPanel(true);
                  refreshCanvas();
                }}
                rawImages={rawImages}
              />
            </WithEditor>
          </div>
          <div className="relative min-w-0 flex-1 overflow-hidden bg-slate-100">
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
          <div className={cn('flex h-full shrink-0', !showRightPanel && 'hidden')}>
            <WithEditor>
              <EditorDetailMinimap />
            </WithEditor>
            <WithEditor>
              <DetailPageRightPanel
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
