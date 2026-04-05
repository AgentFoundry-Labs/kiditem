'use client';

import { useState, useCallback } from 'react';
import dynamic from 'next/dynamic';
import TabLayout from '@/components/ui/TabLayout';
import { Bot, Activity, Coins, Puzzle, GitBranch, Store } from 'lucide-react';

const AgentOverview = dynamic(() => import('@/app/agents/components/AgentOverview'), { ssr: false });
const ActivityPage = dynamic(() => import('@/app/agents/activity/page'), { ssr: false });
const CostsPage = dynamic(() => import('@/app/agents/costs/page'), { ssr: false });
const SkillsPage = dynamic(() => import('@/app/agents/skills/page'), { ssr: false });
const WorkflowsPage = dynamic(() => import('@/app/workflows/page'), { ssr: false });
const MarketplacePage = dynamic(() => import('@/app/marketplace/page'), { ssr: false });

export default function AgentOSPage() {
  const [activeTab, setActiveTab] = useState('agents');

  const goToMarketplace = useCallback(() => setActiveTab('marketplace'), []);

  return (
    <TabLayout
      title="Agent OS"
      titleIcon={Bot}
      activeTab={activeTab}
      onTabChange={setActiveTab}
      tabs={[
        { id: 'agents', label: '에이전트 관리', icon: Bot, content: <AgentOverview onAddAgent={goToMarketplace} /> },
        { id: 'activity', label: '활동 로그', icon: Activity, content: <ActivityPage /> },
        { id: 'costs', label: '비용 분석', icon: Coins, content: <CostsPage /> },
        { id: 'skills', label: '스킬 카탈로그', icon: Puzzle, content: <SkillsPage /> },
        { id: 'workflows', label: '워크플로우', icon: GitBranch, content: <WorkflowsPage onAddWorkflow={goToMarketplace} /> },
        { id: 'marketplace', label: '마켓플레이스', icon: Store, content: <MarketplacePage /> },
      ]}
    />
  );
}
