# Agent OS Dashboard Light Theme Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Convert every Agent OS operational surface from the hard-coded dark treatment to the approved Dashboard-style light theme without changing layout, data, or interaction behavior.

**Architecture:** Keep the existing component boundaries and replace only visual Tailwind classes. Lock the light theme through component-level class contracts, then run the existing Agent OS behavior suite and desktop browser comparison to prove the canvas and controls are unchanged.

**Tech Stack:** React 19, TypeScript, Tailwind CSS 3, Vitest, React Testing Library, Next.js 16, and the in-app browser.

## Global Constraints

- `/agent-os` is an explicitly light fullscreen surface.
- Page background is `slate-50`; operational surfaces are white with `slate-200` borders and `shadow-sm`.
- Primary text is `slate-900`; secondary text is `slate-600`; muted text is `slate-500` or `slate-400`.
- Selection and primary actions use Dashboard purple: `purple-50`, `purple-300`, `purple-600`, and `purple-700`.
- Employee status colors and the existing indigo Agent OS icon remain unchanged.
- Remove dark translucent surfaces, `bg-slate-950`, `bg-black/35`, `border-white/*`, `text-white` used as body text, `shadow-black/*`, and `backdrop-blur` from operational panels.
- Do not change layout, canvas math, floor geometry, employee positions, data, copy, accessible names, or behavior.
- Do not add a theme toggle, dark variant, backend change, dependency, or mobile work.
- Work in the existing dirty branch and stage only files listed in this plan.
- Prefix every shell command with `rtk`.

---

## File Structure

- Modify `apps/web/src/app/agent-os/components/AgentOfficeShell.tsx`
  - Owns the light page background and light canvas frame.
- Modify `apps/web/src/app/agent-os/components/AgentOfficeHeader.tsx`
  - Converts header, counters, and navigation controls to Dashboard light surfaces.
- Modify `apps/web/src/app/agent-os/components/AgentStaffPanel.tsx`
  - Converts staffing surface and selected row to light purple selection.
- Modify `apps/web/src/app/agent-os/components/AgentInspector.tsx`
  - Converts profile metadata, metrics, capabilities, and empty state.
- Modify `apps/web/src/app/agent-os/components/AgentActivityDrawer.tsx`
  - Converts activity header, rows, icon tiles, and metadata.
- Modify `apps/web/src/app/agent-os/components/AgentCommandDock.tsx`
  - Converts target summary and quick commands.
- Modify `apps/web/src/app/agent-os/components/AgentCommandBar.tsx`
  - Converts the input and send button.
- Modify `apps/web/src/app/agent-os/components/AgentOfficePanels.spec.tsx`
  - Locks header, staff, selection, and profile light classes.
- Modify `apps/web/src/app/agent-os/components/AgentOfficeShell.spec.tsx`
  - Locks root, activity, and command light classes.
- Modify `apps/web/src/app/agent-os/components/AgentCommandBar.spec.tsx`
  - Locks light input and purple enabled action styles.

---

### Task 1: Convert The Complete Agent OS Shell To Dashboard Light Surfaces

**Files:**
- Modify: `apps/web/src/app/agent-os/components/AgentOfficePanels.spec.tsx`
- Modify: `apps/web/src/app/agent-os/components/AgentOfficeShell.spec.tsx`
- Modify: `apps/web/src/app/agent-os/components/AgentCommandBar.spec.tsx`
- Modify: `apps/web/src/app/agent-os/components/AgentOfficeShell.tsx`
- Modify: `apps/web/src/app/agent-os/components/AgentOfficeHeader.tsx`
- Modify: `apps/web/src/app/agent-os/components/AgentStaffPanel.tsx`
- Modify: `apps/web/src/app/agent-os/components/AgentInspector.tsx`
- Modify: `apps/web/src/app/agent-os/components/AgentActivityDrawer.tsx`
- Modify: `apps/web/src/app/agent-os/components/AgentCommandDock.tsx`
- Modify: `apps/web/src/app/agent-os/components/AgentCommandBar.tsx`

**Interfaces:**
- Consumes: the existing component props and semantic status classes.
- Produces: unchanged React component signatures with Dashboard light class contracts.

- [ ] **Step 1: Write failing light-theme class tests**

Add to `AgentOfficePanels.spec.tsx`:

```tsx
it('uses Dashboard light surfaces and purple staff selection', () => {
  render(
    <>
      <AgentOfficeHeader
        totals={totals}
        refreshing={false}
        activityOpen={false}
        onRefresh={vi.fn()}
        onToggleActivity={vi.fn()}
      />
      <AgentStaffPanel
        model={{ nodes: [node], capabilities: [], activities: [], totals }}
        selectedNodeId="agent-manager"
        onSelectNode={vi.fn()}
      />
      <AgentInspector node={node} />
    </>,
  );

  const header = screen.getByRole('banner');
  const staff = screen.getByRole('complementary', { name: '인력 배치' });
  const profile = screen.getByRole('complementary', { name: '직원 프로필' });
  const selectedStaff = screen.getByRole('button', { name: /운영 총괄/ });

  expect(header.className).toContain('bg-white');
  expect(header.className).toContain('border-slate-200');
  expect(staff.className).toContain('bg-white');
  expect(profile.className).toContain('bg-white');
  expect(selectedStaff.className).toContain('bg-purple-50');
  expect([header, staff, profile].every((element) =>
    !element.className.includes('bg-slate-950'),
  )).toBe(true);
});
```

In the first `AgentOfficeShell.spec.tsx` test, after activity opens, add:

```tsx
const themeRoot = screen.getByTestId('agent-office-theme-root');
const activity = screen.getByRole('region', { name: '시스템 활동 기록' });
const commandDock = screen.getByRole('region', {
  name: '선택 직원 업무 지시',
});

expect(themeRoot.className).toContain('bg-slate-50');
expect(themeRoot.className).toContain('text-slate-900');
expect(activity.className).toContain('bg-white');
expect(commandDock.className).toContain('bg-white');
```

Add to `AgentCommandBar.spec.tsx`:

```tsx
it('uses a light input and Dashboard primary send action', () => {
  render(
    <AgentCommandBar
      targetName="소싱 담당"
      value="소싱 현황 알려줘"
      pending={false}
      onChange={vi.fn()}
      onSubmit={vi.fn()}
    />,
  );

  expect(screen.getByRole('textbox', { name: '업무 지시 입력' }).className)
    .toContain('bg-slate-50');
  expect(screen.getByRole('button', { name: '전송' }).className)
    .toContain('bg-purple-600');
});
```

- [ ] **Step 2: Run the focused tests and observe the dark-theme failures**

```bash
rtk npm exec --workspace=apps/web vitest -- run src/app/agent-os/components/AgentOfficePanels.spec.tsx src/app/agent-os/components/AgentOfficeShell.spec.tsx src/app/agent-os/components/AgentCommandBar.spec.tsx
```

Expected: FAIL because the root and panels still use dark classes and the theme root test id does not exist.

- [ ] **Step 3: Apply the exact light class contract**

Use these exact surface classes:

```text
AgentOfficeShell root
  min-h-screen min-w-[1080px] overflow-hidden bg-slate-50 text-slate-900

AgentOfficeShell canvas frame
  min-h-0 overflow-hidden rounded-lg border border-slate-200 bg-slate-100 shadow-sm

AgentOfficeHeader
  flex h-14 items-center justify-between gap-3 rounded-lg border border-slate-200 bg-white px-3 text-slate-900 shadow-sm

AgentStaffPanel
  max-h-[calc(100vh-140px)] overflow-auto rounded-lg border border-slate-200 bg-white p-4 text-slate-900 shadow-sm

AgentInspector
  max-h-[calc(100vh-140px)] overflow-auto rounded-lg border border-slate-200 bg-white p-4 text-slate-900 shadow-sm

AgentActivityDrawer
  max-h-[240px] overflow-auto rounded-lg border border-slate-200 bg-white text-slate-900 shadow-sm

AgentCommandDock
  rounded-lg border border-slate-200 bg-white px-3 py-3 text-slate-900 shadow-sm
```

Add `data-testid="agent-office-theme-root"` to the AgentOfficeShell root.

Use these exact state replacements throughout the listed components:

```text
border-white/15 or border-white/10 -> border-slate-200 or border-slate-100
bg-slate-950/*                    -> bg-white
bg-white/5 or bg-white/10         -> bg-slate-50 or bg-slate-100
text-white body/value text        -> text-slate-900
text-slate-100/200/300            -> text-slate-700 or text-slate-600
text-slate-400 secondary text     -> text-slate-500
text-cyan-100/200                 -> text-purple-600
shadow-xl/2xl shadow-black/*      -> shadow-sm
backdrop-blur-xl                  -> remove
```

Use these exact interaction classes:

```text
selected staff row
  border-purple-300 bg-purple-50 text-purple-900

unselected staff row
  border-slate-200 bg-white text-slate-700 hover:bg-slate-50

header icon buttons
  border-slate-200 text-slate-600 hover:bg-slate-100 hover:text-slate-900

quick command buttons
  border-slate-200 bg-white text-slate-600 hover:bg-slate-50 hover:text-slate-900

command input
  border-slate-200 bg-slate-50 text-slate-900 placeholder:text-slate-400 focus:border-purple-400 focus:ring-2 focus:ring-purple-100

enabled send button
  border-purple-600 bg-purple-600 text-white hover:bg-purple-700

disabled send button
  border-slate-200 bg-slate-100 text-slate-400
```

Keep status dots and avatar status classes unchanged.

- [ ] **Step 4: Run focused tests and ESLint**

```bash
rtk npm exec --workspace=apps/web vitest -- run src/app/agent-os/components/AgentOfficePanels.spec.tsx src/app/agent-os/components/AgentOfficeShell.spec.tsx src/app/agent-os/components/AgentCommandBar.spec.tsx
rtk npm exec --workspace=apps/web eslint -- src/app/agent-os/components/AgentOfficeShell.tsx src/app/agent-os/components/AgentOfficeHeader.tsx src/app/agent-os/components/AgentStaffPanel.tsx src/app/agent-os/components/AgentInspector.tsx src/app/agent-os/components/AgentActivityDrawer.tsx src/app/agent-os/components/AgentCommandDock.tsx src/app/agent-os/components/AgentCommandBar.tsx
```

Expected: all focused tests and ESLint pass.

- [ ] **Step 5: Run regression and browser gates**

```bash
rtk npm exec --workspace=apps/web vitest -- run src/app/agent-os
rtk npm run build --workspace=apps/web
```

Verify `/agent-os` in the in-app browser at `1098x935` and `1440x900`. Capture Dashboard and Agent OS and inspect them in one comparison input. Confirm all operational panels are white/light, no dark fragments remain, all seven employees stay visible, and drag, zoom, selection, activity, presets, refresh, and dashboard navigation still work.

- [ ] **Step 6: Commit the theme conversion**

```bash
rtk git add apps/web/src/app/agent-os/components/AgentOfficeShell.tsx apps/web/src/app/agent-os/components/AgentOfficeHeader.tsx apps/web/src/app/agent-os/components/AgentStaffPanel.tsx apps/web/src/app/agent-os/components/AgentInspector.tsx apps/web/src/app/agent-os/components/AgentActivityDrawer.tsx apps/web/src/app/agent-os/components/AgentCommandDock.tsx apps/web/src/app/agent-os/components/AgentCommandBar.tsx apps/web/src/app/agent-os/components/AgentOfficePanels.spec.tsx apps/web/src/app/agent-os/components/AgentOfficeShell.spec.tsx apps/web/src/app/agent-os/components/AgentCommandBar.spec.tsx
rtk git diff --cached --check
rtk git commit -m "style: align agent office with dashboard theme"
```
