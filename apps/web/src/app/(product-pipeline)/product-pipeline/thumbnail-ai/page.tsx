'use client';

import { Suspense, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Gauge, Wand2 } from 'lucide-react';
import TabLayout from '@/components/ui/TabLayout';
import PageSkeleton from '@/components/ui/PageSkeleton';
import { AiEditTab, type AiEditFilter } from './components/AiEditTab';
import { ListingEvaluationTab } from './components/ListingEvaluationTab';

type ThumbnailAiTab = 'evaluation' | 'ai-edit';

function parseTab(value: string | null): ThumbnailAiTab {
  return value === 'ai-edit' ? 'ai-edit' : 'evaluation';
}

function parseFilter(value: string | null): AiEditFilter {
  return value === 'generating' || value === 'adopted' || value === 'failed' ? value : 'ready';
}

export default function ThumbnailsPage() {
  // useSearchParams() 는 Suspense 경계 안에서만 정적 prerender 를 통과한다.
  return (
    <Suspense fallback={<PageSkeleton variant="cards" />}>
      <ThumbnailsPageContent />
    </Suspense>
  );
}

/**
 * 썸네일 AI(KID-313 W3a): 몰이 보여 주는 리스팅 대표이미지 평가와 AI 편집 job · 채택. 분석 · 추적 화면은 없다.
 */
function ThumbnailsPageContent() {
  const searchParams = useSearchParams();
  const [tab, setTab] = useState<ThumbnailAiTab>(() => parseTab(searchParams.get('tab')));
  const [filter, setFilter] = useState<AiEditFilter>(() => parseFilter(searchParams.get('editFilter')));

  return (
    <TabLayout
      title="썸네일 AI"
      activeTab={tab}
      onTabChange={(id) => setTab(parseTab(id))}
      unmountInactive
      tabs={[
        {
          id: 'evaluation',
          label: '리스팅 평가',
          icon: Gauge,
          content: (
            <ListingEvaluationTab
              onEditStarted={() => {
                setFilter('generating');
              }}
            />
          ),
        },
        {
          id: 'ai-edit',
          label: 'AI 편집',
          icon: Wand2,
          content: <AiEditTab filter={filter} onChangeFilter={setFilter} />,
        },
      ]}
    />
  );
}
