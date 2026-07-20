'use client';

import { DetailModal } from '../../../_shared/components/thumbnails/DetailModal';
import type { MainTabKey } from '../ThumbnailMainTabs';
import type { ThumbnailActions } from '../../hooks/useThumbnailActions';
import type { ThumbnailAnalysisResult, ThumbnailGenerationItem } from '@kiditem/shared/ai';

interface ThumbnailDetailModalHostProps {
  activeTab: MainTabKey;
  selectedProduct: ThumbnailAnalysisResult | null;
  selectedGen: ThumbnailGenerationItem | null;
  activeGenForProduct: ThumbnailGenerationItem | null | undefined;
  generations: ThumbnailGenerationItem[];
  generatedContentWorkspaceIds: Set<string>;
  actions: ThumbnailActions;
  onClose: () => void;
  onSelectProduct: (product: ThumbnailAnalysisResult | null) => void;
  onSelectGen: (generation: ThumbnailGenerationItem | null) => void;
  onChangeTab: (tab: MainTabKey) => void;
}

export function ThumbnailDetailModalHost({
  activeTab,
  selectedProduct,
  selectedGen,
  activeGenForProduct,
  generations,
  generatedContentWorkspaceIds,
  actions,
  onClose,
  onSelectProduct,
  onSelectGen,
  onChangeTab,
}: ThumbnailDetailModalHostProps) {
  if (!selectedProduct && !selectedGen) return null;

  // 모달은 selectedProduct (분석 카드 클릭) 또는 selectedGen (편집/이력 카드 클릭)
  // 둘 중 하나로 열린다. AI 분석 결과 / 진행 상태는 contentWorkspaceId 기준이므로
  // 어느 경로로 열었든 같은 contentWorkspaceId 로 조회해야 모달 안에서 재분석 시
  // 결과가 즉시 반영되고 spinner 도 보인다.
  const modalContentWorkspaceId = selectedProduct?.contentWorkspaceId ?? selectedGen?.contentWorkspaceId ?? null;

  const closeAndShowEditTab = () => {
    onSelectProduct(null);
    onSelectGen(null);
    onChangeTab('ai-edit');
  };

  return (
    <DetailModal
      product={selectedProduct}
      gen={selectedGen || activeGenForProduct}
      hideEdit={activeTab === 'unclassified'}
      productGenerations={generations.filter((g) => g.contentWorkspaceId === modalContentWorkspaceId)}
      aiResult={modalContentWorkspaceId ? actions.aiResults[modalContentWorkspaceId] : undefined}
      isAiAnalyzing={modalContentWorkspaceId ? actions.aiAnalyzingId === modalContentWorkspaceId : false}
      imageSpec={selectedProduct?.imageSpec ?? null}
      generatedContentWorkspaceIds={generatedContentWorkspaceIds}
      onClose={onClose}
      onAiAnalyze={() => {
        const pid = selectedProduct?.contentWorkspaceId ?? selectedGen?.contentWorkspaceId;
        if (pid) actions.runAiAnalysis(pid);
      }}
      onEditCompliance={(variantKey) => {
        const pid = selectedProduct?.contentWorkspaceId ?? selectedGen?.contentWorkspaceId;
        if (pid) {
          actions.editSingle(pid, 'compliance', variantKey);
          closeAndShowEditTab();
        }
      }}
      onEditQuality={(variantKey) => {
        const pid = selectedProduct?.contentWorkspaceId ?? selectedGen?.contentWorkspaceId;
        if (pid) {
          actions.editSingle(pid, 'quality', variantKey);
          closeAndShowEditTab();
        }
      }}
      onSelectCandidate={(url) => {
        const g = selectedGen || activeGenForProduct;
        if (g) actions.selectCandidate(g.id, url);
      }}
      onApply={() => {
        const g = selectedGen || activeGenForProduct;
        if (g) actions.openCoupangEdit(g);
      }}
      onSkip={() => {
        const g = selectedGen || activeGenForProduct;
        if (g) actions.skipGeneration(g.id);
      }}
      onCancel={() => {
        const g = selectedGen || activeGenForProduct;
        if (g) actions.cancelGeneration(g.id);
      }}
      onDelete={() => {
        const g = selectedGen || activeGenForProduct;
        if (g) actions.deleteGeneration(g.id);
      }}
      onSelectGen={(g) => onSelectGen(g)}
    />
  );
}
