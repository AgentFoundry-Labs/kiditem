# Agent OS Bounded Office Canvas Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the existing `/agent-os` office into a bounded, draggable, pointer-centered zoom canvas while keeping every operational panel outside the scene and every default employee placement collision-free.

**Architecture:** Keep the existing Agent OS API, React Query model, SVG floor, employee avatars, and selection flow. Add pure route-local camera math, wrap the complete 1200x750 office world in one pointer-driven canvas, and restructure `AgentOfficeShell` into fixed staff, canvas, detail, and command regions so camera movement can never put employees underneath controls.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, Tailwind CSS 3, Pointer Events, Wheel Events, ResizeObserver, CSS transforms, Vitest, React Testing Library, and the in-app browser.

## Global Constraints

- `/agent-os` remains the canonical route; `/agents` remains redirect-only.
- This plan supersedes only the earlier office-scene plan's `V1 has no pan or zoom` constraint.
- The existing code-driven SVG floor and generated employee portraits remain the scene assets.
- Move the staff panel, employee profile, activity record, and command dock outside the clipped office viewport.
- The initial mount frames the full office once. Reaching minimum scale must not recenter, fit, or reset the current allowed translation.
- Camera input is limited to primary-button drag on empty floor and wheel or trackpad-pinch zoom around the pointer.
- Do not add a visible camera toolbar, zoom percentage, minimap, whole-office command, `Esc` reset, other reset interaction, or persisted camera state.
- Do not start camera drag from an employee, desk, zone label, link, input, or other control.
- Keep a 4px drag threshold and a maximum scale of exactly `1.8 * minScale`.
- Allow bounded camera travel with exactly 12 percent viewport overscroll per axis.
- Keep all seven employees collision-free for every pair of `working`, `offline`, `idle`, `waiting`, and `blocked` destinations.
- Keep employee selection, desk selection, activity feedback, status motion, profile updates, command targeting, refresh, and dashboard navigation intact.
- Camera manipulation is progressive enhancement; the fixed staff panel remains the keyboard-accessible employee entrypoint.
- Do not add backend, Prisma, shared-contract, migration, Hermes runtime, WebSocket, SSE, or API changes.
- Do not add React Flow, Three.js, PixiJS, Phaser, gesture libraries, or another runtime dependency.
- Desktop verification only at `1098x935` and `1440x900`; do not add mobile layout work.
- Work in the current dirty branch. Stage only files named by the active task and never revert unrelated changes.
- Prefix every shell command with `rtk`.
- Follow TDD for each behavior: write the failing test, observe the failure, add the minimum implementation, observe the pass, and commit the task.
- Required final gates are the complete Agent OS route tests, the complete web Vitest suite, and `rtk npm run build --workspace=apps/web`.
- This is presentation-only work, so it does not bump `VERSION` or change `docs/ARCHITECTURE.md`.

---

## File Structure

- Modify `apps/web/src/app/agent-os/lib/agent-office-layout.ts`
  - Export the intrinsic world size and employee footprint contract, and own collision-free desk, idle, waiting, and blocked destinations.
- Modify `apps/web/src/app/agent-os/lib/agent-office-layout.spec.ts`
  - Prove every possible destination pair for the seven employees is in bounds and non-overlapping.
- Create `apps/web/src/app/agent-os/lib/agent-office-camera.ts`
  - Own initial fit, scale limits, 12 percent pan bounds, focal zoom, and pan clamping as DOM-free functions.
- Create `apps/web/src/app/agent-os/lib/agent-office-camera.spec.ts`
  - Lock initial fit, pointer focality, bounded pan, maximum zoom, and no recenter at minimum scale.
- Create `apps/web/src/app/agent-os/components/AgentOfficeCanvas.tsx`
  - Own ResizeObserver measurement, Pointer Events, drag threshold, Wheel Events, pointer capture, and the CSS transform for the complete office world.
- Create `apps/web/src/app/agent-os/components/AgentOfficeCanvas.spec.tsx`
  - Verify drag, control exclusion, wheel zoom, cancellation, and absence of camera controls.
- Modify `apps/web/src/app/agent-os/components/AgentOfficeFloor.tsx`
  - Reuse the shared world size and shrink zone interactions from room-sized buttons to compact labels so empty floor remains draggable.
- Modify `apps/web/src/app/agent-os/components/AgentOfficeFloor.spec.tsx`
  - Preserve zone and desk selection while proving zone controls no longer cover the room floor.
- Modify `apps/web/src/app/agent-os/components/AgentOfficeMap.tsx`
  - Place the floor and all avatars inside `AgentOfficeCanvas` as one 1200x750 world.
- Modify `apps/web/src/app/agent-os/components/AgentOfficeMap.spec.tsx`
  - Preserve scene selection and verify the new canvas hierarchy has no visible camera controls.
- Modify `apps/web/src/app/agent-os/components/AgentOfficeShell.tsx`
  - Replace floating overlays with a three-column, two-row desktop grid.
- Modify `apps/web/src/app/agent-os/components/AgentOfficeShell.spec.tsx`
  - Lock the fixed staff, viewport, detail, activity, and command ownership boundaries.

---

### Task 1: Make Every Employee Destination Collision-Free

**Files:**
- Modify: `apps/web/src/app/agent-os/lib/agent-office-layout.spec.ts`
- Modify: `apps/web/src/app/agent-os/lib/agent-office-layout.ts`

**Interfaces:**
- Consumes: `AgentOfficeNodeStatus`, the seven existing `OfficeSeat` records, and normalized `OfficePoint` coordinates.
- Produces:

```ts
export const OFFICE_WORLD_SIZE: Readonly<{ width: 1200; height: 750 }>;
export const OFFICE_EMPLOYEE_FOOTPRINT: Readonly<{
  width: 12;
  height: 16;
}>;
export function getOfficeEmployeeRect(point: OfficePoint): OfficeRect;
export function officeRectsOverlap(left: OfficeRect, right: OfficeRect): boolean;
```

- [ ] **Step 1: Replace the overlay-specific assertion with an all-status collision test**

Add the new imports and replace `keeps waiting and approval destinations clear of desktop overlays` with:

```ts
import {
  DEFAULT_OFFICE_AVATAR_SRC,
  OFFICE_SEATS,
  OFFICE_WORLD_SIZE,
  getOfficeDestination,
  getOfficeEmployeeRect,
  getOfficeMotionPoints,
  getOfficeSeat,
  officeRectsOverlap,
} from './agent-office-layout';
import type { AgentOfficeNodeStatus } from './agent-office-model';

const destinationStatuses = [
  'working',
  'offline',
  'idle',
  'waiting',
  'blocked',
] as const satisfies readonly AgentOfficeNodeStatus[];

it('keeps every seven-employee status combination collision-free and in bounds', () => {
  for (let leftIndex = 0; leftIndex < OFFICE_SEATS.length; leftIndex += 1) {
    for (
      let rightIndex = leftIndex + 1;
      rightIndex < OFFICE_SEATS.length;
      rightIndex += 1
    ) {
      const leftSeat = OFFICE_SEATS[leftIndex];
      const rightSeat = OFFICE_SEATS[rightIndex];

      for (const leftStatus of destinationStatuses) {
        for (const rightStatus of destinationStatuses) {
          const leftRect = getOfficeEmployeeRect(
            getOfficeDestination(leftSeat, leftStatus),
          );
          const rightRect = getOfficeEmployeeRect(
            getOfficeDestination(rightSeat, rightStatus),
          );

          expect(
            officeRectsOverlap(leftRect, rightRect),
            `${leftSeat.employeeType}:${leftStatus} overlaps ${rightSeat.employeeType}:${rightStatus}`,
          ).toBe(false);
        }
      }
    }
  }

  for (const seat of OFFICE_SEATS) {
    for (const status of destinationStatuses) {
      const rect = getOfficeEmployeeRect(getOfficeDestination(seat, status));

      expect(rect.x).toBeGreaterThanOrEqual(0);
      expect(rect.y).toBeGreaterThanOrEqual(0);
      expect(rect.x + rect.width).toBeLessThanOrEqual(100);
      expect(rect.y + rect.height).toBeLessThanOrEqual(100);
    }
  }

  expect(OFFICE_WORLD_SIZE).toEqual({ width: 1200, height: 750 });
});
```

- [ ] **Step 2: Run the layout test and observe the expected failure**

Run:

```bash
rtk npm exec --workspace=apps/web vitest -- run src/app/agent-os/lib/agent-office-layout.spec.ts
```

Expected: FAIL because the footprint exports do not exist and the current mixed-status destinations are not protected by a geometric contract.

- [ ] **Step 3: Add the geometry contract and replace all seven known destinations**

Add immediately after `OfficeZone`:

```ts
export const OFFICE_WORLD_SIZE = { width: 1200, height: 750 } as const;

export const OFFICE_EMPLOYEE_FOOTPRINT = {
  width: 12,
  height: 16,
} as const;

export function getOfficeEmployeeRect(point: OfficePoint): OfficeRect {
  return {
    x: point.x - OFFICE_EMPLOYEE_FOOTPRINT.width / 2,
    y: point.y - OFFICE_EMPLOYEE_FOOTPRINT.height / 2,
    width: OFFICE_EMPLOYEE_FOOTPRINT.width,
    height: OFFICE_EMPLOYEE_FOOTPRINT.height,
  };
}

export function officeRectsOverlap(
  left: OfficeRect,
  right: OfficeRect,
): boolean {
  return (
    left.x < right.x + right.width &&
    left.x + left.width > right.x &&
    left.y < right.y + right.height &&
    left.y + left.height > right.y
  );
}
```

Replace the destination arrays with:

```ts
const waitingPoints: readonly OfficePoint[] = [
  { x: 20, y: 64 },
  { x: 36, y: 64 },
  { x: 52, y: 64 },
  { x: 68, y: 64 },
  { x: 20, y: 84 },
  { x: 36, y: 84 },
  { x: 52, y: 84 },
] as const;

const blockedPoints: readonly OfficePoint[] = [
  { x: 82, y: 14 },
  { x: 94, y: 14 },
  { x: 82, y: 34 },
  { x: 94, y: 34 },
  { x: 82, y: 54 },
  { x: 94, y: 54 },
  { x: 82, y: 74 },
] as const;
```

Change the `idle` assignment in `createSeat` to:

```ts
idle: { x: input.desk.x + 2, y: input.desk.y + 2 },
```

Replace `OFFICE_SEATS` with:

```ts
const knownDeskPoints: readonly OfficePoint[] = [
  { x: 20, y: 18 },
  { x: 36, y: 18 },
  { x: 52, y: 18 },
  { x: 20, y: 40 },
  { x: 36, y: 40 },
  { x: 52, y: 40 },
  { x: 68, y: 29 },
] as const;

export const OFFICE_SEATS: readonly OfficeSeat[] = [
  createSeat({
    employeeType: 'manager',
    index: 0,
    desk: knownDeskPoints[0],
    avatarFile: 'manager.png',
  }),
  createSeat({
    employeeType: 'ad_strategy',
    index: 1,
    desk: knownDeskPoints[1],
    avatarFile: 'ad-strategy.png',
  }),
  createSeat({
    employeeType: 'chat',
    index: 2,
    desk: knownDeskPoints[2],
    avatarFile: 'chat.png',
  }),
  createSeat({
    employeeType: 'sourcing',
    index: 3,
    desk: knownDeskPoints[3],
    avatarFile: 'sourcing.png',
  }),
  createSeat({
    employeeType: 'listing',
    index: 4,
    desk: knownDeskPoints[4],
    avatarFile: 'listing.png',
  }),
  createSeat({
    employeeType: 'order',
    index: 5,
    desk: knownDeskPoints[5],
    avatarFile: 'order.png',
  }),
  createSeat({
    employeeType: 'channel_registration',
    index: 6,
    desk: knownDeskPoints[6],
    avatarFile: 'channel-registration.png',
  }),
] as const;
```

- [ ] **Step 4: Run the layout test and verify the geometric contract passes**

Run:

```bash
rtk npm exec --workspace=apps/web vitest -- run src/app/agent-os/lib/agent-office-layout.spec.ts
```

Expected: PASS with every pair of employees checked across all 25 status combinations.

- [ ] **Step 5: Commit the collision-safe scene manifest**

```bash
rtk git add apps/web/src/app/agent-os/lib/agent-office-layout.ts apps/web/src/app/agent-os/lib/agent-office-layout.spec.ts
rtk git diff --cached --check
rtk git commit -m "fix: keep agent office destinations collision free"
```

Expected: one focused commit containing only the two layout files, including the existing uncommitted destination correction.

---

### Task 2: Add Pure Bounded Camera Math

**Files:**
- Create: `apps/web/src/app/agent-os/lib/agent-office-camera.spec.ts`
- Create: `apps/web/src/app/agent-os/lib/agent-office-camera.ts`

**Interfaces:**
- Consumes: numeric viewport size, world size, pointer anchor, pan delta, and current transform.
- Produces:

```ts
export interface OfficeSize { width: number; height: number }
export interface OfficeCameraPoint { x: number; y: number }
export interface OfficeCameraTransform { x: number; y: number; scale: number }
export interface OfficeCameraLimits { minScale: number; maxScale: number }
export const OFFICE_MAX_ZOOM_MULTIPLIER: 1.8;
export const OFFICE_PAN_OVERSCROLL_RATIO: 0.12;
export function getOfficeCameraLimits(input: {
  viewport: OfficeSize;
  world: OfficeSize;
}): OfficeCameraLimits;
export function createInitialOfficeCamera(input: {
  viewport: OfficeSize;
  world: OfficeSize;
}): OfficeCameraTransform;
export function clampOfficeCamera(input: {
  transform: OfficeCameraTransform;
  viewport: OfficeSize;
  world: OfficeSize;
}): OfficeCameraTransform;
export function panOfficeCamera(input: {
  transform: OfficeCameraTransform;
  delta: OfficeCameraPoint;
  viewport: OfficeSize;
  world: OfficeSize;
}): OfficeCameraTransform;
export function zoomOfficeCameraAt(input: {
  transform: OfficeCameraTransform;
  anchor: OfficeCameraPoint;
  scaleFactor: number;
  viewport: OfficeSize;
  world: OfficeSize;
}): OfficeCameraTransform;
```

- [ ] **Step 1: Write the camera behavior tests**

Create `agent-office-camera.spec.ts`:

```ts
import { describe, expect, it } from 'vitest';
import {
  OFFICE_MAX_ZOOM_MULTIPLIER,
  OFFICE_PAN_OVERSCROLL_RATIO,
  clampOfficeCamera,
  createInitialOfficeCamera,
  getOfficeCameraLimits,
  panOfficeCamera,
  zoomOfficeCameraAt,
} from './agent-office-camera';

const viewport = { width: 800, height: 600 };
const world = { width: 1200, height: 750 };

describe('agent office camera', () => {
  it('centers the full office only for the initial transform', () => {
    expect(createInitialOfficeCamera({ viewport, world })).toEqual({
      x: 0,
      y: 50,
      scale: 2 / 3,
    });
  });

  it('caps zoom at exactly 1.8 times the fitted scale', () => {
    const limits = getOfficeCameraLimits({ viewport, world });

    expect(limits.minScale).toBeCloseTo(2 / 3);
    expect(limits.maxScale).toBeCloseTo(
      (2 / 3) * OFFICE_MAX_ZOOM_MULTIPLIER,
    );
  });

  it('preserves the world point underneath the zoom anchor', () => {
    const transform = createInitialOfficeCamera({ viewport, world });
    const anchor = { x: 600, y: 300 };
    const before = {
      x: (anchor.x - transform.x) / transform.scale,
      y: (anchor.y - transform.y) / transform.scale,
    };
    const zoomed = zoomOfficeCameraAt({
      transform,
      anchor,
      scaleFactor: 1.4,
      viewport,
      world,
    });

    expect((anchor.x - zoomed.x) / zoomed.scale).toBeCloseTo(before.x);
    expect((anchor.y - zoomed.y) / zoomed.scale).toBeCloseTo(before.y);
  });

  it('keeps pan inside the 12 percent viewport overscroll bounds', () => {
    const transform = createInitialOfficeCamera({ viewport, world });
    const panned = panOfficeCamera({
      transform,
      delta: { x: 10_000, y: -10_000 },
      viewport,
      world,
    });

    expect(panned.x).toBe(viewport.width * OFFICE_PAN_OVERSCROLL_RATIO);
    expect(panned.y).toBe(
      50 - (viewport.height * OFFICE_PAN_OVERSCROLL_RATIO),
    );
  });

  it('does not recenter when zooming out again at minimum scale', () => {
    const translatedAtMinimum = clampOfficeCamera({
      transform: { x: 72, y: 10, scale: 2 / 3 },
      viewport,
      world,
    });
    const afterExtraZoomOut = zoomOfficeCameraAt({
      transform: translatedAtMinimum,
      anchor: { x: 400, y: 300 },
      scaleFactor: 0.5,
      viewport,
      world,
    });

    expect(afterExtraZoomOut).toEqual(translatedAtMinimum);
    expect(afterExtraZoomOut).not.toEqual(
      createInitialOfficeCamera({ viewport, world }),
    );
  });
});
```

- [ ] **Step 2: Run the camera test and observe the missing-module failure**

Run:

```bash
rtk npm exec --workspace=apps/web vitest -- run src/app/agent-os/lib/agent-office-camera.spec.ts
```

Expected: FAIL because `agent-office-camera.ts` does not exist.

- [ ] **Step 3: Implement the DOM-free camera functions**

Create `agent-office-camera.ts`:

```ts
export interface OfficeSize {
  width: number;
  height: number;
}

export interface OfficeCameraPoint {
  x: number;
  y: number;
}

export interface OfficeCameraTransform extends OfficeCameraPoint {
  scale: number;
}

export interface OfficeCameraLimits {
  minScale: number;
  maxScale: number;
}

export const OFFICE_MAX_ZOOM_MULTIPLIER = 1.8 as const;
export const OFFICE_PAN_OVERSCROLL_RATIO = 0.12 as const;

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, value));
}

function axisBounds(input: {
  viewportLength: number;
  worldLength: number;
  scale: number;
}) {
  const scaledWorldLength = input.worldLength * input.scale;
  const centered = (input.viewportLength - scaledWorldLength) / 2;
  const halfOverflow = Math.max(
    0,
    (scaledWorldLength - input.viewportLength) / 2,
  );
  const travel =
    halfOverflow + input.viewportLength * OFFICE_PAN_OVERSCROLL_RATIO;

  return {
    minimum: centered - travel,
    maximum: centered + travel,
  };
}

export function getOfficeCameraLimits({
  viewport,
  world,
}: {
  viewport: OfficeSize;
  world: OfficeSize;
}): OfficeCameraLimits {
  if (
    viewport.width <= 0 ||
    viewport.height <= 0 ||
    world.width <= 0 ||
    world.height <= 0
  ) {
    return { minScale: 1, maxScale: OFFICE_MAX_ZOOM_MULTIPLIER };
  }

  const minScale = Math.min(
    viewport.width / world.width,
    viewport.height / world.height,
  );

  return {
    minScale,
    maxScale: minScale * OFFICE_MAX_ZOOM_MULTIPLIER,
  };
}

export function createInitialOfficeCamera({
  viewport,
  world,
}: {
  viewport: OfficeSize;
  world: OfficeSize;
}): OfficeCameraTransform {
  const { minScale } = getOfficeCameraLimits({ viewport, world });

  return {
    x: (viewport.width - world.width * minScale) / 2,
    y: (viewport.height - world.height * minScale) / 2,
    scale: minScale,
  };
}

export function clampOfficeCamera({
  transform,
  viewport,
  world,
}: {
  transform: OfficeCameraTransform;
  viewport: OfficeSize;
  world: OfficeSize;
}): OfficeCameraTransform {
  const limits = getOfficeCameraLimits({ viewport, world });
  const scale = clamp(transform.scale, limits.minScale, limits.maxScale);
  const xBounds = axisBounds({
    viewportLength: viewport.width,
    worldLength: world.width,
    scale,
  });
  const yBounds = axisBounds({
    viewportLength: viewport.height,
    worldLength: world.height,
    scale,
  });

  return {
    x: clamp(transform.x, xBounds.minimum, xBounds.maximum),
    y: clamp(transform.y, yBounds.minimum, yBounds.maximum),
    scale,
  };
}

export function panOfficeCamera({
  transform,
  delta,
  viewport,
  world,
}: {
  transform: OfficeCameraTransform;
  delta: OfficeCameraPoint;
  viewport: OfficeSize;
  world: OfficeSize;
}): OfficeCameraTransform {
  return clampOfficeCamera({
    transform: {
      x: transform.x + delta.x,
      y: transform.y + delta.y,
      scale: transform.scale,
    },
    viewport,
    world,
  });
}

export function zoomOfficeCameraAt({
  transform,
  anchor,
  scaleFactor,
  viewport,
  world,
}: {
  transform: OfficeCameraTransform;
  anchor: OfficeCameraPoint;
  scaleFactor: number;
  viewport: OfficeSize;
  world: OfficeSize;
}): OfficeCameraTransform {
  const limits = getOfficeCameraLimits({ viewport, world });
  const nextScale = clamp(
    transform.scale * scaleFactor,
    limits.minScale,
    limits.maxScale,
  );

  if (nextScale === transform.scale) return transform;

  const worldAnchor = {
    x: (anchor.x - transform.x) / transform.scale,
    y: (anchor.y - transform.y) / transform.scale,
  };

  return clampOfficeCamera({
    transform: {
      x: anchor.x - worldAnchor.x * nextScale,
      y: anchor.y - worldAnchor.y * nextScale,
      scale: nextScale,
    },
    viewport,
    world,
  });
}
```

- [ ] **Step 4: Run the camera test and verify it passes**

Run:

```bash
rtk npm exec --workspace=apps/web vitest -- run src/app/agent-os/lib/agent-office-camera.spec.ts
```

Expected: PASS with no React or DOM environment required.

- [ ] **Step 5: Commit the camera math**

```bash
rtk git add apps/web/src/app/agent-os/lib/agent-office-camera.ts apps/web/src/app/agent-os/lib/agent-office-camera.spec.ts
rtk git diff --cached --check
rtk git commit -m "feat: add bounded agent office camera math"
```

Expected: one commit containing only the camera module and its test.

---

### Task 3: Wrap the Complete Office in an Interactive Canvas

**Files:**
- Create: `apps/web/src/app/agent-os/components/AgentOfficeCanvas.spec.tsx`
- Create: `apps/web/src/app/agent-os/components/AgentOfficeCanvas.tsx`
- Modify: `apps/web/src/app/agent-os/components/AgentOfficeFloor.spec.tsx`
- Modify: `apps/web/src/app/agent-os/components/AgentOfficeFloor.tsx`
- Modify: `apps/web/src/app/agent-os/components/AgentOfficeMap.spec.tsx`
- Modify: `apps/web/src/app/agent-os/components/AgentOfficeMap.tsx`

**Interfaces:**
- Consumes: `OFFICE_WORLD_SIZE`, the Task 2 camera functions, the existing floor, avatars, activities, and selection callback.
- Produces:

```ts
export function AgentOfficeCanvas(props: {
  children: React.ReactNode;
  worldSize: OfficeSize;
  className?: string;
}): React.ReactElement;
```

- [ ] **Step 1: Write component tests for drag, exclusion, zoom, and cancellation**

Create `AgentOfficeCanvas.spec.tsx`:

```tsx
import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AgentOfficeCanvas } from './AgentOfficeCanvas';

const viewportRect = {
  x: 0,
  y: 0,
  top: 0,
  left: 0,
  right: 800,
  bottom: 600,
  width: 800,
  height: 600,
  toJSON: () => ({}),
};

class ResizeObserverMock {
  observe() {}
  unobserve() {}
  disconnect() {}
}

function scaleFrom(transform: string) {
  return Number(transform.match(/scale\(([^)]+)\)/)?.[1]);
}

describe('AgentOfficeCanvas', () => {
  beforeEach(() => {
    vi.stubGlobal('ResizeObserver', ResizeObserverMock);
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue(
      viewportRect,
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('frames once and pans after a four-pixel empty-floor threshold', () => {
    render(
      <AgentOfficeCanvas worldSize={{ width: 1200, height: 750 }}>
        <div>floor</div>
      </AgentOfficeCanvas>,
    );
    const viewport = screen.getByTestId('agent-office-canvas');
    const world = screen.getByTestId('agent-office-camera-world');
    const initialTransform = world.style.transform;

    fireEvent.pointerDown(viewport, {
      pointerId: 1,
      button: 0,
      clientX: 100,
      clientY: 100,
    });
    fireEvent.pointerMove(viewport, {
      pointerId: 1,
      clientX: 103,
      clientY: 102,
    });
    expect(world.style.transform).toBe(initialTransform);

    fireEvent.pointerMove(viewport, {
      pointerId: 1,
      clientX: 140,
      clientY: 120,
    });
    expect(world.style.transform).not.toBe(initialTransform);
    expect(viewport).toHaveAttribute('data-dragging', 'true');
  });

  it('does not start camera drag from a scene control', () => {
    render(
      <AgentOfficeCanvas worldSize={{ width: 1200, height: 750 }}>
        <button type="button">employee</button>
      </AgentOfficeCanvas>,
    );
    const viewport = screen.getByTestId('agent-office-canvas');
    const world = screen.getByTestId('agent-office-camera-world');
    const initialTransform = world.style.transform;

    fireEvent.pointerDown(screen.getByRole('button', { name: 'employee' }), {
      pointerId: 2,
      button: 0,
      clientX: 100,
      clientY: 100,
    });
    fireEvent.pointerMove(viewport, {
      pointerId: 2,
      clientX: 180,
      clientY: 180,
    });

    expect(world.style.transform).toBe(initialTransform);
    expect(viewport).toHaveAttribute('data-dragging', 'false');
  });

  it('zooms the complete world around wheel input without rendering controls', () => {
    render(
      <AgentOfficeCanvas worldSize={{ width: 1200, height: 750 }}>
        <div>floor</div>
      </AgentOfficeCanvas>,
    );
    const viewport = screen.getByTestId('agent-office-canvas');
    const world = screen.getByTestId('agent-office-camera-world');
    const initialScale = scaleFrom(world.style.transform);

    fireEvent.wheel(viewport, {
      clientX: 600,
      clientY: 300,
      deltaY: -160,
    });

    expect(scaleFrom(world.style.transform)).toBeGreaterThan(initialScale);
    expect(screen.queryByRole('button', { name: /확대|축소|전체 보기/ })).toBeNull();
  });

  it('ends dragging on pointer cancellation', () => {
    render(
      <AgentOfficeCanvas worldSize={{ width: 1200, height: 750 }}>
        <div>floor</div>
      </AgentOfficeCanvas>,
    );
    const viewport = screen.getByTestId('agent-office-canvas');

    fireEvent.pointerDown(viewport, {
      pointerId: 3,
      button: 0,
      clientX: 100,
      clientY: 100,
    });
    fireEvent.pointerMove(viewport, {
      pointerId: 3,
      clientX: 140,
      clientY: 140,
    });
    fireEvent.pointerCancel(viewport, { pointerId: 3 });

    expect(viewport).toHaveAttribute('data-dragging', 'false');
  });
});
```

Extend `AgentOfficeFloor.spec.tsx` inside the first test:

```ts
expect(meeting.style.width).toBe('');
expect(meeting.style.height).toBe('');
expect(meeting).toHaveAttribute('data-office-camera-control');
```

Extend the first `AgentOfficeMap.spec.tsx` test:

```ts
expect(screen.getByTestId('agent-office-canvas')).toBeInTheDocument();
expect(screen.getByTestId('agent-office-camera-world')).toContainElement(
  screen.getByTestId('agent-office-scene'),
);
expect(screen.queryByRole('button', { name: /확대|축소|전체 보기/ })).toBeNull();
```

- [ ] **Step 2: Run the focused component tests and observe the expected failures**

Run:

```bash
rtk npm exec --workspace=apps/web vitest -- run src/app/agent-os/components/AgentOfficeCanvas.spec.tsx src/app/agent-os/components/AgentOfficeFloor.spec.tsx src/app/agent-os/components/AgentOfficeMap.spec.tsx
```

Expected: FAIL because `AgentOfficeCanvas` does not exist, the map has no camera hierarchy, and zone buttons still cover complete rooms.

- [ ] **Step 3: Implement the camera viewport component**

Create `AgentOfficeCanvas.tsx`:

```tsx
'use client';

import {
  useCallback,
  useLayoutEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
  type WheelEvent as ReactWheelEvent,
} from 'react';
import { cn } from '@/lib/utils';
import {
  clampOfficeCamera,
  createInitialOfficeCamera,
  panOfficeCamera,
  zoomOfficeCameraAt,
  type OfficeCameraTransform,
  type OfficeSize,
} from '../lib/agent-office-camera';

const DRAG_THRESHOLD_PX = 4;
const WHEEL_ZOOM_SENSITIVITY = 0.0015;

interface DragState {
  pointerId: number;
  startClientX: number;
  startClientY: number;
  startCamera: OfficeCameraTransform;
  active: boolean;
}

function isCameraControl(target: EventTarget | null) {
  return (
    target instanceof Element &&
    target.closest(
      'button, a, input, textarea, select, [role="button"], [data-office-camera-control]',
    ) !== null
  );
}

export function AgentOfficeCanvas({
  children,
  worldSize,
  className,
}: {
  children: ReactNode;
  worldSize: OfficeSize;
  className?: string;
}) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const viewportSizeRef = useRef<OfficeSize>({ width: 0, height: 0 });
  const initializedRef = useRef(false);
  const dragRef = useRef<DragState | null>(null);
  const [dragging, setDragging] = useState(false);
  const [camera, setCamera] = useState<OfficeCameraTransform>({
    x: 0,
    y: 0,
    scale: 1,
  });
  const cameraRef = useRef(camera);

  const updateCamera = useCallback((next: OfficeCameraTransform) => {
    cameraRef.current = next;
    setCamera(next);
  }, []);

  const measureViewport = useCallback(
    (viewport: OfficeSize) => {
      if (viewport.width <= 0 || viewport.height <= 0) return;
      viewportSizeRef.current = viewport;

      if (!initializedRef.current) {
        initializedRef.current = true;
        updateCamera(createInitialOfficeCamera({ viewport, world: worldSize }));
        return;
      }

      updateCamera(
        clampOfficeCamera({
          transform: cameraRef.current,
          viewport,
          world: worldSize,
        }),
      );
    },
    [updateCamera, worldSize],
  );

  useLayoutEffect(() => {
    const viewportElement = viewportRef.current;
    if (!viewportElement) return;

    const rect = viewportElement.getBoundingClientRect();
    measureViewport({ width: rect.width, height: rect.height });

    if (typeof ResizeObserver === 'undefined') return;

    const observer = new ResizeObserver(([entry]) => {
      if (!entry) return;
      measureViewport({
        width: entry.contentRect.width,
        height: entry.contentRect.height,
      });
    });
    observer.observe(viewportElement);

    return () => observer.disconnect();
  }, [measureViewport]);

  const endDrag = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      const drag = dragRef.current;
      if (!drag || drag.pointerId !== event.pointerId) return;

      dragRef.current = null;
      setDragging(false);
      if (event.currentTarget.hasPointerCapture?.(event.pointerId)) {
        event.currentTarget.releasePointerCapture?.(event.pointerId);
      }
    },
    [],
  );

  return (
    <div
      ref={viewportRef}
      data-testid="agent-office-canvas"
      data-dragging={dragging ? 'true' : 'false'}
      className={cn(
        'relative h-full w-full select-none overflow-hidden bg-slate-100',
        dragging ? 'cursor-grabbing' : 'cursor-grab',
        className,
      )}
      style={{ touchAction: 'none' }}
      onPointerDown={(event) => {
        if (event.button !== 0 || isCameraControl(event.target)) return;

        dragRef.current = {
          pointerId: event.pointerId,
          startClientX: event.clientX,
          startClientY: event.clientY,
          startCamera: cameraRef.current,
          active: false,
        };
        event.currentTarget.setPointerCapture?.(event.pointerId);
      }}
      onPointerMove={(event) => {
        const drag = dragRef.current;
        if (!drag || drag.pointerId !== event.pointerId) return;

        const delta = {
          x: event.clientX - drag.startClientX,
          y: event.clientY - drag.startClientY,
        };
        if (!drag.active && Math.hypot(delta.x, delta.y) < DRAG_THRESHOLD_PX) {
          return;
        }

        drag.active = true;
        setDragging(true);
        event.preventDefault();
        updateCamera(
          panOfficeCamera({
            transform: drag.startCamera,
            delta,
            viewport: viewportSizeRef.current,
            world: worldSize,
          }),
        );
      }}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      onLostPointerCapture={(event) => {
        if (dragRef.current?.pointerId !== event.pointerId) return;
        dragRef.current = null;
        setDragging(false);
      }}
      onWheel={(event: ReactWheelEvent<HTMLDivElement>) => {
        const viewport = viewportSizeRef.current;
        if (viewport.width <= 0 || viewport.height <= 0) return;

        event.preventDefault();
        const rect = event.currentTarget.getBoundingClientRect();
        updateCamera(
          zoomOfficeCameraAt({
            transform: cameraRef.current,
            anchor: {
              x: event.clientX - rect.left,
              y: event.clientY - rect.top,
            },
            scaleFactor: Math.exp(
              -event.deltaY * WHEEL_ZOOM_SENSITIVITY,
            ),
            viewport,
            world: worldSize,
          }),
        );
      }}
    >
      <div
        data-testid="agent-office-camera-world"
        className="absolute left-0 top-0"
        style={{
          width: `${worldSize.width}px`,
          height: `${worldSize.height}px`,
          transform: `translate3d(${camera.x}px, ${camera.y}px, 0) scale(${camera.scale})`,
          transformOrigin: '0 0',
        }}
      >
        {children}
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Free empty floor from room-sized controls and share the intrinsic size**

In `AgentOfficeFloor.tsx`, import `OFFICE_WORLD_SIZE`, remove the local width and height constants, and replace the conversion helpers with:

```ts
function toCanvasX(value: number) {
  return (value / 100) * OFFICE_WORLD_SIZE.width;
}

function toCanvasY(value: number) {
  return (value / 100) * OFFICE_WORLD_SIZE.height;
}
```

Use the shared size in the SVG:

```ts
viewBox={`0 0 ${OFFICE_WORLD_SIZE.width} ${OFFICE_WORLD_SIZE.height}`}
```

Add this compact-label position helper:

```ts
function zoneLabelStyle(rect: OfficeRect) {
  return {
    left: `${rect.x + 1}%`,
    top: `${rect.y + 1}%`,
  };
}
```

Replace the zone button map with a non-interactive selected outline and compact button:

```tsx
{OFFICE_ZONES.map((zone) => (
  <div key={zone.id}>
    {selectedZoneId === zone.id ? (
      <span
        data-testid={`office-zone-highlight-${zone.id}`}
        aria-hidden="true"
        style={rectStyle(zone.hitRegion)}
        className="pointer-events-none absolute z-10 border border-purple-600/70 bg-purple-50/20"
      />
    ) : null}
    <button
      type="button"
      data-office-camera-control="true"
      aria-label={`${zone.label} 구역`}
      aria-pressed={selectedZoneId === zone.id}
      onClick={() =>
        setSelectedZoneId((current) =>
          current === zone.id ? null : zone.id,
        )
      }
      style={zoneLabelStyle(zone.hitRegion)}
      className={cn(
        'absolute z-20 rounded-md border bg-white/90 px-2 py-1 text-[11px] font-semibold shadow-sm',
        'border-slate-200 text-slate-600 hover:border-slate-400',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-600',
        selectedZoneId === zone.id &&
          'border-purple-600 text-purple-700',
      )}
    >
      {zone.label}
    </button>
  </div>
))}
```

Add `data-office-camera-control="true"` to each desk button. The generic control selector still protects every button even if this explicit marker is removed later.

- [ ] **Step 5: Put the floor and employees inside one camera world**

In `AgentOfficeMap.tsx`, import `OFFICE_WORLD_SIZE` and `AgentOfficeCanvas`, then replace the returned section with:

```tsx
return (
  <section
    aria-label="운영 캔버스"
    className={cn(
      'relative h-full min-h-0 overflow-hidden bg-slate-100',
      className,
    )}
  >
    <AgentOfficeCanvas worldSize={OFFICE_WORLD_SIZE}>
      <div
        data-testid="agent-office-scene"
        className="relative h-full w-full overflow-hidden border border-slate-200 bg-white shadow-sm"
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
    </AgentOfficeCanvas>
  </section>
);
```

- [ ] **Step 6: Run the canvas, floor, map, and avatar tests**

Run:

```bash
rtk npm exec --workspace=apps/web vitest -- run src/app/agent-os/components/AgentOfficeCanvas.spec.tsx src/app/agent-os/components/AgentOfficeFloor.spec.tsx src/app/agent-os/components/AgentOfficeMap.spec.tsx src/app/agent-os/components/AgentOfficeAvatar.spec.tsx
```

Expected: PASS. Drag changes the complete world transform, controls do not drag, wheel input changes scale, pointer cancellation clears dragging, and all existing selection tests remain green.

- [ ] **Step 7: Commit the interactive office canvas**

```bash
rtk git add apps/web/src/app/agent-os/components/AgentOfficeCanvas.tsx apps/web/src/app/agent-os/components/AgentOfficeCanvas.spec.tsx apps/web/src/app/agent-os/components/AgentOfficeFloor.tsx apps/web/src/app/agent-os/components/AgentOfficeFloor.spec.tsx apps/web/src/app/agent-os/components/AgentOfficeMap.tsx apps/web/src/app/agent-os/components/AgentOfficeMap.spec.tsx
rtk git diff --cached --check
rtk git commit -m "feat: add interactive agent office canvas"
```

Expected: one commit containing the canvas and its direct scene integration only.

---

### Task 4: Dock Operational Panels Outside the Canvas and Verify the Desktop Experience

**Files:**
- Modify: `apps/web/src/app/agent-os/components/AgentOfficeShell.spec.tsx`
- Modify: `apps/web/src/app/agent-os/components/AgentOfficeShell.tsx`

**Interfaces:**
- Consumes: the existing shell props and the Task 3 `AgentOfficeMap` canvas boundary.
- Produces: fixed `agent-office-staff-rail`, `agent-office-viewport`, `agent-office-detail-rail`, and `agent-office-command-row` layout regions.

- [ ] **Step 1: Write the shell ownership-boundary assertions**

In the first `AgentOfficeShell.spec.tsx` test, add these assertions before opening activity:

```ts
const workspace = screen.getByTestId('agent-office-workspace');
const staffRail = screen.getByTestId('agent-office-staff-rail');
const viewport = screen.getByTestId('agent-office-viewport');
const detailRail = screen.getByTestId('agent-office-detail-rail');
const commandRow = screen.getByTestId('agent-office-command-row');
const canvas = screen.getByTestId('agent-office-canvas');

expect(workspace.className).toContain('grid-cols-[240px_minmax(480px,1fr)_300px]');
expect(viewport).toContainElement(canvas);
expect(staffRail).not.toContainElement(canvas);
expect(detailRail).not.toContainElement(canvas);
expect(commandRow).not.toContainElement(canvas);
expect(screen.queryByRole('button', { name: /확대|축소|전체 보기/ })).toBeNull();
```

After clicking `시스템 활동 기록 열기`, add:

```ts
expect(detailRail).toContainElement(
  screen.getByRole('region', { name: '시스템 활동 기록' }),
);
```

- [ ] **Step 2: Run the shell test and observe the missing-region failure**

Run:

```bash
rtk npm exec --workspace=apps/web vitest -- run src/app/agent-os/components/AgentOfficeShell.spec.tsx
```

Expected: FAIL because the panels and command dock are still absolutely positioned over the scene and the new region test ids do not exist.

- [ ] **Step 3: Replace floating overlays with the fixed desktop grid**

Keep the existing imports, props, selection lookup, and activity state. Replace the returned JSX in `AgentOfficeShell.tsx` with:

```tsx
return (
  <div className="min-h-screen min-w-[1080px] overflow-hidden bg-slate-950 text-white">
    <div className="flex h-screen flex-col gap-3 p-3">
      <AgentOfficeHeader
        totals={model.totals}
        refreshing={refreshing}
        activityOpen={activityOpen}
        onRefresh={onRefresh}
        onToggleActivity={() => setActivityOpen((open) => !open)}
      />
      <main
        data-testid="agent-office-workspace"
        className="grid min-h-0 flex-1 grid-cols-[240px_minmax(480px,1fr)_300px] grid-rows-[minmax(0,1fr)_auto] gap-3 overflow-hidden"
      >
        <div
          data-testid="agent-office-staff-rail"
          className="row-span-2 min-h-0 overflow-y-auto"
        >
          <AgentStaffPanel
            model={model}
            selectedNodeId={selectedNodeId}
            onSelectNode={onSelectNode}
          />
        </div>

        <div
          data-testid="agent-office-viewport"
          className="min-h-0 overflow-hidden rounded-lg border border-slate-300 bg-slate-100 shadow-2xl shadow-black/25"
        >
          <AgentOfficeMap
            className="h-full min-h-0"
            nodes={model.nodes}
            activities={model.activities}
            selectedNodeId={selectedNodeId}
            onSelectNode={onSelectNode}
          />
        </div>

        <div
          data-testid="agent-office-detail-rail"
          className="row-span-2 flex min-h-0 flex-col gap-3 overflow-y-auto"
        >
          <AgentInspector node={selectedNode} />
          {activityOpen ? (
            <AgentActivityDrawer activities={model.activities} />
          ) : null}
        </div>

        <div
          data-testid="agent-office-command-row"
          className="min-w-0"
        >
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
```

This grid yields `240 + 480 minimum + 300 + two 12px gaps = 1044px`, which fits inside the existing `1080px` desktop minimum after 24px page padding. The side rails span both rows, while the command dock occupies only the row below the central canvas.

- [ ] **Step 4: Run all Agent OS route tests**

Run:

```bash
rtk npm exec --workspace=apps/web vitest -- run src/app/agent-os
```

Expected: PASS for every Agent OS model, hook, page, panel, floor, avatar, canvas, map, and shell test.

- [ ] **Step 5: Run the complete frontend regression gates**

Run:

```bash
rtk npm exec --workspace=apps/web vitest -- run
rtk npm run build --workspace=apps/web
```

Expected: the complete web Vitest suite passes and the Next.js production build completes with `/agent-os` in the route output.

- [ ] **Step 6: Verify the authenticated desktop interaction in the in-app browser**

Use `docs/runbooks/dev-preview-with-auth.md`. Reuse the existing server when healthy. If the web process is unavailable, start it with:

```bash
rtk env KIDITEM_PROXY_ALL_API=true NEXT_PUBLIC_API_URL= npm run dev --workspace=apps/web
```

Open `http://localhost:3000/agent-os` in the in-app browser and verify at both `1098x935` and `1440x900`:

1. Initial load shows all seven employees and the complete office without employee-to-employee, employee-to-label, or employee-to-panel overlap.
2. Staff, profile, activity, and command regions remain outside the clipped canvas.
3. Dragging at least 4px from empty floor pans floor, desks, and employees together; the four fixed operational regions do not move.
4. Dragging from an employee, desk, or zone label does not move the camera and still performs its selection action.
5. Wheel or trackpad-pinch zoom keeps the pointer's office location stable and never exceeds 1.8 times the fitted scale.
6. Repeated zoom-out at minimum scale leaves the translated camera position unchanged.
7. `pointercancel` or lost capture ends the grabbing cursor without changing selection.
8. Opening system activity places it below the profile in the right rail.
9. Employee selection, command preset selection, command input, refresh, and dashboard navigation remain usable.
10. No zoom toolbar, minimap, reset button, zoom percentage, or camera instructions are visible.

Capture the implementation at both desktop sizes. In one image comparison input, inspect `/tmp/openclaw-office-reference.png` together with each new implementation capture. Confirm the implementation matches the reference's light code-driven office density and spatial interaction while retaining KidItem's existing controls, colors, labels, and employee taxonomy.

- [ ] **Step 7: Commit the non-overlapping shell layout after all gates pass**

```bash
rtk git add apps/web/src/app/agent-os/components/AgentOfficeShell.tsx apps/web/src/app/agent-os/components/AgentOfficeShell.spec.tsx
rtk git diff --cached --check
rtk git commit -m "refactor: dock agent office controls outside canvas"
```

Expected: one final focused commit for the shell layout, with unrelated dirty files still untouched and the development server left running for review.

---

## Completion Evidence

Implementation is complete only when the final report includes:

- the four focused commit hashes;
- the Agent OS route-test result;
- the complete web Vitest result;
- the production build result;
- authenticated in-app browser confirmation at `1098x935` and `1440x900`;
- confirmation that all seven employees are collision-free in the fitted view and across every status destination pair;
- confirmation that empty-floor drag and pointer-centered zoom move the entire office world;
- confirmation that fixed panels never cover the canvas and no visible camera controls or reset behavior were added;
- the still-running local URL `http://localhost:3000/agent-os`.
