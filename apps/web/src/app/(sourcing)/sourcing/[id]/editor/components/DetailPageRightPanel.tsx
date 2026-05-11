'use client';

import type { MutableRefObject } from 'react';
import { useCallback, useState } from 'react';
import { useEditor } from '@grapesjs/react';
import {
  Image as ImageIcon,
  Loader2,
  Palette,
  Sparkles,
  Type,
  Wand2,
  X,
} from 'lucide-react';
import { toast } from 'sonner';
import { API_BASE } from '@/lib/api';
import { apiClient } from '@/lib/api-client';
import { cn } from '@/lib/utils';
import { buildSizeGuideFrameHtml } from '../../../lib/size-guide-frame';
import { AITextEditPanel } from './AITextEditPanel';
import { ImagePickerModal } from './ImagePickerModal';
import { ImageSelectionPanel } from './ImageSelectionPanel';

export function DetailPageRightPanel({
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
}: {
  onClose?: () => void;
  selectedTextComponent: any;
  selectedImageComponent: any;
  isBusy: MutableRefObject<boolean>;
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
        sourceType: 'sourcing',
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
          let output: Record<string, unknown> | null = null;
          try {
            output = typeof run.output === 'string' ? JSON.parse(run.output) : run.output;
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
