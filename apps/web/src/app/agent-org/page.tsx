'use client';

import { AgentOsHeader } from './components/AgentOsHeader';
import { AgentOrgView } from './components/AgentOrgView';
import { useAgentOrg } from './hooks/use-agent-org';

/**
 * Agent Org — 소싱부터 CS 까지 한 화면에서, 어디가 막혔는지.
 *
 * 옛 Agent OS 틀을 따른다: 가운데 파이프라인 캔버스, 왼쪽 에이전트, 오른쪽 실시간 활동, 아래 매출.
 *
 * 1단계: 지금 있는 기록(실행 기록 · 알림 · 셀피아 신선도)만으로 그린다. 셀 곳이
 * 없는 단계는 가짜 숫자로 채우지 않고 '데이터 없음'과 그 이유를 적는다. 판정 규칙은
 * `lib/pipe-model.ts`, 단계와 기록의 연결은 `lib/pipe-stages.ts` 가 가진다.
 */
export default function AgentOrgPage() {
  const { snapshot, connection, now, confirm, business, openAlerts, refresh } = useAgentOrg();
  return (
    <div className="fixed inset-0 flex flex-col overflow-hidden bg-[#0a0f1a] text-white max-md:overflow-y-auto">
      <AgentOsHeader ceoName="KidItem 운영" onRefresh={refresh} />
      <main className="flex min-h-0 flex-1 flex-col">
        <AgentOrgView
          snapshot={snapshot}
          connection={connection}
          now={now}
          confirm={confirm}
          business={business}
          openAlerts={openAlerts}
        />
      </main>
    </div>
  );
}
