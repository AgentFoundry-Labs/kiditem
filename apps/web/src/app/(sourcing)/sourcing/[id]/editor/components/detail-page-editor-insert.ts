import type { Editor } from 'grapesjs';
import { getEditorFrameEl } from './detail-page-editor-html';

export function insertEditorHtml(editor: Editor, html: string) {
  const target = getInsertionTarget(editor);
  const added = target.parent
    ? target.parent.components().add(html, { at: target.at })
    : editor.addComponents(html);
  const component = Array.isArray(added) ? added[0] : added;
  if (component) {
    editor.select(component);
    requestAnimationFrame(() => scrollComponentIntoCanvasView(editor, component));
  }
}

function getInsertionTarget(editor: Editor): { parent: any | null; at: number } {
  const wrapper = editor.getWrapper();
  const children = wrapper?.components?.();
  const selected = editor.getSelected();
  if (selected && isComponentInCanvasViewport(editor, selected)) {
    const insertableSelected = getInsertableComponent(selected, wrapper);
    const selectedParent = insertableSelected?.parent?.();
    if (insertableSelected && selectedParent) {
      return { parent: selectedParent, at: insertableSelected.index() + 1 };
    }
  }

  if (!wrapper || !children?.length) return { parent: wrapper ?? null, at: children?.length ?? 0 };

  const viewportComponent = getViewportCenterInsertableComponent(editor, wrapper);
  const viewportParent = viewportComponent?.parent?.();
  if (viewportComponent && viewportParent) {
    return { parent: viewportParent, at: viewportComponent.index() + 1 };
  }

  const frame = getEditorFrameEl(editor);
  const frameWindow = frame?.contentWindow;
  if (!frameWindow) return { parent: wrapper, at: children.length };

  const viewportHeight = frameWindow.innerHeight || frame?.clientHeight || 900;
  const viewportTop = frameWindow.scrollY;
  const viewportBottom = viewportTop + viewportHeight;
  const viewportCenter = viewportTop + viewportHeight / 2;
  const models = flattenEditorComponents(wrapper);
  let best: any | null = null;
  let bestScore = Number.POSITIVE_INFINITY;

  for (const component of models) {
    if (component === wrapper) continue;
    const element = component?.getEl?.();
    if (!element) continue;
    const rect = element.getBoundingClientRect();
    if (rect.height <= 0 || rect.width <= 0) continue;
    const top = viewportTop + rect.top;
    const bottom = top + rect.height;
    const visibleOverlap = Math.max(0, Math.min(bottom, viewportBottom) - Math.max(top, viewportTop));
    if (visibleOverlap <= 0) continue;
    const center = top + rect.height / 2;
    const distance = Math.abs(center - viewportCenter);
    const oversizePenalty = Math.max(0, rect.height - viewportHeight * 0.9) * 0.18;
    const score = distance + oversizePenalty + getInsertionDepth(component, wrapper) * 4;
    if (score < bestScore) {
      best = component;
      bestScore = score;
    }
  }

  const insertableBest = getInsertableComponent(best, wrapper);
  const parent = insertableBest?.parent?.();
  return insertableBest && parent
    ? { parent, at: insertableBest.index() + 1 }
    : { parent: wrapper, at: children.length };
}

function getViewportCenterInsertableComponent(
  editor: Editor,
  wrapper: any,
): any | null {
  const frame = getEditorFrameEl(editor);
  const doc = frame?.contentDocument;
  const frameWindow = frame?.contentWindow;
  if (!doc || !frameWindow || !wrapper) return null;

  const width = frameWindow.innerWidth || frame?.clientWidth || 720;
  const height = frameWindow.innerHeight || frame?.clientHeight || 900;
  const points = [
    [width / 2, height / 2],
    [width / 2, height * 0.36],
    [width / 2, height * 0.64],
    [width * 0.38, height / 2],
    [width * 0.62, height / 2],
  ];

  for (const [x, y] of points) {
    const component = getInsertableComponentFromPoint(doc, wrapper, x, y);
    if (component) return component;
  }

  return null;
}

function getInsertableComponentFromPoint(
  doc: Document,
  wrapper: any,
  x: number,
  y: number,
): any | null {
  let element = doc.elementFromPoint(x, y) as HTMLElement | null;
  while (element && element !== doc.body && element !== doc.documentElement) {
    const id = element.getAttribute('id');
    if (id) {
      const component = findEditorComponentById(wrapper, id);
      const insertableComponent = getInsertableComponent(component, wrapper);
      if (insertableComponent) return insertableComponent;
    }
    element = element.parentElement;
  }
  return null;
}

function findEditorComponentById(wrapper: any, id: string): any | null {
  const escapedId =
    typeof CSS !== 'undefined' && typeof CSS.escape === 'function'
      ? CSS.escape(id)
      : id.replace(/([ !"#$%&'()*+,./:;<=>?@[\\\]^`{|}~])/g, '\\$1');
  return wrapper?.find?.(`#${escapedId}`)?.[0] ?? null;
}

function isComponentInCanvasViewport(editor: Editor, component: any): boolean {
  const frame = getEditorFrameEl(editor);
  const frameWindow = frame?.contentWindow;
  const element = component?.getEl?.();
  if (!frameWindow || !element) return false;
  const rect = element.getBoundingClientRect();
  const viewportHeight = frameWindow.innerHeight || frame?.clientHeight || 900;
  const viewportWidth = frameWindow.innerWidth || frame?.clientWidth || 720;
  return rect.bottom > 0 && rect.top < viewportHeight && rect.right > 0 && rect.left < viewportWidth;
}

function flattenEditorComponents(root: any): any[] {
  const result: any[] = [];
  const walk = (component: any) => {
    result.push(component);
    const children = component?.components?.()?.models ?? [];
    children.forEach(walk);
  };
  walk(root);
  return result;
}

function getInsertableComponent(component: any, wrapper: any): any | null {
  if (!component || !wrapper) return component ?? null;
  let current = component;
  while (current && current !== wrapper) {
    const tag = String(current.get?.('tagName') ?? '').toLowerCase();
    const parent = current.parent?.();
    if (!parent || parent === wrapper) return current;
    const parentTag = String(parent.get?.('tagName') ?? '').toLowerCase();
    if (isInlineEditorTag(tag) || isInlineEditorTag(parentTag)) {
      current = parent;
      continue;
    }
    return current;
  }
  return null;
}

function isInlineEditorTag(tag: string): boolean {
  return ['span', 'strong', 'em', 'b', 'i', 'small', 'u', 'a', 'br'].includes(tag);
}

function getInsertionDepth(component: any, wrapper: any): number {
  let depth = 0;
  let current = component;
  while (current && current !== wrapper) {
    depth += 1;
    current = current.parent?.() ?? null;
  }
  return depth;
}

function scrollComponentIntoCanvasView(editor: Editor, component: any) {
  const frame = getEditorFrameEl(editor);
  const frameWindow = frame?.contentWindow;
  const element = component?.getEl?.();
  if (!frameWindow || !element) return;

  const rect = element.getBoundingClientRect();
  const viewportHeight = frameWindow.innerHeight || frame?.clientHeight || 900;
  if (rect.top >= 80 && rect.bottom <= viewportHeight - 80) return;
  const nextTop = Math.max(0, frameWindow.scrollY + rect.top - viewportHeight * 0.35);
  frameWindow.scrollTo({ top: nextTop, behavior: 'auto' });
}

export function insertImageIntoEditor(editor: Editor, url: string) {
  const selected = editor.getSelected();
  const type = (selected?.get('type') as string) ?? '';
  const tag = ((selected?.get('tagName') as string) ?? '').toLowerCase();
  if (selected && (type === 'image' || tag === 'img')) {
    selected.setAttributes({ src: url });
    return;
  }
  insertEditorHtml(
    editor,
    `<img src="${url}" style="display:block;width:100%;max-width:640px;margin:0 auto;object-fit:cover;" />`,
  );
}

export function applySelectedStyle(editor: Editor, style: Record<string, string>) {
  const target = editor.getSelected() ?? editor.getWrapper();
  target?.addStyle?.(style);
}

export function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ''));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}
