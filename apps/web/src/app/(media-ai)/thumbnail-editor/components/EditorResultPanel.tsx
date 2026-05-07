'use client';
import { useEffect, useState } from 'react';
import {
  Sparkles,
  Scissors,
  ZoomIn,
  Loader2,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { resolveImageUrl } from '@/lib/resolve-url';
import { CoupangSearchCardPreview, CoupangDetailPreview } from '@/components/coupang/CoupangPreview';
import { ImgWithSkeleton } from './ImgWithSkeleton';

import type { EditorMode, HistoryCandidate } from '../edit/page';

type ResultViewTab = 'result' | 'coupang-search' | 'coupang-detail';

interface EditorResultPanelProps {
  mode: EditorMode;
  originalImage: string | null;
  candidates: HistoryCandidate[];
  selectedCandidateUrl: string | null;
  isGenerating?: boolean;
  productName?: string;
  onSelectCandidate: (url: string) => void;
}

const readAccent = (mode: EditorMode): string => {
  if (typeof window === 'undefined') return mode === 'creative' ? '#e879f9' : '#a78bfa';
  const key = mode === 'creative' ? '--accent-creative' : '--accent-edit';
  const raw = getComputedStyle(document.documentElement).getPropertyValue(key).trim();
  return raw || (mode === 'creative' ? '#e879f9' : '#a78bfa');
};
// 일반적인 이미지 생성 한 번 호출에 걸리는 체감 시간 (초)
// 이보다 길어지면 "오래 걸리는 중" 힌트를 노출해서 사용자가 대기 이유를 이해하도록.
const EXPECTED_SECONDS = 20;

export function EditorResultPanel({
  mode,
  candidates,
  selectedCandidateUrl,
  isGenerating,
  productName = '',
}: EditorResultPanelProps) {
  const [zoomImage, setZoomImage] = useState<string | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [viewTab, setViewTab] = useState<ResultViewTab>('result');

  const [accent, setAccent] = useState(() => readAccent(mode));
  useEffect(() => {
    setAccent(readAccent(mode));
    const obs = new MutationObserver(() => setAccent(readAccent(mode)));
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    return () => obs.disconnect();
  }, [mode]);

  useEffect(() => {
    if (!isGenerating) {
      setElapsed(0);
      return;
    }
    const id = setInterval(() => setElapsed((e) => e + 1), 1000);
    return () => clearInterval(id);
  }, [isGenerating]);

  if (isGenerating) {
    // 실제 서버는 Gemini image model (`AI_IMAGE_MODEL`) 를 단일 호출로 돌린다.
    // 중간 진행 신호가 없으므로 가짜 단계 애니메이션 대신 정직한 단일 상태 + 경과시간만 보여준다.
    // ⚠ candidates 가 이미 있어도 (URL `?generationId=...` 진입 후 재편집) generating 오버레이를
    // 우선 노출 — 그렇지 않으면 사용자가 "편집 중" 신호를 못 받고 멈춰있는 것처럼 보인다.
    const overrun = elapsed > EXPECTED_SECONDS;
    const progressRatio = Math.min(0.95, elapsed / EXPECTED_SECONDS);
    return (
      <div className="relative flex flex-col h-full bg-[var(--surface-sunken)]">
        <div className="absolute top-4 left-1/2 -translate-x-1/2 z-10 flex items-center gap-2 px-4 py-2 bg-[var(--surface)]/90 backdrop-blur-md rounded-full border border-[var(--border)] shadow-[0px_4px_20px_rgba(25,28,30,0.06)]">
          <span
            className="inline-block w-1.5 h-1.5 rounded-full animate-pulse"
            style={{ background: accent }}
          />
          <span className="text-[11px] font-bold uppercase tracking-widest text-[var(--text-secondary)]">
            Stage · Generating
          </span>
          <div className="w-px h-3.5 bg-[var(--border)] mx-1" />
          <span className="text-xs text-[var(--text-tertiary)] font-mono tabular-nums">{elapsed}s</span>
        </div>
        <div className="flex-1 min-h-0 flex items-center justify-center p-5 pt-16">
          <div className="w-[360px] bg-[var(--surface)] rounded-xl shadow-2xl p-6 border border-[var(--border)]">
            <div className="flex items-center gap-3 mb-5">
              <div
                className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0"
                style={{ background: `${accent}18` }}
              >
                <Loader2 size={18} className="animate-spin" style={{ color: accent }} />
              </div>
              <div className="min-w-0">
                <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--text-muted)]">
                  Gemini Image API
                </p>
                <p className="text-sm font-bold text-[var(--text-primary)] mt-0.5">AI 이미지 생성 중</p>
              </div>
            </div>

            {/* 단일 블랙박스 API — 세부 진행 신호가 없어서 경과시간 기반 인디케이터만 */}
            <div className="space-y-2">
              <div className="flex items-center justify-between text-[11px]">
                <span className="text-[var(--text-secondary)] font-medium">경과 시간</span>
                <span className="font-mono tabular-nums text-[var(--text-primary)] font-semibold">{elapsed}s</span>
              </div>
              <div className="h-1.5 w-full rounded-full bg-[var(--surface-sunken)] overflow-hidden">
                <div
                  className="h-full rounded-full transition-[width] duration-700 ease-out"
                  style={{
                    width: `${progressRatio * 100}%`,
                    background: accent,
                    // overrun 시엔 pulse 로 "서버가 아직 응답 중" 시각 힌트
                    animation: overrun ? 'pulse 1.4s ease-in-out infinite' : undefined,
                  }}
                />
              </div>
              <p className="text-[11px] text-[var(--text-tertiary)] leading-relaxed pt-1">
                {overrun
                  ? `보통 ${EXPECTED_SECONDS}초 안에 끝나지만 지금은 조금 더 걸리고 있어요. 창을 닫지 말고 잠시만 기다려 주세요.`
                  : `Gemini 가 이미지를 직접 만드는 단계입니다. 보통 ${EXPECTED_SECONDS}초 내외 소요됩니다.`}
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (candidates.length === 0) {
    return (
      <div className="relative flex flex-col items-center justify-center h-full bg-[var(--surface-sunken)]">
        <div className="absolute top-4 left-1/2 -translate-x-1/2 flex items-center gap-2 px-4 py-2 bg-[var(--surface)]/90 backdrop-blur-md rounded-full border border-[var(--border)] shadow-[0px_4px_20px_rgba(25,28,30,0.06)]">
          <span className="inline-block w-1.5 h-1.5 rounded-full bg-[var(--border-strong)]" />
          <span className="text-[11px] font-bold uppercase tracking-widest text-[var(--text-tertiary)]">
            Stage · Waiting
          </span>
        </div>
        <div className="relative">
          <div className="w-20 h-20 rounded-2xl bg-[var(--surface)] flex items-center justify-center shadow-lg mb-5 mx-auto border border-[var(--border)]">
            {mode === 'edit'
              ? <Scissors size={32} style={{ color: accent }} />
              : <Sparkles size={32} style={{ color: accent }} />}
          </div>
          <div className="text-sm font-bold mb-1 text-[var(--text-secondary)] text-center">결과가 여기에 표시됩니다</div>
          <div className="text-xs text-[var(--text-tertiary)] text-center">
            {mode === 'edit' ? '오른쪽에서 설정하고 편집을 시작하세요' : '씬을 설정하고 생성을 시작하세요'}
          </div>
        </div>
      </div>
    );
  }

  const displayUrl =
    selectedCandidateUrl ?? resolveImageUrl(candidates[0].url) ?? '';

  const selectedIdx = candidates.findIndex(
    (c) => (resolveImageUrl(c.url) ?? '') === selectedCandidateUrl,
  );
  const displayIdx = selectedIdx >= 0 ? selectedIdx : 0;
  const displayLabel = String.fromCharCode(65 + displayIdx);
  const displayFilename = candidates[displayIdx]?.filename ?? '';
  const displayMethod = candidates[displayIdx]?.method ?? null;
  const displayIsCreative = displayMethod === 'creative';
  const displayModeLabel = displayMethod ? (displayIsCreative ? '연출' : '편집') : null;

  const tabs: Array<{ key: ResultViewTab; label: string }> = [
    { key: 'result', label: '결과' },
    { key: 'coupang-search', label: '쿠팡 검색카드' },
    { key: 'coupang-detail', label: '쿠팡 상세' },
  ];

  return (
    <>
      <div className="relative flex flex-col h-full bg-[var(--surface-sunken)]">
        {/* Floating pill — tabs */}
        <div className="absolute top-4 left-1/2 -translate-x-1/2 z-10 flex items-center gap-1 px-1.5 py-1 bg-[var(--surface)]/90 backdrop-blur-md rounded-full border border-[var(--border)] shadow-[0px_4px_20px_rgba(25,28,30,0.06)]">
          {tabs.map((t) => {
            const active = viewTab === t.key;
            return (
              <button
                key={t.key}
                type="button"
                onClick={() => setViewTab(t.key)}
                className={cn(
                  'px-3 py-1.5 rounded-full text-[11px] font-bold transition-colors',
                  active
                    ? 'text-white'
                    : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]',
                )}
                style={active ? { background: accent } : undefined}
              >
                {t.label}
              </button>
            );
          })}
          <div className="w-px h-3.5 bg-[var(--border)] mx-1" />
          <span className="text-[11px] font-semibold" style={{ color: accent }}>
            후보 {displayLabel}
          </span>
          {displayModeLabel && (
            <span
              className={cn(
                'ml-1 mr-2 inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold',
                displayIsCreative
                  ? 'bg-fuchsia-500/10 text-fuchsia-600'
                  : 'bg-violet-500/10 text-violet-600',
              )}
              title={displayIsCreative ? 'AI 연출 생성으로 만든 이미지' : '이미지 편집으로 만든 이미지'}
            >
              {displayIsCreative ? <Sparkles size={10} /> : <Scissors size={10} />}
              {displayModeLabel}
            </span>
          )}
        </div>

        {/* Main — view switcher */}
        <div className="flex-1 min-h-0 flex items-center justify-center p-8 pt-20 overflow-y-auto">
          {viewTab === 'result' && (
            <div className="relative group w-full h-full max-w-[780px] flex items-center justify-center">
              <div
                className={cn(
                  'relative aspect-square overflow-hidden transition-all duration-200 bg-[var(--surface)] shadow-2xl',
                )}
                style={{
                  width: 'min(100%, calc(100vh - 220px))',
                  boxShadow: `0 0 0 1px var(--border), 0 20px 40px rgba(0,0,0,0.08)`,
                }}
              >
                {displayUrl ? (
                  <ImgWithSkeleton
                    src={displayUrl}
                    alt={`후보 ${displayLabel}`}
                    fit="contain"
                    priority
                  />
                ) : null}

                <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors flex items-center justify-center opacity-0 group-hover:opacity-100 pointer-events-none">
                  <button
                    type="button"
                    onClick={() => setZoomImage(displayUrl)}
                    className="pointer-events-auto w-12 h-12 rounded-full bg-white flex items-center justify-center text-gray-900 hover:bg-gray-50 shadow-xl"
                    aria-label="확대 보기"
                  >
                    <ZoomIn size={18} />
                  </button>
                </div>
              </div>
            </div>
          )}

          {viewTab === 'coupang-search' && (
            <div className="w-full flex flex-col items-center gap-4">
              <p className="text-[11px] font-bold uppercase tracking-widest text-[var(--text-muted)]">
                Coupang · 검색 결과 카드 미리보기
              </p>
              <CoupangSearchCardPreview imageUrl={displayUrl} productName={productName} />
              <p className="text-[11px] text-[var(--text-tertiary)] max-w-[420px] text-center">
                실제 쿠팡 UI 를 모사한 정적 미리보기입니다. 가격·리뷰·배송 뱃지는 placeholder.
              </p>
            </div>
          )}

          {viewTab === 'coupang-detail' && (
            <div className="w-full flex flex-col items-center gap-4">
              <p className="text-[11px] font-bold uppercase tracking-widest text-[var(--text-muted)]">
                Coupang · 상세 페이지 대표 이미지 미리보기
              </p>
              <CoupangDetailPreview imageUrl={displayUrl} productName={productName} />
              <p className="text-[11px] text-[var(--text-tertiary)] max-w-[560px] text-center">
                실제 쿠팡 UI 를 모사한 정적 미리보기입니다. 가격·리뷰·버튼은 placeholder.
              </p>
            </div>
          )}
        </div>

        {/* Filename caption */}
        {displayFilename && (
          <div className="flex-shrink-0 px-8 pb-5 flex items-center justify-between text-xs">
            <div className="min-w-0">
              <p className="text-[10px] font-bold uppercase tracking-widest text-[var(--text-muted)]">
                Output
              </p>
              <p className="font-medium text-[var(--text-secondary)] truncate max-w-[480px]">
                <span style={{ color: accent }}>후보 {displayLabel} · </span>
                {displayFilename}
              </p>
            </div>

          </div>
        )}
      </div>

      {zoomImage && (
        <div
          className="fixed inset-0 bg-black/85 z-[60] flex items-center justify-center cursor-zoom-out"
          onClick={() => setZoomImage(null)}
        >
          <img
            src={zoomImage}
            alt="확대 보기"
            className="max-w-[90vw] max-h-[90vh] rounded-2xl object-contain"
            referrerPolicy="no-referrer"
          />
        </div>
      )}
    </>
  );
}
