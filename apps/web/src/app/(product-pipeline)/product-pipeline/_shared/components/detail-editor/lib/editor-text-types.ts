import type { Editor } from 'grapesjs';

/** Canonical tags that the detail editor treats as editable text. */
export const DETAIL_EDITOR_TEXT_TAGS = new Set([
  'p',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'span',
  'li',
  'strong',
  'em',
  'td',
  'th',
]);

/**
 * GrapesJS의 표 셀 모델 제약은 유지하면서 Rich Text Editor 동작만 결합한다.
 *
 * 기존 `cell`을 단순히 `text`에서 확장하면 기본 `tagName: 'td'`와
 * `draggable: ['tr']`를 잃어 새 셀이 `<div>`로 저장되거나 표 밖으로 이동할 수 있다.
 */
export function registerEditableTableCellType(editor: Editor): void {
  editor.DomComponents.addType('cell', {
    extend: 'cell',
    extendView: 'text',
    model: {
      defaults: {
        type: 'cell',
        tagName: 'td',
        draggable: ['tr'],
        editable: true,
      },
    },
    isComponent: (el: HTMLElement) => {
      const tag = el?.tagName?.toLowerCase();
      return tag === 'td' || tag === 'th' ? { type: 'cell' } : undefined;
    },
  });
}
