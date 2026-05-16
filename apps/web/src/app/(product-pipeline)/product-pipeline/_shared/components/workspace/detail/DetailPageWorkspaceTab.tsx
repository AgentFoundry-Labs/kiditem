'use client';

import type { GenerationHistoryItem } from '../../../hooks/useGenerationHistory';
import DetailPagePreview from '../DetailPagePreview';

interface DetailPageWorkspaceTabProps {
  productId: string;
  detailPreviewHtml: string;
  editedHtml?: string | null;
  templateCss: string;
  hasSavedDetailPage?: boolean;
  savedDetailPageGenerationId?: string | null;
  initialAgentHistory?: GenerationHistoryItem[];
  generationHistoryQueryEnabled?: boolean;
  registrationWorkspaceId?: string | null;
  selectedKidsPlayfulId: string | null;
  selectedBoldVerticalId: string | null;
  selectedAgentId: string | null;
  onSelectKidsPlayful: (id: string | null) => void;
  onSelectBoldVertical: (id: string | null) => void;
  onSelectAgent: (id: string | null) => void;
  detailEditorSourceCandidateId?: string | null;
  detailEditorReturnHref: string;
}

export default function DetailPageWorkspaceTab({
  productId,
  detailPreviewHtml,
  editedHtml,
  templateCss,
  hasSavedDetailPage,
  savedDetailPageGenerationId,
  initialAgentHistory,
  generationHistoryQueryEnabled,
  detailEditorSourceCandidateId,
  detailEditorReturnHref,
}: DetailPageWorkspaceTabProps) {
  return (
    <div data-testid="detail-page-workspace-tab">
      <span className="sr-only">{initialAgentHistory?.length ?? 0}</span>
      <DetailPagePreview
        productId={productId}
        detailPreviewHtml={detailPreviewHtml}
        editedHtml={editedHtml}
        templateCss={templateCss}
        hasSavedDetailPage={hasSavedDetailPage}
        savedDetailPageGenerationId={savedDetailPageGenerationId}
        initialAgentHistory={initialAgentHistory}
        generationHistoryQueryEnabled={generationHistoryQueryEnabled}
        detailEditorSourceCandidateId={detailEditorSourceCandidateId}
        detailEditorReturnHref={detailEditorReturnHref}
      />
    </div>
  );
}
