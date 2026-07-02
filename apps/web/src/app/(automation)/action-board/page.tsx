'use client';

import { Suspense } from 'react';
import PageSkeleton from '@/components/ui/PageSkeleton';
import { ActionBoardHeader } from './components/ActionBoardHeader';
import { ActionBoardKanban } from './components/ActionBoardKanban';
import { ActionBoardScopeTabs } from './components/ActionBoardScopeTabs';
import { ActionTaskDrawer } from './components/ActionTaskDrawer';
import { useActionBoardWorkflow } from './hooks/useActionBoardWorkflow';

export default function ActionBoardPage() {
  return (
    <Suspense fallback={<PageSkeleton variant="table" />}>
      <ActionBoardContent />
    </Suspense>
  );
}

function ActionBoardContent() {
  const workflow = useActionBoardWorkflow();

  if (workflow.isLoading) return <PageSkeleton variant="table" />;

  return (
    <div className="flex flex-col h-full min-h-0">
      <ActionBoardHeader
        viewMode={workflow.viewMode}
        onViewModeChange={workflow.setViewMode}
        taskCount={workflow.tasks.length}
        onRefresh={workflow.refreshTasks}
        isRefreshing={workflow.isRefreshing}
      />
      <ActionBoardScopeTabs
        scope={workflow.scope}
        onScopeChange={workflow.setScope}
      />
      <ActionBoardKanban
        tasks={workflow.tasks}
        columns={workflow.columns}
        getColumnKey={workflow.getColumnKey}
        currentUserId={workflow.currentUserId}
        selectedTask={workflow.selectedTask}
        openDrawer={workflow.openDrawer}
        closeDrawer={workflow.closeDrawer}
        updateMutation={workflow.updateMutation}
        executeMutation={workflow.executeMutation}
        claimMutation={workflow.claimMutation}
        unclaimMutation={workflow.unclaimMutation}
        isRefreshing={workflow.isRefreshing}
      />
      <ActionTaskDrawer
        selectedTask={workflow.selectedTask}
        currentUserId={workflow.currentUserId}
        noteText={workflow.noteText}
        setNoteText={workflow.setNoteText}
        drawerResult={workflow.drawerResult}
        closeDrawer={workflow.closeDrawer}
        updateMutation={workflow.updateMutation}
        noteMutation={workflow.noteMutation}
        executeMutation={workflow.executeMutation}
        claimMutation={workflow.claimMutation}
        unclaimMutation={workflow.unclaimMutation}
      />
    </div>
  );
}
