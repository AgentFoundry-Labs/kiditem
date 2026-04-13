# KidItem Design System

E-commerce operations dashboard. Data-dense APP UI. Light theme only.

## Color System

### Semantic Tokens (CSS Variables in `globals.css`)

| Token | Value | Usage |
|-------|-------|-------|
| `--background` | `#f8fafc` (gray-50) | Page background |
| `--foreground` | `#0f172a` (slate-900) | Primary text |
| `--card` | `#ffffff` | Card/surface background |
| `--border` | `#e2e8f0` (slate-200) | Default borders |
| `--muted` | `#64748b` (slate-500) | Secondary text |

### Tailwind Palette

| Role | Class | Hex | When |
|------|-------|-----|------|
| Primary accent | `purple-600` | `#9333ea` | Buttons, active states, sort indicators, badges, tabs |
| Primary hover | `purple-700` | `#7e22ce` | Button hover states |
| Success | `green-600` | `#16a34a` | Positive values, confirmed status |
| Warning | `amber-500` / `orange-600` | `#f59e0b` / `#ea580c` | Low margins, caution |
| Danger | `red-600` | `#dc2626` | Negative values, errors, delete actions |
| Text primary | `slate-900` | `#0f172a` | Headings, bold values |
| Text secondary | `slate-700` | `#334155` | Body text, table cells |
| Text tertiary | `slate-500` | `#64748b` | Labels, captions |
| Text quaternary | `slate-400` | `#94a3b8` | Placeholders, disabled |
| Surface sunken | `slate-50` / `gray-50` | `#f8fafc` | Table headers, page bg |
| Border default | `slate-200` | `#e2e8f0` | Cards, table borders |
| Border subtle | `slate-100` | `#f1f5f9` | Row separators |

### Color Rules

- No blue as primary. Blue (`blue-600`) is legacy accent; purple is the current standard.
- Profit colors: `green-600` positive, `red-600` negative, `orange-500` for low margins (0-3%).
- Grade colors: A = `purple-600`, B = `slate-600`, C = `orange-600`.

## Typography

- **Font**: System default with `font-feature-settings: 'cv02', 'cv03', 'cv04', 'cv11'`
- **Page title**: `text-2xl font-bold text-slate-900` (`.page-title`)
- **Section title**: `text-sm font-semibold text-slate-900` (`.section-title`)
- **Stat value**: `text-3xl font-bold tracking-tight` (`.stat-value`)
- **Card label**: `text-sm text-slate-500` (`.card-label`)
- **Card value**: `text-xl font-bold text-slate-900 mt-1` (`.card-value`)
- **Table header**: `text-xs font-semibold text-slate-500 uppercase tracking-wider`
- **Table cell**: `text-sm text-slate-700`
- **Tabular numbers**: Always use `tabular-nums` for numeric columns in tables.

## Spacing

- **Page padding**: handled by layout (sidebar + content area)
- **Section gap**: `space-y-6` between major sections
- **Card grid**: `grid grid-cols-4 gap-4` for summary cards
- **Card padding**: `p-4` standard, `p-5` for larger cards, `p-6` for modals
- **Table cell padding**: `px-4 py-3`

## Components

### Cards

```
.card         → bg-white rounded-xl border border-slate-200 p-4
.glass-card   → bg-white shadow-sm border border-slate-200 rounded-xl
.table-card   → bg-white rounded-xl border border-slate-200 overflow-hidden
```

### Buttons

```
.btn-primary   → purple-600 bg, white text, rounded-lg, hover:purple-700
.btn-secondary → white bg, slate-600 text, slate-200 border, hover:slate-50
.btn-danger    → red-600 bg, white text, rounded-lg, hover:red-700
.btn-sm        → px-3 py-1.5 text-xs (modifier)
```

Inline small buttons: `px-3 py-1.5 text-xs font-medium rounded-md` (no utility class).

### Tables

Global base styles in `@layer base` (globals.css):
- `thead`: `bg-slate-50 border-b border-slate-200`
- `th`: left-aligned, uppercase, tracking-wider, `text-xs font-semibold text-slate-500`
- `td`: `text-slate-700 whitespace-nowrap`
- `tbody tr`: `border-b border-slate-100 hover:bg-slate-50`
- Numeric columns: `text-right tabular-nums`

### Sortable Headers

Pattern: `<th>` contains a `<button>` with `aria-sort` attribute.
Icons: `ArrowUpDown` (inactive, slate-400), `ArrowUp`/`ArrowDown` (active, purple-600).
Size: 14px.

### Tabs (pill style)

```
.tab          → px-4 py-2 rounded-lg text-sm font-medium
.tab-active   → bg-purple-600 text-white
.tab-inactive → bg-white border border-slate-200 text-slate-600 hover:bg-slate-50
```

### Modals

```
.modal-overlay → fixed inset-0 bg-black/50 flex items-center justify-center z-50
.modal-content → bg-white rounded-xl p-6 w-[480px] max-h-[90vh] overflow-y-auto
```

### Empty States

Icon (48px, `text-slate-300`) + message (`text-slate-500`) + optional action button.
Container: `card p-12 text-center` or `empty-state` (`.empty-state → text-center py-12 text-slate-400 text-sm`).

### Period Selector

`usePeriodSelector` hook + `PeriodSelector` component. Returns month-level options.
Options: `{ months: N, defaultTo: 'prev' | 'current' }`.

### Pagination

`Pagination` component from `components/ui/Pagination.tsx`.
Props: `page`, `limit`, `total`, `onPageChange`.
Active page: `bg-purple-600 text-white`. 7-page window.

### Progress Bars

```
<div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden"
     role="progressbar" aria-valuenow={rate} aria-valuemin={0} aria-valuemax={100}>
  <div className={`h-full rounded-full ${colorClass}`}
       style={{ width: `${Math.min(rate, 100)}%` }} />
</div>
```

Color thresholds: `green-500` (100%+), `blue-500` (70%+), `amber-500` (50%+), `red-500` (below).

## Icons

- **Library**: Lucide React only. No other icon libraries.
- **Import**: `import { IconName } from 'lucide-react'`
- **Sizes**: 12px (inline), 14px (sort indicators), 16px (buttons), 20-24px (titles), 48px (empty states)

## Formatting

All formatting via utilities in `lib/utils.ts`:
- `formatNumber()` — `Intl.NumberFormat('ko-KR')`
- `formatKRW()` / `formatCurrency()` — KRW currency
- `formatPercent()` — 1 decimal
- `formatDateTime()` / `formatDate()` / `formatTime()` — date/time formatting
- Direct `toLocaleString()`, `Intl.*` calls prohibited. Always use utils.

## Scrollbar

Custom thin scrollbar: 6px width, `slate-300` thumb, transparent track, `slate-400` on hover.

## Anti-Patterns (Do Not)

- No dark mode. Light theme only.
- No gradients on backgrounds or cards.
- No decorative shadows (except `.glass-card` subtle shadow).
- No colored left-borders on cards.
- No emoji as design elements.
- No centered card grids. Tables and lists are left-aligned.
- No font stacks other than system default.
