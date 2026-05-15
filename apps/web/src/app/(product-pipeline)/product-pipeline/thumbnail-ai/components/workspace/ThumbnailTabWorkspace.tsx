'use client';

import type { ComponentProps } from 'react';
import { AiEditTab } from '../AiEditTab';
import { HistoryTab } from '../HistoryTab';
import { ScanResultsTab } from '../ScanResultsTab';
import { ThumbnailMainTabs, type MainTabKey } from '../ThumbnailMainTabs';
import { UnclassifiedTab } from '../UnclassifiedTab';

interface ThumbnailTabWorkspaceProps {
  activeTab: MainTabKey;
  tabs: ComponentProps<typeof ThumbnailMainTabs>;
  unclassified: ComponentProps<typeof UnclassifiedTab>;
  scanResults: Omit<ComponentProps<typeof ScanResultsTab>, 'mode'>;
  aiEdit: ComponentProps<typeof AiEditTab>;
  history: ComponentProps<typeof HistoryTab>;
}

export function ThumbnailTabWorkspace({
  activeTab,
  tabs,
  unclassified,
  scanResults,
  aiEdit,
  history,
}: ThumbnailTabWorkspaceProps) {
  return (
    <>
      <ThumbnailMainTabs {...tabs} />

      {/* 탭 본문 높이 고정 — 탭 전환 시 페이지 shrink/jump 방지.
          min-h 로 가장 긴 탭(AiEdit, History)의 평균 높이 기준 여유 있게 잡는다. */}
      <div className="min-h-[1100px]">
        {activeTab === 'unclassified' && <UnclassifiedTab {...unclassified} />}

        {(activeTab === 'all' || activeTab === 'needsfix') && (
          <ScanResultsTab {...scanResults} mode={activeTab} />
        )}

        {activeTab === 'ai-edit' && <AiEditTab {...aiEdit} />}

        {activeTab === 'history' && <HistoryTab {...history} />}
      </div>
    </>
  );
}
