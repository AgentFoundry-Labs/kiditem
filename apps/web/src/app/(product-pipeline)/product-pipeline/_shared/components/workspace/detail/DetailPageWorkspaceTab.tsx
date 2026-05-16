'use client';

import { useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { isApiError } from '@/lib/api-error';
import { queryKeys } from '@/lib/query-keys';
import {
  useBoldVerticalGenerationList,
  useKidsPlayfulGenerationDelete,
  useKidsPlayfulGenerationList,
} from '@/app/(product-pipeline)/product-pipeline/detail-template-generation/hooks/useKidsPlayfulGenerate';
import {
  useGenerationHistory,
  useGenerationHistoryDelete,
} from '../../../hooks/useGenerationHistory';
import type { GenerationHistoryItem } from '../../../hooks/useGenerationHistory';
import { registrationWorkspacesApi } from '../../../lib/registration-workspaces-api';
import DetailPagePreview from '../DetailPagePreview';
import DetailGenerationStatusBar from './DetailGenerationStatusBar';
import DetailPageVersionRail from './DetailPageVersionRail';
import {
  buildDetailGenerationRows,
  getCompletedDetailVersionRows,
  getDetailGenerationStatusRows,
  type DetailGenerationRow,
} from './detail-generation-rows';

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
  generationHistoryQueryEnabled = true,
  registrationWorkspaceId = null,
  detailEditorSourceCandidateId,
  detailEditorReturnHref,
  onSelectKidsPlayful,
  onSelectBoldVertical,
  onSelectAgent,
}: DetailPageWorkspaceTabProps) {
  const queryClient = useQueryClient();
  const { data: agentHistory = [] } = useGenerationHistory(
    productId,
    initialAgentHistory,
    { enabled: generationHistoryQueryEnabled },
  );
  const { data: kidsPlayfulEntries = [] } = useKidsPlayfulGenerationList(productId, {
    enabled: generationHistoryQueryEnabled,
  });
  const { data: boldEntries = [] } = useBoldVerticalGenerationList(productId, {
    enabled: generationHistoryQueryEnabled,
  });
  const deleteKidsPlayful = useKidsPlayfulGenerationDelete();
  const deleteAgent = useGenerationHistoryDelete(productId);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [applyingKey, setApplyingKey] = useState<string | null>(null);
  const rows = useMemo(() => buildDetailGenerationRows({
    agentHistory,
    kidsPlayfulEntries,
    boldEntries,
    savedDetailPageGenerationId,
  }), [agentHistory, boldEntries, kidsPlayfulEntries, savedDetailPageGenerationId]);
  const versionRows = useMemo(() => getCompletedDetailVersionRows(rows), [rows]);
  const statusRows = useMemo(() => getDetailGenerationStatusRows(rows), [rows]);
  const selectedRow = selectedKey ? versionRows.find((row) => row.key === selectedKey) ?? null : null;
  const selectedPreviewGenerationId = selectedRow?.id ?? savedDetailPageGenerationId ?? null;

  const handleApply = async (row: DetailGenerationRow) => {
    setApplyingKey(row.key);
    try {
      if (row.kind === 'agent') {
        if (registrationWorkspaceId) {
          await registrationWorkspacesApi.selectCurrentDetailPage(registrationWorkspaceId, row.id);
          await Promise.all([
            queryClient.invalidateQueries({
              queryKey: queryKeys.registrationWorkspaces.detail(registrationWorkspaceId),
            }),
            queryClient.invalidateQueries({ queryKey: queryKeys.registrationWorkspaces.all }),
          ]);
        }
        onSelectAgent(row.id);
        onSelectKidsPlayful(null);
        onSelectBoldVertical(null);
      } else if (row.kind === 'kids-playful') {
        onSelectKidsPlayful(row.id);
        onSelectAgent(null);
        onSelectBoldVertical(null);
      } else {
        onSelectBoldVertical(row.id);
        onSelectAgent(null);
        onSelectKidsPlayful(null);
      }
      setSelectedKey(row.key);
      toast.success('선택한 상세페이지를 등록 상세로 적용했습니다.');
    } catch (err) {
      toast.error(isApiError(err) ? err.detail : '등록 상세 적용 실패');
    } finally {
      setApplyingKey(null);
    }
  };

  const handleDelete = (row: DetailGenerationRow) => {
    if (!confirm('이 상세페이지 버전을 삭제할까요?')) return;
    const onSuccess = () => {
      if (selectedKey === row.key) setSelectedKey(null);
      toast.success('상세페이지 버전을 삭제했습니다.');
    };
    const onError = (err: unknown) => {
      toast.error(isApiError(err) ? err.detail : '삭제 실패');
    };
    if (row.kind === 'agent') {
      deleteAgent.mutate(row.id, { onSuccess, onError });
      return;
    }
    deleteKidsPlayful.mutate(row.id, { onSuccess, onError });
  };

  return (
    <div className="space-y-4 p-5" data-testid="detail-page-workspace-tab">
      <span className="sr-only">{agentHistory.length}</span>
      <DetailGenerationStatusBar rows={statusRows} />
      <div className="flex min-w-0 gap-4">
        <DetailPageVersionRail
          rows={versionRows}
          selectedKey={selectedKey}
          applyingKey={applyingKey}
          onSelect={setSelectedKey}
          onApply={handleApply}
          onDelete={handleDelete}
        />
        <div className="min-w-0 flex-1">
          <DetailPagePreview
            productId={productId}
            detailPreviewHtml={detailPreviewHtml}
            editedHtml={editedHtml}
            templateCss={templateCss}
            hasSavedDetailPage={hasSavedDetailPage}
            savedDetailPageGenerationId={selectedPreviewGenerationId}
            initialAgentHistory={agentHistory}
            generationHistoryQueryEnabled={generationHistoryQueryEnabled}
            detailEditorSourceCandidateId={detailEditorSourceCandidateId}
            detailEditorReturnHref={detailEditorReturnHref}
          />
        </div>
      </div>
    </div>
  );
}
