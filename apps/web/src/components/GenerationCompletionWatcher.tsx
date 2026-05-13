'use client';

import { useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import {
  useBoldVerticalGenerationList,
  useKidsPlayfulGenerationList,
  type KidsPlayfulGenerationItem,
} from '@/app/(media-ai)/generate/hooks/useKidsPlayfulGenerate';
import { buildProductContentEditorHref } from '@/app/(catalog)/product-content/lib/product-content-routing';

const IN_PROGRESS_STATUSES = new Set(['pending', 'processing']);
const TERMINAL_STATUSES = new Set(['completed', 'failed', 'cancelled']);

export default function GenerationCompletionWatcher() {
  const router = useRouter();
  const { data: kpList = [] } = useKidsPlayfulGenerationList(null);
  const { data: boldList = [] } = useBoldVerticalGenerationList(null);
  const prevStatusRef = useRef<Map<string, string>>(new Map());
  const initializedRef = useRef(false);

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
        const isBoldVertical = entry.templateId === 'bold-vertical';
        const editorUrl = entry.productId
          ? buildProductContentEditorHref({
              productId: entry.productId,
              generationId: entry.id,
            })
          : null;
        const productLabel = entry.productName || '상세페이지';

        if (current === 'completed') {
          toast.success(`${productLabel} 생성 완료`, {
            description: `${
              isBoldVertical ? 'KIDITEM DESIGN' : 'Trend Vertical'
            } - 상세페이지로 이동하시겠습니까?`,
            duration: Infinity,
            action: editorUrl
              ? {
                  label: '상세페이지로 이동',
                  onClick: () => router.push(editorUrl),
                }
              : undefined,
          });
        } else if (current === 'cancelled') {
          toast.info(`${productLabel} 생성 중단됨`, {
            description: '사용자 요청으로 상세페이지 생성을 멈췄습니다.',
            duration: 5000,
          });
        } else {
          toast.error(`${productLabel} 생성 실패`, {
            description: entry.imageProcessingError || '알 수 없는 오류',
            duration: 10000,
          });
        }
      }
    }

    prevStatusRef.current = currentStatus;
  }, [kpList, boldList, router]);

  return null;
}
