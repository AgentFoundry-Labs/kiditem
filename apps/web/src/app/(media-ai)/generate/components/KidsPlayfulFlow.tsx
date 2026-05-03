'use client';

import { useMemo, useState } from 'react';
import { ArrowLeft, Sparkles } from 'lucide-react';
import { toast } from 'sonner';
import { isApiError } from '@/lib/api-error';
import { cn } from '@/lib/utils';
import { useKidsPlayfulGenerate } from '../hooks/useKidsPlayfulGenerate';
import {
  adaptToKidsPlayful,
  type DetailPageGenerationRaw,
} from '../lib/kids-playful-types';
import GenerateLoadingOverlay from './GenerateLoadingOverlay';
import KidsPlayfulRenderer from './KidsPlayfulRenderer';

interface KidsPlayfulFlowProps {
  onBack: () => void;
}

/**
 * kids-playful 템플릿 전용 입력 → 생성 → 렌더 플로우.
 *
 * 1688 raw 5 필드 입력 → POST /api/ai/detail-page/generate → 11 섹션 JSON →
 *   adaptToKidsPlayful 로 imageIndex → URL 변환 → KidsPlayfulRenderer 렌더.
 */
export default function KidsPlayfulFlow({ onBack }: KidsPlayfulFlowProps) {
  const [rawTitle, setRawTitle] = useState('');
  const [rawCategory, setRawCategory] = useState('');
  const [rawDescription, setRawDescription] = useState('');
  const [rawOptions, setRawOptions] = useState('');
  const [imageUrlsText, setImageUrlsText] = useState('');
  const [heroImageMode, setHeroImageMode] = useState<'first' | 'llm-pick'>(
    'llm-pick',
  );
  const [result, setResult] = useState<DetailPageGenerationRaw | null>(null);
  /** 결과를 렌더할 때 imageIndex resolve 에 쓰기 위해 입력 imageUrls 보존 */
  const [resultImageUrls, setResultImageUrls] = useState<string[]>([]);

  const mutation = useKidsPlayfulGenerate();

  const imageUrls = imageUrlsText
    .split(/\n+/)
    .map((s) => s.trim())
    .filter(Boolean);

  const isFormValid =
    rawTitle.trim() !== '' &&
    rawCategory.trim() !== '' &&
    imageUrls.length > 0;

  const handleSubmit = async () => {
    if (!isFormValid || mutation.isPending) return;
    try {
      const res = await mutation.mutateAsync({
        rawTitle,
        rawCategory,
        rawDescription,
        rawOptions,
        imageUrls,
        heroImageMode,
      });
      // server 가 row 반환 (DB 저장됨). result 가 11 섹션 raw, imageUrls 도 같이.
      setResult(res.result as unknown as DetailPageGenerationRaw);
      setResultImageUrls(res.imageUrls);
    } catch (err) {
      const detail = isApiError(err)
        ? err.detail
        : '상세페이지 생성 중 오류가 발생했습니다.';
      toast.error(detail);
    }
  };

  const handleReset = () => {
    setResult(null);
    setResultImageUrls([]);
  };
  const handleNewCreate = () => {
    setResult(null);
    setResultImageUrls([]);
    setRawTitle('');
    setRawCategory('');
    setRawDescription('');
    setRawOptions('');
    setImageUrlsText('');
  };

  const adaptedData = useMemo(
    () => (result ? adaptToKidsPlayful(result, resultImageUrls) : null),
    [result, resultImageUrls],
  );

  if (result && adaptedData) {
    return (
      <div className="flex flex-col h-full bg-slate-100">
        <div className="bg-white border-b border-slate-200 px-8 py-4 flex items-center justify-between sticky top-0 z-20">
          <button
            onClick={handleReset}
            className="flex items-center gap-2 text-slate-600 hover:text-slate-900 font-bold transition-colors"
          >
            <ArrowLeft size={20} />
            다시 만들기
          </button>
          <div className="flex items-center gap-2 text-violet-600 font-bold text-sm">
            <Sparkles size={16} />
            kids-playful 미리보기
          </div>
          <button
            onClick={handleNewCreate}
            className="px-4 py-2 border border-slate-300 text-slate-700 rounded-lg font-bold text-xs hover:bg-slate-50 transition-colors"
          >
            새로 만들기
          </button>
        </div>
        <div className="flex-1 overflow-y-auto">
          <KidsPlayfulRenderer data={adaptedData} />
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-slate-50 overflow-y-auto">
      <div className="border-b border-slate-200 bg-white px-8 py-4">
        <div className="flex w-full items-center justify-between">
          <button
            type="button"
            onClick={onBack}
            className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-800"
          >
            <ArrowLeft size={14} />
            템플릿 다시 선택
          </button>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-violet-50 px-3 py-1 text-xs font-semibold text-violet-700">
            템플릿: <span className="font-mono">kids-playful</span>
          </span>
        </div>
      </div>

      <div className="flex-1 w-full p-8 space-y-6">
        <header className="space-y-1">
          <h1 className="text-xl font-bold text-slate-900 inline-flex items-center gap-2">
            <Sparkles size={18} className="text-violet-500" />
            kids-playful 상세페이지 생성
          </h1>
          <p className="text-sm text-slate-500">
            1688/Alibaba raw 데이터 5 필드를 입력하면 11 개 섹션 카피를 한 번에 생성합니다.
          </p>
        </header>

        <Field
          label="제품명 (원문)"
          required
          hint="1688 원본 제품명 그대로 (한자/영어 가능)"
          value={rawTitle}
          onChange={setRawTitle}
          placeholder="예: 儿童双喷头压缩水枪夏季玩具"
        />

        <Field
          label="카테고리 (원문)"
          required
          hint="원본 카테고리 — 예: '儿童玩具/水枪'"
          value={rawCategory}
          onChange={setRawCategory}
          placeholder="예: 儿童玩具/水枪"
        />

        <Field
          label="원본 설명"
          multiline
          hint="제품 페이지의 본문 / 셀링포인트"
          value={rawDescription}
          onChange={setRawDescription}
          placeholder="예: 双喷头压缩水枪... 大容量水箱..."
        />

        <Field
          label="옵션 / 스펙"
          multiline
          hint="색상·사이즈·구성 등 옵션 요약"
          value={rawOptions}
          onChange={setRawOptions}
          placeholder="예: 색상: 파랑/빨강, 용량: 1.2L, 구성: 본체+캡"
        />

        <div className="space-y-2">
          <Label
            label="이미지 URL 후보"
            required
            hint="줄바꿈으로 구분. 1~50 장. 인덱스 = 줄 순서 (0-based)"
          />
          <textarea
            value={imageUrlsText}
            onChange={(e) => setImageUrlsText(e.target.value)}
            rows={6}
            className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-mono text-slate-800 focus:border-violet-400 focus:outline-none focus:ring-1 focus:ring-violet-200"
            placeholder={
              'https://cbu01.alicdn.com/.../image1.jpg\nhttps://cbu01.alicdn.com/.../image2.jpg'
            }
          />
          {imageUrls.length > 0 && (
            <p className="text-xs text-slate-400">{imageUrls.length}장 입력됨</p>
          )}
        </div>

        <div className="space-y-2">
          <Label label="Hero 이미지 모드" />
          <div className="flex gap-2">
            <ModeButton
              active={heroImageMode === 'llm-pick'}
              onClick={() => setHeroImageMode('llm-pick')}
              label="LLM 자동 픽"
              hint="라이프스타일컷 우선"
            />
            <ModeButton
              active={heroImageMode === 'first'}
              onClick={() => setHeroImageMode('first')}
              label="첫 번째 이미지"
              hint="0번 강제 (1688 메인)"
            />
          </div>
        </div>

        <div className="pt-4">
          <button
            type="button"
            onClick={handleSubmit}
            disabled={!isFormValid || mutation.isPending}
            className={cn(
              'w-full rounded-lg px-6 py-3 text-sm font-bold transition-colors',
              isFormValid && !mutation.isPending
                ? 'bg-violet-500 text-white hover:bg-violet-600'
                : 'bg-slate-200 text-slate-400 cursor-not-allowed',
            )}
          >
            {mutation.isPending ? '생성 중...' : '11 섹션 카피 생성'}
          </button>
        </div>
      </div>

      {mutation.isPending && <GenerateLoadingOverlay />}
    </div>
  );
}

interface FieldProps {
  label: string;
  required?: boolean;
  hint?: string;
  multiline?: boolean;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}

function Field({
  label,
  required,
  hint,
  multiline,
  value,
  onChange,
  placeholder,
}: FieldProps) {
  return (
    <div className="space-y-2">
      <Label label={label} required={required} hint={hint} />
      {multiline ? (
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          rows={3}
          className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 focus:border-violet-400 focus:outline-none focus:ring-1 focus:ring-violet-200"
          placeholder={placeholder}
        />
      ) : (
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 focus:border-violet-400 focus:outline-none focus:ring-1 focus:ring-violet-200"
          placeholder={placeholder}
        />
      )}
    </div>
  );
}

function Label({
  label,
  required,
  hint,
}: {
  label: string;
  required?: boolean;
  hint?: string;
}) {
  return (
    <div className="flex items-baseline justify-between">
      <label className="text-sm font-bold text-slate-700">
        {label}
        {required && <span className="text-rose-500 ml-0.5">*</span>}
      </label>
      {hint && <span className="text-xs text-slate-400">{hint}</span>}
    </div>
  );
}

function ModeButton({
  active,
  onClick,
  label,
  hint,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  hint: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex-1 rounded-lg border px-4 py-3 text-left transition-colors',
        active
          ? 'border-violet-500 bg-violet-50 text-violet-900'
          : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300',
      )}
    >
      <div className="text-sm font-bold">{label}</div>
      <div className="text-xs text-slate-500 mt-0.5">{hint}</div>
    </button>
  );
}
