# Agent OS Interactive Office Scene Design

Date: 2026-07-10
Status: Approved design, in implementation

## Summary

Replace the static office photograph inside `/agent-os` with an interactive
2D office scene inspired by OpenClaw Office. The benchmark scope is limited to
the background style and scene interactions.

The existing KidItem Agent OS shell, employee taxonomy, Hermes runtime,
profile inspector, command composer, activity data, and backend contracts
remain authoritative. OpenClaw navigation, metrics, branding, Agent/SubAgent
semantics, and chat/console information architecture are not part of this
change.

## Decision

The selected approach is a **code-driven semantic office scene**:

- an SVG floor-plan layer renders rooms, corridors, furniture, and fixed desk
  fixtures using the same runtime composition approach as OpenClaw Office;
- a route-local scene manifest defines zones, employee seats, status
  destinations, hit regions, and movement paths in normalized coordinates;
- semantic HTML controls render employees and interactive desks over the
  SVG floor;
- generated transparent raster portraits provide stable employee identities;
- existing Agent OS data determines every employee state and movement.

This keeps rooms and furniture independently addressable while making the
office meaningful and testable. The result must not be a photograph with
decorative labels placed on top.

## Reference

Primary reference:

- [OpenClaw Office](https://github.com/WW-AI-Lab/openclaw-office)
- [Office reference image](https://github.com/WW-AI-Lab/openclaw-office/blob/main/assets/office.png)
- [2D office components](https://github.com/WW-AI-Lab/openclaw-office/tree/main/src/components/office-2d)

Benchmark these characteristics:

- light gray and desaturated blue floor-plan palette;
- clear room boundaries, desk slots, corridors, and meeting/lounge areas;
- compact employee avatars with status rings and labels;
- visible but restrained status animation;
- employee selection and speech/activity bubbles;
- movement between meaningful scene anchors.

Do not copy:

- the OpenClaw name, logo, labels, or language;
- header navigation, right-side analytics, chat, or console layout;
- OpenClaw Agent/SubAgent identity rules;
- token, collaboration-rate, or gateway metrics;
- OpenClaw business semantics or product-specific content.

The floor composition benchmarks OpenClaw Office's MIT-licensed SVG approach.
KidItem owns its room geometry, palette, seats, employee assets, data mapping,
and interaction implementation, and retains the upstream license notice next
to the adapted scene component.

## Scope

### In Scope

- replace the current `office-floor.png` scene skin;
- replace free-positioned employee cards with scene-aware employee controls;
- make desks, employees, and status destinations selectable or inspectable;
- animate employees only when structured Agent OS state changes;
- show status, selection, approval, and active-work feedback in the scene;
- preserve the current staff panel, inspector, command dock, activity drawer,
  refresh action, and dashboard navigation;
- dock the staff panel, inspector, activity record, and command dock outside
  the movable scene viewport;
- support bounded empty-floor drag and wheel or trackpad-pinch zoom;
- keep all default employee and status destinations collision-free;
- support the current desktop-only minimum width.

### Out of Scope

- no 3D, Three.js, PixiJS, Phaser, or game-engine dependency;
- no React Flow scene implementation;
- no backend, schema, Hermes adapter, or runtime changes;
- no new employee, capability, or Agent OS identity definitions;
- no random wandering or simulated conversations;
- no collaboration line without a structured employee-to-employee relation;
- no user-authored layout editor or persisted scene geometry;
- no drag-to-reassign behavior;
- no infinite canvas, camera rotation, minimap, visible camera toolbar, camera
  reset command, or persisted camera position;
- no OpenClaw header, navigation, analytics, chat, or console clone;
- no mobile or touch-specific layout work.

## Product Semantics

The office contains only KidItem employees as people. The current seven
employee types remain the only employee avatars:

- `manager`;
- `ad_strategy`;
- `chat` (customer/operations response);
- `sourcing`;
- `listing`;
- `order`;
- `channel_registration`.

Capabilities remain attached to their owning employee and appear in the
inspector. Models, adapters, tools, execution sessions, runs, and capabilities
must not become additional employee avatars.

Runs affect an employee only through the existing authoritative status and
activity projection; they do not occupy a seat. This prevents the visual
office from inflating the workforce whenever Hermes starts another execution.

## Visual Design

### Scene Floor

Create a desktop SVG floor composed at runtime. The floor has:

- a stable wide view box that fills the central canvas without cropping;
- a light `slate-50` base with pale blue-gray room fills;
- strong enough room and corridor boundaries to remain legible behind UI;
- seven clearly usable employee desk positions;
- a waiting/lounge anchor and an approval/meeting anchor;
- restrained furniture density so employee labels do not overlap assets;
- no logos, employee avatars, or baked-in status badges.

Decorative furniture remains in the SVG layer. Interactive meaning comes from
the scene manifest and semantic controls rendered above it.

### Scene Integration

Lay out the desktop shell as three non-overlapping columns using approximately
`240px minmax(480px, 1fr) 300px`: staff panel, clipped office viewport, and
profile/activity rail. Place the command dock in a dedicated row below the
office viewport. The activity record expands below the profile inside the
scrollable right rail. Fixed operational controls never occupy the scene's hit
area, and employees cannot be hidden underneath them.

The central viewport clips one 8:5 office world. Its initial state frames the
full office. The user may move and zoom only that world; the header, panels,
activity record, and command dock remain fixed. Do not add explanatory copy or
visible camera controls.

Use KidItem design tokens for controls and state:

- purple for selection and primary interaction;
- green for ready/success;
- amber for waiting;
- red for blocked/approval-required or failed states;
- slate for offline and secondary scene details.

OpenClaw's palette informs the office floor only. It does not replace the
KidItem design system.

### Employees

Employee controls use real avatar assets rather than generic person icons.
Each avatar has:

- a stable visual identity;
- a compact status ring;
- employee name and role label;
- a selected state with a purple focus ring;
- a blocked state that is clear without relying only on color;
- a visible keyboard focus state.

Labels must remain one or two compact lines and must not overlap neighboring
employees or fixed furniture.

## Scene Model

Move layout ownership out of `agent-office-model.ts`. Business projection
continues to return employees, statuses, counts, capabilities, and activity,
but it no longer owns scene coordinates.

Add a route-local scene model with these concepts:

```ts
type OfficePoint = { x: number; y: number };

type OfficeSeat = {
  id: string;
  employeeType: string;
  desk: OfficePoint;
  idle: OfficePoint;
  waiting: OfficePoint;
  blocked: OfficePoint;
  paths: Partial<Record<AgentOfficeNodeStatus, OfficePoint[]>>;
};

type OfficeZone = {
  id: string;
  label: string;
  hitRegion: { x: number; y: number; width: number; height: number };
};
```

All coordinates are normalized to the scene's intrinsic dimensions. Resizing
the page scales the SVG floor and every scene entity together without changing
the business model.

Unknown future employee types use deterministic overflow seats. They must not
overlap an existing employee or silently disappear.

## Components

### `AgentOfficeMap`

Remains the public scene boundary used by `AgentOfficeShell`. It composes the
floor and employee layers inside the camera world but does not own shell panel
placement.

### `AgentOfficeCanvas`

Owns the clipped viewport, pointer capture, drag threshold, wheel/pinch zoom,
and the transform applied to the complete office world. It ignores pointer
starts from employees, desks, zone labels, and other controls so selection is
never mistaken for camera movement.

### `agent-office-camera.ts`

Contains pure fit, focal-point zoom, and translation-bound calculations. It
has no React or DOM dependency and uses viewport and world dimensions supplied
by the canvas component.

### `AgentOfficeFloor`

Renders the SVG office floor, seven fixed desk fixtures, and semantic zone hit
regions. Zone controls expose their names to assistive technology and show a
restrained hover/focus treatment.

### `AgentOfficeAvatar`

Replaces the generic `AgentOfficeNode` presentation. It renders the avatar,
status ring, compact label, selected state, and activity bubble. Clicking or
pressing Enter/Space selects the existing employee and opens the existing
inspector flow.

### `agent-office-layout.ts`

Owns zones, seats, anchors, normalized hit regions, overflow placement, and
motion paths. It contains no API calls or Agent OS business-state mapping.

## Interaction Model

### Selection

- Selecting an employee from either the scene or staff panel updates the same
  `selectedNodeId` state.
- Selection highlights the employee in both surfaces and updates the existing
  inspector and command target.
- Clicking the selected employee again does not clear the command target.
- Selecting a desk selects its assigned employee.

### Status Destinations

Employee destination is derived from the existing authoritative status:

| Status | Scene destination | Feedback |
|---|---|---|
| `working` | assigned desk | active monitor/status pulse |
| `idle` | employee idle anchor | ready ring, no continuous motion |
| `waiting` | waiting anchor | amber waiting badge |
| `blocked` | approval/meeting anchor | alert icon and approval badge |
| `offline` | assigned desk | desaturated avatar and disabled motion |

When polling changes an employee status, animate from the previous anchor to
the new anchor along the configured path. Initial render places the employee
at the current destination without an entrance animation.

### Motion Rules

- motion is caused only by a structured status transition;
- no random walking, idle wandering, or fabricated meetings;
- use transform/opacity animation, not React state updates on every frame;
- movement must not shift the surrounding layout;
- `prefers-reduced-motion` places employees directly at their destination;
- stale or refetched identical data must not replay an animation.

### Activity Feedback

When an employee status changes, show the latest safe activity label associated
with that employee for six seconds. Do not replay the bubble for an unchanged
poll result or initial render. Bubble content uses labels already exposed by
the view model. It must not expose hidden model reasoning, raw prompts, tool
input/output, or secrets.

### Scene Navigation

The initial view frames the full office. On empty floor, primary-button drag
moves the office world after a small movement threshold. Wheel and trackpad
pinch zoom around the pointer position. Zoom is bounded from the initial fit
scale to 1.8 times that scale. Translation is bounded so a meaningful portion
of the office always remains inside the viewport.

There is no visible camera toolbar, minimap, automatic whole-office command,
keyboard reset, or explicit reset interaction. Camera state is local to the
mounted page and is not persisted. Cursor feedback changes between grab and
grabbing; no instructional text is added.

The centered full-office transform is applied only on initial mount. Reaching
the minimum scale clamps scale only and does not recenter, fit, or otherwise
replace the current allowed translation.

Employee, desk, zone-label, panel, and command interactions retain their
existing click behavior and never start a drag. Camera movement is immediate
and does not use decorative easing.

### Collision And Visibility Rules

- staff, profile, activity, and command surfaces remain outside the clipped
  canvas at every supported desktop width;
- assigned desks and every status destination use unique slots sized for the
  avatar, status badge, and two-line label footprint;
- the default fitted view shows all seven employees and labels without
  employee-to-employee or employee-to-control overlap;
- intentional user camera movement may move scene content outside the clipped
  viewport, but it can never place content underneath a fixed panel because
  the panels are not part of the viewport;
- selecting or moving an employee does not alter the camera transform.

## Data Flow

```text
Nest Agent OS APIs
  -> existing React Query polling
  -> buildAgentOfficeModel
  -> employee business view model
  -> AgentOfficeMap
  -> AgentOfficeCanvas camera transform
  -> scene layout + status destination
  -> avatar, desk, bubble, and connection layers
```

The frontend does not infer task success, approval resolution, collaboration,
or employee identity from visual state. Structured Agent OS records remain the
source of truth.

No new polling interval, WebSocket, SSE stream, or backend endpoint is required
for this scene redesign.

Camera state is presentation-only local state. Agent OS records remain the
only input to employee placement and status movement.

## Loading And Error States

- During initial loading, preserve the existing full-page loading treatment.
- During background refetch, keep the current scene visible and use the
  existing refresh indicator.
- If an employee has no configured seat, place it in an overflow seat and log
  no user-visible technical error.
- If an employee portrait fails to load, use the generated default portrait;
  selection and command routing must still work.
- If there are no employee instances, show the empty office with the existing
  operational empty state instead of mock employees.
- A failed query must not animate employees or reset the current selection.
- Losing pointer capture or receiving `pointercancel` ends camera dragging
  without changing selection.
- A viewport resize recomputes fit dimensions and clamps the current transform
  into the new bounds without persisting it.

## Accessibility

- The scene has a descriptive `aria-label` and does not rely on decorative
  floor graphics for employee state.
- Employees and interactive desks are real buttons with unique accessible
  names.
- Status names are exposed as text, not color alone.
- Keyboard selection follows the same behavior as pointer selection.
- Decorative floor and furniture are hidden from assistive technology.
- Motion respects `prefers-reduced-motion`.
- Camera manipulation is progressive enhancement; all employees and commands
  remain reachable through the fixed staff panel without manipulating the
  camera.

## Testing

### Unit Tests

- employee type maps to the expected seat and status destination;
- overflow seats are deterministic and non-overlapping;
- unchanged status does not create a new movement transition;
- reduced-motion mode resolves directly to the destination;
- scene layout coordinates remain independent of the business view model;
- focal-point zoom preserves the world point under the cursor;
- camera scale and translation remain inside their bounds;
- reaching minimum scale preserves the allowed translation and does not
  recenter the office;
- all seven desk, idle, waiting, blocked, and offline footprints are
  collision-free in the fitted view;
- employee status never creates speculative collaboration lines.

### Component Tests

- scene and staff panel share selection state;
- clicking a desk selects its assigned employee;
- selecting an employee updates the inspector and command target;
- each status renders its text and non-color indicator;
- an avatar-load failure keeps employee controls usable;
- empty-floor drag moves the world while employee and desk clicks do not;
- wheel/pinch input zooms the floor and employees as one world;
- pointer cancellation ends dragging cleanly;
- empty employee data does not create mock avatars.

### Regression Gates

- existing `agent-office-model` behavior and employee/capability taxonomy tests;
- existing command dock, inspector, activity drawer, redirect, and route tests;
- `npm run build --workspace=apps/web`.

### Visual Verification

Verify `/agent-os` in the in-app browser at desktop widths only. Compare the
captured OpenClaw Office reference and the implemented office in a single
side-by-side review at the same viewport.

Confirm:

- the scene is recognizably grounded in the reference's light 2D office style;
- every employee is visibly associated with a desk or status destination;
- labels and panels do not overlap employees;
- the panels and command dock remain fixed while the office pans and zooms;
- empty-floor drag and pointer-centered zoom remain bounded;
- selected, working, waiting, blocked, idle, and offline states are distinct;
- the command dock, staff panel, inspector, activity drawer, refresh action,
  and dashboard navigation remain usable;
- the scene contains no baked-in OpenClaw branding or fake employee data.

## Relationship To Existing Designs

This design supersedes the execution-canvas visual model as the default
`/agent-os` scene. It does not supersede the Agent OS Hermes tool-loop design,
KidItem source-of-truth boundaries, approval behavior, artifact behavior, or
runtime safety rules.

The office is a presentation of structured Agent OS state, not a workflow
builder, task simulator, or alternate runtime.

## Completion Criteria

The redesign is complete when:

1. the static current office photograph is no longer the primary scene;
2. the office matches the approved OpenClaw-inspired background direction;
3. seven KidItem employees remain the only person-like scene entities;
4. selection, desk interaction, status feedback, and event-driven movement
   work from existing Agent OS data;
5. no random or fabricated activity is displayed;
6. existing Agent OS controls and backend contracts continue to work;
7. the bounded camera works without visible camera controls or reset behavior;
8. the fitted view contains no employee, label, or fixed-control overlap;
9. route tests and the web production build pass;
10. desktop visual comparison confirms the reference alignment.
