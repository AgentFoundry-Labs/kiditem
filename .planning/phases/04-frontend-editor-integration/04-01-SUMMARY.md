---
phase: "04"
plan: "01"
subsystem: frontend-editor
tags: [react, components, color-picker, template-preview, editor]
dependency_graph:
  requires: []
  provides: [ColorPickerField, StructuredPreviewPane, StructuredEditPanel, ImageGenerationCTA]
  affects: [04-02]
tech_stack:
  added: [react-colorful@^5.6.1]
  patterns: [Radix Popover, useMemo for template rendering, save-on-close pattern]
key_files:
  created:
    - apps/web/src/app/sourcing/[id]/editor/components/ColorPickerField.tsx
    - apps/web/src/app/sourcing/[id]/editor/components/StructuredPreviewPane.tsx
    - apps/web/src/app/sourcing/[id]/editor/components/StructuredEditPanel.tsx
    - apps/web/src/app/sourcing/[id]/editor/components/ImageGenerationCTA.tsx
  modified:
    - apps/web/package.json
decisions:
  - react-colorful (5.6.1) installed for hex color picking with zero dependencies
  - StructuredPreviewPane uses useMemo to avoid re-rendering on unrelated state changes
  - Save triggers match D-09: onBlur for text, onClose for color popover, onSelect for hero
metrics:
  duration: 2 minutes
  completed_date: "2026-03-25T23:50:00Z"
  tasks_completed: 2
  files_created: 4
  files_modified: 1
---

# Phase 04 Plan 01: Sub-components for Structured Editor Summary

**One-liner:** 4 reusable editor sub-components created — color picker with swatch+popover, iframe template preview, full edit panel (text+colors+hero), and image generation CTA button with loading state.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Install react-colorful + ColorPickerField + StructuredPreviewPane | 5bd6d99 | ColorPickerField.tsx, StructuredPreviewPane.tsx, package.json |
| 2 | Create StructuredEditPanel and ImageGenerationCTA | e139f7e | StructuredEditPanel.tsx, ImageGenerationCTA.tsx |

## What Was Built

### ColorPickerField
- Reusable color picker component with: colored swatch button (Radix Popover trigger), HexColorPicker popover, HexColorInput for direct hex editing
- `onClose` prop fires when popover closes — allows parent to call `onSave()` without saving on every drag (per D-09, Pitfall 4)
- Uses `@radix-ui/react-popover` (already in project dependencies)

### StructuredPreviewPane
- Wraps `renderTemplateToHtml()` in `useMemo` — re-renders only when `draftData` or `templateConfig` changes
- Displays result in `<iframe srcDoc>` — no backend calls, purely client-side (per D-05)
- Shows "프리뷰를 표시할 수 없습니다" placeholder when data is null

### StructuredEditPanel
- **Section 1 — 텍스트 편집:** text inputs for title, subtitle, badge, hookText, hookTitleSub, hookSubtext; textarea for description (array joined by newlines); numbered keyPoints editor (title + description per item); key-value specs editor
- **Section 2 — 테마 컬러:** 7 `ColorPickerField` components for all theme color fields (themeColorMain, themeColorBgLight, themeColorBadge1, themeColorBadge2, themeSectionBg, themeTextPrimary, themeTextSecondary)
- **Section 3 — 히어로 이미지:** thumbnail preview or placeholder, "이미지 선택" button, ImagePickerModal integration
- Save triggers: `onBlur` for text inputs, `onClose` for color pickers, `onSelect` for hero image — not on every keystroke

### ImageGenerationCTA
- Two states: idle (Sparkles icon + "이미지 생성 확정" button, emerald-500) and generating (Loader2 spinner + "이미지 생성 중..." + polling hint text)
- `disabled` prop for cases where confirm is not yet valid

## Deviations from Plan

None — plan executed exactly as written.

## Known Stubs

None — all components are fully implemented with real data flow. Props connect to parent state; no hardcoded empty values used for rendering.

## Self-Check: PASSED

Files exist:
- apps/web/src/app/sourcing/[id]/editor/components/ColorPickerField.tsx — FOUND
- apps/web/src/app/sourcing/[id]/editor/components/StructuredPreviewPane.tsx — FOUND
- apps/web/src/app/sourcing/[id]/editor/components/StructuredEditPanel.tsx — FOUND
- apps/web/src/app/sourcing/[id]/editor/components/ImageGenerationCTA.tsx — FOUND

Commits exist:
- 5bd6d99 — FOUND
- e139f7e — FOUND
