'use client';

import { Suspense } from 'react';
import { Sparkles, X } from 'lucide-react';
import GenerationStartModal from './components/GenerationStartModal';
import ProductInputSection from './components/ProductInputSection';
import { useProductGenerateWorkflow } from './hooks/useProductGenerateWorkflow';

export default function ProductGeneratePage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-[var(--surface-sunken)]" />}>
      <ProductGeneratePageContent />
    </Suspense>
  );
}

function ProductGeneratePageContent() {
  const {
    templateId,
    setTemplateId,
    isRegisteringCandidate,
    form,
    handleSubmit: handleProductSubmit,
    handleGenerationDialogAction,
    handleGenerationDialogCancel,
  } = useProductGenerateWorkflow();
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
    usageSectionMode,
    setUsageSectionMode,
    kcCertificationStatus,
    setKcCertificationStatus,
    kcCertificationNumber,
    setKcCertificationNumber,
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
    generationDialog,
    closeGenerationDialog,
    handlePrefill,
    duplicateWorkspace,
    handleDuplicateCheck,
    handleLoadDuplicateLatest,
  } = form;

  return (
    <div className="flex h-full min-h-[calc(100vh-48px)] flex-col overflow-y-auto bg-[var(--surface-sunken)]">
      <div className="px-6 pt-6">
        <div className="mx-auto flex w-full max-w-[960px] justify-end">
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
          templateId={templateId}
          setTemplateId={setTemplateId}
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
          usageSectionMode={usageSectionMode}
          setUsageSectionMode={setUsageSectionMode}
          kcCertificationStatus={kcCertificationStatus}
          setKcCertificationStatus={setKcCertificationStatus}
          kcCertificationNumber={kcCertificationNumber}
          setKcCertificationNumber={setKcCertificationNumber}
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
          isLoading={isLoading || isRegisteringCandidate}
          isFormValid={isFormValid}
          isPrefilling={isPrefilling}
          duplicateWorkspace={duplicateWorkspace}
          generationStartedAt={generationStartedAt}
          onPrefill={handlePrefill}
          onDuplicateCheck={handleDuplicateCheck}
          onLoadDuplicateLatest={handleLoadDuplicateLatest}
          onSubmit={(thumbnailUrl) => handleProductSubmit(templateId, thumbnailUrl)}
        />
      </div>

      <GenerationStartModal
        state={generationDialog}
        onClose={closeGenerationDialog}
        onAction={handleGenerationDialogAction}
        onCancel={handleGenerationDialogCancel}
      />
    </div>
  );
}
