# Agent OS Dashboard Light Theme Design

## Context

The `/agent-os` office now has a bounded interactive canvas and fixed staff,
profile, activity, and command regions. Those operational regions still use a
hard-coded dark treatment that conflicts with the approved light office floor
and KidItem Dashboard.

This design applies the Dashboard's default light visual language to the
complete Agent OS shell without changing its layout, data, or interaction
model.

## Goals

- make `/agent-os` read as part of the same product as `/dashboard`;
- use the Dashboard light background, white surfaces, slate text, subtle
  borders, and restrained shadows;
- retain semantic employee status colors and the current purple selection
  color;
- preserve the office canvas, employee placement, drag, zoom, selection,
  activity, and command behavior.

## Out Of Scope

- no layout, camera, floor geometry, employee, capability, or data changes;
- no new theme toggle or automatic light/dark synchronization;
- no dark Agent OS variant;
- no Dashboard navigation, KPI card, chart, or sidebar cloning;
- no backend, API, schema, polling, or persistence changes;
- no mobile work.

## Visual Source Of Truth

Use the existing Dashboard and root light tokens as the visual source:

```text
background        #f8fafc  / --background
surface           #ffffff  / --surface
surface sunken    #f1f5f9  / --surface-sunken
border            #e2e8f0  / --border
border subtle     #f1f5f9  / --border-subtle
text primary      #0f172a  / --text-primary
text secondary    #334155  / --text-secondary
text tertiary     #64748b  / --text-tertiary
text muted        #94a3b8  / --text-muted
primary           #7c3aed  / --primary
primary soft      #f5f3ff  / --primary-soft
```

The Agent OS route is an explicitly light surface. Use the concrete Dashboard
light classes or equivalent light token values so a document-level `.dark`
class cannot turn only part of the fullscreen office dark.

## Surface Treatment

### Page And Header

- page background is `slate-50` with `slate-900` primary text;
- the header is a white surface with a `slate-200` border and `shadow-sm`;
- summary counters use `slate-50` fills and `slate-200` borders;
- refresh, activity, and dashboard controls use slate text with a
  `slate-100` hover state;
- the existing indigo Agent OS icon remains the primary brand signal.

### Staff Panel

- use a white panel, `slate-200` border, and restrained shadow;
- unselected employees use white or `slate-50` rows with slate text;
- selected employee uses `purple-50`, `purple-300`, and `purple-700`;
- status dots retain cyan, emerald, amber, rose, and slate semantics;
- counts use compact `slate-100` chips.

### Employee Profile

- use a white panel with slate hierarchy and no backdrop blur;
- metadata and capability sections use `slate-50` fills and `slate-200`
  separators;
- model, adapter, trust, folder, run, and approval values use `slate-900`;
- folder and capability accents use `purple-600` rather than cyan-on-dark;
- status badges retain their existing semantic meaning.

### Activity Record

- use a white surface with a sticky white header;
- rows use `slate-100` separators and slate typography;
- activity icons use a `purple-50` tile and `purple-600` foreground;
- keep the current event labels, ordering, and scroll behavior.

### Command Dock

- use a white panel with a `slate-200` border and `shadow-sm`;
- the target icon uses `purple-50` and `purple-600`;
- quick commands use white or `slate-50` buttons with slate borders;
- the input uses a `slate-50` surface, `slate-200` border, and slate text;
- the enabled send button uses the Dashboard primary purple and white icon;
- disabled controls remain visibly disabled without relying only on opacity.

### Office Canvas

The floor, furniture, zone labels, employee portraits, status badges, and
camera cursors remain unchanged. The canvas border and surrounding frame use
the same slate border and subtle shadow as Dashboard panels.

## Interaction And Accessibility

- existing keyboard focus rings remain visible against white surfaces;
- primary interactive focus uses purple with sufficient contrast;
- status text remains present so color is not the only status signal;
- light text is never placed on a light surface;
- no translucent dark overlays or `backdrop-blur` remain in Agent OS
  operational panels;
- all current accessible names, roles, pressed states, and command behavior
  remain unchanged.

## Data And Error Behavior

The theme consumes no new data. Loading, query failure, refresh, empty office,
selection, activity, and command states keep their existing behavior and copy.
Only their visual classes change.

## Testing

### Component Tests

- shell root exposes a light page background and dark primary text;
- header, staff, profile, activity, and command surfaces use white/light
  classes and no `bg-slate-950` or dark translucent panel class;
- selected staff state uses the purple light selection treatment;
- command input and enabled send button use light input and primary action
  styles;
- existing Agent OS behavior tests continue to pass unchanged.

### Visual Verification

Verify the authenticated `/agent-os` route in the in-app browser at
`1098x935` and `1440x900`. Compare the Dashboard reference and Agent OS
capture in one image review. Confirm:

- the page background, panel surfaces, border strength, text hierarchy, and
  shadows match Dashboard's light language;
- the office remains the central visual surface;
- all seven employees and labels remain visible and non-overlapping;
- fixed panels remain outside the camera viewport;
- drag, zoom, employee selection, activity, command presets, refresh, and
  dashboard navigation still work;
- no dark operational panel, dark command input, or mixed-theme fragment
  remains.

## Completion Criteria

The theme change is complete when every Agent OS operational surface is light,
the office interaction contract is unchanged, all Agent OS and web regression
tests pass, the production build succeeds, and desktop comparison confirms
visual alignment with Dashboard.
