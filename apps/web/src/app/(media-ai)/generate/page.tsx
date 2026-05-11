'use client';

// 사이드바 '상세페이지 생성' 진입점 (/generate).
//
// 2-step flow:
//   Step 1: TemplatePickStep — 템플릿 카드 (미리보기 모달 포함) 에서 선택
//   Step 2: ProductInputSection — compact single-card generation form
//
// 사용자: "사이드바 상세페이지 생성 페이지... 앞에 템플릿 선택하고 이 페이지로 넘어오게"

import { Suspense, useState } from 'react';
import { ArrowLeft, Sparkles, X } from 'lucide-react';
import GenerateLoadingOverlay from './components/GenerateLoadingOverlay';
import KidsPlayfulHistoryList from './components/KidsPlayfulHistoryList';
import ProductInputSection from './components/ProductInputSection';
import TemplatePickStep from './components/TemplatePickStep';
import { useGenerateForm, type GenerateTemplateId } from './hooks/useGenerateForm';

export default function GeneratePage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-[var(--surface-sunken)]" />}>
      <GeneratePageContent />
    </Suspense>
  );
}

function GeneratePageContent() {
  const [step, setStep] = useState<'template' | 'form'>('template');
  const [templateId, setTemplateId] = useState<GenerateTemplateId>('bold-vertical');

  const {
    rawTitle,
    setRawTitle,
    rawCategory,
    setRawCategory,
    target,
    setTarget,
    ageGroup,
    setAgeGroup,
    detailImageCount,
    setDetailImageCount,
    rawDescription,
    setRawDescription,
    productSize,
    setProductSize,
    boxSetStatus,
    setBoxSetStatus,
    boxSetQuantity,
    setBoxSetQuantity,
    colorVariantStatus,
    setColorVariantStatus,
    colorVariantNames,
    setColorVariantNames,
    rawOptions,
    setRawOptions,
    images,
    setImages,
    isLoading,
    error,
    setError,
    isFormValid,
    imagesLoading,
    isPrefilling,
    generationStartedAt,
    handlePrefill,
    handleSubmit,
  } = useGenerateForm();

  if (step === 'template') {
    return (
      <div className="flex h-full flex-col overflow-y-auto bg-[var(--surface-sunken)]">
        <TemplatePickStep
          defaultTemplateId="bold-vertical"
          onPick={(tid) => {
            setTemplateId(tid === 'kids-playful' ? 'kids-playful' : 'bold-vertical');
            setStep('form');
          }}
        />
        <KidsPlayfulHistoryList />
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-[calc(100vh-48px)] flex-col overflow-y-auto bg-[var(--surface-sunken)]">
      <div className="px-6 pt-6">
        <div className="mx-auto flex w-full max-w-[960px] items-center justify-between">
          <button
            type="button"
            onClick={() => setStep('template')}
            className="inline-flex items-center gap-1.5 text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
          >
            <ArrowLeft size={14} />
            템플릿 다시 선택
          </button>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-violet-50 px-3 py-1 text-xs font-black text-violet-700 ring-1 ring-violet-200">
            <Sparkles size={13} />
            KIDITEM DETAIL DESIGN
          </span>
        </div>
      </div>

      {error && (
        <div className="px-6 pt-3">
          <div className="mx-auto flex w-full max-w-[960px] items-center justify-between rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            <span>{error}</span>
            <button onClick={() => setError(null)} className="text-red-500 hover:text-red-700">
              <X size={16} />
            </button>
          </div>
        </div>
      )}

      <div className="flex min-h-0 flex-1 items-start justify-center px-6 pb-3 pt-3">
        <ProductInputSection
          rawTitle={rawTitle}
          setRawTitle={setRawTitle}
          rawCategory={rawCategory}
          setRawCategory={setRawCategory}
          target={target}
          setTarget={setTarget}
          ageGroup={ageGroup}
          setAgeGroup={setAgeGroup}
          detailImageCount={detailImageCount}
          setDetailImageCount={setDetailImageCount}
          rawDescription={rawDescription}
          setRawDescription={setRawDescription}
          productSize={productSize}
          setProductSize={setProductSize}
          boxSetStatus={boxSetStatus}
          setBoxSetStatus={setBoxSetStatus}
          boxSetQuantity={boxSetQuantity}
          setBoxSetQuantity={setBoxSetQuantity}
          colorVariantStatus={colorVariantStatus}
          setColorVariantStatus={setColorVariantStatus}
          colorVariantNames={colorVariantNames}
          setColorVariantNames={setColorVariantNames}
          rawOptions={rawOptions}
          setRawOptions={setRawOptions}
          images={images}
          setImages={setImages}
          imagesLoading={imagesLoading}
          isLoading={isLoading}
          isFormValid={isFormValid}
          isPrefilling={isPrefilling}
          generationStartedAt={generationStartedAt}
          onPrefill={handlePrefill}
          onSubmit={() => handleSubmit(templateId)}
        />
      </div>

      {isLoading && <GenerateLoadingOverlay />}
    </div>
  );
}
