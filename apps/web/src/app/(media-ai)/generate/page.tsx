'use client';

// 사이드바 '상세페이지 생성' 진입점 (/generate).
//
// 2-step flow:
//   Step 1: TemplatePickStep — 템플릿 카드 (미리보기 모달 포함) 에서 선택
//   Step 2: 기존 form (ProductInputSection + CategorySelect + Submit)
//
// 사용자: "사이드바 상세페이지 생성 페이지... 앞에 템플릿 선택하고 이 페이지로 넘어오게"

import { Suspense, useState } from 'react';
import { ArrowLeft, X } from 'lucide-react';
import CategorySelect from './components/CategorySelect';
import GenerateLoadingOverlay from './components/GenerateLoadingOverlay';
import GeneratePageHeader from './components/GeneratePageHeader';
import GenerateResult from './components/GenerateResult';
import GenerateSubmitButton from './components/GenerateSubmitButton';
import KidsPlayfulFlow from './components/KidsPlayfulFlow';
import KidsPlayfulHistoryList from './components/KidsPlayfulHistoryList';
import ProductInputSection from './components/ProductInputSection';
import TemplatePickStep from './components/TemplatePickStep';
import { useGenerateForm } from './hooks/useGenerateForm';

export default function GeneratePage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-slate-50" />}>
      <GeneratePageContent />
    </Suspense>
  );
}

function GeneratePageContent() {
  const [step, setStep] = useState<'template' | 'form'>('template');
  const [templateId, setTemplateId] = useState<string>('simple-vertical');

  const {
    mode,
    setMode,
    url,
    setUrl,
    images,
    setImages,
    category,
    setCategory,
    isLoading,
    result,
    error,
    setError,
    isFormValid,
    imagesLoading,
    handleSubmit,
    reset,
    newCreate,
  } = useGenerateForm();

  if (result) {
    return <GenerateResult result={result} onReset={reset} onNewCreate={newCreate} />;
  }

  if (step === 'template') {
    return (
      <div className="flex flex-col h-full bg-slate-50 overflow-y-auto">
        <TemplatePickStep
          defaultTemplateId="simple-vertical"
          onPick={(tid) => {
            setTemplateId(tid);
            setStep('form');
          }}
        />
        <KidsPlayfulHistoryList />
      </div>
    );
  }

  if (templateId === 'kids-playful') {
    return <KidsPlayfulFlow onBack={() => setStep('template')} />;
  }

  return (
    <div className="flex flex-col h-full bg-slate-50 overflow-y-auto">
      <GeneratePageHeader />

      {/* 선택된 템플릿 표시 + 다시 고르기 */}
      <div className="border-b border-slate-200 bg-white px-8 py-3">
        <div className="flex w-full items-center justify-between">
          <button
            type="button"
            onClick={() => setStep('template')}
            className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-800"
          >
            <ArrowLeft size={14} />
            템플릿 다시 선택
          </button>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-violet-50 px-3 py-1 text-xs font-semibold text-violet-700">
            템플릿: <span className="font-mono">{templateId}</span>
          </span>
        </div>
      </div>

      {error && (
        <div className="w-full px-8 pt-4">
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-sm text-red-700 flex items-center justify-between">
            <span>{error}</span>
            <button onClick={() => setError(null)} className="text-red-500 hover:text-red-700">
              <X size={16} />
            </button>
          </div>
        </div>
      )}

      <div className="flex-1 w-full p-8 space-y-8">
        <ProductInputSection
          mode={mode}
          setMode={setMode}
          url={url}
          setUrl={setUrl}
          images={images}
          setImages={setImages}
          imagesLoading={imagesLoading}
        />

        <CategorySelect category={category} setCategory={setCategory} />

        <GenerateSubmitButton
          isLoading={isLoading}
          isFormValid={isFormValid}
          onSubmit={handleSubmit}
        />
      </div>

      {isLoading && <GenerateLoadingOverlay />}
    </div>
  );
}
