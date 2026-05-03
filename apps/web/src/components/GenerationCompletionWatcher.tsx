'use client';

import { useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import {
  useKidsPlayfulGenerationList,
  useSimpleVerticalGenerationList,
  type KidsPlayfulGenerationItem,
} from '@/app/(media-ai)/generate/hooks/useKidsPlayfulGenerate';

const IN_PROGRESS_STATUSES = new Set(['pending', 'processing']);
const TERMINAL_STATUSES = new Set(['completed', 'failed']);

export default function GenerationCompletionWatcher() {
  const router = useRouter();
  const { data: kpList = [] } = useKidsPlayfulGenerationList(null);
  const { data: svList = [] } = useSimpleVerticalGenerationList(null);
  const prevStatusRef = useRef<Map<string, string>>(new Map());
  const initializedRef = useRef(false);

  useEffect(() => {
    const all: KidsPlayfulGenerationItem[] = [...kpList, ...svList].filter(
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
        const isSimpleVertical = entry.templateId === 'simple-vertical';
        const queryKey = isSimpleVertical ? 'svId' : 'kpId';
        const editorUrl = entry.productId
          ? `/sourcing/${entry.productId}/editor?${queryKey}=${entry.id}`
          : null;
        const productLabel = entry.productName || '상세페이지';

        if (current === 'completed') {
          toast.success(`${productLabel} 생성 완료`, {
            description: `${
              isSimpleVertical ? 'Simple Vertical' : 'Trend Vertical'
            } - 상세페이지로 이동하시겠습니까?`,
            duration: Infinity,
            action: editorUrl
              ? {
                  label: '상세페이지로 이동',
                  onClick: () => router.push(editorUrl),
                }
              : undefined,
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
  }, [kpList, svList, router]);

  return null;
}
