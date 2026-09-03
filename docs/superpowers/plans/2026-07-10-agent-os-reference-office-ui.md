# Agent OS Reference Office UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Recompose `/agent-os` into a bright digital-twin office where the office scene is dominant, selecting an employee updates one coherent work context, and the user can assign work through Operator without the system activity log taking over the conversation area.

**Architecture:** Keep the canonical `/agent-os` route, current React Query data flow, and Operator-first conversation API unchanged. Add a small pure command-target layer that turns the selected employee into an explicit Operator delegation hint, then split the large shell into route-local header, staffing, inspector, command-dock, and office-scene components. Keep technical activity available behind an explicit toggle; render a generated isometric office bitmap as the full-bleed scene while React owns all interactive employee nodes and panels.

**Tech Stack:** Next.js 16 App Router, React 19, React Query 5, Tailwind CSS, lucide-react, Next Image, Vitest, React Testing Library, in-app browser desktop QA.

## Global Constraints

- Canonical route remains `/agent-os`; `/agents` remains redirect-only.
- Frontend data continues through route-local `lib/agent-os-api.ts` and shared `apiClient`; no backend API, Prisma schema, or data migration changes.
- Operator remains the only conversation entrypoint. Selecting another employee adds a delegation hint to the Operator message and must not call a direct employee-run endpoint.
- Do not present controls that have no backend mutation contract. Runtime model, adapter, trust level, work folder, and capabilities are read-only in this iteration.
- The office scene is the primary visual surface. Left, right, top, and bottom controls overlay it as restrained dark translucent work panels.
- The activity feed is hidden by default and labeled `시스템 활동 기록` when opened; it must not look like employee conversation.
- Use a generated bitmap office asset. Do not rebuild the background from gradients, decorative orbs, or a hand-drawn SVG.
- Use lucide-react icons, maximum 8px panel radius, zero custom letter spacing, and stable component dimensions.
- Desktop-only verification. Verify `1098x935` and `1440x900`; do not spend implementation time on mobile layouts.
- Preserve the existing dashboard return link at `/dashboard`.
- Follow TDD for every behavior change: failing test, observed failure, minimal implementation, passing test.
- Do not update `docs/ARCHITECTURE.md`; this plan changes neither route ownership nor a top-level architecture boundary.

---

## File Structure

- Create `apps/web/src/app/agent-os/lib/agent-command-presets.ts`
  - Owns employee-specific quick commands and the pure Operator delegation message builder.
- Create `apps/web/src/app/agent-os/lib/agent-command-presets.spec.ts`
  - Locks delegation-message and preset behavior.
- Modify `apps/web/src/app/agent-os/lib/agent-office-model.ts`
  - Exposes existing instance runtime fields needed by the inspector.
- Modify `apps/web/src/app/agent-os/lib/agent-office-model.spec.ts`
  - Verifies runtime fields survive view-model projection.
- Modify `apps/web/src/app/agent-os/hooks/useAgentOffice.ts`
  - Resolves the selected employee and submits a delegation-aware Operator command.
- Modify `apps/web/src/app/agent-os/hooks/useAgentOffice.spec.tsx`
  - Verifies a selected employee affects the content sent to Operator.
- Create `apps/web/src/app/agent-os/components/AgentCommandDock.tsx`
  - Owns selected-employee context, quick-command chips, and the command form.
- Create `apps/web/src/app/agent-os/components/AgentCommandDock.spec.tsx`
  - Verifies selected context and preset interaction.
- Modify `apps/web/src/app/agent-os/components/AgentCommandBar.tsx`
  - Accepts a target-aware placeholder while retaining form validation.
- Modify `apps/web/src/app/agent-os/components/AgentCommandBar.spec.tsx`
  - Verifies target-aware and no-selection placeholders.
- Create `apps/web/src/app/agent-os/components/AgentOfficeHeader.tsx`
  - Owns title, real status summaries, activity toggle, refresh, and dashboard navigation.
- Create `apps/web/src/app/agent-os/components/AgentStaffPanel.tsx`
  - Owns the left `인력 배치` list and selection controls.
- Create `apps/web/src/app/agent-os/components/AgentOfficePanels.spec.tsx`
  - Verifies header actions, staff selection, and inspector runtime facts.
- Modify `apps/web/src/app/agent-os/components/AgentInspector.tsx`
  - Rebuilds the right panel around actual profile, runtime, and capability data.
- Add `apps/web/public/agent-os/office-floor.png`
  - Generated, people-free isometric office scene used as the canvas background.
- Modify `apps/web/src/app/agent-os/components/AgentOfficeMap.tsx`
  - Renders the bitmap full-bleed and keeps interactive employee nodes in React.
- Modify `apps/web/src/app/agent-os/components/AgentOfficeMap.spec.tsx`
  - Verifies the office image, landmarks, and node selection.
- Modify `apps/web/src/app/agent-os/components/AgentActivityDrawer.tsx`
  - Renames and clarifies the technical activity surface and adds an empty state.
- Modify `apps/web/src/app/agent-os/components/AgentOfficeShell.tsx`
  - Composes the new overlay hierarchy and controls activity visibility.
- Modify `apps/web/src/app/agent-os/components/AgentOfficeShell.spec.tsx`
  - Locks the reference-aligned hierarchy and hidden-by-default activity behavior.
- Modify `apps/web/src/app/agent-os/__tests__/page.spec.tsx`
  - Updates the canonical route integration expectation.
- Delete `apps/web/src/app/agent-os/components/AgentStatusRail.tsx`
  - Removes an unused competing summary surface after the header takes ownership.

### Task 1: Project Real Runtime Facts Into Employee Nodes

**Files:**
- Modify: `apps/web/src/app/agent-os/lib/agent-office-model.ts:13-28`
- Modify: `apps/web/src/app/agent-os/lib/agent-office-model.ts:291-322`
- Modify: `apps/web/src/app/agent-os/lib/agent-office-model.spec.ts`
- Modify: `apps/web/src/app/agent-os/components/AgentOfficeMap.spec.tsx`
- Modify: `apps/web/src/app/agent-os/components/AgentOfficeShell.spec.tsx`
- Modify: `apps/web/src/app/agent-os/__tests__/page.spec.tsx`

**Interfaces:**
- Consumes: `AgentInstanceSummary.trustLevel`, `adapterType`, and `effectiveModel`.
- Produces: `AgentOfficeNode.trustLevel: number`, `adapterType: string`, and `effectiveModel: string`.

- [ ] **Step 1: Write the failing view-model assertion**

Add this assertion to the existing employee-node test in `agent-office-model.spec.ts`:

~~~ts
expect(model.nodes.find((node) => node.id === 'agent-manager')).toMatchObject({
  trustLevel: 1,
  adapterType: 'hermes_local',
  effectiveModel: 'gpt-5.1-codex',
});
~~~

- [ ] **Step 2: Run the focused model test and observe the failure**

Run:

~~~bash
rtk npm exec --workspace=apps/web vitest -- run src/app/agent-os/lib/agent-office-model.spec.ts
~~~

Expected: FAIL because the projected node does not contain `trustLevel`, `adapterType`, or `effectiveModel`.

- [ ] **Step 3: Extend the node contract and projection**

Add the fields to `AgentOfficeNode`:

~~~ts
export interface AgentOfficeNode {
  id: string;
  name: string;
  agentType: string;
  title: string | null;
  displayName: string;
  responsibility: string;
  status: AgentOfficeNodeStatus;
  x: number;
  y: number;
  activeRunCount: number;
  pendingApprovalCount: number;
  lastActivityAt: string | null;
  trustLevel: number;
  adapterType: string;
  effectiveModel: string;
  capabilities: AgentOfficeCapability[];
}
~~~

Add these properties to the employee-node return object:

~~~ts
trustLevel: unit.instance.trustLevel,
adapterType: unit.instance.adapterType,
effectiveModel: unit.instance.effectiveModel,
capabilities: ownedCapabilities,
~~~

Update every literal `AgentOfficeNode` fixture in the listed component and page tests with:

~~~ts
trustLevel: 1,
adapterType: 'hermes_local',
effectiveModel: 'gpt-5.1-codex',
~~~

- [ ] **Step 4: Run model and component type-facing tests**

Run:

~~~bash
rtk npm exec --workspace=apps/web vitest -- run src/app/agent-os/lib/agent-office-model.spec.ts src/app/agent-os/components/AgentOfficeMap.spec.tsx src/app/agent-os/components/AgentOfficeShell.spec.tsx src/app/agent-os/__tests__/page.spec.tsx
~~~

Expected: PASS with no missing-property TypeScript transform errors.

- [ ] **Step 5: Commit the runtime projection**

~~~bash
rtk git add apps/web/src/app/agent-os/lib/agent-office-model.ts apps/web/src/app/agent-os/lib/agent-office-model.spec.ts apps/web/src/app/agent-os/components/AgentOfficeMap.spec.tsx apps/web/src/app/agent-os/components/AgentOfficeShell.spec.tsx apps/web/src/app/agent-os/__tests__/page.spec.tsx
rtk git commit -m "feat: expose agent runtime facts in office model"
~~~

### Task 2: Make Employee Selection Affect Operator Delegation

**Files:**
- Create: `apps/web/src/app/agent-os/lib/agent-command-presets.ts`
- Create: `apps/web/src/app/agent-os/lib/agent-command-presets.spec.ts`
- Modify: `apps/web/src/app/agent-os/hooks/useAgentOffice.ts:152-209`
- Modify: `apps/web/src/app/agent-os/hooks/useAgentOffice.spec.tsx`

**Interfaces:**
- Consumes: selected `AgentOfficeNode | null` and raw user command.
- Produces:

~~~ts
export interface AgentCommandTarget {
  id: string;
  agentType: string;
  displayName: string;
}

export function getAgentCommandPresets(agentType: string | null): readonly string[];
export function commandTargetFromNode(node: AgentOfficeNode | null): AgentCommandTarget | null;
export function buildOperatorCommand(input: {
  content: string;
  target: AgentCommandTarget | null;
}): string;
~~~

- [ ] **Step 1: Write failing pure-helper tests**

Create `agent-command-presets.spec.ts`:

~~~ts
import { describe, expect, it } from 'vitest';
import {
  buildOperatorCommand,
  getAgentCommandPresets,
} from './agent-command-presets';

describe('agent command presets', () => {
  it('adds an explicit delegation hint when a non-manager employee is selected', () => {
    expect(
      buildOperatorCommand({
        content: '신규 상품 후보를 정리해줘',
        target: {
          id: 'agent-sourcing',
          agentType: 'sourcing',
          displayName: '소싱 담당',
        },
      }),
    ).toBe(
      [
        '[Agent OS 업무 배정 요청]',
        '대상 직원: 소싱 담당',
        '대상 직원 유형: sourcing',
        '대상 직원 ID: agent-sourcing',
        '업무: 신규 상품 후보를 정리해줘',
      ].join('\n'),
    );
  });

  it('keeps manager commands unchanged because Operator is already the entrypoint', () => {
    expect(
      buildOperatorCommand({
        content: ' 승인 대기 업무를 정리해줘 ',
        target: {
          id: 'agent-manager',
          agentType: 'manager',
          displayName: '운영 총괄',
        },
      }),
    ).toBe('승인 대기 업무를 정리해줘');
  });

  it('returns employee-specific quick commands with a manager fallback', () => {
    expect(getAgentCommandPresets('sourcing')).toContain(
      '신규 상품 후보와 공급처 리스크를 정리해줘',
    );
    expect(getAgentCommandPresets('unknown')).toEqual(
      getAgentCommandPresets('manager'),
    );
  });
});
~~~

- [ ] **Step 2: Run helper tests and observe the missing-module failure**

Run:

~~~bash
rtk npm exec --workspace=apps/web vitest -- run src/app/agent-os/lib/agent-command-presets.spec.ts
~~~

Expected: FAIL because `agent-command-presets.ts` does not exist.

- [ ] **Step 3: Implement the pure command helpers**

Create `agent-command-presets.ts`:

~~~ts
import type { AgentOfficeNode } from './agent-office-model';

export interface AgentCommandTarget {
  id: string;
  agentType: string;
  displayName: string;
}

const PRESETS: Record<string, readonly string[]> = {
  manager: [
    '승인 대기 업무를 우선순위로 정리해줘',
    '오늘 운영 병목과 담당자를 정리해줘',
    '진행 중인 업무의 위험 요소를 요약해줘',
  ],
  sourcing: [
    '신규 상품 후보와 공급처 리스크를 정리해줘',
    '소싱 후보의 가격과 MOQ를 비교해줘',
    '발주 검토가 필요한 후보를 추려줘',
  ],
  listing: [
    '상품 등록 초안을 작성해줘',
    '상세페이지와 썸네일 준비 상태를 점검해줘',
    '등록 누락 필드를 정리해줘',
  ],
  order: [
    '승인된 상품의 발주 초안을 정리해줘',
    '발주 지연 위험을 확인해줘',
    '공급처별 발주 현황을 요약해줘',
  ],
  channel_registration: [
    '채널별 등록 대기 상품을 정리해줘',
    '마켓 등록 실패 원인을 요약해줘',
    '외부 채널 동기화 상태를 점검해줘',
  ],
  ad_strategy: [
    '광고 성과가 낮은 상품을 정리해줘',
    '예산 재배분 후보를 제안해줘',
    '캠페인별 위험 신호를 요약해줘',
  ],
  chat: [
    '고객 문의의 주요 이슈를 분류해줘',
    '반복 문의에 필요한 답변 초안을 작성해줘',
    '긴급 응대가 필요한 대화를 추려줘',
  ],
};

export function getAgentCommandPresets(
  agentType: string | null,
): readonly string[] {
  return PRESETS[agentType ?? 'manager'] ?? PRESETS.manager;
}

export function commandTargetFromNode(
  node: AgentOfficeNode | null,
): AgentCommandTarget | null {
  if (!node) return null;
  return {
    id: node.id,
    agentType: node.agentType,
    displayName: node.displayName,
  };
}

export function buildOperatorCommand(input: {
  content: string;
  target: AgentCommandTarget | null;
}): string {
  const content = input.content.trim();
  if (!input.target || input.target.agentType === 'manager') return content;

  return [
    '[Agent OS 업무 배정 요청]',
    '대상 직원: ' + input.target.displayName,
    '대상 직원 유형: ' + input.target.agentType,
    '대상 직원 ID: ' + input.target.id,
    '업무: ' + content,
  ].join('\n');
}
~~~

- [ ] **Step 4: Write the failing hook delegation test**

Add this case to `useAgentOffice.spec.tsx`, using a second instance shaped like the existing manager fixture:

~~~ts
it('sends the selected employee as a delegation hint through Operator', async () => {
  listInstancesMock.mockResolvedValue([
    {
      id: 'agent-manager',
      organizationId: 'org-1',
      type: 'manager',
      name: 'Operator',
      role: 'ceo',
      title: '대표실',
      icon: null,
      reportsToId: null,
      lifecycleStatus: 'active',
      pauseReason: null,
      trustLevel: 5,
      adapterType: 'operator',
      modelOverride: null,
      effectiveModel: 'gpt-5.4',
    },
    {
      id: 'agent-sourcing',
      organizationId: 'org-1',
      type: 'sourcing',
      name: 'Sourcing',
      role: 'specialist',
      title: '소싱실',
      icon: null,
      reportsToId: 'agent-manager',
      lifecycleStatus: 'active',
      pauseReason: null,
      trustLevel: 2,
      adapterType: 'hermes_local',
      modelOverride: null,
      effectiveModel: 'gpt-5.4',
    },
  ]);

  const { result } = renderHook(() => useAgentOffice(), { wrapper });

  await waitFor(() => expect(result.current.isPending).toBe(false));

  act(() => {
    result.current.setSelectedNodeId('agent-sourcing');
    result.current.setCommand('신규 상품 후보를 정리해줘');
  });
  act(() => result.current.submitCommand());

  await waitFor(() => {
    expect(createConversationMock).toHaveBeenCalledWith({
      content: [
        '[Agent OS 업무 배정 요청]',
        '대상 직원: 소싱 담당',
        '대상 직원 유형: sourcing',
        '대상 직원 ID: agent-sourcing',
        '업무: 신규 상품 후보를 정리해줘',
      ].join('\n'),
    });
  });
});
~~~

- [ ] **Step 5: Run the hook test and observe the raw-content mismatch**

Run:

~~~bash
rtk npm exec --workspace=apps/web vitest -- run src/app/agent-os/hooks/useAgentOffice.spec.tsx
~~~

Expected: FAIL because `createConversationMock` receives only the raw command.

- [ ] **Step 6: Integrate the selected target in the hook**

Import the helpers:

~~~ts
import {
  buildOperatorCommand,
  commandTargetFromNode,
} from '../lib/agent-command-presets';
~~~

After the `model` memo, add:

~~~ts
const selectedNode = useMemo(
  () =>
    selectedNodeId === null
      ? null
      : model.nodes.find((node) => node.id === selectedNodeId) ?? null,
  [model.nodes, selectedNodeId],
);
~~~

Replace the first two lines of `submitCommand` with:

~~~ts
const submitCommand = () => {
  const content = buildOperatorCommand({
    content: command,
    target: commandTargetFromNode(selectedNode),
  });
  if (!content) return;
~~~

Keep the existing conversation reuse and create/send mutation branches unchanged.

- [ ] **Step 7: Run helper and hook tests**

Run:

~~~bash
rtk npm exec --workspace=apps/web vitest -- run src/app/agent-os/lib/agent-command-presets.spec.ts src/app/agent-os/hooks/useAgentOffice.spec.tsx
~~~

Expected: PASS. Existing active-conversation reuse must still pass.

- [ ] **Step 8: Commit the delegation behavior**

~~~bash
rtk git add apps/web/src/app/agent-os/lib/agent-command-presets.ts apps/web/src/app/agent-os/lib/agent-command-presets.spec.ts apps/web/src/app/agent-os/hooks/useAgentOffice.ts apps/web/src/app/agent-os/hooks/useAgentOffice.spec.tsx
rtk git commit -m "feat: route selected staff commands through operator"
~~~

### Task 3: Build the Selected-Employee Command Dock

**Files:**
- Create: `apps/web/src/app/agent-os/components/AgentCommandDock.tsx`
- Create: `apps/web/src/app/agent-os/components/AgentCommandDock.spec.tsx`
- Modify: `apps/web/src/app/agent-os/components/AgentCommandBar.tsx`
- Modify: `apps/web/src/app/agent-os/components/AgentCommandBar.spec.tsx`

**Interfaces:**
- Consumes: `node: AgentOfficeNode | null`, command form state, and command callbacks.
- Produces: `AgentCommandDock` as the only bottom-center interaction surface.

- [ ] **Step 1: Write failing command-dock tests**

Create `AgentCommandDock.spec.tsx`:

~~~tsx
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { AgentCommandDock } from './AgentCommandDock';
import type { AgentOfficeNode } from '../lib/agent-office-model';

const node: AgentOfficeNode = {
  id: 'agent-sourcing',
  name: 'Sourcing',
  agentType: 'sourcing',
  title: '소싱실',
  displayName: '소싱 담당',
  responsibility: '상품 후보와 공급처 신호를 수집한다.',
  status: 'idle',
  x: 30,
  y: 58,
  activeRunCount: 0,
  pendingApprovalCount: 0,
  lastActivityAt: null,
  trustLevel: 2,
  adapterType: 'hermes_local',
  effectiveModel: 'gpt-5.4',
  capabilities: [],
};

describe('AgentCommandDock', () => {
  it('shows selected employee context and fills a clicked quick command', () => {
    const onChange = vi.fn();
    render(
      <AgentCommandDock
        node={node}
        value=""
        pending={false}
        onChange={onChange}
        onSubmit={vi.fn()}
      />,
    );

    expect(
      screen.getByRole('region', { name: '선택 직원 업무 지시' }),
    ).toHaveTextContent('소싱 담당');
    expect(screen.getByText('운영 총괄을 통해 업무 배정')).toBeInTheDocument();

    fireEvent.click(
      screen.getByRole('button', {
        name: '빠른 지시: 신규 상품 후보와 공급처 리스크를 정리해줘',
      }),
    );
    expect(onChange).toHaveBeenCalledWith(
      '신규 상품 후보와 공급처 리스크를 정리해줘',
    );
  });

  it('shows a clear no-selection state', () => {
    render(
      <AgentCommandDock
        node={null}
        value=""
        pending={false}
        onChange={vi.fn()}
        onSubmit={vi.fn()}
      />,
    );

    expect(screen.getByText('직원을 선택하세요')).toBeInTheDocument();
  });
});
~~~

- [ ] **Step 2: Run the dock test and observe the missing-module failure**

Run:

~~~bash
rtk npm exec --workspace=apps/web vitest -- run src/app/agent-os/components/AgentCommandDock.spec.tsx
~~~

Expected: FAIL because `AgentCommandDock.tsx` does not exist.

- [ ] **Step 3: Add a target-aware placeholder to the command bar**

Extend `AgentCommandBar` with `targetName: string | null` and replace its placeholder:

~~~tsx
export function AgentCommandBar({
  targetName,
  value,
  pending,
  onChange,
  onSubmit,
}: {
  targetName: string | null;
  value: string;
  pending: boolean;
  onChange: (value: string) => void;
  onSubmit: () => void;
}) {
  const disabled = pending || value.trim().length === 0;
  const placeholder = targetName
    ? '운영 총괄을 통해 ' + targetName + '에게 맡길 업무를 입력하세요'
    : '운영 총괄에게 맡길 업무를 입력하세요';

  return (
    <form
      aria-label="업무 지시"
      className="flex min-h-14 items-center gap-2"
      onSubmit={(event) => {
        event.preventDefault();
        if (!disabled) onSubmit();
      }}
    >
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        aria-label="업무 지시 입력"
        className="h-10 min-w-0 flex-1 rounded-md border border-white/15 bg-black/35 px-3 text-sm text-white outline-none placeholder:text-slate-400 focus:border-cyan-300"
        placeholder={placeholder}
      />
      <button
        type="submit"
        disabled={disabled}
        className={cn(
          'inline-flex h-10 w-10 items-center justify-center rounded-md border transition',
          disabled
            ? 'border-white/10 text-slate-500'
            : 'border-indigo-400 bg-indigo-500 text-white hover:bg-indigo-400',
        )}
        aria-label="전송"
        title="업무 전송"
      >
        <SendHorizontal size={18} />
      </button>
    </form>
  );
}
~~~

Update every existing `AgentCommandBar` test render with either:

~~~tsx
targetName="소싱 담당"
~~~

or:

~~~tsx
targetName={null}
~~~

Add this assertion:

~~~ts
expect(
  screen.getByPlaceholderText(
    '운영 총괄을 통해 소싱 담당에게 맡길 업무를 입력하세요',
  ),
).toBeInTheDocument();
~~~

- [ ] **Step 4: Implement the command dock**

Create `AgentCommandDock.tsx`:

~~~tsx
'use client';

import { Bot, CircleUserRound, Sparkles } from 'lucide-react';
import type { AgentOfficeNode } from '../lib/agent-office-model';
import { getAgentCommandPresets } from '../lib/agent-command-presets';
import { AgentCommandBar } from './AgentCommandBar';

const STATUS_LABEL = {
  working: '집중 중',
  waiting: '대기 중',
  blocked: '승인 필요',
  idle: '준비됨',
  offline: '오프라인',
} satisfies Record<AgentOfficeNode['status'], string>;

export function AgentCommandDock({
  node,
  value,
  pending,
  onChange,
  onSubmit,
}: {
  node: AgentOfficeNode | null;
  value: string;
  pending: boolean;
  onChange: (value: string) => void;
  onSubmit: () => void;
}) {
  const presets = getAgentCommandPresets(node?.agentType ?? null);

  return (
    <section
      aria-label="선택 직원 업무 지시"
      className="border border-white/15 bg-slate-950/80 px-3 py-3 text-white shadow-2xl shadow-black/30 backdrop-blur-xl"
    >
      <div className="flex items-center gap-3 border-b border-white/10 pb-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white/10 text-cyan-200">
          {node ? <CircleUserRound size={22} /> : <Bot size={22} />}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold">
            {node?.displayName ?? '직원을 선택하세요'}
          </p>
          <p className="truncate text-[11px] text-slate-400">
            {node
              ? STATUS_LABEL[node.status] + ' · 운영 총괄을 통해 업무 배정'
              : '운영 총괄에게 직접 지시할 수 있습니다'}
          </p>
        </div>
        {node ? (
          <span className="shrink-0 rounded-md border border-white/10 bg-white/5 px-2 py-1 text-[11px] text-cyan-200">
            능력 {node.capabilities.length}
          </span>
        ) : null}
      </div>
      <div className="flex gap-2 overflow-x-auto py-2">
        {presets.map((preset) => (
          <button
            key={preset}
            type="button"
            aria-label={'빠른 지시: ' + preset}
            onClick={() => onChange(preset)}
            className="inline-flex h-7 shrink-0 items-center gap-1 rounded-md border border-white/10 bg-white/5 px-2 text-[11px] text-slate-300 hover:bg-white/10 hover:text-white"
          >
            <Sparkles size={12} />
            {preset}
          </button>
        ))}
      </div>
      <AgentCommandBar
        targetName={node?.displayName ?? null}
        value={value}
        pending={pending}
        onChange={onChange}
        onSubmit={onSubmit}
      />
    </section>
  );
}
~~~

- [ ] **Step 5: Run command component tests**

Run:

~~~bash
rtk npm exec --workspace=apps/web vitest -- run src/app/agent-os/components/AgentCommandBar.spec.tsx src/app/agent-os/components/AgentCommandDock.spec.tsx
~~~

Expected: PASS.

- [ ] **Step 6: Commit the command dock**

~~~bash
rtk git add apps/web/src/app/agent-os/components/AgentCommandBar.tsx apps/web/src/app/agent-os/components/AgentCommandBar.spec.tsx apps/web/src/app/agent-os/components/AgentCommandDock.tsx apps/web/src/app/agent-os/components/AgentCommandDock.spec.tsx
rtk git commit -m "feat: add selected staff command dock"
~~~

### Task 4: Rebuild Header, Staffing, And Inspector Panels

**Files:**
- Create: `apps/web/src/app/agent-os/components/AgentOfficeHeader.tsx`
- Create: `apps/web/src/app/agent-os/components/AgentStaffPanel.tsx`
- Create: `apps/web/src/app/agent-os/components/AgentOfficePanels.spec.tsx`
- Modify: `apps/web/src/app/agent-os/components/AgentInspector.tsx`

**Interfaces:**
- `AgentOfficeHeader` consumes totals, refresh state, activity visibility, and two callbacks.
- `AgentStaffPanel` consumes model, selection, and `onSelectNode(id)`.
- `AgentInspector` consumes the selected `AgentOfficeNode | null`.

- [ ] **Step 1: Write failing panel-contract tests**

Create `AgentOfficePanels.spec.tsx`:

~~~tsx
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { AgentInspector } from './AgentInspector';
import { AgentOfficeHeader } from './AgentOfficeHeader';
import { AgentStaffPanel } from './AgentStaffPanel';
import type {
  AgentOfficeNode,
  AgentOfficeViewModel,
} from '../lib/agent-office-model';

const node: AgentOfficeNode = {
  id: 'agent-manager',
  name: 'Operator',
  agentType: 'manager',
  title: '대표실',
  displayName: '운영 총괄',
  responsibility: '운영 우선순위, 위임, 승인 흐름을 총괄한다.',
  status: 'working',
  x: 18,
  y: 24,
  activeRunCount: 1,
  pendingApprovalCount: 1,
  lastActivityAt: '2026-07-09T00:00:00.000Z',
  trustLevel: 5,
  adapterType: 'hermes_local',
  effectiveModel: 'gpt-5.4',
  capabilities: [],
};

const totals: AgentOfficeViewModel['totals'] = {
  agents: 1,
  employees: 1,
  capabilities: 0,
  working: 1,
  waiting: 0,
  blocked: 0,
  pendingApprovals: 1,
  runningRuns: 1,
  totalCostMicros: '0',
};

describe('Agent OS office panels', () => {
  it('exposes real header actions and dashboard navigation', () => {
    const onToggleActivity = vi.fn();
    render(
      <AgentOfficeHeader
        totals={totals}
        refreshing={false}
        activityOpen={false}
        onRefresh={vi.fn()}
        onToggleActivity={onToggleActivity}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: '시스템 활동 기록 열기' }));
    expect(onToggleActivity).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('link', { name: '대시보드' })).toHaveAttribute(
      'href',
      '/dashboard',
    );
  });

  it('labels the left panel as staffing and changes selection', () => {
    const onSelectNode = vi.fn();
    render(
      <AgentStaffPanel
        model={{ nodes: [node], capabilities: [], activities: [], totals }}
        selectedNodeId={null}
        onSelectNode={onSelectNode}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /운영 총괄/ }));
    expect(onSelectNode).toHaveBeenCalledWith('agent-manager');
    expect(
      screen.getByRole('complementary', { name: '인력 배치' }),
    ).toBeInTheDocument();
  });

  it('shows only runtime values that really exist', () => {
    render(<AgentInspector node={node} />);

    expect(screen.getByText('gpt-5.4')).toBeInTheDocument();
    expect(screen.getByText('hermes_local')).toBeInTheDocument();
    expect(screen.getByText('신뢰 단계 5')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /모델 변경/ })).not.toBeInTheDocument();
  });
});
~~~

- [ ] **Step 2: Run the panel test and observe missing component failures**

Run:

~~~bash
rtk npm exec --workspace=apps/web vitest -- run src/app/agent-os/components/AgentOfficePanels.spec.tsx
~~~

Expected: FAIL because `AgentOfficeHeader` and `AgentStaffPanel` do not exist and the inspector lacks runtime facts.

- [ ] **Step 3: Implement the header**

Create `AgentOfficeHeader.tsx`:

~~~tsx
'use client';

import Link from 'next/link';
import {
  Activity,
  Bot,
  Circle,
  LayoutDashboard,
  RefreshCw,
} from 'lucide-react';
import type { AgentOfficeViewModel } from '../lib/agent-office-model';

export function AgentOfficeHeader({
  totals,
  refreshing,
  activityOpen,
  onRefresh,
  onToggleActivity,
}: {
  totals: AgentOfficeViewModel['totals'];
  refreshing: boolean;
  activityOpen: boolean;
  onRefresh: () => void;
  onToggleActivity: () => void;
}) {
  const summaries = [
    { label: '집중 중', value: totals.working, color: 'text-sky-300 fill-sky-300' },
    { label: '대기 중', value: totals.waiting, color: 'text-amber-300 fill-amber-300' },
    { label: '승인 필요', value: totals.pendingApprovals, color: 'text-rose-300 fill-rose-300' },
  ];

  return (
    <header className="flex h-14 items-center justify-between gap-3 rounded-lg border border-white/15 bg-slate-950/85 px-3 text-white shadow-xl shadow-black/20 backdrop-blur-xl">
      <div className="flex min-w-0 items-center gap-3">
        <span className="flex h-8 w-8 items-center justify-center rounded-md bg-indigo-500">
          <Bot size={18} />
        </span>
        <div className="min-w-0">
          <h1 className="truncate text-sm font-semibold">Agent OS 사무실</h1>
          <p className="truncate text-[11px] text-slate-400">
            Operator · Hermes · KidItem MCP
          </p>
        </div>
      </div>
      <div className="flex min-w-0 flex-1 items-center justify-center gap-2">
        {summaries.map((summary) => (
          <span
            key={summary.label}
            className="inline-flex h-7 items-center gap-1 rounded-md border border-white/10 bg-white/5 px-2 text-[11px] text-slate-300"
          >
            <Circle size={7} className={summary.color} />
            {summary.label}
            <strong className="font-semibold text-white">{summary.value}</strong>
          </span>
        ))}
      </div>
      <div className="flex items-center gap-2">
        <span className="rounded-md border border-white/10 bg-white/5 px-2 py-1 text-[11px] text-slate-300">
          직원 {totals.employees}명 · 능력 {totals.capabilities}개
        </span>
        <button
          type="button"
          aria-label={activityOpen ? '시스템 활동 기록 닫기' : '시스템 활동 기록 열기'}
          aria-expanded={activityOpen}
          aria-controls="agent-system-activity"
          onClick={onToggleActivity}
          className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-white/10 text-slate-200 hover:bg-white/10"
          title="시스템 활동 기록"
        >
          <Activity size={16} />
        </button>
        <button
          type="button"
          onClick={onRefresh}
          className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-white/10 text-slate-200 hover:bg-white/10"
          aria-label="새로고침"
          title="새로고침"
        >
          <RefreshCw size={16} className={refreshing ? 'animate-spin' : ''} />
        </button>
        <Link
          href="/dashboard"
          className="inline-flex h-9 items-center justify-center gap-2 rounded-md border border-white/10 px-3 text-xs font-medium text-slate-200 hover:bg-white/10"
        >
          <LayoutDashboard size={16} />
          대시보드
        </Link>
      </div>
    </header>
  );
}
~~~

- [ ] **Step 4: Extract the staffing panel**

Create `AgentStaffPanel.tsx` using the current `StaffPanel` row behavior, with these complete labels and container contract:

~~~tsx
'use client';

import { UsersRound } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { AgentOfficeViewModel } from '../lib/agent-office-model';

const STATUS_DOT_CLASS = {
  working: 'bg-sky-400',
  waiting: 'bg-amber-300',
  blocked: 'bg-rose-400',
  idle: 'bg-emerald-400',
  offline: 'bg-slate-400',
} satisfies Record<AgentOfficeViewModel['nodes'][number]['status'], string>;

export function AgentStaffPanel({
  model,
  selectedNodeId,
  onSelectNode,
}: {
  model: AgentOfficeViewModel;
  selectedNodeId: string | null;
  onSelectNode: (id: string) => void;
}) {
  return (
    <aside
      aria-label="인력 배치"
      className="max-h-[calc(100vh-112px)] overflow-auto rounded-lg border border-white/15 bg-slate-950/80 p-4 text-slate-100 shadow-2xl shadow-black/30 backdrop-blur-xl"
    >
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-sm font-semibold">
          <UsersRound size={15} />
          인력 배치
        </div>
        <span className="rounded-md bg-white/10 px-2 py-1 text-[11px] text-slate-300">
          {model.totals.employees}
        </span>
      </div>
      <p className="mt-2 text-[11px] text-slate-400">
        능력 {model.totals.capabilities} · 승인 {model.totals.pendingApprovals}
      </p>
      <div className="mt-4 space-y-2">
        {model.nodes.map((node) => (
          <button
            key={node.id}
            type="button"
            aria-pressed={selectedNodeId === node.id}
            onClick={() => onSelectNode(node.id)}
            className={cn(
              'flex min-h-14 w-full items-center gap-3 rounded-md border px-3 py-2 text-left text-xs transition',
              selectedNodeId === node.id
                ? 'border-cyan-300 bg-cyan-300/15 text-white'
                : 'border-white/10 bg-white/5 text-slate-300 hover:bg-white/10',
            )}
          >
            <span className={cn('h-2.5 w-2.5 rounded-full', STATUS_DOT_CLASS[node.status])} />
            <span className="min-w-0 flex-1">
              <span className="block truncate font-semibold">{node.displayName}</span>
              <span className="block truncate text-[11px] text-slate-400">
                {node.responsibility}
              </span>
            </span>
            <span className="rounded-md bg-white/10 px-2 py-0.5 text-[10px] text-slate-300">
              {node.activeRunCount + node.pendingApprovalCount}
            </span>
          </button>
        ))}
      </div>
    </aside>
  );
}
~~~

- [ ] **Step 5: Rebuild the inspector around real fields**

In `AgentInspector.tsx`, preserve the existing status map and capability rows, remove the uppercase/tracking class, and replace the runtime portion with:

~~~tsx
<div className="mt-4 space-y-3 text-xs">
  <div className="border-b border-white/10 pb-3">
    <p className="text-slate-400">담당 업무</p>
    <p className="mt-1 leading-5 text-slate-200">{node.responsibility}</p>
  </div>
  <dl className="grid grid-cols-2 gap-x-4 gap-y-3 border-b border-white/10 pb-3">
    <div>
      <dt className="text-slate-400">모델</dt>
      <dd className="mt-1 truncate font-medium text-white">{node.effectiveModel}</dd>
    </div>
    <div>
      <dt className="text-slate-400">어댑터</dt>
      <dd className="mt-1 truncate font-medium text-white">{node.adapterType}</dd>
    </div>
    <div>
      <dt className="text-slate-400">권한</dt>
      <dd className="mt-1 font-medium text-white">신뢰 단계 {node.trustLevel}</dd>
    </div>
    <div>
      <dt className="text-slate-400">작업 폴더</dt>
      <dd className="mt-1 truncate font-mono text-cyan-200">
        agents/{node.agentType}
      </dd>
    </div>
  </dl>
  <dl className="grid grid-cols-2 gap-3">
    <div className="border border-white/10 bg-white/5 p-3">
      <dt className="flex items-center gap-1 text-slate-400">
        <TimerReset size={13} /> 실행
      </dt>
      <dd className="mt-1 text-lg font-semibold text-white">{node.activeRunCount}</dd>
    </div>
    <div className="border border-white/10 bg-white/5 p-3">
      <dt className="flex items-center gap-1 text-slate-400">
        <ShieldCheck size={13} /> 승인
      </dt>
      <dd className="mt-1 text-lg font-semibold text-white">
        {node.pendingApprovalCount}
      </dd>
    </div>
  </dl>
</div>
~~~

Keep the existing `보유 능력` list and `formatDateTime` last-activity line below this block. Do not add editable model, persona, or tool controls.

- [ ] **Step 6: Run panel tests**

Run:

~~~bash
rtk npm exec --workspace=apps/web vitest -- run src/app/agent-os/components/AgentOfficePanels.spec.tsx
~~~

Expected: PASS.

- [ ] **Step 7: Commit the office panels**

~~~bash
rtk git add apps/web/src/app/agent-os/components/AgentOfficeHeader.tsx apps/web/src/app/agent-os/components/AgentStaffPanel.tsx apps/web/src/app/agent-os/components/AgentOfficePanels.spec.tsx apps/web/src/app/agent-os/components/AgentInspector.tsx
rtk git commit -m "feat: align agent office control panels"
~~~

### Task 5: Replace The Synthetic Floor With A Generated Office Scene

**Files:**
- Add: `apps/web/public/agent-os/office-floor.png`
- Modify: `apps/web/src/app/agent-os/components/AgentOfficeMap.tsx`
- Modify: `apps/web/src/app/agent-os/components/AgentOfficeMap.spec.tsx`
- Modify: `apps/web/src/app/agent-os/components/AgentOfficeNode.tsx`

**Interfaces:**
- Consumes: the same node coordinates and selection callback.
- Produces: one accessible `운영 캔버스` region with a bitmap office scene and React-owned employee buttons.

- [ ] **Step 1: Replace the landmark test with a failing image-scene test**

In `AgentOfficeMap.spec.tsx`, replace `renders office landmarks around the staff avatars` with:

~~~tsx
it('renders the generated office scene behind interactive staff nodes', () => {
  render(
    <AgentOfficeMap
      nodes={nodes}
      selectedNodeId={null}
      onSelectNode={vi.fn()}
    />,
  );

  expect(screen.getByRole('region', { name: '운영 캔버스' })).toBeInTheDocument();
  expect(
    screen.getByRole('img', { name: 'Agent OS 가상 사무공간' }),
  ).toHaveAttribute('src', expect.stringContaining('office-floor.png'));
  expect(screen.getByText('대표실')).toBeInTheDocument();
  expect(screen.getByText('콘텐츠 실험실')).toBeInTheDocument();
  expect(screen.getByText('운영 광장')).toBeInTheDocument();
});
~~~

Delete the narrow-screen edge-anchor test. Desktop layout is the explicit scope.

- [ ] **Step 2: Run the map test and observe the missing-image failure**

Run:

~~~bash
rtk npm exec --workspace=apps/web vitest -- run src/app/agent-os/components/AgentOfficeMap.spec.tsx
~~~

Expected: FAIL because no office image is rendered.

- [ ] **Step 3: Generate the bitmap asset**

Invoke the `imagegen` skill and generate one 16:10 office image with this exact prompt:

~~~text
Bright isometric 3D virtual office for an AI e-commerce operations team, clean white tile floor, open central operations plaza, private manager office in the upper left, content experiment lab in the upper right, sourcing desks in the lower left, product listing desks in the center, order and channel registration desks in the lower right, a few green indoor trees and planters, visible desks monitors shelves and walkways, polished game-like digital twin aesthetic, soft daylight, saturated cyan green indigo and coral accents, no people, no avatars, no text, no logos, no UI panels, no dark vignette, full scene visible, orthographic camera, 16:10 landscape.
~~~

Save the selected output as:

~~~text
apps/web/public/agent-os/office-floor.png
~~~

Reject outputs with baked-in labels, people, unreadable furniture, or a cropped floor edge.

- [ ] **Step 4: Render the asset and simplify the scene markup**

Replace `AgentOfficeMap.tsx` with:

~~~tsx
'use client';

import Image from 'next/image';
import { cn } from '@/lib/utils';
import { AgentOfficeNode } from './AgentOfficeNode';
import type { AgentOfficeNode as AgentOfficeNodeModel } from '../lib/agent-office-model';

const LANDMARKS = [
  { label: '대표실', className: 'left-[26%] top-[15%]' },
  { label: '콘텐츠 실험실', className: 'right-[25%] top-[18%]' },
  { label: '운영 광장', className: 'left-1/2 top-[54%] -translate-x-1/2' },
] as const;

export function AgentOfficeMap({
  nodes,
  selectedNodeId,
  onSelectNode,
  className,
}: {
  nodes: AgentOfficeNodeModel[];
  selectedNodeId: string | null;
  onSelectNode: (id: string) => void;
  className?: string;
}) {
  return (
    <section
      aria-label="운영 캔버스"
      className={cn('relative min-h-[720px] overflow-hidden bg-slate-100', className)}
    >
      <Image
        src="/agent-os/office-floor.png"
        alt="Agent OS 가상 사무공간"
        fill
        priority
        sizes="100vw"
        className="object-cover object-center"
      />
      <div className="absolute inset-0 bg-white/10" />
      {LANDMARKS.map((landmark) => (
        <span
          key={landmark.label}
          className={
            'absolute rounded-md bg-slate-950/80 px-2 py-1 text-[11px] font-semibold text-white shadow-lg backdrop-blur ' +
            landmark.className
          }
        >
          {landmark.label}
        </span>
      ))}
      <div className="absolute inset-y-0 left-[20%] right-[20%]">
        {nodes.map((node) => (
          <AgentOfficeNode
            key={node.id}
            node={node}
            selected={selectedNodeId === node.id}
            onSelect={onSelectNode}
          />
        ))}
      </div>
    </section>
  );
}
~~~

In `AgentOfficeNode.tsx`, keep the fixed `h-[96px] w-[142px]` hit area and remove only the mobile edge-specific branches from `nodePositionStyle`:

~~~ts
function nodePositionStyle(x: number, y: number) {
  return {
    left: x + '%',
    top: y + '%',
    marginLeft: '-71px',
    marginTop: '-37px',
  };
}
~~~

- [ ] **Step 5: Run map tests**

Run:

~~~bash
rtk npm exec --workspace=apps/web vitest -- run src/app/agent-os/components/AgentOfficeMap.spec.tsx
~~~

Expected: PASS and employee selection remains covered.

- [ ] **Step 6: Commit the office scene**

~~~bash
rtk git add apps/web/public/agent-os/office-floor.png apps/web/src/app/agent-os/components/AgentOfficeMap.tsx apps/web/src/app/agent-os/components/AgentOfficeMap.spec.tsx apps/web/src/app/agent-os/components/AgentOfficeNode.tsx
rtk git commit -m "feat: add digital twin office scene"
~~~

### Task 6: Compose The Reference-Aligned Shell And Hide Technical Activity

**Files:**
- Modify: `apps/web/src/app/agent-os/components/AgentActivityDrawer.tsx`
- Modify: `apps/web/src/app/agent-os/components/AgentOfficeShell.tsx`
- Modify: `apps/web/src/app/agent-os/components/AgentOfficeShell.spec.tsx`
- Modify: `apps/web/src/app/agent-os/__tests__/page.spec.tsx`
- Delete: `apps/web/src/app/agent-os/components/AgentStatusRail.tsx`

**Interfaces:**
- Consumes: existing `AgentOfficeShell` props without changing `page.tsx`.
- Produces: top header, left staffing, right inspector, full-bleed office, bottom command dock, and opt-in system activity overlay.

- [ ] **Step 1: Write the failing shell interaction test**

Change the test import to include `fireEvent`:

~~~ts
import { fireEvent, render, screen } from '@testing-library/react';
~~~

Replace the first shell test with:

~~~tsx
it('renders the office-first hierarchy and keeps system activity hidden by default', () => {
  const activityModel: AgentOfficeViewModel = {
    ...model,
    activities: [
      {
        id: 'cost-1',
        kind: 'cost',
        label: 'codex-local 42µ',
        status: 'preview-model',
        occurredAt: '2026-07-09T00:00:00.000Z',
        agentInstanceId: 'agent-manager',
      },
    ],
  };

  render(
    <AgentOfficeShell
      model={activityModel}
      selectedNodeId="agent-manager"
      command=""
      commandPending={false}
      refreshing={false}
      onSelectNode={vi.fn()}
      onCommandChange={vi.fn()}
      onSubmitCommand={vi.fn()}
      onRefresh={vi.fn()}
    />,
  );

  expect(screen.getByRole('banner')).toHaveTextContent('Agent OS 사무실');
  expect(
    screen.getByRole('complementary', { name: '인력 배치' }),
  ).toBeInTheDocument();
  expect(
    screen.getByRole('complementary', { name: '직원 프로필' }),
  ).toBeInTheDocument();
  expect(
    screen.getByRole('region', { name: '선택 직원 업무 지시' }),
  ).toHaveTextContent('운영 총괄');
  expect(
    screen.queryByRole('region', { name: '시스템 활동 기록' }),
  ).not.toBeInTheDocument();

  fireEvent.click(
    screen.getByRole('button', { name: '시스템 활동 기록 열기' }),
  );
  expect(
    screen.getByRole('region', { name: '시스템 활동 기록' }),
  ).toHaveTextContent('codex-local 42µ');
});
~~~

Retain the null-selection test, but assert both the inspector and command dock show their no-selection copy.

- [ ] **Step 2: Run the shell test and observe hierarchy failures**

Run:

~~~bash
rtk npm exec --workspace=apps/web vitest -- run src/app/agent-os/components/AgentOfficeShell.spec.tsx
~~~

Expected: FAIL because the old shell always renders `실시간 로그`, has the nested `StaffPanel`, and does not render the command dock.

- [ ] **Step 3: Clarify the activity drawer**

Change the section contract and add a heading/empty state:

~~~tsx
<section
  id="agent-system-activity"
  aria-label="시스템 활동 기록"
  className="max-h-[240px] overflow-auto rounded-lg border border-white/15 bg-slate-950/85 text-white shadow-xl shadow-black/25 backdrop-blur-xl"
>
  <div className="sticky top-0 border-b border-white/10 bg-slate-950/95 px-3 py-2">
    <h2 className="text-xs font-semibold">시스템 활동 기록</h2>
    <p className="mt-0.5 text-[11px] text-slate-400">
      실행 · 승인 · 비용 · 권한 이벤트
    </p>
  </div>
  {activities.length === 0 ? (
    <p className="px-3 py-5 text-center text-xs text-slate-400">
      기록된 시스템 활동이 없습니다.
    </p>
  ) : (
    <ul className="divide-y divide-white/10">
      {activities.slice(0, 8).map((activity) => (
        <li
          key={activity.kind + ':' + activity.id}
          className="flex items-center gap-3 px-3 py-2 text-xs"
        >
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-white/10 text-cyan-100">
            <ActivityIcon kind={activity.kind} />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate font-medium text-white">
              {activity.label}
            </span>
            <span className="block truncate text-slate-400">
              {activity.status} · {formatDateTime(activity.occurredAt)}
            </span>
          </span>
        </li>
      ))}
    </ul>
  )}
</section>
~~~

- [ ] **Step 4: Replace shell composition**

Remove the nested `StaffPanel`, gradient page background, direct `AgentCommandBar`, and always-visible activity block. Replace `AgentOfficeShell` with this composition:

~~~tsx
'use client';

import { useState } from 'react';
import { AgentActivityDrawer } from './AgentActivityDrawer';
import { AgentCommandDock } from './AgentCommandDock';
import { AgentInspector } from './AgentInspector';
import { AgentOfficeHeader } from './AgentOfficeHeader';
import { AgentOfficeMap } from './AgentOfficeMap';
import { AgentStaffPanel } from './AgentStaffPanel';
import type { AgentOfficeViewModel } from '../lib/agent-office-model';

export function AgentOfficeShell({
  model,
  selectedNodeId,
  command,
  commandPending,
  refreshing,
  onSelectNode,
  onCommandChange,
  onSubmitCommand,
  onRefresh,
}: {
  model: AgentOfficeViewModel;
  selectedNodeId: string | null;
  command: string;
  commandPending: boolean;
  refreshing: boolean;
  onSelectNode: (id: string) => void;
  onCommandChange: (value: string) => void;
  onSubmitCommand: () => void;
  onRefresh: () => void;
}) {
  const [activityOpen, setActivityOpen] = useState(false);
  const selectedNode =
    selectedNodeId === null
      ? null
      : model.nodes.find((node) => node.id === selectedNodeId) ?? null;

  return (
    <div className="min-h-screen min-w-[1080px] overflow-hidden bg-slate-950 text-white">
      <div className="flex min-h-screen flex-col gap-3 p-3">
        <AgentOfficeHeader
          totals={model.totals}
          refreshing={refreshing}
          activityOpen={activityOpen}
          onRefresh={onRefresh}
          onToggleActivity={() => setActivityOpen((open) => !open)}
        />
        <main className="relative min-h-[calc(100vh-80px)] flex-1 overflow-hidden rounded-lg border border-white/20 bg-slate-100 shadow-2xl shadow-black/25">
          <AgentOfficeMap
            className="absolute inset-0 min-h-full"
            nodes={model.nodes}
            selectedNodeId={selectedNodeId}
            onSelectNode={onSelectNode}
          />
          <div className="absolute left-4 top-4 z-20 w-[272px]">
            <AgentStaffPanel
              model={model}
              selectedNodeId={selectedNodeId}
              onSelectNode={onSelectNode}
            />
          </div>
          <div className="absolute right-4 top-4 z-20 w-[340px]">
            <AgentInspector node={selectedNode} />
          </div>
          {activityOpen ? (
            <div className="absolute left-1/2 top-4 z-30 w-[560px] -translate-x-1/2">
              <AgentActivityDrawer activities={model.activities} />
            </div>
          ) : null}
          <div className="absolute bottom-4 left-1/2 z-20 w-[680px] -translate-x-1/2">
            <AgentCommandDock
              node={selectedNode}
              value={command}
              pending={commandPending}
              onChange={onCommandChange}
              onSubmit={onSubmitCommand}
            />
          </div>
        </main>
      </div>
    </div>
  );
}
~~~

- [ ] **Step 5: Update the canonical page test**

In `page.spec.tsx`, replace the old title and panel assertions with:

~~~ts
expect(screen.getByText('Agent OS 사무실')).toBeInTheDocument();
expect(
  screen.getByRole('complementary', { name: '인력 배치' }),
).toBeInTheDocument();
expect(
  screen.getByRole('region', { name: '선택 직원 업무 지시' }),
).toBeInTheDocument();
expect(
  screen.queryByRole('region', { name: '시스템 활동 기록' }),
).not.toBeInTheDocument();
~~~

- [ ] **Step 6: Delete the unused status rail and run shell/page tests**

Delete `AgentStatusRail.tsx`, then run:

~~~bash
rtk npm exec --workspace=apps/web vitest -- run src/app/agent-os/components/AgentOfficeShell.spec.tsx src/app/agent-os/__tests__/page.spec.tsx
~~~

Expected: PASS. The activity region appears only after the header toggle is clicked.

- [ ] **Step 7: Commit the final shell hierarchy**

~~~bash
rtk git add apps/web/src/app/agent-os/components/AgentActivityDrawer.tsx apps/web/src/app/agent-os/components/AgentOfficeShell.tsx apps/web/src/app/agent-os/components/AgentOfficeShell.spec.tsx apps/web/src/app/agent-os/__tests__/page.spec.tsx
rtk git add -u apps/web/src/app/agent-os/components/AgentStatusRail.tsx
rtk git commit -m "feat: make agent office interaction first"
~~~

### Task 7: Verify Desktop Visual And Behavioral Acceptance

**Files:**
- Verify only: `apps/web/src/app/agent-os/**`
- Verify only: `apps/web/public/agent-os/office-floor.png`

**Interfaces:**
- Consumes: completed Tasks 1-6 and the existing authenticated development session.
- Produces: passing tests/build plus desktop visual evidence; no repository artifact is created in this task.

- [ ] **Step 1: Run the complete route-local suite**

~~~bash
rtk npm exec --workspace=apps/web vitest -- run src/app/agent-os
~~~

Expected: all `agent-os` test files PASS.

- [ ] **Step 2: Run the legacy redirect and layout regression tests**

~~~bash
rtk npm exec --workspace=apps/web vitest -- run src/app/'(automation)'/agents src/components/layout/__tests__/AppLayout.auth.spec.tsx
~~~

Expected: `/agents` remains redirect-only and fullscreen `/agent-os` layout tests PASS.

- [ ] **Step 3: Build the web app**

~~~bash
rtk npm run build --workspace=apps/web
~~~

Expected: Next.js production build exits 0.

- [ ] **Step 4: Check formatting and unintended file damage**

~~~bash
rtk git diff --check
rtk git status --short
~~~

Expected: `git diff --check` exits 0. Status shows only the intended Agent OS work plus pre-existing unrelated changes.

- [ ] **Step 5: Verify the authenticated desktop flow in the in-app browser**

Use the existing authenticated development session and the `browser:control-in-app-browser` skill. Open `http://localhost:3000/agent-os` at `1098x935`, then `1440x900`, and verify all of the following:

1. The bright office image is the dominant surface; no dark gradient or decorative orb fills the page.
2. The top header, `인력 배치`, employee profile, and command dock fit without overlap.
3. The technical activity list is absent on first render.
4. Clicking `시스템 활동 기록` opens the labeled activity panel and clicking again closes it.
5. Clicking `소싱 담당` updates the map selection, inspector, selected-employee context, placeholder, and quick commands together.
6. Clicking a quick command fills the input without submitting immediately.
7. Sending a selected non-manager command produces one Operator conversation mutation with the target hint; it does not create a direct employee run from the browser.
8. The `대시보드` link remains visible and points to `/dashboard`.
9. No clipped employee labels, hidden send button, horizontal text overflow, runtime console error, or failed asset request appears.

Capture comparison screenshots to `/tmp/agent-os-office-1098x935.png` and `/tmp/agent-os-office-1440x900.png`; do not add them to git.

- [ ] **Step 6: Make only evidence-driven visual corrections**

If verification reveals overlap, adjust only these fixed layout values and rerun Steps 1, 3, and 5:

~~~text
AgentOfficeShell: left panel width 272px, right panel width 340px, command dock width 680px
AgentOfficeMap: interactive node plane left/right inset 20%
AgentOfficeNode: fixed 142px by 96px hit area
~~~

Do not add responsive mobile branches or new backend settings while correcting desktop layout.

- [ ] **Step 7: Commit verified visual corrections if Step 6 changed files**

~~~bash
rtk git add apps/web/src/app/agent-os apps/web/public/agent-os/office-floor.png
rtk git commit -m "fix: polish agent office desktop layout"
~~~

Skip this commit only when Step 6 made no changes.

## Self-Review

- Spec coverage: Tasks 3-6 implement the reference hierarchy: office-first canvas, staffing left rail, factual inspector, selected employee context, quick commands, command input, top controls, and hidden technical activity. Task 2 ensures employee selection changes the real Operator message rather than only changing presentation.
- Scope coverage: No backend, schema, route ownership, mobile, hiring, guest, persona-editing, model-editing, or direct employee-run work is included.
- Placeholder scan: The plan contains no deferred implementation markers; every test and implementation step defines concrete interfaces, code, commands, and expected outcomes.
- Type consistency: `AgentOfficeNode` runtime fields introduced in Task 1 are used unchanged by Tasks 3-5. `AgentCommandDock` and `AgentCommandBar` prop names match their shell composition. Activity IDs and ARIA labels match between header, drawer, and shell tests.
