'use client';

import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  ArrowLeft,
  CheckCircle2,
  FileText,
  Image as ImageIcon,
  Loader2,
  Sparkles,
  XCircle,
} from 'lucide-react';
import type { DetailPageTemplateId } from '@kiditem/shared/ai';
import type { SourcingCandidateStatus } from '@kiditem/shared/sourcing';
import { cn } from '@/lib/utils';
import { isApiError } from '@/lib/api-error';
import { queryKeys } from '@/lib/query-keys';
import { salesProductKeys } from '@/lib/sales-product-api';
import { registrationTargetApi, registrationTargetKeys } from '@/lib/registration-target-api';
import { useKidsPlayfulInProgress } from '@/app/(product-pipeline)/product-pipeline/detail-template-generation/hooks/useKidsPlayfulGenerate';
import { useGenerateDetailPage, type GenerateMode } from '@/app/(product-pipeline)/product-pipeline/_shared/hooks/useGenerateDetailPage';
import { useKidsPlayfulFromSourcing } from '../../../hooks/useKidsPlayfulFromSourcing';
import TemplateSelectionModal from '@/app/(product-pipeline)/product-pipeline/_shared/components/detail-page/TemplateSelectionModal';
import {
  candidatesApi,
  registrationStateFromPreparation,
  type CandidateRegistrationState,
  type ProductBasics,
  type ProductPreparationSelection,
} from '@/app/(product-pipeline)/product-pipeline/collected-products/lib/sourcing-api';
import {
  channelListingsApi,
} from '@/app/(product-pipeline)/product-pipeline/registered-products/lib/channel-listings-api';
import { getInlineGenerationProgressLabel } from '@/app/(product-pipeline)/product-pipeline/collected-products/lib/generation-progress-label';
import ProductPreparationDraftDialog from './ProductPreparationDraftDialog';

/** 반려는 원천 기록(수집상품)의 소싱 판단이다 — 직접 작성 · 사방넷 초안에는 반려할 원천이 없다. */
const NO_SOURCE_REJECT_REASON = '원천 기록이 없는 초안은 반려할 수 없습니다.';

interface ProductEditHeaderProps {
  productName: string;
  productId: string;
  /** 이 화면의 판매상품 초안 id(ADR-0022) — 등록 설정과 생성은 이 id 로 연다. */
  salesProductId?: string | null;
  /** 초안의 원천 기록(수집상품). 반려는 원천 기록의 소싱 판단이라 이 id 로 한다. 없으면 반려가 없다. */
  sourceCandidateId?: string | null;
  status?: SourcingCandidateStatus;
  registrationTarget?: ProductPreparationSelection | null;
  /** 울타리가 답하는 등록 상태. 구버전 응답에서만 `null` 이다. */
  registrationState?: CandidateRegistrationState | null;
  isEditComplete: boolean;
  isLocked: boolean;
  basicInfo?: ProductBasics | null;
  costCny?: number | null;
  selectedThumbnailUrl?: string | null;
  selectedThumbnailGenerationId?: string | null;
  selectedThumbnailGenerationCandidateId?: string | null;
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
  sourceCandidateId = null,
  status = 'sourced',
  registrationTarget = null,
  registrationState = null,
  basicInfo = null,
  selectedThumbnailUrl = null,
  selectedThumbnailGenerationId = null,
  selectedThumbnailGenerationCandidateId = null,
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
  const [rejectReason, setRejectReason] = useState('');
  const [rejectInputOpen, setRejectInputOpen] = useState(false);
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
    },
    onError: (err) => {
      toast.error(
        isApiError(err) ? err.detail : err instanceof Error ? err.message : '제품 등록 준비를 저장하지 못했습니다.',
      );
    },
  });

  const rejectMutation = useMutation({
    mutationFn: (reason: string | undefined) => {
      if (!sourceCandidateId) throw new Error(NO_SOURCE_REJECT_REASON);
      return candidatesApi.reject(sourceCandidateId, reason && reason.trim() ? reason.trim() : undefined);
    },
    onSuccess: (result) => {
      // 초안을 함께 내릴지는 서버가 정한다 — 응답을 그대로 알린다.
      toast.success('소싱 후보를 반려했습니다.', {
        description: result.draftRetired ? '판매상품 초안도 함께 내렸습니다.' : undefined,
      });
      if (result.draftWarning) {
        toast.warning('판매상품 초안은 내리지 못했습니다.', { description: result.draftWarning });
      }
      setRejectInputOpen(false);
      setRejectReason('');
      queryClient.invalidateQueries({ queryKey: queryKeys.sourcing.all });
      queryClient.invalidateQueries({ queryKey: salesProductKeys.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.collectedProducts.workspace(productId) });
    },
    onError: (err) => {
      toast.error(isApiError(err) ? err.detail : '반려 처리에 실패했습니다.');
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
        sourceCandidateId,
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

  const accountScopedPreparation = registrationTarget?.channelAccountId ? registrationTarget : null;
  // `registrationTargetApi.resolve` 는 상태가 없는 등록 설정을 돌려준다 — 방금 열었다는
  // 사실 자체가 '등록 준비됨' 이다. 서버 재조회가 끝나면 `registrationTarget`(울타리
  // 기준)이 그 자리를 대신한다.
  const preparationStatus = accountScopedPreparation?.status ??
    (createPreparationDraftMutation.data ? 'draft' : null);
  const preparationId = accountScopedPreparation?.id ??
    createPreparationDraftMutation.data?.id ?? null;
  /**
   * 등록이 어디까지 갔는가는 울타리가 답한다(ADR-0014). 초안 행의 `status` 는 거울이라
   * 울타리와 어긋날 수 있고, 어긋난 거울을 믿으면 이미 마켓에 올라간 상품에 '제품 등록
   * 준비' 버튼이 다시 열린다. 울타리 값이 없는 구버전 응답에서만 거울로 환산한다.
   */
  const fenceState = registrationState ?? registrationStateFromPreparation(preparationStatus);
  const registrationStarted = fenceState !== 'none';
  // 방금 만든 초안은 아직 울타리를 열지 않았다(`none`). "초안이 있다"는 사실은 초안
  // 행이 답하고, "등록이 시작됐다"는 울타리가 답한다 — 둘 다 만족해야 다시 준비한다.
  const canCreatePreparation = status === 'sourced' &&
    !registrationStarted &&
    (preparationStatus === null || preparationStatus === 'cancelled') &&
    !createPreparationDraftMutation.isPending &&
    !rejectMutation.isPending;
  const canReject = !!sourceCandidateId && status === 'sourced' && !registrationStarted && preparationStatus === null &&
    !createPreparationDraftMutation.isPending && !rejectMutation.isPending;
  const registrationBadge = registrationStarted
    ? registrationStateLabel(fenceState)
    : preparationStatus === 'draft' ? '등록 준비됨' : null;
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
          {registrationBadge && (
            <span
              className={cn(
                'text-[10px] font-bold',
                fenceState === 'failed' ? 'text-rose-600' : 'text-emerald-600',
              )}
              title={preparationId ? `제품 등록 준비 ${preparationId}` : undefined}
            >
              {registrationBadge}
            </span>
          )}
          {status === 'rejected' && (
            <span className="text-[10px] font-bold text-rose-600">반려됨</span>
          )}
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

        {/* 등록 준비 · 반려는 판매상품 초안 화면에만 있다 — 등록상품(리스팅) 화면에는 초안이 없다. */}
        {salesProductId && status === 'sourced' && (
          <>
            {!registrationStarted
              && (preparationStatus === null || preparationStatus === 'cancelled') && (
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
                title={`채널별 제품 등록 준비\n${registrationAssetsTitle}`}
              >
                {createPreparationDraftMutation.isPending ? (
                  <Loader2 size={12} className="animate-spin" />
                ) : (
                  <CheckCircle2 size={12} />
                )}
                제품 등록 준비
              </button>
            )}
            {preparationStatus === null && !registrationStarted && (
              <button
                type="button"
                onClick={() => setRejectInputOpen((v) => !v)}
                disabled={!canReject}
                className={cn(
                  'inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs font-semibold transition-colors',
                  canReject
                    ? 'border-rose-200 text-rose-600 hover:bg-rose-50'
                    : 'cursor-not-allowed border-rose-100 text-rose-300',
                )}
                title={sourceCandidateId ? '후보 반려' : NO_SOURCE_REJECT_REASON}
                aria-describedby={sourceCandidateId ? undefined : 'reject-disabled-reason'}
              >
                <XCircle size={12} />
                반려
              </button>
            )}
            {!sourceCandidateId && preparationStatus === null && !registrationStarted && (
              <span id="reject-disabled-reason" className="text-[10px] font-medium text-slate-500">
                {NO_SOURCE_REJECT_REASON}
              </span>
            )}
            {preparationStatus === null && !registrationStarted && rejectInputOpen && (
              <div className="flex items-center gap-1.5">
                <input
                  type="text"
                  value={rejectReason}
                  onChange={(e) => setRejectReason(e.target.value)}
                  placeholder="반려 사유 (선택)"
                  className="h-7 rounded-md border border-slate-200 px-2 text-xs text-slate-700 focus:outline-none focus:ring-1 focus:ring-rose-300"
                />
                <button
                  type="button"
                  onClick={() => rejectMutation.mutate(rejectReason)}
                  disabled={rejectMutation.isPending}
                  className="inline-flex items-center gap-1 rounded-md bg-rose-600 px-2 py-1 text-[11px] font-semibold text-white shadow-sm hover:bg-rose-700 disabled:opacity-50"
                >
                  {rejectMutation.isPending ? (
                    <Loader2 size={11} className="animate-spin" />
                  ) : (
                    <Sparkles size={11} />
                  )}
                  확인
                </button>
              </div>
            )}
          </>
        )}

        <ProductPreparationDraftDialog
          open={preparationDialogOpen}
          accounts={accountsQuery.data ?? []}
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

/** 울타리 상태를 사장님이 읽을 한 줄로. `none` 은 배지를 세우지 않는다. */
function registrationStateLabel(state: CandidateRegistrationState): string | null {
  switch (state) {
    case 'preparing':
      return '등록 준비됨';
    case 'confirming':
      return '마켓 등록 중';
    case 'registered':
      return '제품 등록됨';
    case 'failed':
      return '등록 실패';
    case 'none':
      return null;
  }
}
