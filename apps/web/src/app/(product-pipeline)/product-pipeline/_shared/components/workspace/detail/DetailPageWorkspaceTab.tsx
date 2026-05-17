'use client';

import { useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { apiClient } from '@/lib/api-client';
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
import { contentWorkspacesApi } from '../../../lib/content-workspaces-api';
import DetailPagePreview from '../DetailPagePreview';
import DetailGenerationStatusBar from './DetailGenerationStatusBar';
import DetailPageVersionRail from './DetailPageVersionRail';
import {
  buildDetailGenerationRows,
  getCompletedDetailVersionRows,
  getDetailGenerationStatusRows,
  type DetailGenerationRow,
} from './detail-generation-rows';
import type { ProductRegistrationPreviewData } from '../preview/product-registration-preview';

interface DetailPageWorkspaceTabProps {
  productId: string;
  detailPreviewHtml: string;
  editedHtml?: string | null;
  templateCss: string;
  hasSavedDetailPage?: boolean;
  savedDetailPageGenerationId?: string | null;
  initialAgentHistory?: GenerationHistoryItem[];
  generationHistoryQueryEnabled?: boolean;
  contentWorkspaceId?: string | null;
  selectedKidsPlayfulId: string | null;
  selectedBoldVerticalId: string | null;
  selectedAgentId: string | null;
  onSelectKidsPlayful: (id: string | null) => void;
  onSelectBoldVertical: (id: string | null) => void;
  onSelectAgent: (id: string | null) => void;
  onApplyRegistrationDetailPage?: (input: {
    selectedDetailPageGenerationId: string;
    selectedDetailPageArtifactId?: string | null;
    selectedDetailPageRevisionId?: string | null;
  }) => Promise<void> | void;
  detailEditorSourceCandidateId?: string | null;
  detailEditorReturnHref: string;
  mobilePreviewData: ProductRegistrationPreviewData;
  onPreviewHtmlChange?: (html: string | null) => void;
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
  contentWorkspaceId = null,
  detailEditorSourceCandidateId,
  detailEditorReturnHref,
  mobilePreviewData,
  onPreviewHtmlChange,
  onSelectKidsPlayful,
  onSelectBoldVertical,
  onSelectAgent,
  onApplyRegistrationDetailPage,
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
  const [duplicatingKey, setDuplicatingKey] = useState<string | null>(null);
  const [renamingKey, setRenamingKey] = useState<string | null>(null);
  const rows = useMemo(() => buildDetailGenerationRows({
    agentHistory,
    kidsPlayfulEntries,
    boldEntries,
    savedDetailPageGenerationId,
  }), [agentHistory, boldEntries, kidsPlayfulEntries, savedDetailPageGenerationId]);
  const versionRows = useMemo(() => getCompletedDetailVersionRows(rows), [rows]);
  const statusRows = useMemo(() => getDetailGenerationStatusRows(rows), [rows]);
  const selectedRow = selectedKey ? versionRows.find((row) => row.key === selectedKey) ?? null : null;
  const selectedKeyGenerationId = selectedKey?.split(':').slice(1).join(':') ?? null;
  const selectedPreviewGenerationId =
    selectedRow?.id ?? selectedKeyGenerationId ?? savedDetailPageGenerationId ?? null;

  const invalidateDetailVersionQueries = async () => {
    await Promise.all([
      queryClient.invalidateQueries({
        queryKey: [...queryKeys.sourcing.detail(productId), 'history'],
      }),
      queryClient.invalidateQueries({ queryKey: ['kp-generations'] }),
      queryClient.invalidateQueries({ queryKey: ['bold-generations'] }),
      queryClient.invalidateQueries({
        queryKey: queryKeys.productContent.sourcingLinks(productId, { limit: '8' }),
      }),
    ]);
  };

  const handleApply = async (row: DetailGenerationRow) => {
    setApplyingKey(row.key);
    try {
      if (row.kind === 'agent') {
        if (contentWorkspaceId) {
          await contentWorkspacesApi.selectCurrentDetailPage(contentWorkspaceId, row.id);
          await Promise.all([
            queryClient.invalidateQueries({
              queryKey: queryKeys.contentWorkspaces.detail(contentWorkspaceId),
            }),
            queryClient.invalidateQueries({ queryKey: queryKeys.contentWorkspaces.all }),
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
      await onApplyRegistrationDetailPage?.({
        selectedDetailPageGenerationId: row.id,
        selectedDetailPageArtifactId: row.agentItem?.detailPageArtifactId ?? null,
        selectedDetailPageRevisionId: row.agentItem?.detailPageRevisionId ?? null,
      });
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

  const handleRename = async (row: DetailGenerationRow) => {
    const title = window.prompt('상세페이지 버전 이름', row.title)?.trim();
    if (title === undefined) return;
    if (!title) {
      toast.error('버전 이름을 입력해주세요.');
      return;
    }
    setRenamingKey(row.key);
    try {
      await apiClient.patch<{ ok: true }>(`/api/ai/detail-page/${row.id}/title`, {
        title,
      });
      await invalidateDetailVersionQueries();
      toast.success('상세페이지 버전 이름을 변경했습니다.');
    } catch (err) {
      toast.error(isApiError(err) ? err.detail : '이름 변경 실패');
    } finally {
      setRenamingKey(null);
    }
  };

  const handleDuplicate = async (row: DetailGenerationRow) => {
    setDuplicatingKey(row.key);
    try {
      const duplicated = await apiClient.post<{ id: string }>(
        `/api/ai/detail-page/${row.id}/duplicate`,
      );
      const duplicatedKey = `${row.kind}:${duplicated.id}`;
      setSelectedKey(duplicatedKey);
      await invalidateDetailVersionQueries();
      toast.success('상세페이지 버전을 복제했습니다. 복제본을 선택했습니다.');
    } catch (err) {
      toast.error(isApiError(err) ? err.detail : '복제 실패');
    } finally {
      setDuplicatingKey(null);
    }
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
          duplicatingKey={duplicatingKey}
          renamingKey={renamingKey}
          onSelect={setSelectedKey}
          onApply={handleApply}
          onRename={handleRename}
          onDuplicate={handleDuplicate}
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
            initialAgentHistory={initialAgentHistory}
            generationHistoryQueryEnabled={generationHistoryQueryEnabled}
            detailEditorSourceCandidateId={detailEditorSourceCandidateId}
            detailEditorReturnHref={detailEditorReturnHref}
            mobilePreviewData={mobilePreviewData}
            onPreviewHtmlChange={onPreviewHtmlChange}
          />
        </div>
      </div>
    </div>
  );
}
