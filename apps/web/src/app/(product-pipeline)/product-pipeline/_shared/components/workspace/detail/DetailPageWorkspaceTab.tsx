'use client';

import { useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { apiClient } from '@/lib/api-client';
import { isApiError } from '@/lib/api-error';
import { queryKeys } from '@/lib/query-keys';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import {
  useBoldVerticalGenerationList,
  useKidsPlayfulGenerationDelete,
  useKidsPlayfulGenerationList,
} from '@/app/(product-pipeline)/product-pipeline/detail-template-generation/hooks/useKidsPlayfulGenerate';
import {
  useGenerationHistoryDelete,
} from '../../../hooks/useGenerationHistory';
import { contentWorkspacesApi } from '../../../lib/content-workspaces-api';
import DetailPagePreview from '../DetailPagePreview';
import DetailPageVersionRail from './DetailPageVersionRail';
import {
  buildDetailGenerationRows,
  getCompletedDetailVersionRows,
  type DetailGenerationRow,
} from './detail-generation-rows';
import type { GenerationHistoryItem } from '../../../hooks/useGenerationHistory';
import type { ProductRegistrationPreviewData } from '../preview/product-registration-preview';

interface DetailPageWorkspaceTabProps {
  productId: string;
  detailPreviewHtml: string;
  templateCss: string;
  hasSavedDetailPage?: boolean;
  savedDetailPageGenerationId?: string | null;
  /** 작업공간 이력(에이전트 생성). 화면이 작업공간에서 읽어 넘긴다. */
  agentHistory?: GenerationHistoryItem[];
  generationHistoryQueryEnabled?: boolean;
  /** 이 화면의 콘텐츠 작업공간. 상세 이력은 이 작업공간 안에서만 읽는다. */
  contentWorkspaceId?: string | null;
  selectedKidsPlayfulId: string | null;
  selectedBoldVerticalId: string | null;
  selectedAgentId: string | null;
  onSelectKidsPlayful: (id: string | null) => void;
  onSelectBoldVertical: (id: string | null) => void;
  onSelectAgent: (id: string | null) => void;
  onApplyRegistrationDetailPage?: (input: {
    selectedDetailPageGenerationId: string;
    selectedDetailPageRevisionId?: string | null;
  }) => Promise<void> | void;
  detailEditorSalesProductId?: string | null;
  detailEditorReturnHref: string;
  mobilePreviewData: ProductRegistrationPreviewData;
  onPreviewHtmlChange?: (html: string | null) => void;
}

export default function DetailPageWorkspaceTab({
  productId,
  detailPreviewHtml,
  templateCss,
  hasSavedDetailPage,
  savedDetailPageGenerationId,
  agentHistory = [],
  generationHistoryQueryEnabled = true,
  contentWorkspaceId = null,
  detailEditorSalesProductId,
  detailEditorReturnHref,
  mobilePreviewData,
  onPreviewHtmlChange,
  onSelectKidsPlayful,
  onSelectBoldVertical,
  onSelectAgent,
  onApplyRegistrationDetailPage,
}: DetailPageWorkspaceTabProps) {
  const queryClient = useQueryClient();
  // 상세 이력은 이 작업공간 안에서만 읽는다(B2). 작업공간이 없으면 읽지 않는다 — 없는 필터로
  // 물으면 조직의 다른 상품 상세페이지가 이 상품의 이력처럼 보이고, 지우면 그것이 지워진다.
  const contentQueriesEnabled = generationHistoryQueryEnabled && !!contentWorkspaceId;
  const { data: kidsPlayfulEntries = [] } = useKidsPlayfulGenerationList(null, {
    enabled: contentQueriesEnabled,
    contentWorkspaceId,
  });
  const { data: boldEntries = [] } = useBoldVerticalGenerationList(null, {
    enabled: contentQueriesEnabled,
    contentWorkspaceId,
  });
  const deleteKidsPlayful = useKidsPlayfulGenerationDelete();
  const deleteAgent = useGenerationHistoryDelete();
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [applyingKey, setApplyingKey] = useState<string | null>(null);
  const [duplicatingKey, setDuplicatingKey] = useState<string | null>(null);
  const [renamingKey, setRenamingKey] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<DetailGenerationRow | null>(null);
  const rows = useMemo(() => buildDetailGenerationRows({
    agentHistory,
    kidsPlayfulEntries,
    boldEntries,
    savedDetailPageGenerationId,
  }), [agentHistory, boldEntries, kidsPlayfulEntries, savedDetailPageGenerationId]);
  const versionRows = useMemo(() => getCompletedDetailVersionRows(rows), [rows]);
  const selectedRow = selectedKey ? versionRows.find((row) => row.key === selectedKey) ?? null : null;
  const selectedKeyGenerationId = selectedKey?.split(':').slice(1).join(':') ?? null;
  const selectedPreviewGenerationId =
    selectedRow?.id ?? selectedKeyGenerationId ?? savedDetailPageGenerationId ?? null;

  const invalidateDetailVersionQueries = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: queryKeys.contentWorkspaces.all }),
      queryClient.invalidateQueries({
        queryKey: queryKeys.productContent.detailGenerationsAll('kids-playful'),
      }),
      queryClient.invalidateQueries({
        queryKey: queryKeys.productContent.detailGenerationsAll('bold-vertical'),
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
        selectedDetailPageRevisionId: row.agentItem?.detailPageRevisionId ?? null,
      });
      setSelectedKey(row.key);
      toast.success('선택한 상세페이지를 등록 상세로 적용했습니다.');
    } catch (err) {
      toast.error(isApiError(err) ? err.message : '등록 상세 적용 실패');
    } finally {
      setApplyingKey(null);
    }
  };

  const confirmDelete = () => {
    if (!deleteTarget) return;
    const row = deleteTarget;
    setDeleteTarget(null);
    const onSuccess = () => {
      if (selectedKey === row.key) setSelectedKey(null);
      toast.success('상세페이지 버전을 삭제했습니다.');
    };
    const onError = (err: unknown) => {
      toast.error(isApiError(err) ? err.message : '삭제 실패');
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
      toast.error(isApiError(err) ? err.message : '이름 변경 실패');
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
      toast.error(isApiError(err) ? err.message : '복제 실패');
    } finally {
      setDuplicatingKey(null);
    }
  };

  return (
    <>
      <div className="space-y-4 p-5" data-testid="detail-page-workspace-tab">
        <span className="sr-only">{agentHistory.length}</span>
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
            onDelete={setDeleteTarget}
          />
          <div className="min-w-0 flex-1">
            <DetailPagePreview
              productId={productId}
              detailPreviewHtml={detailPreviewHtml}
              templateCss={templateCss}
              hasSavedDetailPage={hasSavedDetailPage}
              savedDetailPageGenerationId={selectedPreviewGenerationId}
              agentHistory={agentHistory}
              detailEditorSalesProductId={detailEditorSalesProductId}
              detailEditorReturnHref={detailEditorReturnHref}
              mobilePreviewData={mobilePreviewData}
              onPreviewHtmlChange={onPreviewHtmlChange}
            />
          </div>
        </div>
      </div>
      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        tone="danger"
        title="이 상세페이지 버전을 삭제할까요?"
        description={
          deleteTarget ? (
            <>
              <span className="font-semibold text-[var(--text-primary,#0f172a)]">
                {deleteTarget.title || '상세페이지 버전'}
              </span>
              을 생성 이력에서 삭제합니다. 복구할 수 없습니다.
            </>
          ) : null
        }
        confirmText="삭제"
        cancelText="취소"
        onConfirm={confirmDelete}
      />
    </>
  );
}
