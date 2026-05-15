'use client';

// 템플릿 갤러리 — '상세페이지 생성' 누르면 여기 먼저 도착.
// 사용자가 각 템플릿이 실제로 어떻게 생겼는지 iframe 미리보기로 비교 후 선택.
//
// 흐름:
//   /product-pipeline/collected-products/[id]/templates 진입 → 모든 템플릿을 placeholder data 로 iframe 렌더
//     (또는 사용자가 '내 데이터로 미리보기' 토글 시 product.draft_content 사용)
//   각 템플릿 카드의 "이 템플릿으로 생성" 버튼 → useGenerateDetailPage.mutate(templateId)
//   완료 후 /product-pipeline/collected-products/[id] 로 navigate.
//
// 이전: TemplateSelectionModal 작은 카드 (이모지만) → 실제 모양 모름.
// 사용자 요구 "템플릿을 보여줘 어떻게 생겼는지를".

import { useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft, Sparkles, Loader2, Check } from 'lucide-react';
import {
  getTemplate,
  parseDetailPageData,
  placeholderDetailPageData,
  templateIds,
  type DetailPageData,
} from '@kiditem/templates';
import { apiClient } from '@/lib/api-client';
import { cn } from '@/lib/utils';
import { collectedProductDetailHref } from '../../../_shared/lib/product-pipeline-routes';
import { renderTemplateToHtml } from '@/app/(product-pipeline)/product-pipeline/_shared/lib/template-html';
import { useGenerateDetailPage, type GenerateMode } from '@/app/(product-pipeline)/product-pipeline/_shared/hooks/useGenerateDetailPage';

// 템플릿별 설명 — 모달에서 쓰던 텍스트 재활용
const TEMPLATE_META: Record<string, { tagline: string; suit: string }> = {
  'bold-vertical': {
    tagline: '굵직한 헤드라인 + 임팩트',
    suit: '식품·완구·강한 시각 카테고리',
  },
  'kids-playful': {
    tagline: '귀엽고 발랄한 톤 + 핑크 pain-point',
    suit: '유아·키즈·캐릭터 상품',
  },
};

const MODE_OPTIONS: { mode: GenerateMode; label: string; duration: string }[] = [
  { mode: 'draft', label: '카피 + 색상만', duration: '5~30초' },
  { mode: 'image', label: '이미지만', duration: '1~3분' },
  { mode: 'full', label: '전체 생성', duration: '1~3.5분' },
];

export default function TemplateGalleryPage() {
  const params = useParams();
  const router = useRouter();
  const productId = params.id as string;

  const [mode, setMode] = useState<GenerateMode>('full');
  const [pickedId, setPickedId] = useState<string | null>(null);
  const [useMyData, setUseMyData] = useState(false);

  // 사용자 product 의 draft_content 가져오기 — '내 데이터로 미리보기' 토글 시
  const [myData, setMyData] = useState<DetailPageData | null>(null);

  // 토글 ON 시 fetch — 한번만
  useMemo(() => {
    if (!useMyData || myData) return;
    apiClient
      .get<{ template: string | null; data: Record<string, unknown> }>(
        `/api/products/${productId}/preview`,
      )
      .then((res) => {
        if (res?.data && Object.keys(res.data).length > 0) {
          setMyData(parseDetailPageData(res.data));
        }
      })
      .catch(() => {});
  }, [useMyData, myData, productId]);

  const previewData: DetailPageData =
    (useMyData ? myData : null) ?? placeholderDetailPageData;

  const { mutate: runGenerate, isPending } = useGenerateDetailPage(productId);

  const handleGenerate = (templateId: string) => {
    setPickedId(templateId);
    runGenerate(
      { mode, templateId },
      {
        onSuccess: () => {
          // 생성 완료 후 detail 페이지로 — 새 미리보기 탭에서 결과 확인 가능
          router.push(collectedProductDetailHref(productId));
        },
        onSettled: () => setPickedId(null),
      },
    );
  };

  return (
    <div className="flex h-full flex-col bg-slate-50">
      {/* 헤더 */}
      <div className="flex items-center justify-between border-b border-slate-200 bg-white px-6 py-4">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => router.push(collectedProductDetailHref(productId))}
            className="rounded-md p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-700"
            aria-label="뒤로"
          >
            <ArrowLeft size={18} />
          </button>
          <div>
            <h1 className="text-lg font-bold text-slate-900">상세페이지 템플릿 선택</h1>
            <p className="text-xs text-slate-500">템플릿을 미리 보고 마음에 드는 걸 골라주세요</p>
          </div>
        </div>

        {/* 미리보기 데이터 토글 */}
        <label className="flex cursor-pointer items-center gap-2">
          <span className="text-xs text-slate-600">내 상품 데이터로 미리보기</span>
          <div className="relative">
            <input
              type="checkbox"
              className="peer sr-only"
              checked={useMyData}
              onChange={(e) => setUseMyData(e.target.checked)}
            />
            <div className="h-5 w-9 rounded-full bg-slate-300 transition peer-checked:bg-violet-600" />
            <div className="absolute left-0.5 top-0.5 h-4 w-4 rounded-full bg-white transition peer-checked:translate-x-4" />
          </div>
        </label>
      </div>

      {/* 모드 선택 — 갤러리 위에 sticky bar */}
      <div className="border-b border-slate-200 bg-white px-6 py-3">
        <div className="flex items-center gap-3">
          <span className="text-xs font-semibold text-slate-600">생성 모드:</span>
          <div className="inline-flex rounded-lg bg-slate-100 p-0.5">
            {MODE_OPTIONS.map((m) => (
              <button
                key={m.mode}
                onClick={() => setMode(m.mode)}
                className={cn(
                  'rounded-md px-3 py-1.5 text-xs font-semibold transition',
                  mode === m.mode
                    ? 'bg-white text-slate-900 shadow-sm'
                    : 'text-slate-500 hover:text-slate-700',
                )}
              >
                {m.label}
                <span className="ml-1 text-[10px] text-slate-400">{m.duration}</span>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* 갤러리 — 그리드 카드. 각 카드 = 템플릿 미리보기 iframe + 메타 + CTA */}
      <div className="flex-1 overflow-y-auto p-6">
        <div className="mx-auto grid max-w-7xl grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-3">
          {templateIds.map((tid) => (
            <TemplatePreviewCard
              key={tid}
              templateId={tid}
              previewData={previewData}
              isPicked={pickedId === tid}
              isPending={isPending && pickedId === tid}
              onGenerate={() => handleGenerate(tid)}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

interface CardProps {
  templateId: string;
  previewData: DetailPageData;
  isPicked: boolean;
  isPending: boolean;
  onGenerate: () => void;
}

function TemplatePreviewCard({
  templateId,
  previewData,
  isPicked,
  isPending,
  onGenerate,
}: CardProps) {
  const config = useMemo(() => {
    try {
      return getTemplate(templateId);
    } catch {
      return null;
    }
  }, [templateId]);

  const previewHtml = useMemo(() => {
    if (!config) return '';
    return renderTemplateToHtml(
      config.component as React.ComponentType<unknown>,
      previewData,
      config,
      '',
    );
  }, [config, previewData]);

  const meta = TEMPLATE_META[templateId];

  if (!config) return null;

  return (
    <div
      className={cn(
        'flex flex-col overflow-hidden rounded-2xl border-2 bg-white shadow-sm transition',
        isPicked
          ? 'border-violet-500 ring-4 ring-violet-100'
          : 'border-slate-200 hover:border-slate-300 hover:shadow-md',
      )}
    >
      {/* iframe 미리보기 — 고정 높이 + 내부 스크롤 */}
      <div className="relative h-[480px] overflow-hidden bg-slate-50">
        <iframe
          srcDoc={previewHtml}
          className="absolute left-0 top-0 origin-top-left border-0"
          style={{
            width: '180%',
            height: '180%',
            transform: 'scale(0.555)',
          }}
          title={`${templateId}-preview`}
          sandbox="allow-same-origin"
        />
        {isPicked && (
          <div className="absolute right-3 top-3 flex h-8 w-8 items-center justify-center rounded-full bg-violet-600 text-white shadow-lg">
            <Check size={16} strokeWidth={3} />
          </div>
        )}
      </div>

      {/* 메타 + CTA */}
      <div className="flex flex-col gap-3 p-4">
        <div>
          <div className="mb-1 flex items-center gap-2">
            <h3 className="text-base font-bold text-slate-900">{config.name}</h3>
            <span className="rounded-md bg-slate-100 px-1.5 py-0.5 font-mono text-[10px] text-slate-500">
              {templateId}
            </span>
          </div>
          {meta && (
            <>
              <p className="text-xs text-slate-600">{meta.tagline}</p>
              <p className="text-[11px] text-slate-400">추천: {meta.suit}</p>
            </>
          )}
        </div>

        <button
          type="button"
          onClick={onGenerate}
          disabled={isPending}
          className={cn(
            'inline-flex items-center justify-center gap-1.5 rounded-lg px-4 py-2.5 text-sm font-semibold text-white transition',
            isPending
              ? 'cursor-wait bg-violet-400'
              : 'bg-violet-600 hover:bg-violet-700',
          )}
        >
          {isPending ? (
            <>
              <Loader2 size={14} className="animate-spin" />
              생성 중...
            </>
          ) : (
            <>
              <Sparkles size={14} />이 템플릿으로 생성
            </>
          )}
        </button>
      </div>
    </div>
  );
}
