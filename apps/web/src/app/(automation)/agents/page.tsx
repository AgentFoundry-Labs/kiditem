'use client';

import { Suspense, useState, useCallback } from 'react';
import { useSearchParams } from 'next/navigation';
import dynamic from 'next/dynamic';
import { Bot, Activity, Coins, Puzzle, GitBranch, Store, ListTree } from 'lucide-react';
import TabLayout from '@/components/ui/TabLayout';

const AgentOverview = dynamic(() => import('@/app/(automation)/agents/components/AgentOverview'), { ssr: false });
const ActivityPage = dynamic(() => import('@/app/(automation)/agents/activity/page'), { ssr: false });
const TasksPage = dynamic(() => import('@/app/(automation)/agents/tasks/page'), { ssr: false });
const CostsPage = dynamic(() => import('@/app/(automation)/agents/costs/page'), { ssr: false });
const SkillsPage = dynamic(() => import('@/app/(automation)/agents/skills/page'), { ssr: false });
const WorkflowsPage = dynamic(() => import('@/app/(automation)/workflows/page'), { ssr: false });
const MarketplacePage = dynamic(() => import('@/app/(automation)/marketplace/page'), { ssr: false });

const VALID_TABS = ['agents', 'activity', 'tasks', 'costs', 'skills', 'workflows', 'marketplace'];

export default function AgentOSPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-slate-50" />}>
      <AgentOSContent />
    </Suspense>
  );
}

function AgentOSContent() {
  const searchParams = useSearchParams();
  const initialTab = VALID_TABS.includes(searchParams.get('tab') ?? '') ? searchParams.get('tab')! : 'agents';
  const [activeTab, setActiveTab] = useState(initialTab);

  const [marketplaceFilter, setMarketplaceFilter] = useState<'all' | 'agent' | 'workflow'>('all');
  const goToMarketplace = useCallback((type?: 'agent' | 'workflow') => {
    setMarketplaceFilter(type ?? 'all');
    setActiveTab('marketplace');
  }, []);

  return (
    <TabLayout
      title="Agent OS"
      titleIcon={Bot}
      activeTab={activeTab}
      onTabChange={setActiveTab}
      tabs={[
        { id: 'agents', label: '에이전트 관리', icon: Bot, content: <AgentOverview onAddAgent={() => goToMarketplace('agent')} /> },
        { id: 'activity', label: '활동 로그', icon: Activity, content: <ActivityPage /> },
        { id: 'tasks', label: '태스크 트레이스', icon: ListTree, content: <TasksPage /> },
        { id: 'costs', label: '비용 분석', icon: Coins, content: <CostsPage /> },
        { id: 'skills', label: '스킬 카탈로그', icon: Puzzle, content: <SkillsPage /> },
        { id: 'workflows', label: '워크플로우', icon: GitBranch, content: <WorkflowsPage onAddWorkflow={() => goToMarketplace('workflow')} /> },
        { id: 'marketplace', label: '마켓플레이스', icon: Store, content: <MarketplacePage initialTypeFilter={marketplaceFilter} /> },
      ]}
    />
  );
}
