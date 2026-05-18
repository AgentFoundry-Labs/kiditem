'use client';

import { useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import type { PanelAlertItem } from '@kiditem/shared/panel';
import {
  useBoldVerticalGenerationList,
  useKidsPlayfulGenerationList,
  type KidsPlayfulGenerationItem,
} from '@/app/(product-pipeline)/product-pipeline/detail-template-generation/hooks/useKidsPlayfulGenerate';
import {
  collectedProductDetailHref,
  detailPageEditorHref,
  registeredProductDetailHref,
} from '@/app/(product-pipeline)/product-pipeline/_shared/lib/product-pipeline-routes';
import { usePanelStore } from '@/components/panel/lib/panel-store';

const IN_PROGRESS_STATUSES = new Set(['pending', 'processing']);
const TERMINAL_STATUSES = new Set(['completed', 'failed', 'cancelled']);
const PANEL_IN_PROGRESS_STATUSES = new Set(['pending', 'running']);
const PANEL_TERMINAL_STATUSES = new Set(['succeeded', 'failed', 'cancelled']);
const DETAIL_PAGE_OPERATION_KEY_PREFIX = 'detail-page:';

type DetailGenerationToastStatus = 'completed' | 'failed' | 'cancelled';

export default function GenerationCompletionWatcher() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const panelItemsById = usePanelStore((s) => s.byId);
  const { data: kpList = [] } = useKidsPlayfulGenerationList(null);
  const { data: boldList = [] } = useBoldVerticalGenerationList(null);
  const prevStatusRef = useRef<Map<string, string>>(new Map());
  const prevPanelStatusRef = useRef<Map<string, string>>(new Map());
  const initializedRef = useRef(false);
  const panelInitializedRef = useRef(false);
  const notifiedGenerationIdsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    const detailPageAlerts = Object.values(panelItemsById).filter(isDetailPageOperationAlert);
    const currentStatus = new Map<string, string>();
    for (const alert of detailPageAlerts) currentStatus.set(alert.id, alert.status);

    if (!panelInitializedRef.current) {
      prevPanelStatusRef.current = currentStatus;
      panelInitializedRef.current = true;
      return;
    }

    const prev = prevPanelStatusRef.current;
    for (const alert of detailPageAlerts) {
      const prevStatus = prev.get(alert.id);
      if (
        prevStatus &&
        PANEL_IN_PROGRESS_STATUSES.has(prevStatus) &&
        PANEL_TERMINAL_STATUSES.has(alert.status)
      ) {
        const generationId = generationIdFromDetailPageAlert(alert);
        if (generationId) {
          void queryClient.invalidateQueries({ queryKey: ['kp-generations'] });
          void queryClient.invalidateQueries({ queryKey: ['bold-generations'] });
          void queryClient.invalidateQueries({ queryKey: ['kp-generations', 'one', generationId] });
        }
        if (generationId && notifiedGenerationIdsRef.current.has(generationId)) continue;
        if (generationId) notifiedGenerationIdsRef.current.add(generationId);

        showDetailGenerationToast({
          status: panelStatusToGenerationStatus(alert.status),
          productLabel: labelFromDetailPageAlert(alert),
          templateLabel: templateLabelFromDetailPageAlert(alert),
          errorMessage: alert.message,
          editorUrl: alert.href,
          routerPush: router.push,
        });
      }
    }

    prevPanelStatusRef.current = currentStatus;
  }, [panelItemsById, queryClient, router.push]);

  useEffect(() => {
    const all: KidsPlayfulGenerationItem[] = [...kpList, ...boldList].filter(
      (entry) => !entry.id.startsWith('optimistic-'),
    );
    const currentStatus = new Map<string, string>();
    for (const entry of all) currentStatus.set(entry.id, entry.imageProcessingStatus);

    if (!initializedRef.current) {
      prevStatusRef.current = currentStatus;
      initializedRef.current = true;
      return;
    }

    const prev = prevStatusRef.current;
    for (const entry of all) {
      const prevStatus = prev.get(entry.id);
      const current = entry.imageProcessingStatus;
      if (
        prevStatus &&
        IN_PROGRESS_STATUSES.has(prevStatus) &&
        TERMINAL_STATUSES.has(current)
      ) {
        if (notifiedGenerationIdsRef.current.has(entry.id)) continue;
        notifiedGenerationIdsRef.current.add(entry.id);

        const isBoldVertical = entry.templateId === 'bold-vertical';
        const sourceCandidateId = sourceCandidateIdFromGeneration(entry);
        const returnTo = sourceCandidateId
          ? collectedProductDetailHref(sourceCandidateId)
          : entry.contentWorkspaceId
            ? registeredProductDetailHref(entry.contentWorkspaceId)
            : null;
        const editorUrl = detailPageEditorHref({
          candidateId: sourceCandidateId,
          generationId: entry.id,
          returnTo,
        });
        showDetailGenerationToast({
          status: current === 'cancelled' ? 'cancelled' : current === 'completed' ? 'completed' : 'failed',
          productLabel: entry.productName || '상세페이지',
          templateLabel: isBoldVertical ? 'KIDITEM DESIGN' : 'Trend Vertical',
          errorMessage: entry.imageProcessingError,
          editorUrl,
          routerPush: router.push,
        });
      }
    }

    prevStatusRef.current = currentStatus;
  }, [kpList, boldList, router]);

  return null;
}

function isDetailPageOperationAlert(item: unknown): item is PanelAlertItem {
  if (!item || typeof item !== 'object') return false;
  const maybeItem = item as Partial<PanelAlertItem>;
  return (
    maybeItem.kind === 'alert' &&
    maybeItem.alertKind === 'operation' &&
    typeof maybeItem.operationKey === 'string' &&
    maybeItem.operationKey.startsWith(DETAIL_PAGE_OPERATION_KEY_PREFIX)
  );
}

function generationIdFromDetailPageAlert(alert: PanelAlertItem): string | null {
  if (alert.sourceType === 'content_generation' && alert.sourceId) return alert.sourceId;
  return alert.operationKey?.slice(DETAIL_PAGE_OPERATION_KEY_PREFIX.length) || null;
}

function labelFromDetailPageAlert(alert: PanelAlertItem): string {
  const generatedTitle = metadataString(alert, 'generatedTitle');
  if (generatedTitle) return generatedTitle;
  const titlePrefix = '상세페이지 생성: ';
  if (alert.title.startsWith(titlePrefix)) {
    const label = alert.title.slice(titlePrefix.length).trim();
    if (label) return label;
  }
  return '상세페이지';
}

function templateLabelFromDetailPageAlert(alert: PanelAlertItem): string {
  return metadataString(alert, 'templateId') === 'bold-vertical'
    ? 'KIDITEM DESIGN'
    : 'Trend Vertical';
}

function metadataString(alert: PanelAlertItem, key: string): string | null {
  const value = alert.metadata[key];
  return typeof value === 'string' && value.trim() ? value : null;
}

function panelStatusToGenerationStatus(status: PanelAlertItem['status']): DetailGenerationToastStatus {
  if (status === 'cancelled') return 'cancelled';
  if (status === 'failed') return 'failed';
  return 'completed';
}

function showDetailGenerationToast(input: {
  status: DetailGenerationToastStatus;
  productLabel: string;
  templateLabel: string;
  errorMessage: string | null;
  editorUrl: string | null;
  routerPush: (href: string) => void;
}) {
  if (input.status === 'completed') {
    toast.success(`${input.productLabel} 생성 완료`, {
      description: `${input.templateLabel} - 상세페이지로 이동하시겠습니까?`,
      duration: Infinity,
      ...(input.editorUrl
        ? {
            action: {
              label: '상세페이지로 이동',
              onClick: () => input.routerPush(input.editorUrl as string),
            },
          }
        : {}),
    });
    return;
  }

  if (input.status === 'cancelled') {
    toast.info(`${input.productLabel} 생성 중단됨`, {
      description: '사용자 요청으로 상세페이지 생성을 멈췄습니다.',
      duration: 5000,
    });
    return;
  }

  toast.error(`${input.productLabel} 생성 실패`, {
    description: input.errorMessage || '알 수 없는 오류',
    duration: 10000,
  });
}

function sourceCandidateIdFromGeneration(entry: KidsPlayfulGenerationItem): string | null {
  const rawInput = entry.rawInput;
  if (!rawInput || typeof rawInput !== 'object') return null;
  const sourceReferences = (rawInput as { sourceReferences?: unknown }).sourceReferences;
  if (!Array.isArray(sourceReferences)) return null;
  for (const ref of sourceReferences) {
    if (
      ref &&
      typeof ref === 'object' &&
      (ref as { sourceType?: unknown }).sourceType === 'sourcing_candidate' &&
      typeof (ref as { sourceCandidateId?: unknown }).sourceCandidateId === 'string'
    ) {
      return (ref as { sourceCandidateId: string }).sourceCandidateId;
    }
  }
  return null;
}
