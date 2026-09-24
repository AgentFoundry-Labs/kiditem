'use client';

import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  ArrowLeft,
  CheckCircle2,
  FileText,
  Image as ImageIcon,
  Loader2,
  Sparkles,
} from 'lucide-react';
import type { DetailPageTemplateId } from '@kiditem/shared/ai';
import type { RegistrationAccountState } from '@kiditem/shared/sales-product';
import { cn } from '@/lib/utils';
import { isApiError } from '@/lib/api-error';
import { queryKeys } from '@/lib/query-keys';
import { registrationTargetApi, registrationTargetKeys } from '@/lib/registration-target-api';
import { salesProductKeys } from '@/lib/sales-product-api';
import {
  canPrepareRegistration,
  registrationStateLabel,
} from '@/app/(channels)/_shared/registration-account-state';
import { RegistrationStateBadge } from '@/app/(channels)/_shared/components/RegistrationStateBadge';
import { useKidsPlayfulInProgress } from '@/app/(product-pipeline)/product-pipeline/detail-template-generation/hooks/useKidsPlayfulGenerate';
import { useGenerateDetailPage, type GenerateMode } from '@/app/(product-pipeline)/product-pipeline/_shared/hooks/useGenerateDetailPage';
import { useKidsPlayfulFromSourcing } from '../../../hooks/useKidsPlayfulFromSourcing';
import TemplateSelectionModal from '@/app/(product-pipeline)/product-pipeline/_shared/components/detail-page/TemplateSelectionModal';
import type { ProductBasics } from '@/app/(product-pipeline)/product-pipeline/collected-products/lib/sourcing-api';
import {
  channelListingsApi,
} from '@/app/(product-pipeline)/product-pipeline/registered-products/lib/channel-listings-api';
import { getInlineGenerationProgressLabel } from '@/app/(product-pipeline)/product-pipeline/collected-products/lib/generation-progress-label';
import ProductPreparationDraftDialog from './ProductPreparationDraftDialog';

interface ProductEditHeaderProps {
  productName: string;
  productId: string;
  /** 이 화면의 판매상품 초안 id(ADR-0022) — 등록 설정과 생성은 이 id 로 연다. */
  salesProductId?: string | null;
  /** 초안을 만든 원본 기록. 상세페이지 생성이 출처로 적는다. 직접 작성 초안은 없다. */
  sourceRecordId?: string | null;
  /** 몰 계정별 등록 상태 — Channels 등록 상태 reader 값 그대로다(KID-320). */
  registrationAccounts?: readonly RegistrationAccountState[];
  isEditComplete: boolean;
  isLocked: boolean;
  basicInfo?: ProductBasics | null;
  costCny?: number | null;
  selectedThumbnailUrl?: string | null;
  selectedDetailPageGenerationId?: string | null;
  detailGenerationContentWorkspaceId?: string | null;
  detailGenerationEnabled?: boolean;
  onOpenDetailTemplateGeneration?: () => void;
  onToggleEditComplete: () => void;
  onToggleLocked: () => void;
  onBack: () => void;
  rawData?: Record<string, unknown> | null;
  imageUrls?: string[];
}

export default function ProductEditHeader({
  productName,
  productId,
  salesProductId = null,
  sourceRecordId = null,
  registrationAccounts = NO_ACCOUNTS,
  basicInfo = null,
  selectedThumbnailUrl = null,
  selectedDetailPageGenerationId = null,
  detailGenerationContentWorkspaceId = null,
  detailGenerationEnabled = true,
  onOpenDetailTemplateGeneration,
  onBack,
  rawData = null,
  imageUrls = [],
}: ProductEditHeaderProps) {
  const queryClient = useQueryClient();
  const [modalOpen, setModalOpen] = useState(false);
  const [preparationDialogOpen, setPreparationDialogOpen] = useState(false);
  const { mutate: runGenerate, isPending } = useGenerateDetailPage(salesProductId ?? '');
  const kp = useKidsPlayfulFromSourcing();
  // 진행 중 생성은 이 초안의 작업공간 안에서만 찾는다. 작업공간이 없으면 찾을 것도 없다 —
  // 후보 id 나 조직 전체 목록으로 대신 묻지 않는다(KID-310).
  const kpInProgress = useKidsPlayfulInProgress(null, {
    enabled: detailGenerationEnabled && !onOpenDetailTemplateGeneration && !!detailGenerationContentWorkspaceId,
    contentWorkspaceId: detailGenerationContentWorkspaceId,
  });
  // 첫 생성은 서버가 초안의 작업공간을 만든다. 그 작업공간을 다시 읽기 전에는 진행 조회가 돌지
  // 않으므로, 그동안 버튼을 막아 두 번째 유료 생성을 시작하지 못하게 한다(작업공간이 오면 풀린다).
  const [awaitingDraftWorkspace, setAwaitingDraftWorkspace] = useState(false);
  useEffect(() => {
    if (detailGenerationContentWorkspaceId) setAwaitingDraftWorkspace(false);
  }, [detailGenerationContentWorkspaceId]);
  const generateBusy = isPending || kp.isPending || !!kpInProgress || awaitingDraftWorkspace;
  const accountsQuery = useQuery({
    queryKey: queryKeys.channelAccounts.active(),
    queryFn: () => channelListingsApi.listAccounts(),
    enabled: preparationDialogOpen,
  });

  /**
   * "제품 등록 준비" = 이 판매상품 초안 × 고른 몰 계정의 등록 설정을 연다.
   *
   * 초안은 수집 시점부터 있으므로(KID-310 · ADR-0022) 여기서 만들 것이 없다 — 이름·
   * 썸네일·상세페이지·판매가는 전부 초안 자체에 이미 있다(판매상품 편집이 정본).
   * 같은 상품 × 몰 계정에 이미 설정이 있으면 서버가 그 설정을 그대로 돌려준다
   * (부분 유일키, 사용자 결정 01:12) — 골라야 할 것이 없다.
   */
  const createPreparationDraftMutation = useMutation({
    mutationFn: async (channelAccountId: string) => {
      if (!salesProductId) {
        throw new Error('이 후보에 연결된 판매상품 초안을 찾지 못했습니다.');
      }
      return registrationTargetApi.resolve({ salesProductId, channelAccountId });
    },
    onSuccess: (target) => {
      setPreparationDialogOpen(false);
      toast.success('제품 등록 준비를 저장했습니다.', {
        description: `등록 설정 ID: ${target.id}`,
      });
      queryClient.invalidateQueries({ queryKey: queryKeys.collectedProducts.workspace(productId) });
      queryClient.invalidateQueries({ queryKey: registrationTargetKeys.all });
      if (salesProductId) {
        queryClient.invalidateQueries({ queryKey: salesProductKeys.registrationState(salesProductId) });
      }
    },
    onError: (err) => {
      toast.error(
        isApiError(err) ? err.detail : err instanceof Error ? err.message : '제품 등록 준비를 저장하지 못했습니다.',
      );
    },
  });

  const handleConfirm = (templateId: string, mode: GenerateMode) => {
    if (!salesProductId) {
      toast.error('판매상품 초안이 없어 상세페이지를 만들 수 없습니다.');
      return;
    }
    if (templateId === 'kids-playful' || templateId === 'bold-vertical') {
      const firstGeneration = !detailGenerationContentWorkspaceId;
      if (firstGeneration) setAwaitingDraftWorkspace(true);
      void kp.trigger({
        salesProductId,
        // Content 의 생성 출처 칸 이름은 W3 가 바꾼다 — 값은 원본 기록 id 다.
        sourceCandidateId: sourceRecordId,
        contentWorkspaceId: detailGenerationContentWorkspaceId,
        productName,
        rawData,
        templateId: templateId as DetailPageTemplateId,
        generationMode: templateId === 'kids-playful' ? 'full' : mode,
        imageUrls,
      }).then((result) => {
        if (!result) {
          // 시작하지 못했다(입력 부족 · 요청 실패) — 다시 누를 수 있게 푼다.
          setAwaitingDraftWorkspace(false);
          return;
        }
        void queryClient.invalidateQueries({
          queryKey: queryKeys.contentWorkspaces.forSalesProduct(salesProductId),
        });
      });
      return;
    }
    runGenerate({ mode, templateId });
  };

  /**
   * 등록이 어디까지 갔는가는 Channels 등록 상태 reader 가 계정별로 답한다(KID-320) — 화면은 실행 이력이나
   * 등록 설정 행으로 상태를 짓지 않는다. 배지는 '고른 계정' 기준이다: 방금 준비한 계정, 아니면 계정이
   * 하나뿐일 때 그 계정. 고른 계정이 없으면(계정이 없거나 여럿) 상품 요약 배지다.
   *
   * "제품 등록 준비"는 준비할 수 있는 계정이 하나라도 있으면 연다 — 한 몰에 올라갔거나 보내는 중이어도 다른 몰은
   * 준비할 수 있다. 등록됐거나 진행 중인 계정은 대화상자가 계정마다 막는다(`unavailableAccounts`).
   */
  const selectedAccount = useMemo(() => {
    const resolvedAccountId = createPreparationDraftMutation.data?.channelAccountId ?? null;
    if (resolvedAccountId) {
      return registrationAccounts.find((account) => account.channelAccountId === resolvedAccountId) ?? null;
    }
    return registrationAccounts.length === 1 ? registrationAccounts[0] : null;
  }, [createPreparationDraftMutation.data?.channelAccountId, registrationAccounts]);
  const unavailableAccounts = useMemo(() => {
    const reasons: Record<string, string> = {};
    for (const account of registrationAccounts) {
      if (!canPrepareRegistration(account.state)) reasons[account.channelAccountId] = registrationStateLabel(account.state);
    }
    return reasons;
  }, [registrationAccounts]);
  // 계정 목록은 대화상자를 열 때 읽는다. 읽은 뒤 계정이 하나라도 있고 전부 막혔을 때만 버튼을 닫는다.
  // 계정이 0개면 버튼은 열려 있고 대화상자가 "사용할 수 있는 채널 계정이 없습니다"를 말한다(KID-330).
  const noPreparableAccount = accountsQuery.data !== undefined
    && accountsQuery.data.length > 0
    && accountsQuery.data.every((account) => account.id in unavailableAccounts);
  const preparationBlockedReason = noPreparableAccount
    ? '모든 몰 계정이 이미 등록됐거나 진행 중입니다.'
    : null;
  const canCreatePreparation = preparationBlockedReason === null && !createPreparationDraftMutation.isPending;
  const hasRegistrationThumbnail = !!selectedThumbnailUrl;
  const hasRegistrationDetailPage = !!selectedDetailPageGenerationId;
  const registrationAssetsTitle = [
    hasRegistrationThumbnail
      ? '등록 대표 썸네일: 사용자가 선택한 이미지'
      : '등록 대표 썸네일: 없음',
    hasRegistrationDetailPage
      ? '등록 상세페이지: 생성 이력에서 선택됨'
      : '등록 상세페이지: 미선택',
  ].join('\n');

  return (
    <div className="h-12 border-b border-slate-200 flex items-center justify-between px-4 shrink-0">
      <div className="flex items-center gap-2 min-w-0 flex-1">
        <button
          onClick={onBack}
          className="p-1 rounded-md text-slate-500 hover:text-slate-800 hover:bg-slate-100 transition-colors shrink-0"
        >
          <ArrowLeft size={16} />
        </button>

        <div className="min-w-0 flex items-baseline gap-2">
          <h1 className="text-sm font-semibold text-slate-900 truncate">
            {productName}
          </h1>
          <p className="text-[10px] text-slate-400 truncate font-mono">
            {productId.slice(0, 8)}
          </p>
          {selectedAccount ? (
            <RegistrationStateBadge account={selectedAccount} />
          ) : registrationAccounts.length > 0 ? (
            <RegistrationStateBadge accounts={registrationAccounts} />
          ) : null}
        </div>
      </div>

      <div className="flex items-center gap-3 shrink-0 ml-4 text-xs">
        <div
          className="hidden min-w-0 max-w-[240px] items-center gap-1.5 rounded-md border border-slate-200 bg-slate-50 px-2 py-1 text-[10px] font-semibold text-slate-600 lg:flex"
          title={registrationAssetsTitle}
        >
          {hasRegistrationThumbnail && selectedThumbnailUrl ? (
            <img
              src={selectedThumbnailUrl}
              alt="등록 대표 썸네일"
              className="h-5 w-5 shrink-0 rounded border border-white object-cover shadow-sm"
            />
          ) : (
            <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded border border-slate-200 bg-white text-slate-400">
              <ImageIcon size={12} />
            </span>
          )}
          <span className="min-w-0 truncate">
            등록 썸네일
          </span>
          <span className="text-slate-300">·</span>
          <FileText
            size={12}
            className={cn(
              'shrink-0',
              hasRegistrationDetailPage ? 'text-emerald-600' : 'text-slate-300',
            )}
          />
          <span
            className={cn(
              'shrink-0',
              hasRegistrationDetailPage ? 'text-emerald-700' : 'text-slate-400',
            )}
          >
            {hasRegistrationDetailPage ? '상세 선택' : '상세 미선택'}
          </span>
        </div>

        {kpInProgress && (
          <span className="inline-flex items-center gap-1.5 rounded-md bg-violet-50 border border-violet-200 px-2.5 py-1 text-[11px] font-semibold text-violet-700">
            <Loader2 size={11} className="animate-spin" />
            {(() => {
              const label =
                kpInProgress.templateId === 'bold-vertical'
                  ? 'KIDITEM DESIGN'
                  : '트렌드 광고형 템플릿';
              return getInlineGenerationProgressLabel({
                templateLabel: label,
                imageProcessingStatus: kpInProgress.imageProcessingStatus,
                rawInput: kpInProgress.rawInput,
              });
            })()}
          </span>
        )}

        {detailGenerationEnabled && (
          <>
            <button
              type="button"
              onClick={() => {
                if (onOpenDetailTemplateGeneration) {
                  onOpenDetailTemplateGeneration();
                  return;
                }
                setModalOpen(true);
              }}
              disabled={!onOpenDetailTemplateGeneration && generateBusy}
              className={cn(
                'inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold text-white shadow-sm transition-colors',
                generateBusy ? 'cursor-wait bg-violet-400' : 'bg-violet-600 hover:bg-violet-700',
              )}
              title="템플릿 + 모드 선택 후 생성"
            >
              {generateBusy ? (
                <Loader2 size={12} className="animate-spin" />
              ) : (
                <Sparkles size={12} />
              )}
              {generateBusy ? '생성 중...' : '상세페이지 생성'}
            </button>
            {!onOpenDetailTemplateGeneration && (
              <TemplateSelectionModal
                isOpen={modalOpen}
                onClose={() => setModalOpen(false)}
                onConfirm={handleConfirm}
              />
            )}
          </>
        )}

        {/* 등록 준비는 판매상품 초안 화면에만 있다 — 등록상품(리스팅) 화면에는 초안이 없다. */}
        {salesProductId && (
          <button
            type="button"
            onClick={() => setPreparationDialogOpen(true)}
            disabled={!canCreatePreparation}
            className={cn(
              'inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold text-white shadow-sm transition-colors',
              canCreatePreparation
                ? 'bg-emerald-600 hover:bg-emerald-700'
                : 'cursor-not-allowed bg-emerald-300',
            )}
            title={preparationBlockedReason ?? `채널별 제품 등록 준비\n${registrationAssetsTitle}`}
          >
            {createPreparationDraftMutation.isPending ? (
              <Loader2 size={12} className="animate-spin" />
            ) : (
              <CheckCircle2 size={12} />
            )}
            제품 등록 준비
          </button>
        )}

        <ProductPreparationDraftDialog
          open={preparationDialogOpen}
          accounts={accountsQuery.data ?? []}
          unavailableAccounts={unavailableAccounts}
          isLoading={accountsQuery.isLoading}
          isSubmitting={createPreparationDraftMutation.isPending}
          errorMessage={accountsQuery.error
            ? isApiError(accountsQuery.error)
              ? accountsQuery.error.detail
              : '채널 계정을 불러오지 못했습니다.'
            : null}
          onClose={() => setPreparationDialogOpen(false)}
          onSubmit={(channelAccountId) => createPreparationDraftMutation.mutate(channelAccountId)}
        />
      </div>
    </div>
  );
}

const NO_ACCOUNTS: readonly RegistrationAccountState[] = [];
