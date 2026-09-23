'use client';

import { useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  useBoldVerticalGenerationList,
  useKidsPlayfulGenerationList,
  type KidsPlayfulGenerationItem,
} from '@/app/(product-pipeline)/product-pipeline/detail-template-generation/hooks/useKidsPlayfulGenerate';
import {
  detailPageEditorHref,
  registeredProductDetailHref,
} from '@/app/(product-pipeline)/product-pipeline/_shared/lib/product-pipeline-routes';
import { queryKeys } from '@/lib/query-keys';

const IN_PROGRESS_STATUSES = new Set(['pending', 'processing']);
const TERMINAL_STATUSES = new Set(['completed', 'failed', 'cancelled']);

type DetailGenerationToastStatus = 'completed' | 'failed' | 'cancelled';

export default function GenerationCompletionWatcher() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { data: kpList = [] } = useKidsPlayfulGenerationList(null);
  const { data: boldList = [] } = useBoldVerticalGenerationList(null);
  const prevStatusRef = useRef<Map<string, string>>(new Map());
  const initializedRef = useRef(false);
  const notifiedGenerationIdsRef = useRef<Set<string>>(new Set());

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
        // 생성 이력은 판매상품 초안 id 를 모른다 — 원천 기록 id 로 수집상품 화면을 열지 않는다(KID-310).
        const returnTo = entry.contentWorkspaceId
          ? registeredProductDetailHref(entry.contentWorkspaceId)
          : null;
        const editorUrl = detailPageEditorHref({
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

