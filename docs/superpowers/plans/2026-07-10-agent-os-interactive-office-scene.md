# Agent OS Interactive Office Scene Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (- [ ]) syntax for tracking.

**Goal:** Replace the static /agent-os office photograph with an OpenClaw-inspired light 2D office scene whose desks, employees, status transitions, and activity bubbles are driven by existing KidItem Agent OS data.

**Architecture:** Keep AgentOfficeShell and the existing React Query/business projection intact, but remove presentation coordinates from AgentOfficeNode. A route-local scene manifest owns normalized seats, zones, status destinations, motion paths, and avatar assets; AgentOfficeMap composes a code-driven SVG floor, semantic desk/zone controls, and employee avatar controls. Status changes animate with the Web Animations API, while initial render, repeated poll data, offline employees, and reduced-motion users skip animation.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, Tailwind CSS 3, SVG, Next Image, lucide-react, Web Animations API, Vitest, React Testing Library, built-in ImageGen, in-app browser desktop QA.

**Implementation Revision (2026-07-10):** Direct source inspection confirmed that OpenClaw Office composes its runtime floor and furniture from SVG components rather than using `assets/office.png` as a background. The user chose to benchmark that interaction model. Task 2 therefore uses a KidItem-specific SVG floor with the upstream MIT notice, while generated bitmaps remain limited to individual employee portraits.

## Global Constraints

- Canonical route remains /agent-os; /agents remains redirect-only.
- Benchmark only OpenClaw Office's light 2D background style and scene interactions.
- Do not copy OpenClaw branding, labels, navigation, analytics, Agent/SubAgent semantics, or product content. Keep the MIT notice beside the SVG scene implementation that benchmarks the upstream composition approach.
- Keep the existing Agent OS shell, staff panel, inspector, command dock, activity drawer, refresh action, dashboard navigation, APIs, and React Query polling intervals.
- The seven employee types are manager, ad_strategy, chat, sourcing, listing, order, and channel_registration; models, capabilities, adapters, tools, runs, and sessions never become employee avatars.
- Do not add backend, Prisma, shared-contract, Hermes runtime, schema, migration, WebSocket, or SSE changes.
- Do not add React Flow, Three.js, PixiJS, Phaser, or another scene/game dependency.
- Use a code-driven SVG floor and furniture layer, generated transparent avatar assets, and semantic HTML controls for interaction.
- Motion occurs only after a structured AgentOfficeNode.status transition; never add random wandering, fake conversations, or inferred collaboration.
- Initial render, unchanged poll data, offline status, and prefers-reduced-motion must not animate.
- V1 has no drag reassignment, layout editor, pan, zoom, camera rotation, mobile, or touch-specific work.
- Use KidItem design tokens for controls: purple selection, green ready, amber waiting, red blocked, and slate offline.
- Use lucide-react for interface icons; do not use emoji, CSS art, handcrafted decorative SVG, or placeholder avatar boxes.
- Work in the existing dirty branch and never stage, revert, or rewrite unrelated user changes.
- Follow TDD for behavior: failing test, observed failure, minimal implementation, passing test, focused commit.
- Prefix every shell command with rtk.
- Required final gates are focused Agent OS tests, the full Agent OS route test set, and rtk npm run build --workspace=apps/web.
- Desktop visual QA only at 1098x935 and 1440x900 using the in-app browser.

---

## File Structure

- Create apps/web/src/app/agent-os/lib/agent-office-layout.ts
  - Owns normalized office zones, known seats, overflow seats, avatar paths, status destinations, and motion-point resolution.
- Create apps/web/src/app/agent-os/lib/agent-office-layout.spec.ts
  - Locks seven known seats, deterministic overflow, destination mapping, and path endpoints.
- Modify apps/web/src/app/agent-os/lib/agent-office-model.ts
  - Removes x/y presentation coordinates from AgentOfficeNode and node projection.
- Modify apps/web/src/app/agent-os/lib/agent-office-model.spec.ts
  - Replaces coordinate assertions with a business-model boundary assertion.
- Modify AgentOfficeNode fixtures in:
  - apps/web/src/app/agent-os/__tests__/page.spec.tsx
  - apps/web/src/app/agent-os/components/AgentCommandDock.spec.tsx
  - apps/web/src/app/agent-os/components/AgentOfficeMap.spec.tsx
  - apps/web/src/app/agent-os/components/AgentOfficePanels.spec.tsx
  - apps/web/src/app/agent-os/components/AgentOfficeShell.spec.tsx
- Add apps/web/public/agent-os/avatars/manager.png
- Add apps/web/public/agent-os/avatars/ad-strategy.png
- Add apps/web/public/agent-os/avatars/chat.png
- Add apps/web/public/agent-os/avatars/sourcing.png
- Add apps/web/public/agent-os/avatars/listing.png
- Add apps/web/public/agent-os/avatars/order.png
- Add apps/web/public/agent-os/avatars/channel-registration.png
- Add apps/web/public/agent-os/avatars/default.png
  - Transparent, individually generated employee portraits with a common visual system.
- Create apps/web/src/app/agent-os/components/AgentOfficeFloor.tsx
  - Renders the SVG floor, seven fixtures, inspectable zones, and selectable desk hit regions.
- Create apps/web/src/app/agent-os/components/AgentOfficeFloor.spec.tsx
  - Verifies SVG composition, seven fixtures, zone selection, and desk selection.
- Create apps/web/src/app/agent-os/components/AgentOfficeAvatar.tsx
  - Renders generated avatar, status, label, selection, activity bubble, and status-change motion.
- Create apps/web/src/app/agent-os/components/AgentOfficeAvatar.spec.tsx
  - Verifies initial stability, one transition per status change, reduced motion, bubble timeout, selection, and avatar fallback.
- Modify apps/web/src/app/agent-os/components/AgentOfficeMap.tsx
  - Composes floor and avatar layers and maps latest safe activity labels to employees.
- Modify apps/web/src/app/agent-os/components/AgentOfficeMap.spec.tsx
  - Locks the new scene hierarchy and shared desk/avatar selection behavior.
- Modify apps/web/src/app/agent-os/components/AgentOfficeShell.tsx
  - Passes model.activities into AgentOfficeMap without changing shell ownership.
- Delete apps/web/src/app/agent-os/components/AgentOfficeNode.tsx
  - Replaced by AgentOfficeAvatar.
- Delete apps/web/public/agent-os/office-floor.png
  - Removes the prior isometric photograph after the new floor is wired.

## Task 1: Separate Business Projection From Scene Layout

**Files:**
- Create: apps/web/src/app/agent-os/lib/agent-office-layout.spec.ts
- Create: apps/web/src/app/agent-os/lib/agent-office-layout.ts
- Modify: apps/web/src/app/agent-os/lib/agent-office-model.spec.ts
- Modify: apps/web/src/app/agent-os/lib/agent-office-model.ts
- Modify fixtures in the five component/page test files listed in File Structure.

**Interfaces:**
- Consumes: AgentOfficeNodeStatus and employee agentType strings.
- Produces:

~~~ts
export interface OfficePoint {
  x: number;
  y: number;
}

export interface OfficeRect extends OfficePoint {
  width: number;
  height: number;
}

export interface OfficeSeat {
  id: string;
  employeeType: string;
  avatarSrc: string;
  desk: OfficePoint;
  idle: OfficePoint;
  waiting: OfficePoint;
  blocked: OfficePoint;
  paths: Partial<Record<AgentOfficeNodeStatus, OfficePoint[]>>;
}

export interface OfficeZone {
  id: 'desks' | 'meeting' | 'waiting' | 'lounge';
  label: string;
  hitRegion: OfficeRect;
}

export function getOfficeSeat(agentType: string, index: number): OfficeSeat;
export function getOfficeDestination(
  seat: OfficeSeat,
  status: AgentOfficeNodeStatus,
): OfficePoint;
export function getOfficeMotionPoints(input: {
  seat: OfficeSeat;
  fromStatus: AgentOfficeNodeStatus;
  toStatus: AgentOfficeNodeStatus;
}): OfficePoint[];
~~~

- [ ] **Step 1: Write the failing layout and model-boundary tests**

Create agent-office-layout.spec.ts:

~~~ts
import { describe, expect, it } from 'vitest';
import {
  DEFAULT_OFFICE_AVATAR_SRC,
  getOfficeDestination,
  getOfficeMotionPoints,
  getOfficeSeat,
} from './agent-office-layout';

const employeeTypes = [
  'manager',
  'ad_strategy',
  'chat',
  'sourcing',
  'listing',
  'order',
  'channel_registration',
] as const;

describe('agent office layout', () => {
  it('assigns the seven employees unique desks and role-specific avatars', () => {
    const seats = employeeTypes.map((type, index) => getOfficeSeat(type, index));
    const desks = seats.map((seat) => seat.desk.x + ':' + seat.desk.y);

    expect(new Set(desks).size).toBe(7);
    expect(seats.map((seat) => seat.employeeType)).toEqual(employeeTypes);
    expect(seats.every((seat) => seat.avatarSrc.endsWith('.png'))).toBe(true);
  });

  it('maps statuses to stable scene destinations', () => {
    const seat = getOfficeSeat('manager', 0);

    expect(getOfficeDestination(seat, 'working')).toEqual(seat.desk);
    expect(getOfficeDestination(seat, 'idle')).toEqual(seat.idle);
    expect(getOfficeDestination(seat, 'waiting')).toEqual(seat.waiting);
    expect(getOfficeDestination(seat, 'blocked')).toEqual(seat.blocked);
    expect(getOfficeDestination(seat, 'offline')).toEqual(seat.desk);
  });

  it('creates deterministic, non-overlapping overflow seats', () => {
    const first = getOfficeSeat('reviewer', 7);
    const repeated = getOfficeSeat('reviewer', 7);
    const second = getOfficeSeat('auditor', 8);

    expect(first).toEqual(repeated);
    expect(first.desk).not.toEqual(second.desk);
    expect(first.avatarSrc).toBe(DEFAULT_OFFICE_AVATAR_SRC);
  });

  it('starts and ends motion at authoritative status destinations', () => {
    const seat = getOfficeSeat('listing', 4);
    const points = getOfficeMotionPoints({
      seat,
      fromStatus: 'idle',
      toStatus: 'blocked',
    });

    expect(points[0]).toEqual(seat.idle);
    expect(points.at(-1)).toEqual(seat.blocked);
  });
});
~~~

Replace the existing coordinate test in agent-office-model.spec.ts with:

~~~ts
it('keeps presentation coordinates out of the employee business model', () => {
  const model = buildAgentOfficeModel({
    instances: [employeeInstance('manager', 'agent-manager', '운영 총괄')],
    runs: [],
    requests: [],
    approvals: [],
    conversations: [],
    costEvents: [],
    authorizationEvents: [],
    totalCostMicros: '0',
  });

  expect(model.nodes).toHaveLength(1);
  expect(model.nodes[0]).not.toHaveProperty('x');
  expect(model.nodes[0]).not.toHaveProperty('y');
});
~~~

- [ ] **Step 2: Run the focused tests and observe the expected failures**

Run:

~~~bash
rtk npm exec --workspace=apps/web vitest -- run src/app/agent-os/lib/agent-office-layout.spec.ts src/app/agent-os/lib/agent-office-model.spec.ts
~~~

Expected:
- FAIL because agent-office-layout.ts does not exist.
- FAIL because projected AgentOfficeNode objects still contain x and y.

- [ ] **Step 3: Implement the route-local scene manifest**

Create agent-office-layout.ts with this structure and the exact known employee order:

~~~ts
import type { AgentOfficeNodeStatus } from './agent-office-model';

export interface OfficePoint {
  x: number;
  y: number;
}

export interface OfficeRect extends OfficePoint {
  width: number;
  height: number;
}

export interface OfficeSeat {
  id: string;
  employeeType: string;
  avatarSrc: string;
  desk: OfficePoint;
  idle: OfficePoint;
  waiting: OfficePoint;
  blocked: OfficePoint;
  paths: Partial<Record<AgentOfficeNodeStatus, OfficePoint[]>>;
}

export interface OfficeZone {
  id: 'desks' | 'meeting' | 'waiting' | 'lounge';
  label: string;
  hitRegion: OfficeRect;
}

export const DEFAULT_OFFICE_AVATAR_SRC =
  '/agent-os/avatars/default.png';

export const OFFICE_ZONES: readonly OfficeZone[] = [
  {
    id: 'desks',
    label: '직원 업무 공간',
    hitRegion: { x: 4, y: 8, width: 58, height: 58 },
  },
  {
    id: 'meeting',
    label: '승인 및 협업 공간',
    hitRegion: { x: 64, y: 8, width: 32, height: 38 },
  },
  {
    id: 'waiting',
    label: '대기 공간',
    hitRegion: { x: 4, y: 68, width: 58, height: 27 },
  },
  {
    id: 'lounge',
    label: '공용 라운지',
    hitRegion: { x: 64, y: 50, width: 32, height: 45 },
  },
] as const;

const waitingPoints: readonly OfficePoint[] = [
  { x: 12, y: 78 },
  { x: 22, y: 78 },
  { x: 32, y: 78 },
  { x: 42, y: 78 },
  { x: 52, y: 78 },
  { x: 27, y: 88 },
  { x: 47, y: 88 },
] as const;

const blockedPoints: readonly OfficePoint[] = [
  { x: 71, y: 23 },
  { x: 79, y: 18 },
  { x: 87, y: 23 },
  { x: 71, y: 33 },
  { x: 79, y: 38 },
  { x: 87, y: 33 },
  { x: 79, y: 28 },
] as const;

function createSeat(input: {
  employeeType: string;
  index: number;
  desk: OfficePoint;
  avatarFile: string;
}): OfficeSeat {
  return {
    id: 'seat-' + input.employeeType,
    employeeType: input.employeeType,
    avatarSrc: '/agent-os/avatars/' + input.avatarFile,
    desk: input.desk,
    idle: { x: input.desk.x, y: input.desk.y + 9 },
    waiting: waitingPoints[input.index],
    blocked: blockedPoints[input.index],
    paths: {
      working: [{ x: 49, y: 53 }],
      idle: [{ x: 49, y: 53 }],
      waiting: [{ x: 49, y: 68 }],
      blocked: [{ x: 62, y: 47 }],
    },
  };
}

const knownSeats: readonly OfficeSeat[] = [
  createSeat({
    employeeType: 'manager',
    index: 0,
    desk: { x: 14, y: 20 },
    avatarFile: 'manager.png',
  }),
  createSeat({
    employeeType: 'ad_strategy',
    index: 1,
    desk: { x: 31, y: 20 },
    avatarFile: 'ad-strategy.png',
  }),
  createSeat({
    employeeType: 'chat',
    index: 2,
    desk: { x: 48, y: 20 },
    avatarFile: 'chat.png',
  }),
  createSeat({
    employeeType: 'sourcing',
    index: 3,
    desk: { x: 14, y: 49 },
    avatarFile: 'sourcing.png',
  }),
  createSeat({
    employeeType: 'listing',
    index: 4,
    desk: { x: 31, y: 49 },
    avatarFile: 'listing.png',
  }),
  createSeat({
    employeeType: 'order',
    index: 5,
    desk: { x: 48, y: 49 },
    avatarFile: 'order.png',
  }),
  createSeat({
    employeeType: 'channel_registration',
    index: 6,
    desk: { x: 58, y: 35 },
    avatarFile: 'channel-registration.png',
  }),
] as const;

const knownSeatByType = new Map(
  knownSeats.map((seat) => [seat.employeeType, seat]),
);

function overflowSeat(agentType: string, index: number): OfficeSeat {
  const ordinal = Math.max(0, index - knownSeats.length);
  const desk = {
    x: 12 + (ordinal % 5) * 10,
    y: 91 + Math.floor(ordinal / 5) * 4,
  };

  return {
    id: 'seat-overflow-' + agentType + '-' + ordinal,
    employeeType: agentType,
    avatarSrc: DEFAULT_OFFICE_AVATAR_SRC,
    desk,
    idle: desk,
    waiting: desk,
    blocked: desk,
    paths: {},
  };
}

export function getOfficeSeat(agentType: string, index: number): OfficeSeat {
  return knownSeatByType.get(agentType) ?? overflowSeat(agentType, index);
}

export function getOfficeDestination(
  seat: OfficeSeat,
  status: AgentOfficeNodeStatus,
): OfficePoint {
  if (status === 'idle') return seat.idle;
  if (status === 'waiting') return seat.waiting;
  if (status === 'blocked') return seat.blocked;
  return seat.desk;
}

export function getOfficeMotionPoints(input: {
  seat: OfficeSeat;
  fromStatus: AgentOfficeNodeStatus;
  toStatus: AgentOfficeNodeStatus;
}): OfficePoint[] {
  return [
    getOfficeDestination(input.seat, input.fromStatus),
    ...(input.seat.paths[input.toStatus] ?? []),
    getOfficeDestination(input.seat, input.toStatus),
  ];
}
~~~

- [ ] **Step 4: Remove presentation coordinates from the business model**

Delete x and y from AgentOfficeNode:

~~~ts
export interface AgentOfficeNode {
  id: string;
  name: string;
  agentType: string;
  title: string | null;
  displayName: string;
  responsibility: string;
  status: AgentOfficeNodeStatus;
  activeRunCount: number;
  pendingApprovalCount: number;
  lastActivityAt: string | null;
  trustLevel: number;
  adapterType: string;
  effectiveModel: string;
  capabilities: AgentOfficeCapability[];
}
~~~

Delete OFFICE_POSITIONS and OFFICE_POSITION_BY_AGENT_TYPE. In the employeeUnits map, remove the position lookup and return this business-only shape:

~~~ts
return {
  id: unit.id,
  name: unit.name,
  agentType: unit.agentType,
  title: unit.title,
  displayName: unit.displayName,
  responsibility: unit.responsibility,
  status: statusFor({
    instance: unit.instance,
    activeRunCount,
    waitingRequestCount: unit.waitingRequestCount + capabilityWaitingCount,
    pendingApprovalCount,
  }),
  activeRunCount,
  pendingApprovalCount,
  lastActivityAt: latestDate([
    unit.lastActivityAt,
    ...ownedCapabilities.map((capability) => capability.lastActivityAt),
  ]),
  trustLevel: unit.instance.trustLevel,
  adapterType: unit.instance.adapterType,
  effectiveModel: unit.instance.effectiveModel,
  capabilities: ownedCapabilities,
};
~~~

Remove only the x and y properties from AgentOfficeNode literals in:

~~~text
apps/web/src/app/agent-os/__tests__/page.spec.tsx
apps/web/src/app/agent-os/components/AgentCommandDock.spec.tsx
apps/web/src/app/agent-os/components/AgentOfficeMap.spec.tsx
apps/web/src/app/agent-os/components/AgentOfficePanels.spec.tsx
apps/web/src/app/agent-os/components/AgentOfficeShell.spec.tsx
~~~

Do not change any status, runtime, capability, or selection fixture values.

- [ ] **Step 5: Run layout, model, and type-facing component tests**

Run:

~~~bash
rtk npm exec --workspace=apps/web vitest -- run src/app/agent-os/lib/agent-office-layout.spec.ts src/app/agent-os/lib/agent-office-model.spec.ts src/app/agent-os/components/AgentCommandDock.spec.tsx src/app/agent-os/components/AgentOfficePanels.spec.tsx src/app/agent-os/components/AgentOfficeShell.spec.tsx src/app/agent-os/__tests__/page.spec.tsx
~~~

Expected: PASS.

- [ ] **Step 6: Commit the scene-model boundary**

~~~bash
rtk git add apps/web/src/app/agent-os/lib/agent-office-layout.ts apps/web/src/app/agent-os/lib/agent-office-layout.spec.ts apps/web/src/app/agent-os/lib/agent-office-model.ts apps/web/src/app/agent-os/lib/agent-office-model.spec.ts apps/web/src/app/agent-os/__tests__/page.spec.tsx apps/web/src/app/agent-os/components/AgentCommandDock.spec.tsx apps/web/src/app/agent-os/components/AgentOfficeMap.spec.tsx apps/web/src/app/agent-os/components/AgentOfficePanels.spec.tsx apps/web/src/app/agent-os/components/AgentOfficeShell.spec.tsx
rtk git commit -m "refactor: separate agent office layout"
~~~

## Task 2: Create Grounded Office Assets And Interactive Floor

**Files:**
- Create: apps/web/public/agent-os/office-floor-2d.png
- Create: apps/web/public/agent-os/avatars/manager.png
- Create: apps/web/public/agent-os/avatars/ad-strategy.png
- Create: apps/web/public/agent-os/avatars/chat.png
- Create: apps/web/public/agent-os/avatars/sourcing.png
- Create: apps/web/public/agent-os/avatars/listing.png
- Create: apps/web/public/agent-os/avatars/order.png
- Create: apps/web/public/agent-os/avatars/channel-registration.png
- Create: apps/web/public/agent-os/avatars/default.png
- Create: apps/web/src/app/agent-os/components/AgentOfficeFloor.spec.tsx
- Create: apps/web/src/app/agent-os/components/AgentOfficeFloor.tsx

**Interfaces:**
- Consumes: OfficeZone, OfficeSeat, AgentOfficeNode, and onSelectNode(id).
- Produces:

~~~ts
export interface AgentOfficeDeskPlacement {
  node: AgentOfficeNode;
  seat: OfficeSeat;
}

export function AgentOfficeFloor(props: {
  desks: AgentOfficeDeskPlacement[];
  onSelectNode: (id: string) => void;
}): React.JSX.Element;
~~~

- [ ] **Step 1: Write failing floor interaction tests**

Create AgentOfficeFloor.spec.tsx:

~~~tsx
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { AgentOfficeFloor } from './AgentOfficeFloor';
import { getOfficeSeat } from '../lib/agent-office-layout';
import type { AgentOfficeNode } from '../lib/agent-office-model';

const manager: AgentOfficeNode = {
  id: 'agent-manager',
  name: 'Operator',
  agentType: 'manager',
  title: '대표실',
  displayName: '운영 총괄',
  responsibility: '운영 우선순위, 위임, 승인 흐름을 총괄한다.',
  status: 'working',
  activeRunCount: 1,
  pendingApprovalCount: 0,
  lastActivityAt: '2026-07-09T00:00:00.000Z',
  trustLevel: 1,
  adapterType: 'hermes_local',
  effectiveModel: 'gpt-5.1-codex',
  capabilities: [],
};

describe('AgentOfficeFloor', () => {
  it('renders the grounded floor asset and selectable zones', () => {
    render(
      <AgentOfficeFloor
        desks={[{ node: manager, seat: getOfficeSeat('manager', 0) }]}
        onSelectNode={vi.fn()}
      />,
    );

    expect(screen.getByTestId('office-floor-asset')).toHaveAttribute(
      'src',
      expect.stringContaining('office-floor-2d.png'),
    );

    const meeting = screen.getByRole('button', {
      name: '승인 및 협업 공간 구역',
    });
    fireEvent.click(meeting);
    expect(meeting).toHaveAttribute('aria-pressed', 'true');
  });

  it('selects the employee assigned to a clicked desk', () => {
    const onSelectNode = vi.fn();

    render(
      <AgentOfficeFloor
        desks={[{ node: manager, seat: getOfficeSeat('manager', 0) }]}
        onSelectNode={onSelectNode}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: '운영 총괄 책상' }));
    expect(onSelectNode).toHaveBeenCalledWith('agent-manager');
  });

  it('keeps desk interaction usable when the floor asset fails', () => {
    const onSelectNode = vi.fn();

    render(
      <AgentOfficeFloor
        desks={[{ node: manager, seat: getOfficeSeat('manager', 0) }]}
        onSelectNode={onSelectNode}
      />,
    );

    fireEvent.error(screen.getByTestId('office-floor-asset'));
    expect(screen.getByTestId('office-floor-fallback')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '운영 총괄 책상' }));
    expect(onSelectNode).toHaveBeenCalledWith('agent-manager');
  });
});
~~~

- [ ] **Step 2: Run the floor test and observe the missing-component failure**

Run:

~~~bash
rtk npm exec --workspace=apps/web vitest -- run src/app/agent-os/components/AgentOfficeFloor.spec.tsx
~~~

Expected: FAIL because AgentOfficeFloor.tsx does not exist.

- [ ] **Step 3: Capture the exact visual reference and generate the floor asset**

Download the primary source image for local visual grounding:

~~~bash
rtk curl -sL -o /tmp/openclaw-office-reference.png https://raw.githubusercontent.com/WW-AI-Lab/openclaw-office/main/assets/office.png
~~~

Inspect it with view_image, then call the built-in image generation tool with /tmp/openclaw-office-reference.png as the referenced image and this exact prompt:

~~~text
Create a production UI asset for KidItem Agent OS using the attached OpenClaw Office screenshot only as visual grounding. Output a clean 1600x1000 raster illustration of a light top-down 2D office floor plan. Use pale slate, white, and desaturated blue-gray rooms with crisp thin boundaries and a restrained operational-dashboard aesthetic. Place seven empty employee desk stations in the left and center work areas, a six-seat round meeting table in the upper-right room, a waiting area in the lower-left, and a compact lounge in the lower-right. Keep broad clear corridors for avatar movement. Furniture must be legible but visually quiet. No people, faces, avatars, text, letters, labels, logos, UI panels, status rings, speech bubbles, gradients, shadows that look decorative, or cropped furniture. Keep every important object inside the frame.
~~~

Place the generated result at:

~~~text
apps/web/public/agent-os/office-floor-2d.png
~~~

The tool's returned output_hint is the source file path; move that exact returned file to the target above. Do not synthesize or edit the bitmap with Python.

- [ ] **Step 4: Generate eight separate transparent avatar assets**

Run ImageGen once per JSON entry below. Use /tmp/openclaw-office-reference.png as grounding, create one centered circular bust per call, and place each returned output at its exact key under apps/web/public/agent-os/avatars/:

~~~json
{
  "manager.png": "Transparent-background circular office avatar, calm Korean operations director, dark short hair, navy jacket, small purple accent, flat friendly vector-like raster style, front-facing bust, no text, no logo, no border, no shadow, centered with generous transparent padding.",
  "ad-strategy.png": "Transparent-background circular office avatar, analytical Korean advertising strategist, neat dark hair, teal shirt and charcoal jacket, small purple accent, flat friendly vector-like raster style, front-facing bust, no text, no logo, no border, no shadow, centered with generous transparent padding.",
  "chat.png": "Transparent-background circular office avatar, approachable Korean customer operations specialist, warm expression, dark hair, light blue shirt, small purple accent, flat friendly vector-like raster style, front-facing bust, no text, no logo, no border, no shadow, centered with generous transparent padding.",
  "sourcing.png": "Transparent-background circular office avatar, focused Korean sourcing specialist, practical green overshirt, dark hair, small purple accent, flat friendly vector-like raster style, front-facing bust, no text, no logo, no border, no shadow, centered with generous transparent padding.",
  "listing.png": "Transparent-background circular office avatar, detail-oriented Korean listing specialist, white shirt with violet vest, dark hair, small purple accent, flat friendly vector-like raster style, front-facing bust, no text, no logo, no border, no shadow, centered with generous transparent padding.",
  "order.png": "Transparent-background circular office avatar, dependable Korean order specialist, amber shirt and dark jacket, dark hair, small purple accent, flat friendly vector-like raster style, front-facing bust, no text, no logo, no border, no shadow, centered with generous transparent padding.",
  "channel-registration.png": "Transparent-background circular office avatar, precise Korean marketplace channel specialist, coral shirt and charcoal jacket, dark hair, small purple accent, flat friendly vector-like raster style, front-facing bust, no text, no logo, no border, no shadow, centered with generous transparent padding.",
  "default.png": "Transparent-background circular office avatar, neutral Korean operations employee, slate shirt and dark jacket, dark hair, small purple accent, flat friendly vector-like raster style, front-facing bust, no text, no logo, no border, no shadow, centered with generous transparent padding."
}
~~~

Do not create a sprite sheet and do not crop a multi-character image.

- [ ] **Step 5: Inspect every asset before coding against it**

Use view_image for the floor and each avatar. Confirm:

- floor contains exactly seven usable desk areas;
- meeting, waiting, and lounge areas are visible;
- no baked-in text, people, logos, or status UI exists;
- avatars share crop, scale, palette, and transparent padding;
- no avatar contains text or an embedded border.

Regenerate any failed asset before continuing. Do not compensate for a bad crop with CSS.

- [ ] **Step 6: Implement the floor and hit regions**

Create AgentOfficeFloor.tsx:

~~~tsx
'use client';

import Image from 'next/image';
import { useState } from 'react';
import { cn } from '@/lib/utils';
import {
  OFFICE_ZONES,
  type OfficeRect,
  type OfficeSeat,
} from '../lib/agent-office-layout';
import type { AgentOfficeNode } from '../lib/agent-office-model';

export interface AgentOfficeDeskPlacement {
  node: AgentOfficeNode;
  seat: OfficeSeat;
}

function rectStyle(rect: OfficeRect) {
  return {
    left: rect.x + '%',
    top: rect.y + '%',
    width: rect.width + '%',
    height: rect.height + '%',
  };
}

function deskRect(seat: OfficeSeat): OfficeRect {
  return {
    x: seat.desk.x - 5,
    y: seat.desk.y - 4,
    width: 10,
    height: 8,
  };
}

export function AgentOfficeFloor({
  desks,
  onSelectNode,
}: {
  desks: AgentOfficeDeskPlacement[];
  onSelectNode: (id: string) => void;
}) {
  const [assetFailed, setAssetFailed] = useState(false);
  const [selectedZoneId, setSelectedZoneId] = useState<string | null>(null);

  return (
    <div className="absolute inset-0">
      {assetFailed ? (
        <div
          data-testid="office-floor-fallback"
          className="absolute inset-0 bg-slate-50"
        />
      ) : (
        <Image
          data-testid="office-floor-asset"
          src="/agent-os/office-floor-2d.png"
          alt=""
          fill
          priority
          sizes="(min-width: 1080px) 100vw, 1080px"
          className="object-fill"
          onError={() => setAssetFailed(true)}
        />
      )}

      {OFFICE_ZONES.map((zone) => (
        <button
          key={zone.id}
          type="button"
          aria-label={zone.label + ' 구역'}
          aria-pressed={selectedZoneId === zone.id}
          onClick={() =>
            setSelectedZoneId((current) => (current === zone.id ? null : zone.id))
          }
          style={rectStyle(zone.hitRegion)}
          className={cn(
            'absolute z-10 border border-transparent text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-600',
            'hover:border-slate-400/60',
            selectedZoneId === zone.id && 'border-purple-600/70 bg-purple-50/10',
          )}
        >
          <span className="absolute left-2 top-2 rounded bg-white/90 px-2 py-1 text-[11px] font-semibold text-slate-600 shadow-sm">
            {zone.label}
          </span>
        </button>
      ))}

      {desks.map(({ node, seat }) => (
        <button
          key={seat.id}
          type="button"
          aria-label={node.displayName + ' 책상'}
          onClick={() => onSelectNode(node.id)}
          style={rectStyle(deskRect(seat))}
          className="absolute z-10 border border-transparent hover:border-purple-400/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-600"
        />
      ))}
    </div>
  );
}
~~~

- [ ] **Step 7: Run floor tests**

Run:

~~~bash
rtk npm exec --workspace=apps/web vitest -- run src/app/agent-os/components/AgentOfficeFloor.spec.tsx
~~~

Expected: PASS.

- [ ] **Step 8: Commit assets and floor interaction**

~~~bash
rtk git add apps/web/public/agent-os/office-floor-2d.png apps/web/public/agent-os/avatars apps/web/src/app/agent-os/components/AgentOfficeFloor.tsx apps/web/src/app/agent-os/components/AgentOfficeFloor.spec.tsx
rtk git commit -m "feat: add interactive agent office floor"
~~~

## Task 3: Build Employee Avatar Status And Motion

**Files:**
- Create: apps/web/src/app/agent-os/components/AgentOfficeAvatar.spec.tsx
- Create: apps/web/src/app/agent-os/components/AgentOfficeAvatar.tsx

**Interfaces:**
- Consumes: AgentOfficeNode, OfficeSeat, selected, activityLabel, and onSelect(id).
- Produces: one accessible employee button positioned at the current status destination.

- [ ] **Step 1: Write failing avatar interaction tests**

Create AgentOfficeAvatar.spec.tsx:

~~~tsx
import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AgentOfficeAvatar } from './AgentOfficeAvatar';
import { getOfficeSeat } from '../lib/agent-office-layout';
import type { AgentOfficeNode } from '../lib/agent-office-model';

const baseNode: AgentOfficeNode = {
  id: 'agent-manager',
  name: 'Operator',
  agentType: 'manager',
  title: '대표실',
  displayName: '운영 총괄',
  responsibility: '운영 우선순위, 위임, 승인 흐름을 총괄한다.',
  status: 'working',
  activeRunCount: 1,
  pendingApprovalCount: 0,
  lastActivityAt: '2026-07-09T00:00:00.000Z',
  trustLevel: 1,
  adapterType: 'hermes_local',
  effectiveModel: 'gpt-5.1-codex',
  capabilities: [],
};

describe('AgentOfficeAvatar', () => {
  const animate = vi.fn();

  beforeEach(() => {
    vi.useFakeTimers();
    animate.mockReset();
    Object.defineProperty(Element.prototype, 'animate', {
      configurable: true,
      value: animate,
    });
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      value: vi.fn().mockReturnValue({ matches: false }),
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('selects the employee and does not animate initial render', () => {
    const onSelect = vi.fn();

    render(
      <AgentOfficeAvatar
        node={baseNode}
        seat={getOfficeSeat('manager', 0)}
        selected={false}
        activityLabel="실행 running"
        onSelect={onSelect}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: '운영 총괄, 집중 중' }));
    expect(onSelect).toHaveBeenCalledWith('agent-manager');
    expect(animate).not.toHaveBeenCalled();
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('animates once and shows a six-second bubble after a status change', () => {
    const seat = getOfficeSeat('manager', 0);
    const { rerender } = render(
      <AgentOfficeAvatar
        node={baseNode}
        seat={seat}
        selected={false}
        activityLabel="실행 running"
        onSelect={vi.fn()}
      />,
    );

    const waitingNode = { ...baseNode, status: 'waiting' as const };
    rerender(
      <AgentOfficeAvatar
        node={waitingNode}
        seat={seat}
        selected={false}
        activityLabel="요청 pending"
        onSelect={vi.fn()}
      />,
    );

    expect(animate).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('status')).toHaveTextContent('요청 pending');

    rerender(
      <AgentOfficeAvatar
        node={waitingNode}
        seat={seat}
        selected={false}
        activityLabel="요청 pending"
        onSelect={vi.fn()}
      />,
    );
    expect(animate).toHaveBeenCalledTimes(1);

    act(() => vi.advanceTimersByTime(6_000));
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('skips motion for reduced-motion users', () => {
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      value: vi.fn().mockReturnValue({ matches: true }),
    });
    const seat = getOfficeSeat('manager', 0);
    const { rerender } = render(
      <AgentOfficeAvatar
        node={baseNode}
        seat={seat}
        selected={false}
        activityLabel={null}
        onSelect={vi.fn()}
      />,
    );

    rerender(
      <AgentOfficeAvatar
        node={{ ...baseNode, status: 'blocked' }}
        seat={seat}
        selected={false}
        activityLabel="승인 요청"
        onSelect={vi.fn()}
      />,
    );

    expect(animate).not.toHaveBeenCalled();
  });

  it.each([
    ['working', '집중 중'],
    ['waiting', '대기 중'],
    ['blocked', '승인 필요'],
    ['idle', '준비됨'],
    ['offline', '오프라인'],
  ] as const)('renders %s with a textual status indicator', (status, label) => {
    render(
      <AgentOfficeAvatar
        node={{ ...baseNode, status }}
        seat={getOfficeSeat('manager', 0)}
        selected={false}
        activityLabel={null}
        onSelect={vi.fn()}
      />,
    );

    expect(screen.getByRole('button', { name: '운영 총괄, ' + label })).toBeInTheDocument();
    expect(screen.getByText(label)).toBeInTheDocument();
  });

  it('falls back to the default avatar asset when a role asset fails', () => {
    render(
      <AgentOfficeAvatar
        node={baseNode}
        seat={getOfficeSeat('manager', 0)}
        selected={false}
        activityLabel={null}
        onSelect={vi.fn()}
      />,
    );

    const image = screen.getByTestId('employee-avatar-image');
    fireEvent.error(image);
    expect(image).toHaveAttribute('src', expect.stringContaining('default.png'));
  });
});
~~~

- [ ] **Step 2: Run avatar tests and observe the missing-component failure**

Run:

~~~bash
rtk npm exec --workspace=apps/web vitest -- run src/app/agent-os/components/AgentOfficeAvatar.spec.tsx
~~~

Expected: FAIL because AgentOfficeAvatar.tsx does not exist.

- [ ] **Step 3: Implement status destination, motion, bubble, and fallback**

Create AgentOfficeAvatar.tsx:

~~~tsx
'use client';

import Image from 'next/image';
import {
  CircleAlert,
  Clock3,
  PauseCircle,
  Sparkles,
} from 'lucide-react';
import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import { cn } from '@/lib/utils';
import {
  DEFAULT_OFFICE_AVATAR_SRC,
  getOfficeDestination,
  getOfficeMotionPoints,
  type OfficeSeat,
} from '../lib/agent-office-layout';
import type {
  AgentOfficeNode,
  AgentOfficeNodeStatus,
} from '../lib/agent-office-model';

const BUBBLE_DURATION_MS = 6_000;

const STATUS_LABEL = {
  working: '집중 중',
  waiting: '대기 중',
  blocked: '승인 필요',
  idle: '준비됨',
  offline: '오프라인',
} satisfies Record<AgentOfficeNodeStatus, string>;

const STATUS_CLASS = {
  working: 'border-sky-500 bg-sky-50 text-sky-800',
  waiting: 'border-amber-500 bg-amber-50 text-amber-900',
  blocked: 'border-red-600 bg-red-50 text-red-800',
  idle: 'border-green-600 bg-green-50 text-green-800',
  offline: 'border-slate-400 bg-slate-100 text-slate-600',
} satisfies Record<AgentOfficeNodeStatus, string>;

function StatusIcon({ status }: { status: AgentOfficeNodeStatus }) {
  if (status === 'blocked') return <CircleAlert size={13} aria-hidden="true" />;
  if (status === 'waiting') return <Clock3 size={13} aria-hidden="true" />;
  if (status === 'offline') return <PauseCircle size={13} aria-hidden="true" />;
  return <Sparkles size={13} aria-hidden="true" />;
}

function reducedMotionEnabled() {
  return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
}

export function AgentOfficeAvatar({
  node,
  seat,
  selected,
  activityLabel,
  onSelect,
}: {
  node: AgentOfficeNode;
  seat: OfficeSeat;
  selected: boolean;
  activityLabel: string | null;
  onSelect: (id: string) => void;
}) {
  const buttonRef = useRef<HTMLButtonElement>(null);
  const previousStatusRef = useRef(node.status);
  const bubbleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [bubbleLabel, setBubbleLabel] = useState<string | null>(null);
  const [avatarSrc, setAvatarSrc] = useState(seat.avatarSrc);
  const destination = getOfficeDestination(seat, node.status);

  useEffect(() => {
    setAvatarSrc(seat.avatarSrc);
  }, [seat.avatarSrc]);

  useEffect(
    () => () => {
      if (bubbleTimerRef.current) clearTimeout(bubbleTimerRef.current);
    },
    [],
  );

  useLayoutEffect(() => {
    const previousStatus = previousStatusRef.current;
    if (previousStatus === node.status) return;

    if (
      node.status !== 'offline' &&
      !reducedMotionEnabled() &&
      typeof buttonRef.current?.animate === 'function'
    ) {
      const points = getOfficeMotionPoints({
        seat,
        fromStatus: previousStatus,
        toStatus: node.status,
      });
      buttonRef.current.animate(
        points.map((point) => ({
          left: point.x + '%',
          top: point.y + '%',
        })),
        {
          duration: 900,
          easing: 'ease-in-out',
        },
      );
    }

    if (bubbleTimerRef.current) clearTimeout(bubbleTimerRef.current);
    setBubbleLabel(activityLabel);
    if (activityLabel) {
      bubbleTimerRef.current = setTimeout(
        () => setBubbleLabel(null),
        BUBBLE_DURATION_MS,
      );
    }

    previousStatusRef.current = node.status;
  }, [activityLabel, node.status, seat]);

  return (
    <button
      ref={buttonRef}
      type="button"
      aria-label={node.displayName + ', ' + STATUS_LABEL[node.status]}
      aria-pressed={selected}
      data-status={node.status}
      onClick={() => onSelect(node.id)}
      style={{
        left: destination.x + '%',
        top: destination.y + '%',
      }}
      className="group absolute z-20 h-[116px] w-[142px] -translate-x-1/2 -translate-y-1/2 text-left focus-visible:outline-none"
    >
      {bubbleLabel ? (
        <span
          role="status"
          className="absolute bottom-[104px] left-1/2 w-max max-w-[180px] -translate-x-1/2 rounded-md border border-slate-200 bg-white px-2 py-1 text-center text-[11px] text-slate-700 shadow-sm"
        >
          {bubbleLabel}
        </span>
      ) : null}

      <span
        className={cn(
          'absolute left-1/2 top-0 flex h-7 -translate-x-1/2 items-center gap-1 rounded-full border px-2 text-[11px] font-semibold shadow-sm',
          STATUS_CLASS[node.status],
        )}
      >
        <StatusIcon status={node.status} />
        {STATUS_LABEL[node.status]}
      </span>

      <span
        className={cn(
          'absolute left-1/2 top-7 flex h-14 w-14 -translate-x-1/2 items-center justify-center overflow-hidden rounded-full border-2 border-white bg-white shadow-sm',
          selected
            ? 'ring-4 ring-purple-600/70'
            : 'group-hover:ring-2 group-hover:ring-purple-300',
          'group-focus-visible:ring-4 group-focus-visible:ring-purple-600/70',
          node.status === 'offline' && 'grayscale opacity-70',
        )}
      >
        <Image
          data-testid="employee-avatar-image"
          src={avatarSrc}
          alt=""
          width={56}
          height={56}
          className="h-full w-full object-contain"
          onError={() => {
            if (avatarSrc !== DEFAULT_OFFICE_AVATAR_SRC) {
              setAvatarSrc(DEFAULT_OFFICE_AVATAR_SRC);
            }
          }}
        />
      </span>

      <span className="absolute left-1/2 top-[82px] w-[136px] -translate-x-1/2 rounded-md border border-slate-200 bg-white/95 px-2 py-1 text-center shadow-sm">
        <span className="block truncate text-xs font-semibold text-slate-900">
          {node.displayName}
        </span>
        <span className="block truncate text-[10px] text-slate-500">
          {node.name}
        </span>
      </span>
    </button>
  );
}
~~~

- [ ] **Step 4: Run avatar tests**

Run:

~~~bash
rtk npm exec --workspace=apps/web vitest -- run src/app/agent-os/components/AgentOfficeAvatar.spec.tsx
~~~

Expected: PASS.

- [ ] **Step 5: Commit employee interaction**

~~~bash
rtk git add apps/web/src/app/agent-os/components/AgentOfficeAvatar.tsx apps/web/src/app/agent-os/components/AgentOfficeAvatar.spec.tsx
rtk git commit -m "feat: animate agent office employees"
~~~

## Task 4: Integrate The Interactive Scene Into Agent OS

**Files:**
- Modify: apps/web/src/app/agent-os/components/AgentOfficeMap.spec.tsx
- Modify: apps/web/src/app/agent-os/components/AgentOfficeMap.tsx
- Modify: apps/web/src/app/agent-os/components/AgentOfficeShell.tsx
- Modify: apps/web/src/app/agent-os/components/AgentOfficeShell.spec.tsx
- Delete: apps/web/src/app/agent-os/components/AgentOfficeNode.tsx
- Delete: apps/web/public/agent-os/office-floor.png

**Interfaces:**
- AgentOfficeMap adds activities: AgentOfficeActivity[].
- AgentOfficeShell passes model.activities through unchanged.
- selectedNodeId and onSelectNode remain the single selection contract shared by staff panel, desk, avatar, inspector, and command dock.

- [ ] **Step 1: Replace map expectations with scene-level failing tests**

Update AgentOfficeMap.spec.tsx so every render supplies activities and the core assertions are:

~~~tsx
const activities = [
  {
    id: 'run-1',
    kind: 'run' as const,
    label: '실행 running',
    status: 'running',
    occurredAt: '2026-07-09T02:00:00.000Z',
    agentInstanceId: 'agent-manager',
  },
];

it('renders the interactive floor, employee avatars, and shared selection', () => {
  const onSelectNode = vi.fn();

  render(
    <AgentOfficeMap
      nodes={nodes}
      activities={activities}
      selectedNodeId={null}
      onSelectNode={onSelectNode}
    />,
  );

  expect(screen.getByTestId('agent-office-scene')).toBeInTheDocument();
  expect(screen.getByTestId('office-floor-asset')).toHaveAttribute(
    'src',
    expect.stringContaining('office-floor-2d.png'),
  );

  fireEvent.click(screen.getByRole('button', { name: '운영 총괄 책상' }));
  fireEvent.click(screen.getByRole('button', { name: '운영 총괄, 집중 중' }));

  expect(onSelectNode).toHaveBeenNthCalledWith(1, 'agent-manager');
  expect(onSelectNode).toHaveBeenNthCalledWith(2, 'agent-manager');
});

it('keeps a true no-selection state', () => {
  render(
    <AgentOfficeMap
      nodes={nodes}
      activities={activities}
      selectedNodeId={null}
      onSelectNode={vi.fn()}
    />,
  );

  expect(screen.getByRole('button', { name: '운영 총괄, 집중 중' })).toHaveAttribute(
    'aria-pressed',
    'false',
  );
  expect(screen.getByRole('button', { name: '검수 담당, 준비됨' })).toHaveAttribute(
    'aria-pressed',
    'false',
  );
});

it('renders an empty office without inventing employee avatars', () => {
  render(
    <AgentOfficeMap
      nodes={[]}
      activities={[]}
      selectedNodeId={null}
      onSelectNode={vi.fn()}
    />,
  );

  expect(screen.getByTestId('office-floor-asset')).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: /집중 중|대기 중|승인 필요|준비됨|오프라인/ })).not.toBeInTheDocument();
});
~~~

Remove assertions for office-floor.png and the old landmarks 대표실, 콘텐츠 실험실, and 운영 광장.

- [ ] **Step 2: Run map and shell tests and observe interface failures**

Run:

~~~bash
rtk npm exec --workspace=apps/web vitest -- run src/app/agent-os/components/AgentOfficeMap.spec.tsx src/app/agent-os/components/AgentOfficeShell.spec.tsx
~~~

Expected:
- FAIL because AgentOfficeMap does not accept activities.
- FAIL because the new floor and avatar controls are absent.

- [ ] **Step 3: Recompose AgentOfficeMap**

Replace AgentOfficeMap.tsx with:

~~~tsx
'use client';

import { useMemo } from 'react';
import { cn } from '@/lib/utils';
import { AgentOfficeAvatar } from './AgentOfficeAvatar';
import { AgentOfficeFloor } from './AgentOfficeFloor';
import { getOfficeSeat } from '../lib/agent-office-layout';
import type {
  AgentOfficeActivity,
  AgentOfficeNode,
} from '../lib/agent-office-model';

function latestActivityLabels(activities: AgentOfficeActivity[]) {
  const labels = new Map<string, string>();

  for (const activity of activities) {
    if (!activity.agentInstanceId || labels.has(activity.agentInstanceId)) {
      continue;
    }
    labels.set(activity.agentInstanceId, activity.label);
  }

  return labels;
}

export function AgentOfficeMap({
  nodes,
  activities,
  selectedNodeId,
  onSelectNode,
  className,
}: {
  nodes: AgentOfficeNode[];
  activities: AgentOfficeActivity[];
  selectedNodeId: string | null;
  onSelectNode: (id: string) => void;
  className?: string;
}) {
  const placements = useMemo(
    () =>
      nodes.map((node, index) => ({
        node,
        seat: getOfficeSeat(node.agentType, index),
      })),
    [nodes],
  );
  const activityLabels = useMemo(
    () => latestActivityLabels(activities),
    [activities],
  );

  return (
    <section
      aria-label="운영 캔버스"
      className={cn(
        'relative flex min-h-[720px] items-center justify-center overflow-hidden bg-slate-100',
        className,
      )}
    >
      <div
        data-testid="agent-office-scene"
        className="relative aspect-[8/5] max-w-full overflow-hidden border border-slate-200 bg-white shadow-sm"
        style={{
          width: 'min(100%, calc((100vh - 104px) * 1.6))',
        }}
      >
        <AgentOfficeFloor desks={placements} onSelectNode={onSelectNode} />
        {placements.map(({ node, seat }) => (
          <AgentOfficeAvatar
            key={node.id}
            node={node}
            seat={seat}
            selected={selectedNodeId === node.id}
            activityLabel={activityLabels.get(node.id) ?? null}
            onSelect={onSelectNode}
          />
        ))}
      </div>
    </section>
  );
}
~~~

- [ ] **Step 4: Pass activities from the existing shell**

Update the AgentOfficeMap call in AgentOfficeShell.tsx:

~~~tsx
<AgentOfficeMap
  className="absolute inset-0 min-h-full"
  nodes={model.nodes}
  activities={model.activities}
  selectedNodeId={selectedNodeId}
  onSelectNode={onSelectNode}
/>
~~~

Do not change selectedNodeId ownership, the activity drawer toggle, inspector lookup, or command dock target.

- [ ] **Step 5: Remove the legacy node and photograph**

Delete:

~~~text
apps/web/src/app/agent-os/components/AgentOfficeNode.tsx
apps/web/public/agent-os/office-floor.png
~~~

Confirm there are no live imports or asset references:

~~~bash
rtk rg -n "office-floor\.png|from './AgentOfficeNode'" apps/web/src apps/web/public
~~~

Expected: no matches.

- [ ] **Step 6: Run the complete focused component suite**

Run:

~~~bash
rtk npm exec --workspace=apps/web vitest -- run src/app/agent-os/lib/agent-office-layout.spec.ts src/app/agent-os/lib/agent-office-model.spec.ts src/app/agent-os/components/AgentOfficeFloor.spec.tsx src/app/agent-os/components/AgentOfficeAvatar.spec.tsx src/app/agent-os/components/AgentOfficeMap.spec.tsx src/app/agent-os/components/AgentOfficePanels.spec.tsx src/app/agent-os/components/AgentCommandDock.spec.tsx src/app/agent-os/components/AgentOfficeShell.spec.tsx src/app/agent-os/__tests__/page.spec.tsx
~~~

Expected: PASS.

- [ ] **Step 7: Commit scene integration**

~~~bash
rtk git add apps/web/src/app/agent-os/components/AgentOfficeMap.tsx apps/web/src/app/agent-os/components/AgentOfficeMap.spec.tsx apps/web/src/app/agent-os/components/AgentOfficeShell.tsx apps/web/src/app/agent-os/components/AgentOfficeShell.spec.tsx
rtk git commit -m "feat: replace agent office photograph"
~~~

## Task 5: Run Regression Gates And Desktop Visual QA

**Files:**
- Verify only; modify scene files from Tasks 1-4 only when a gate exposes a defect.
- Temporary screenshots and comparison images stay under /tmp or .superpowers and are not committed.

**Interfaces:**
- Consumes: completed interactive scene.
- Produces: passing tests/build and desktop visual evidence against the captured reference.

- [ ] **Step 1: Run every Agent OS web test**

Run:

~~~bash
rtk npm exec --workspace=apps/web vitest -- run src/app/agent-os
~~~

Expected: all Agent OS tests pass.

- [ ] **Step 2: Run the required production build**

Run:

~~~bash
rtk npm run build --workspace=apps/web
~~~

Expected: Next.js production build exits 0 with /agent-os included and no TypeScript error.

- [ ] **Step 3: Confirm asset dimensions and file presence**

Run:

~~~bash
rtk sips -g pixelWidth -g pixelHeight apps/web/public/agent-os/office-floor-2d.png
rtk rg --files apps/web/public/agent-os/avatars
~~~

Expected:
- floor reports 1600x1000, or an aspect-equivalent 8:5 size approved during asset inspection;
- avatar listing contains manager, ad-strategy, chat, sourcing, listing, order, channel-registration, and default.

- [ ] **Step 4: Establish or recover the authenticated development preview**

Follow docs/runbooks/dev-preview-with-auth.md.

If the existing localhost:3000 and localhost:4000 sessions respond, reuse them. If either is stale, stop only that stale process and start:

~~~bash
rtk npm run dev:server
rtk env KIDITEM_PROXY_ALL_API=true NEXT_PUBLIC_API_URL= npm run dev --workspace=apps/web
~~~

For a fresh browser session, run:

~~~bash
rtk ./bin/dev-bootstrap.sh --web-origin http://localhost:3000
~~~

Navigate the in-app browser to the generated callback URL, verify /api/auth/me returns 200 with a non-null organizationId, then open:

~~~text
http://localhost:3000/agent-os
~~~

- [ ] **Step 5: Verify the 1098x935 desktop state**

Using only the in-app browser:

- set viewport to 1098x935;
- select 운영 총괄 from the scene;
- select 소싱 담당 from the staff panel;
- click the selected employee's desk;
- open and close 시스템 활동 기록;
- verify the 대시보드 link remains visible and correct;
- capture /tmp/agent-os-office-1098x935.png.

Expected:
- all seven employees are visible;
- floor, desk, and employee coordinates align;
- no employee or label sits behind the left panel, inspector, or command dock;
- scene and staff-panel selection stay synchronized;
- no runtime console error appears.

- [ ] **Step 6: Verify the 1440x900 desktop state and status distinction**

Set viewport to 1440x900 and capture /tmp/agent-os-office-1440x900.png.

Expected:
- scene stays 8:5 without cropping or stretching;
- floor furniture remains legible;
- working, waiting, blocked, idle, and offline states use both text/icon and color;
- command dock, inspector, refresh, activity toggle, and dashboard navigation remain usable;
- no OpenClaw name, branding, token metric, or fake employee appears.

- [ ] **Step 7: Compare reference and implementation in one visual input**

Ensure /tmp/openclaw-office-reference.png exists. In one tool result, emit both the reference and /tmp/agent-os-office-1440x900.png with view_image so they are judged together.

Review:

- light top-down office composition;
- room and desk readability;
- restrained blue-gray palette;
- compact avatars and labels;
- scene hierarchy behind existing KidItem controls;
- visible differences caused by KidItem semantics rather than accidental styling.

If a mismatch is visible, edit only the scene asset/layout/avatar/map files, rerun the focused component suite, rebuild, recapture, and repeat this combined comparison once.

- [ ] **Step 8: Verify the dirty-worktree boundary**

Run:

~~~bash
rtk git status --short
rtk git diff --check
~~~

Expected:
- no unrelated file is staged or reverted;
- no whitespace error exists;
- temporary screenshots and visual-companion files are untracked or ignored;
- all implementation commits contain only the files from their task.

## Execution Notes

- The existing development server and visual companion may remain running; do not stop a healthy user-visible session.
- The current branch already contains unrelated and partially completed Agent OS work. Use exact-path staging from each task and inspect rtk git diff --cached --name-status before every commit.
- If ImageGen returns an asset with baked-in text, people, inconsistent crops, or wrong aspect ratio, regenerate it. Do not repair a visibly incorrect source asset with layout CSS.
- Do not add a new dependency to solve motion, scene sizing, or image fallback.
- Do not modify docs/ARCHITECTURE.md because route ownership and backend boundaries do not change.
